/**
 * Notícias → resumo diário por categoria (Gemini, resposta em JSON com schema `TOPICS_SCHEMA`
 * em server/services/news.ts). Recebe Memória Pessoal (integração #8 aprovada) só para desempate.
 * Usado em: server/services/news.ts (`summarize`).
 */
export function promptResumoNoticias(p: {
  data: string
  categoria: string
  maxTopicos: number
  /** Bloco de Memória Pessoal (vazio = sem). */
  memoria: string
  /** Manchetes numeradas: `[n] título (fonte)\nURL: …`. */
  manchetes: string
}): string {
  return [
    `Você é um editor de notícias. Abaixo estão manchetes do Google Notícias publicadas em ${p.data}, categoria "${p.categoria}".`,
    `Selecione as até ${p.maxTopicos} notícias mais relevantes (junte manchetes sobre o mesmo fato num só tópico) e resuma cada uma em pt-BR, de forma objetiva e factual, sem opinião.`,
    'Use só a informação das manchetes; não invente detalhes. Para cada tópico, informe o número [n] e a URL exata da notícia de origem.',
    `Use "${p.categoria}" no campo categoria.`,
    ...(p.memoria
      ? [
          '',
          'Contexto pessoal do leitor, use SÓ para desempatar a seleção a favor do que interessa a ele (sem deixar de fora fatos de grande relevância geral). Não mencione esse contexto no resumo:',
          p.memoria
        ]
      : []),
    '',
    p.manchetes
  ].join('\n')
}
