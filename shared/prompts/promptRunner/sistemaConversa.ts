import { definirChamada, ex } from '../definicao'
import { EX_CTX_PROJETO } from '../exemplos'
import { RUNNER_EFFORT, RUNNER_MODEL } from '../padroes'

/**
 * Prompt Runner → conversa com o Claude Code. O system prompt (`--append-system-prompt`)
 * junta contexto do projeto + agente + skills (textos do banco, editáveis na UI) em `{{blocos}}`;
 * o prompt é a mensagem digitada. Modelo/effort: os da conversa ou estes padrões.
 * Usado em: server/rpc.ts (`systemPrompt` das conversas) → server/aiconv/runner.ts.
 */
export const promptRunnerConversa = definirChamada<{
  /** `promptContextoProjeto` (vazio = sem projeto). */
  contextoProjeto: string
  agente: { name: string; systemPrompt: string } | null
  skills: { name: string; content: string }[]
  mensagem: string
}>({
  id: 'promptRunner.conversa',
  modulo: 'promptRunner',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: RUNNER_MODEL,
  effort: RUNNER_EFFORT,
  arquivo: 'promptRunner/sistemaConversa.ts',
  usadoEm: 'server/aiconv/runner.ts',
  sistema: '{{blocos}}',
  template: '{{mensagem}}',
  preparar: (p) => {
    const parts: string[] = []
    const ctx = p.contextoProjeto.trim()
    if (ctx) parts.push(ctx)
    if (p.agente?.systemPrompt.trim()) parts.push(`### AGENTE: ${p.agente.name}\n${p.agente.systemPrompt.trim()}`)
    for (const sk of p.skills) {
      if (sk.content.trim()) parts.push(`### SKILL: ${sk.name}\n${sk.content.trim()}`)
    }
    return { blocos: parts.join('\n\n'), mensagem: p.mensagem }
  },
  exemplo: { contextoProjeto: EX_CTX_PROJETO, agente: { name: ex('agente'), systemPrompt: ex('system prompt do agente') }, skills: [{ name: ex('skill'), content: ex('conteúdo da skill') }], mensagem: ex('sua mensagem') }
})
