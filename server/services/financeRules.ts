import { getCategories, getFinanceRules, getTransactions, DbTransaction } from '../database/queries'
import { matchFinanceRule } from '../../shared/finance'

/** "Outros": categoria padrão das importações. Regras só recategorizam o que está aqui ou sem categoria. */
export const FALLBACK_CATEGORY_ID = 6

const uncategorized = (t: { categoryId: number | null }): boolean =>
  t.categoryId == null || t.categoryId === FALLBACK_CATEGORY_ID

/** Aplica as regras ativas às transações novas (importação) que chegaram sem categoria ou em "Outros". */
export async function categorizeNew<T extends Omit<DbTransaction, 'id'>>(rows: T[]): Promise<T[]> {
  const rules = await getFinanceRules()
  if (!rules.some((r) => r.active)) return rows
  const categories = await getCategories()
  return rows.map((r) => {
    if (!uncategorized(r)) return r
    const rule = matchFinanceRule(rules, categories, r.description, r.type)
    return rule ? { ...r, categoryId: rule.categoryId } : r
  })
}

export interface RulePreviewItem {
  id: number
  date: string
  description: string | null
  amount: number
  currency: string
  type: string
  toCategoryId: number
  ruleId: number
}

/**
 * O que as regras mudariam nas transações existentes sem categoria ou em "Outros"
 * (de `month`, ou de todos os meses). Categorias escolhidas pelo usuário não entram.
 */
export async function previewFinanceRules(month?: string): Promise<RulePreviewItem[]> {
  const [rules, categories, txs] = await Promise.all([getFinanceRules(), getCategories(), getTransactions(month)])
  const out: RulePreviewItem[] = []
  for (const t of txs) {
    if (!uncategorized(t) || t.ignoredReason) continue
    const rule = matchFinanceRule(rules, categories, t.description, t.type)
    if (rule && rule.categoryId !== t.categoryId) {
      out.push({ id: t.id, date: t.date, description: t.description, amount: t.amount, currency: t.currency, type: t.type, toCategoryId: rule.categoryId, ruleId: rule.id })
    }
  }
  return out
}
