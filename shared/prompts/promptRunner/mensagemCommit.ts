import { ALT_CODEX } from '../padroes'
import { definirChamada, ex } from '../definicao'

/**
 * Prompt Runner → "Sugerir mensagem de commit" para as mudanças da conversa.
 * Usado em: server/aiconv/rpc.ts (`conv:suggestCommit`). Modelo: haiku.
 * `contexto`: diff/stat + commits recentes (`commitContext`).
 */
export const promptRunnerMensagemCommit = definirChamada<{ contexto: string }>({
  id: 'promptRunner.mensagemCommit',
  modulo: 'promptRunner',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: { padrao: 'haiku' },
  effort: null,
  alternativas: ALT_CODEX,
  arquivo: 'promptRunner/mensagemCommit.ts',
  usadoEm: 'server/aiconv/rpc.ts',
  template: `Escreva UMA mensagem de commit para as mudanças abaixo, no mesmo estilo e idioma dos commits recentes (ex.: convencional "tipo(escopo): resumo"). Responda só com a mensagem, sem aspas nem explicação; corpo opcional depois de uma linha em branco.\n\n{{contexto}}`,
  preparar: (p) => ({ contexto: p.contexto }),
  exemplo: { contexto: ex('diff e commits recentes') }
})
