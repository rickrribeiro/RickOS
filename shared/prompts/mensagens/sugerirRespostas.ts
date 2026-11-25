/**
 * Central de Mensagens → "Sugerir resposta" para as mensagens selecionadas (uma única
 * ou uma por mensagem recebida). System prompt: `SISTEMA_MENSAGENS` (./sistema.ts).
 * Usado em: server/chats/ai.ts (`suggestReplies`). Modelo: config do módulo (`aiModel`).
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

export function promptSugerirRespostas(p: PromptSugerirRespostas): string {
  const perMessage = !!p.alvosPorMensagem
  return [
    `Conversa: ${p.conversa} no ${p.rede}.`,
    p.contextoPessoa ? `Contexto que o usuário autorizou compartilhar sobre a pessoa:\n<contexto>${p.contextoPessoa}</contexto>` : '',
    `Estilo: ${p.estilo}.`,
    p.idioma ? `Idioma da resposta: ${p.idioma}.` : 'Idioma: o mesmo usado na conversa.',
    p.preferenciasEscrita ? `Preferências gerais de escrita do usuário: ${p.preferenciasEscrita}` : '',
    p.pedidoExtra ? `Pedido do usuário para esta resposta: ${p.pedidoExtra}` : '',
    p.modelo ? `Use como base este modelo de resposta do usuário, adaptando ao contexto: """${p.modelo}"""` : '',
    'Mensagens selecionadas pelo usuário (só estas; "EU" é o usuário):',
    p.mensagens,
    perMessage
      ? `Escreva UMA sugestão de resposta para CADA mensagem recebida destes ids: ${p.alvosPorMensagem!.join(', ')}. Se uma mensagem já foi respondida por "EU" depois dela, ou não precisa de resposta, diga isso em needsReply=false e deixe reply curto ou vazio.`
      : 'Escreva UMA única resposta que cubra o conjunto das mensagens recebidas.',
    `Formato: {"suggestions":[{"id":"${perMessage ? 'm1' : 'all'}","reply":"texto","needsReply":true,"priority":"alta|normal|baixa","reason":"por que (curto)"}]}`
  ]
    .filter(Boolean)
    .join('\n\n')
}
