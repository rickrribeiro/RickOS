/**
 * Movimentação de investimento: aplicação (saída) ou resgate (entrada). Não é gasto nem
 * receita real — o dinheiro só troca de lugar —, então fica fora dos totais e aparece à parte.
 */

/** Categorias do Pluggy (grupo "Investments") que indicam aplicação/resgate. Rendimentos e dividendos ficam de fora: são receita real. */
const PLUGGY_INVESTMENT_CATEGORIES = new Set(
  [
    'investments',
    'investment',
    'automatic investment',
    'fixed income',
    'fixed income investment',
    'mutual funds',
    'variable income',
    'margin',
    'margin withdrawn',
    'pension'
  ].map((s) => s.toLowerCase())
)

/** Rendimento/juros/dividendos: receita real mesmo citando RDB/CDB. */
const REAL_INCOME = /\b(rendimento|rendimentos|juros|dividendo|dividendos|proventos?|jcp)\b/i
const MOVE_START = /^\s*(resgate|aplica[cç][aã]o|aplic\.?|investimento|dinheiro guardado|dinheiro resgatado)\b/i
const PRODUCTS = /\b(rdb|cdb|lci|lca|cra|cri|tesouro direto|tesouro selic|cofrinho|caixinha)\b/i

export function detectInvestmentMove(description: string | null | undefined, category?: string | null): boolean {
  const d = description ?? ''
  if (REAL_INCOME.test(d)) return false
  if (category && PLUGGY_INVESTMENT_CATEGORIES.has(category.toLowerCase())) return true
  return MOVE_START.test(d) || PRODUCTS.test(d)
}
