import { getTransactions, applyRefundPairs } from '../database/queries'
import { pairRefunds, REFUND_REASON, REFUNDED_REASON } from '../../shared/finance'

/** Pareia estornos novos com as compras originais (as duas saem dos cálculos). Retorna quantos pares. */
export async function reconcileRefunds(): Promise<number> {
  const pairs = pairRefunds(await getTransactions())
  if (pairs.length) await applyRefundPairs(pairs, REFUND_REASON, REFUNDED_REASON)
  return pairs.length
}
