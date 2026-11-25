import { definirChamada, ex } from '../definicao'
import { CLAUDE_MODEL } from '../padroes'

/**
 * Automações → agente agendado: roda uma vez por dia o prompt escrito pelo usuário em
 * Automações; a saída vai para o Inbox.
 * Usado em: server/rpc.ts (`runScheduledJobs`).
 */
export const automacoesAgendado = definirChamada<{ prompt: string }>({
  id: 'automacoes.agendado',
  modulo: 'automacoes',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: CLAUDE_MODEL,
  effort: null,
  arquivo: 'automacoes/agendado.ts',
  usadoEm: 'server/rpc.ts (runScheduledJobs)',
  template: '{{prompt}}',
  preparar: (p) => ({ prompt: p.prompt }),
  exemplo: { prompt: ex('prompt do job, definido em Automações') }
})
