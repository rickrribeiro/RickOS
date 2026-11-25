import { getTransactions, getRecurringOverrides, setTransactionsRecurring } from '../database/queries'
import { detectRecurringIds, recurringKey } from '../../shared/finance'

/**
 * Recalcula o flag `recurring` de todas as transações: detecção automática (shared/finance)
 * + exceções do usuário por estabelecimento (sempre/nunca). Barato (~ms para milhares de linhas).
 */
export async function recomputeRecurring(): Promise<number> {
  const [txs, overrides] = await Promise.all([getTransactions(), getRecurringOverrides()])
  const auto = detectRecurringIds(txs)
  const byKey = new Map(overrides.map((o) => [o.key, o.recurring]))
  const ids = new Set<number>()
  for (const t of txs) {
    const o = byKey.get(recurringKey(t.description, t.type))
    if (o === 1 || (o == null && auto.has(t.id))) ids.add(t.id)
  }
  return setTransactionsRecurring(ids)
}
