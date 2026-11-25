import { definirChamada, ex } from '../definicao'
import { EX_MEMORIA } from '../exemplos'

/**
 * Notícias → resumo diário por categoria (Gemini, resposta em JSON com schema `TOPICS_SCHEMA`
 * em server/services/news.ts). Recebe Memória Pessoal (integração #8 aprovada) só para desempate.
 * Usado em: server/services/news.ts (`summarize`).
 */
export const MODELO_NOTICIAS = 'gemini-2.5-flash'

export const noticiasResumo = definirChamada<{
  data: string
  categoria: string
  maxTopicos: number
  /** Bloco de Memória Pessoal (vazio = sem). */
  memoria: string
  /** Manchetes numeradas: `[n] título (fonte)\nURL: …`. */
  manchetes: string
}>({
  id: 'noticias.resumo',
  modulo: 'noticias',
  tipo: 'executa',
  motor: 'gemini',
  modelo: { padrao: MODELO_NOTICIAS },
  effort: null,
  arquivo: 'noticias/resumoCategoria.ts',
  usadoEm: 'server/services/news.ts',
  template: [
    'Você é um editor de notícias. Abaixo estão manchetes do Google Notícias publicadas em {{data}}, categoria "{{categoria}}".',
    'Selecione as até {{maxTopicos}} notícias mais relevantes (junte manchetes sobre o mesmo fato num só tópico) e resuma cada uma em pt-BR, de forma objetiva e factual, sem opinião.',
    'Use só a informação das manchetes; não invente detalhes. Para cada tópico, informe o número [n] e a URL exata da notícia de origem.',
    'Use "{{categoria}}" no campo categoria.{{memoria}}',
    '',
    '{{manchetes}}'
  ].join('\n'),
  preparar: (p) => ({
    data: p.data,
    categoria: p.categoria,
    maxTopicos: String(p.maxTopicos),
    memoria: p.memoria
      ? `\n\nContexto pessoal do leitor, use SÓ para desempatar a seleção a favor do que interessa a ele (sem deixar de fora fatos de grande relevância geral). Não mencione esse contexto no resumo:\n${p.memoria}`
      : '',
    manchetes: p.manchetes
  }),
  exemplo: { data: ex('data'), categoria: ex('categoria'), maxTopicos: 6, memoria: EX_MEMORIA, manchetes: `[1] ${ex('manchete')} (${ex('fonte')})\nURL: ${ex('url')}` }
})
