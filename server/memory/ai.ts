import os from 'os'
import type { IdChamadaIa, MotorIa, ParamsDe } from '../../shared/prompts/catalogo'
import { getSetting, setSetting } from '../database/queries'
import { montarChamada } from '../ia/gateway'
import { criarMotor } from '../ia/motores'

/**
 * Motor de IA da Memória Pessoal (só usado pelas funcionalidades INTERNAS do módulo).
 *
 * • prompt, motor e modelo vêm do gateway (chamadas `memoria.*` do catálogo; modelo por
 *   complexidade: `memory_ai_model_fast` nos lotes do agente e `memory_ai_model` no resto);
 * • sem ferramentas, sem MCP, fora de qualquer repositório;
 * • custo/tokens vão para `ai_usage` com `source = memoria-<op>` (baixa cardinalidade);
 * • limite diário de chamadas (`memory_max_llm_calls_day`) contra loops e custo;
 * • injetável (`setMemoryAi`) para testes — a suíte nunca chama LLM pago.
 */
export type MemoryAiOp = 'agente' | 'texto' | 'migracao' | 'analise' | 'consolidacao' | 'lacunas' | 'entrevista'

export type ChamadaMemoria = Extract<IdChamadaIa, `memoria.${string}`>

export interface MemoryAi {
  readonly id: string
  complete(system: string, prompt: string, opts: { model?: string; op: MemoryAiOp; motor?: MotorIa; effort?: string }): Promise<string>
}

export const claudeCliMemoryAi: MemoryAi = {
  id: 'gateway',
  async complete(system, prompt, opts) {
    return criarMotor(opts.motor ?? 'claude-code').executar({
      prompt,
      sistema: system,
      modelo: opts.model,
      effort: opts.effort,
      ferramentas: 'nenhuma',
      timeoutMs: 180_000,
      cwd: os.tmpdir(),
      usage: { source: `memoria-${opts.op}` }
    })
  }
}

let engine: MemoryAi = claudeCliMemoryAi
export function setMemoryAi(e: MemoryAi | null): void {
  engine = e ?? claudeCliMemoryAi
}

/** Extração: lotes do agente/entrevistas usam a chamada rápida; texto livre e migração, a principal. */
export function chamadaDeExtracao(op: MemoryAiOp): ChamadaMemoria {
  return op === 'agente' || op === 'entrevista' || op === 'lacunas' ? 'memoria.extracaoAgente' : 'memoria.extracaoTexto'
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
export async function callAi<K extends ChamadaMemoria>(op: MemoryAiOp, chamada: K, params: ParamsDe<K>): Promise<string> {
  const st = await callsToday()
  if (st.n >= st.limit) throw new AiBudgetError(`Limite diário de chamadas de IA da Memória atingido (${st.limit}). Ajuste em Configurações.`)
  await setSetting('memory_llm_calls', JSON.stringify({ day: st.day, n: st.n + 1 }))
  const c = await montarChamada(chamada, params)
  return engine.complete(c.sistema ?? '', c.prompt, { model: c.modelo, op, motor: c.motor, effort: c.effort })
}

/** Primeiro objeto JSON da resposta (tolera cercas de código e texto em volta). */
export function parseJsonObject<T>(text: string): T {
  const s = String(text ?? '')
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('A IA não devolveu JSON.')
  return JSON.parse(s.slice(start, end + 1)) as T
}
