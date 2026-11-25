import { getTransactions, getRecurringOverrides, setTransactionsRecurring } from '../database/queries'
import { detectRecurringIds, recurringKey } from '../../shared/finance'

/**
 * Recalcula o flag `recurring`: só o que o usuário CONFIRMOU (exceção = 1 por estabelecimento) é
 * recorrente — todas as transações daquele estabelecimento, inclusive as que chegarem depois.
 * A detecção automática não marca nada; vira sugestão (`recurringSuggestions`).
 */
export async function recomputeRecurring(): Promise<number> {
  const [txs, overrides] = await Promise.all([getTransactions(), getRecurringOverrides()])
  const confirmed = new Set(overrides.filter((o) => o.recurring === 1).map((o) => o.key))
  const ids = new Set<number>()
  for (const t of txs) if (confirmed.has(recurringKey(t.description, t.type))) ids.add(t.id)
  return setTransactionsRecurring(ids)
}

export interface RecurringSuggestion {
  key: string
  label: string // descrição mais recente
  type: string
  count: number
  avgAmount: number
  currency: string
  lastDate: string
}

/** Estabelecimentos com padrão de recorrência ainda não decididos pelo usuário (nem confirmados nem descartados). */
export async function recurringSuggestions(): Promise<RecurringSuggestion[]> {
  const [txs, overrides] = await Promise.all([getTransactions(), getRecurringOverrides()])
  const decided = new Set(overrides.map((o) => o.key))
  const auto = detectRecurringIds(txs)
  const byKey = new Map<string, { list: typeof txs }>()
  for (const t of txs) {
    if (!auto.has(t.id)) continue
    const k = recurringKey(t.description, t.type)
    if (!k || decided.has(k)) continue
    if (!byKey.has(k)) byKey.set(k, { list: [] })
    byKey.get(k)!.list.push(t)
  }
  return [...byKey.entries()]
    .map(([key, { list }]) => {
      const last = list.reduce((a, b) => (b.date > a.date ? b : a))
      return {
        key,
        label: last.description ?? key,
        type: last.type,
        count: list.length,
        avgAmount: Math.round((list.reduce((s, t) => s + t.amount, 0) / list.length) * 100) / 100,
        currency: last.currency,
        lastDate: last.date
      }
    })
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || b.count - a.count)
}
