/** Resumo Diário de Notícias (Google News RSS + Gemini). Tipos puros compartilhados servidor ↔ front. */

export const NEWS_DEFAULT_CATEGORIES = ['Brasil', 'Mundo', 'Tech', 'Finance']

/** Um tópico resumido pelo Gemini, sempre ligado a uma notícia real do feed. */
export interface NewsTopic {
  categoria: string
  titulo_resumido: string
  resumo_curto: string
  /** Link do item do Google News (redireciona para a matéria original). */
  url_fonte: string
  /** Veículo que publicou (ex.: "g1", "Folha"), vindo do RSS. */
  fonte?: string
}

export interface NewsCategoryDigest {
  categoria: string
  topics: NewsTopic[]
  /** Quantas notícias do dia-alvo vieram do RSS (antes do resumo). */
  collected: number
  /** Quantas memórias pessoais entraram no prompt desta categoria (ausente = nenhuma). */
  memoryItems?: number
  /** Falha só desta categoria (RSS ou Gemini); as outras continuam. */
  error?: string
}

export interface NewsDigest {
  /** Quando a busca rodou (ISO). */
  generatedAt: string
  /** Dia das notícias (YYYY-MM-DD, local do cliente que pediu). */
  targetDate: string
  model: string
  categories: NewsCategoryDigest[]
}

export interface NewsConfig {
  hasGeminiKey: boolean
  categories: string[]
}

export interface NewsState {
  config: NewsConfig
  digest: NewsDigest | null
  /** Notícias abertas em "Ler mais" guardadas como evidência para sugerir memórias. */
  readsCount: number
  /** Busca rodando no servidor (segundo plano); `only` = só essas categorias. null = parado. */
  generating: { only: string[] | null; startedAt: string } | null
  /** Erro da última busca (some quando outra começa). */
  lastError: string | null
}
