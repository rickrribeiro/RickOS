/**
 * Prompt Runner → system prompt de cada conversa (`--append-system-prompt`): contexto do
 * projeto + agente escolhido + skills. Os textos de agentes/skills ficam no banco (UI).
 * Usado em: server/rpc.ts (`systemPrompt` das conversas). Modelo/effort: da conversa ou
 * `prompt_runner_model` / `prompt_runner_effort`.
 */
export function promptSistemaConversa(p: {
  /** `promptContextoProjeto` (vazio = sem projeto). */
  contextoProjeto: string
  agente: { name: string; systemPrompt: string } | null
  skills: { name: string; content: string }[]
}): string {
  const parts: string[] = []
  const ctx = p.contextoProjeto.trim()
  if (ctx) parts.push(ctx)
  if (p.agente?.systemPrompt.trim()) parts.push(`### AGENTE: ${p.agente.name}\n${p.agente.systemPrompt.trim()}`)
  for (const sk of p.skills) {
    if (sk.content.trim()) parts.push(`### SKILL: ${sk.name}\n${sk.content.trim()}`)
  }
  return parts.join('\n\n')
}
