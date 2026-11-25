import { definirChamada, ex } from '../definicao'
import { EX_MENSAGENS } from '../exemplos'
import { CHATS_MODEL } from '../padroes'
import { SISTEMA_MENSAGENS } from './sistema'

/**
 * Central de Mensagens → "Resumir" um trecho selecionado da conversa.
 * System prompt: `SISTEMA_MENSAGENS` (./sistema.ts).
 * Usado em: server/chats/ai.ts (`summarize`).
 */
export const mensagensResumo = definirChamada<{
  /** "no grupo \"X\"" ou "com Fulano" — já formatado. */
  conversa: string
  rede: string
  contextoPessoa: string | null
  /** Bloco `<mensagens>…</mensagens>`. */
  mensagens: string
}>({
  id: 'mensagens.resumo',
  modulo: 'mensagens',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: CHATS_MODEL,
  effort: null,
  arquivo: 'mensagens/sistema.ts, mensagens/resumo.ts',
  usadoEm: 'server/chats/ai.ts',
  sistema: SISTEMA_MENSAGENS,
  template: `Resuma as mensagens selecionadas de uma conversa {{conversa}} ({{rede}}).{{contextoPessoa}}

Importante: é um TRECHO selecionado pelo usuário, não necessariamente a conversa inteira.

{{mensagens}}

Responda em português com tópicos curtos, nesta estrutura (omita seções vazias):
- Assuntos principais
- Últimos acontecimentos
- Perguntas feitas (e se "EU" respondeu)
- Compromissos/combinados mencionados
- Pendências
- Contexto útil para responder
Separe claramente o que está ESCRITO nas mensagens do que é SUA INFERÊNCIA (marque inferências com "(inferência)").
Formato: {"summary":"texto em markdown simples"}`,
  preparar: (p) => ({
    conversa: p.conversa,
    rede: p.rede,
    contextoPessoa: p.contextoPessoa ? `\n\n<contexto>${p.contextoPessoa}</contexto>` : '',
    mensagens: p.mensagens
  }),
  exemplo: { conversa: `com ${ex('pessoa')}`, rede: ex('rede'), contextoPessoa: null, mensagens: EX_MENSAGENS }
})
