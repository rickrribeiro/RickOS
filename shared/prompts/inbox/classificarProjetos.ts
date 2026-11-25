/**
 * Inbox → "Sugerir projetos com IA": classifica cada item do inbox no projeto mais provável.
 * Usado em: src/modules/inbox/pages/InboxPage.tsx (via `runJson`, que anexa o sufixo de JSON).
 */
export function promptClassificarInbox(p: {
  projetos: { id: number; name: string; description: string | null }[]
  itens: { id: number; title: string; notes: string | null }[]
}): string {
  return `Classifique cada item do meu inbox no projeto mais provável, ou null se não for de nenhum projeto (compras, lembretes pessoais etc.). Seja conservador.
Projetos: ${p.projetos.map((p) => `${p.id}=${p.name}${p.description ? ` (${p.description})` : ''}`).join('; ')}
Itens:
${p.itens.map((t) => `${t.id}: ${t.title}${t.notes ? ` — ${t.notes}` : ''}`).join('\n')}
Formato: {"items": [{"id": 1, "projectId": 2}]}`
}
