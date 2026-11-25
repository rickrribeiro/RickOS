import { definirChamada, ex } from '../definicao'
import { EX_MENSAGENS } from '../exemplos'
import { ALT_CODEX, CHATS_MODEL } from '../padroes'
import { ESTILOS_RESPOSTA, SISTEMA_MENSAGENS } from './sistema'

/**
 * Central de Mensagens → "Sugerir resposta" para as mensagens selecionadas (uma única
 * ou uma por mensagem recebida). System prompt: `SISTEMA_MENSAGENS` (./sistema.ts).
 * Usado em: server/chats/ai.ts (`suggestReplies`).
 */
export interface PromptSugerirRespostas {
  /** "grupo \"X\"" ou "com Fulano" — já formatado. */
  conversa: string
  rede: string
  /** Notas/contexto da pessoa (só com opt-in explícito do usuário). */
  contextoPessoa: string | null
  /** Texto do estilo (ver `ESTILOS_RESPOSTA`). */
  estilo: string
  idioma: string | null
  preferenciasEscrita: string | null
  pedidoExtra: string | null
  modelo: string | null
  /** Bloco `<mensagens>…</mensagens>` com o JSON das mensagens selecionadas. */
  mensagens: string
  /** Aliases (m1, m2…) das mensagens recebidas quando é uma sugestão por mensagem; null = resposta única. */
  alvosPorMensagem: string[] | null
}

const bloco = (s: string | null | false): string => (s ? `\n\n${s}` : '')

export const mensagensSugerir = definirChamada<PromptSugerirRespostas>({
  id: 'mensagens.sugerir',
  modulo: 'mensagens',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: CHATS_MODEL,
  effort: null,
  alternativas: ALT_CODEX,
  arquivo: 'mensagens/sistema.ts, mensagens/sugerirRespostas.ts',
  usadoEm: 'server/chats/ai.ts',
  sistema: SISTEMA_MENSAGENS,
  template: `Conversa: {{conversa}} no {{rede}}.{{contextoPessoa}}

Estilo: {{estilo}}.

{{idioma}}{{preferencias}}{{pedidoExtra}}{{modeloResposta}}

Mensagens selecionadas pelo usuário (só estas; "EU" é o usuário):

{{mensagens}}

{{instrucao}}

Formato: {"suggestions":[{"id":"{{idExemplo}}","reply":"texto","needsReply":true,"priority":"alta|normal|baixa","reason":"por que (curto)"}]}`,
  preparar: (p) => {
    const perMessage = !!p.alvosPorMensagem
    return {
      conversa: p.conversa,
      rede: p.rede,
      contextoPessoa: bloco(p.contextoPessoa && `Contexto que o usuário autorizou compartilhar sobre a pessoa:\n<contexto>${p.contextoPessoa}</contexto>`),
      estilo: p.estilo,
      idioma: p.idioma ? `Idioma da resposta: ${p.idioma}.` : 'Idioma: o mesmo usado na conversa.',
      preferencias: bloco(p.preferenciasEscrita && `Preferências gerais de escrita do usuário: ${p.preferenciasEscrita}`),
      pedidoExtra: bloco(p.pedidoExtra && `Pedido do usuário para esta resposta: ${p.pedidoExtra}`),
      modeloResposta: bloco(p.modelo && `Use como base este modelo de resposta do usuário, adaptando ao contexto: """${p.modelo}"""`),
      mensagens: p.mensagens,
      instrucao: perMessage
        ? `Escreva UMA sugestão de resposta para CADA mensagem recebida destes ids: ${p.alvosPorMensagem!.join(', ')}. Se uma mensagem já foi respondida por "EU" depois dela, ou não precisa de resposta, diga isso em needsReply=false e deixe reply curto ou vazio.`
        : 'Escreva UMA única resposta que cubra o conjunto das mensagens recebidas.',
      idExemplo: perMessage ? 'm1' : 'all'
    }
  },
  exemplo: { conversa: `com ${ex('pessoa')}`, rede: ex('rede'), contextoPessoa: ex('notas da pessoa (só com opt-in)'), estilo: ESTILOS_RESPOSTA.natural, idioma: null, preferenciasEscrita: ex('preferências de escrita'), pedidoExtra: null, modelo: null, mensagens: EX_MENSAGENS, alvosPorMensagem: null }
})
