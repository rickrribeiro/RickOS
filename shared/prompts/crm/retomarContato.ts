import { definirChamada, ex } from '../definicao'
import { CLAUDE_MODEL } from '../padroes'

/**
 * CRM → "Retomar contato": 2-3 opções de mensagem para reaproximar de alguém.
 * Usado em: src/modules/crm/pages/CrmPage.tsx.
 */
export const crmRetomarContato = definirChamada<{ nome: string; local: string; interesses: string | null; ultimaConversa: string | null; contexto: string | null }>({
  id: 'crm.retomarContato',
  modulo: 'crm',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: CLAUDE_MODEL,
  effort: null,
  arquivo: 'crm/retomarContato.ts',
  usadoEm: 'src/modules/crm/pages/CrmPage.tsx',
  template: `Sou nômade e quero manter viva minha relação com {{nome}}. Com base no contexto abaixo, escreva 2 ou 3 opções curtas de mensagem calorosa e natural para retomar o contato (em português, tom pessoal, sem parecer robô). Se houver um gancho no contexto (ex.: um exame, uma viagem, um projeto), puxe por ele.

Nome: {{nome}}
Local: {{local}}
Interesses: {{interesses}}
Última conversa: {{ultimaConversa}}
Contexto: {{contexto}}`,
  preparar: (p) => ({ nome: p.nome, local: p.local || '—', interesses: p.interesses ?? '—', ultimaConversa: p.ultimaConversa ?? '—', contexto: p.contexto ?? '—' }),
  exemplo: { nome: ex('nome'), local: ex('local'), interesses: ex('interesses'), ultimaConversa: ex('data'), contexto: ex('contexto') }
})
