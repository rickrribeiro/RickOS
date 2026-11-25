/**
 * CRM → "Retomar contato": 2-3 opções de mensagem para reaproximar de alguém.
 * Usado em: src/modules/crm/pages/CrmPage.tsx. Modelo: `claude_model`.
 */
export function promptRetomarContato(p: {
  nome: string
  /** Cidade, estado, país (vazio = desconhecido). */
  local: string
  interesses: string | null
  /** Data da última conversa já formatada. */
  ultimaConversa: string | null
  contexto: string | null
}): string {
  return `Sou nômade e quero manter viva minha relação com ${p.nome}. Com base no contexto abaixo, escreva 2 ou 3 opções curtas de mensagem calorosa e natural para retomar o contato (em português, tom pessoal, sem parecer robô). Se houver um gancho no contexto (ex.: um exame, uma viagem, um projeto), puxe por ele.

Nome: ${p.nome}
Local: ${p.local || '—'}
Interesses: ${p.interesses ?? '—'}
Última conversa: ${p.ultimaConversa ?? '—'}
Contexto: ${p.contexto ?? '—'}`
}
