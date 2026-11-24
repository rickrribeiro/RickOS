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

// ── Regras de categorização ────────────────────────────────────────────────────

export interface FinanceRule {
  id: number
  categoryId: number
  keywords: string // separadas por vírgula
  active: number // 1 = ativa
  position: number // menor = mais prioritária
}

/** minúsculas, sem acentos e com espaços colapsados — para comparar descrições. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseKeywords(keywords: string): string[] {
  return keywords
    .split(',')
    .map((k) => normalizeText(k))
    .filter(Boolean)
}

/**
 * Primeira regra ativa (por `position`) cuja categoria é do mesmo tipo da transação e que
 * tem alguma palavra contida na descrição. null se nenhuma bate.
 */
export function matchFinanceRule<R extends FinanceRule>(
  rules: R[],
  categories: { id: number; type: string }[],
  description: string | null | undefined,
  type: string
): R | null {
  const d = normalizeText(description ?? '')
  if (!d) return null
  const typeOf = new Map(categories.map((c) => [c.id, c.type]))
  const ordered = [...rules].sort((a, b) => a.position - b.position || a.id - b.id)
  for (const r of ordered) {
    if (!r.active || typeOf.get(r.categoryId) !== type) continue
    if (parseKeywords(r.keywords).some((k) => d.includes(k))) return r
  }
  return null
}
