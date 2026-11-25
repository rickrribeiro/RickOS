import { definirChamada, ex } from '../definicao'
import { CLAUDE_MODEL } from '../padroes'

/**
 * Inbox → "Sugerir projetos com IA": classifica cada item do inbox no projeto mais provável.
 * Usado em: src/modules/inbox/pages/InboxPage.tsx (via `runJson`, que anexa o sufixo de JSON).
 */
export const inboxClassificar = definirChamada<{ projetos: { id: number; name: string; description: string | null }[]; itens: { id: number; title: string; notes: string | null }[] }>({
  id: 'inbox.classificar',
  modulo: 'inbox',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: CLAUDE_MODEL,
  effort: null,
  arquivo: 'inbox/classificarProjetos.ts',
  usadoEm: 'src/modules/inbox/pages/InboxPage.tsx',
  template: `Classifique cada item do meu inbox no projeto mais provável, ou null se não for de nenhum projeto (compras, lembretes pessoais etc.). Seja conservador.
Projetos: {{projetos}}
Itens:
{{itens}}
Formato: {"items": [{"id": 1, "projectId": 2}]}\n\nResponda APENAS com JSON válido, sem texto antes ou depois, sem cercas de código.`,
  preparar: (p) => {
    return {
      projetos: String(p.projetos.map((p) => `${p.id}=${p.name}${p.description ? ` (${p.description})` : ''}`).join('; ')),
      itens: String(p.itens.map((t) => `${t.id}: ${t.title}${t.notes ? ` — ${t.notes}` : ''}`).join('\n'))
    }
  },
  exemplo: { projetos: [{ id: 1, name: ex('projeto'), description: ex('descrição') }], itens: [{ id: 10, title: ex('item'), notes: ex('notas') }] }
})
