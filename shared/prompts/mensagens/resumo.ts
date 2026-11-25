/**
 * Central de Mensagens → "Resumir" um trecho selecionado da conversa.
 * System prompt: `SISTEMA_MENSAGENS` (./sistema.ts).
 * Usado em: server/chats/ai.ts (`summarize`). Modelo: config do módulo (`aiModel`).
 */
export function promptResumoConversa(p: {
  /** "no grupo \"X\"" ou "com Fulano" — já formatado. */
  conversa: string
  rede: string
  contextoPessoa: string | null
  /** Bloco `<mensagens>…</mensagens>`. */
  mensagens: string
}): string {
  return [
    `Resuma as mensagens selecionadas de uma conversa ${p.conversa} (${p.rede}).`,
    p.contextoPessoa ? `<contexto>${p.contextoPessoa}</contexto>` : '',
    'Importante: é um TRECHO selecionado pelo usuário, não necessariamente a conversa inteira.',
    p.mensagens,
    `Responda em português com tópicos curtos, nesta estrutura (omita seções vazias):
- Assuntos principais
- Últimos acontecimentos
- Perguntas feitas (e se "EU" respondeu)
- Compromissos/combinados mencionados
- Pendências
- Contexto útil para responder
Separe claramente o que está ESCRITO nas mensagens do que é SUA INFERÊNCIA (marque inferências com "(inferência)").
Formato: {"summary":"texto em markdown simples"}`
  ]
    .filter(Boolean)
    .join('\n\n')
}
