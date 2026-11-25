import os from 'os'
import { getSetting, setSetting } from '../database/queries'
import { runClaude } from '../services/claude'

/**
 * Motor de IA da Memória Pessoal (só usado pelas funcionalidades INTERNAS do módulo).
 *
 * • Claude Code CLI sem ferramentas, sem MCP, fora de qualquer repositório;
 * • custo/tokens vão para `ai_usage` com `source = memoria-<op>` (baixa cardinalidade);
 * • limite diário de chamadas (`memory_max_llm_calls_day`) contra loops e custo;
 * • modelo por complexidade: `memory_ai_model_fast` (lotes do agente) e `memory_ai_model`.
 * • injetável (`setMemoryAi`) para testes — a suíte nunca chama LLM pago.
 */
export type MemoryAiOp = 'agente' | 'texto' | 'migracao' | 'analise' | 'consolidacao' | 'lacunas' | 'entrevista'

export interface MemoryAi {
  readonly id: string
  complete(system: string, prompt: string, opts: { model?: string; op: MemoryAiOp }): Promise<string>
}

export const claudeCliMemoryAi: MemoryAi = {
  id: 'claude-cli',
  async complete(system, prompt, opts) {
    const command = (await getSetting('claude_command')) || 'claude'
    return runClaude(prompt, command, {
      model: opts.model || undefined,
      timeoutMs: 180_000,
      cwd: os.tmpdir(),
      usage: { source: `memoria-${opts.op}` },
      extraArgs: ['--tools', '', '--strict-mcp-config', '--append-system-prompt', system]
    })
  }
}

let engine: MemoryAi = claudeCliMemoryAi
export function setMemoryAi(e: MemoryAi | null): void {
  engine = e ?? claudeCliMemoryAi
}

const FAST_OPS: MemoryAiOp[] = ['agente', 'lacunas', 'entrevista']

export async function modelFor(op: MemoryAiOp): Promise<string> {
  const fast = ((await getSetting('memory_ai_model_fast')) ?? '').trim() || 'haiku'
  const main = ((await getSetting('memory_ai_model')) ?? '').trim() || 'sonnet'
  return FAST_OPS.includes(op) ? fast : main
}

export class AiBudgetError extends Error {}

const today = (): string => new Date().toISOString().slice(0, 10)

export async function callsToday(): Promise<{ day: string; n: number; limit: number }> {
  let st = { day: today(), n: 0 }
  try {
    const v = JSON.parse((await getSetting('memory_llm_calls')) || '{}')
    if (v?.day === st.day) st = { day: v.day, n: Number(v.n) || 0 }
  } catch {
    // reinicia
  }
  const limit = Math.max(0, Number((await getSetting('memory_max_llm_calls_day')) ?? 40) || 0)
  return { ...st, limit }
}

/** Chamada com orçamento diário. Conta ANTES de chamar (falhas também custam). */
export async function callAi(op: MemoryAiOp, system: string, prompt: string): Promise<string> {
  const st = await callsToday()
  if (st.n >= st.limit) throw new AiBudgetError(`Limite diário de chamadas de IA da Memória atingido (${st.limit}). Ajuste em Configurações.`)
  await setSetting('memory_llm_calls', JSON.stringify({ day: st.day, n: st.n + 1 }))
  return engine.complete(system, prompt, { model: await modelFor(op), op })
}

/** Primeiro objeto JSON da resposta (tolera cercas de código e texto em volta). */
export function parseJsonObject<T>(text: string): T {
  const s = String(text ?? '')
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('A IA não devolveu JSON.')
  return JSON.parse(s.slice(start, end + 1)) as T
}
