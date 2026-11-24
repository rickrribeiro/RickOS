import {
  getSetting,
  getTransactions,
  bulkInsertTransactions,
  applyExternalTransactionUpdate,
  DbTransaction
} from '../database/queries'
import { decodeSecret } from './secrets'
import { detectInvestmentMove } from '../../shared/finance'

const PLUGGY_API = 'https://api.pluggy.ai'
const OUTROS_CATEGORY_ID = 6 // seeded "Outros"

interface PluggyAccount {
  id: string
  type?: string // BANK | CREDIT
  currencyCode?: string
}
interface PluggyTransaction {
  id: string
  description?: string
  amount: number
  amountInAccountCurrency?: number | null
  currencyCode?: string
  date: string
  type?: string // DEBIT | CREDIT
  status?: string // PENDING | POSTED
  category?: string | null
  operationType?: string | null // ex.: PAGAMENTO_FATURA
}

/**
 * Pagamento da fatura do cartão: aparece como "Pagamento de fatura" na conta corrente e como
 * "Pagamento recebido" na conta do cartão. As compras do cartão já entram uma a uma, então
 * contar esses lançamentos duplicaria o gasto. Eles são importados, mas marcados como
 * ignorados (fora dos cálculos); o usuário pode marcá-los como válidos na tela.
 */
function isCardBillPayment(t: PluggyTransaction, acc: PluggyAccount): boolean {
  if (t.operationType === 'PAGAMENTO_FATURA') return true
  if ((t.category ?? '').toLowerCase() === 'credit card payment') return true
  const d = (t.description ?? '').toLowerCase()
  if (/\b(pagamento|pagto|pgto|pag)\.? (de |da )?fatura\b/.test(d)) return true
  // na conta do cartão, crédito "Pagamento recebido" é a fatura sendo quitada
  return acc.type === 'CREDIT' && /^pagamento recebido\b/.test(d)
}

/** Manual FX config from settings: base currency + rates (value of 1 unit in base). */
async function loadFx(): Promise<{ base: string; rates: Record<string, number> }> {
  const base = (await getSetting('finance_base')) || 'BRL'
  let rates: Record<string, number> = {}
  try {
    const raw = await getSetting('finance_rates')
    rates = raw ? JSON.parse(raw) : {}
  } catch {
    rates = {}
  }
  return { base, rates }
}

/**
 * Convert a Pluggy transaction to BRL. Prefers the value already in the account's
 * currency (bank-converted BRL for a Brazilian account); otherwise applies manual
 * FX rates; last resort keeps the number (best-effort) — always labeled BRL.
 */
function toBrl(t: PluggyTransaction, acc: PluggyAccount, fx: { base: string; rates: Record<string, number> }): number {
  const cur = (t.currencyCode || acc.currencyCode || 'BRL').toUpperCase()
  if (cur === 'BRL') return Math.abs(t.amount)
  const accCur = (acc.currencyCode || 'BRL').toUpperCase()
  if (accCur === 'BRL' && t.amountInAccountCurrency != null) return Math.abs(t.amountInAccountCurrency)
  // manual rates: value of 1 <cur> in base; brl only meaningful if base is BRL
  const rate = fx.rates[cur]
  if (fx.base === 'BRL' && rate) return Math.abs(t.amount) * rate
  return Math.abs(t.amount) // sem taxa: mantém o número (rotulado BRL)
}

async function apiKey(): Promise<string> {
  const clientId = (decodeSecret(await getSetting('pluggy_client_id')) ?? '').trim()
  const clientSecret = (decodeSecret(await getSetting('pluggy_client_secret')) ?? '').trim()
  if (!clientId || !clientSecret) {
    throw new Error('Configure o Client ID e o Client Secret do Pluggy em Configurações.')
  }
  let res: Response
  try {
    res = await fetch(`${PLUGGY_API}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret })
    })
  } catch (e) {
    throw new Error(`Sem conexão com o Pluggy: ${e instanceof Error ? e.message : String(e)}`)
  }
  const body = await res.text().catch(() => '')
  let json: { apiKey?: string; message?: string } = {}
  try {
    json = JSON.parse(body)
  } catch {
    // non-JSON response
  }
  if (!res.ok || !json.apiKey) {
    const detail = json.message || body.slice(0, 160) || res.statusText
    throw new Error(`Falha ao autenticar no Pluggy (${res.status}). ${detail}`)
  }
  return json.apiKey
}

/**
 * Create a Pluggy Connect token (server-side) so the renderer can open the
 * Pluggy Connect widget and let the user link a bank (which yields an itemId).
 */
export async function createConnectToken(): Promise<string> {
  const key = await apiKey()
  let res: Response
  try {
    res = await fetch(`${PLUGGY_API}/connect_token`, {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
  } catch (e) {
    throw new Error(`Sem conexão com o Pluggy: ${e instanceof Error ? e.message : String(e)}`)
  }
  const body = await res.text().catch(() => '')
  let json: { accessToken?: string; message?: string } = {}
  try {
    json = JSON.parse(body)
  } catch {
    // non-JSON
  }
  if (!res.ok || !json.accessToken) {
    throw new Error(`Falha ao criar connect token (${res.status}). ${json.message || body.slice(0, 160)}`)
  }
  return json.accessToken
}

async function get<T>(path: string, key: string): Promise<T> {
  const res = await fetch(`${PLUGGY_API}${path}`, { headers: { 'X-API-KEY': key } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Pluggy ${path} falhou (${res.status}). ${body.slice(0, 120)}`)
  }
  return (await res.json()) as T
}

/**
 * Fetch every transaction of an account via the cursor-paginated `/v2/transactions`
 * endpoint (the old page-based `/transactions` was deprecated → 410). Pages are a
 * fixed 500 (no `pageSize` param — it 400s); `next` is a URL carrying the `after`
 * cursor, null when exhausted.
 */
async function fetchAllTransactions(accountId: string, key: string): Promise<PluggyTransaction[]> {
  const out: PluggyTransaction[] = []
  let after: string | null = null
  for (let i = 0; i < 200; i++) {
    const qs = new URLSearchParams({ accountId })
    if (after) qs.set('after', after)
    const page = await get<{ results: PluggyTransaction[]; next: string | null }>(
      `/v2/transactions?${qs.toString()}`,
      key
    )
    out.push(...(page.results ?? []))
    if (!page.next) break
    try {
      after = new URL(page.next, PLUGGY_API).searchParams.get('after')
    } catch {
      after = null
    }
    if (!after) break
  }
  return out
}

/** Transação pendente que estava no banco do app mas o Pluggy não devolve mais (cancelada ou substituída). */
export interface VanishedPending {
  id: number
  date: string
  description: string | null
  amount: number
  currency: string
}

export interface PluggySyncResult {
  imported: number
  updated: number
  skipped: number
  vanishedPending: VanishedPending[]
}

type Incoming = Omit<DbTransaction, 'id'> & { externalId: string; externalSig: string; pending: number }

const legacyKey = (t: { date: string; amount: number; description?: string | null }): string =>
  `${t.date}|${t.amount}|${t.description ?? ''}`

/**
 * Open Finance (Brasil) via the Pluggy aggregator.
 * Requires the user's Pluggy clientId/clientSecret and an itemId (a bank connected
 * through Pluggy Connect). Pulls transactions for all accounts of the item and syncs them
 * by the Pluggy transaction id:
 *  - nova → insere (só as do `month`, se informado);
 *  - já importada e o banco mudou valor/descrição/data/tipo/status → atualiza esses campos,
 *    mantendo categoria e "ignorada". Edição manual do usuário não é sobrescrita: só aplica o
 *    que mudou em relação ao que o banco mandou da última vez (`externalSig`);
 *  - importada antes do id existir (casada por data+valor+descrição) → só vincula o id.
 * Pendentes que sumiram do Pluggy voltam em `vanishedPending` para o usuário decidir; nada
 * é apagado aqui.
 */
export async function syncPluggy(month?: string): Promise<PluggySyncResult> {
  if (month && !/^\d{4}-\d{2}$/.test(month)) throw new Error(`Mês inválido: ${month}`)
  const itemId = (await getSetting('pluggy_item_id')) ?? ''
  if (!itemId) throw new Error('Configure o Item ID do Pluggy (banco conectado) em Configurações.')

  const key = await apiKey()
  const accounts = (await get<{ results: PluggyAccount[] }>(`/accounts?itemId=${encodeURIComponent(itemId)}`, key)).results
  if (!accounts || accounts.length === 0) {
    throw new Error('Nenhuma conta encontrada para esse Item ID. Verifique se o Item está conectado e pronto no Pluggy (e se o Item ID está correto).')
  }

  const fx = await loadFx()
  const incoming: Incoming[] = []
  const seenIds = new Set<string>() // tudo que o Pluggy devolveu, sem filtro de mês
  for (const acc of accounts) {
    const txs = await fetchAllTransactions(acc.id, key)
    for (const t of txs) {
      seenIds.add(t.id)
      // Cartão (docs Pluggy): compra = valor positivo, pagamento/estorno = negativo; o `type`
      // não é confiável ali (compra parcelada pode vir CREDIT). Conta corrente: DEBIT/negativo = saída.
      const isExpense = acc.type === 'CREDIT' ? t.amount > 0 : t.type === 'DEBIT' || t.amount < 0
      const row = {
        accountId: null,
        categoryId: OUTROS_CATEGORY_ID,
        amount: Math.round(toBrl(t, acc, fx) * 100) / 100, // padroniza tudo em BRL
        currency: 'BRL',
        type: isExpense ? 'expense' : 'income',
        description: t.description ?? null,
        date: t.date.slice(0, 10),
        ignoredReason: isCardBillPayment(t, acc) ? 'Pagamento de fatura do cartão' : null,
        investment: detectInvestmentMove(t.description, t.category) ? 1 : 0,
        externalId: t.id,
        pending: t.status === 'PENDING' ? 1 : 0
      }
      incoming.push({ ...row, externalSig: JSON.stringify([row.amount, row.description, row.date, row.type, row.pending]) })
    }
  }

  const existing = await getTransactions()
  const byExternal = new Map<string, DbTransaction>()
  const legacy = new Map<string, DbTransaction[]>() // sem externalId, por data+valor+descrição
  for (const t of existing) {
    if (t.externalId) byExternal.set(t.externalId, t)
    else {
      const k = legacyKey(t)
      legacy.set(k, [...(legacy.get(k) ?? []), t])
    }
  }

  const fresh: Incoming[] = []
  let updated = 0
  let skipped = 0
  for (const inc of incoming) {
    const cur = byExternal.get(inc.externalId)
    if (cur) {
      if (cur.externalSig === inc.externalSig) {
        if (!month || inc.date.startsWith(month)) skipped++
        continue
      }
      // o banco mudou algo: aplica só os campos que mudaram em relação à última versão do banco
      let prev: unknown[] | null = null
      try {
        prev = cur.externalSig ? JSON.parse(cur.externalSig) : null
      } catch {
        prev = null
      }
      const fields: Partial<Pick<DbTransaction, 'amount' | 'description' | 'date' | 'type'>> = {}
      const next = [inc.amount, inc.description, inc.date, inc.type] as const
      ;(['amount', 'description', 'date', 'type'] as const).forEach((k, i) => {
        const bankChanged = !prev || prev[i] !== next[i]
        if (bankChanged && cur[k] !== next[i]) Object.assign(fields, { [k]: next[i] })
      })
      await applyExternalTransactionUpdate(cur.id, fields, inc.externalId, inc.externalSig, inc.pending)
      updated++
      continue
    }
    if (month && !inc.date.startsWith(month)) continue
    // importada por versão antiga (sem id): vincula em vez de duplicar
    const old = legacy.get(legacyKey(inc))?.shift()
    if (old) {
      await applyExternalTransactionUpdate(old.id, {}, inc.externalId, inc.externalSig, inc.pending)
      skipped++
      continue
    }
    fresh.push(inc)
  }

  if (fresh.length) await bulkInsertTransactions(fresh)

  const vanishedPending: VanishedPending[] = existing
    .filter((t) => t.externalId && t.pending && !seenIds.has(t.externalId) && (!month || t.date.startsWith(month)))
    .map((t) => ({ id: t.id, date: t.date, description: t.description, amount: t.amount, currency: t.currency }))

  return { imported: fresh.length, updated, skipped, vanishedPending }
}

/** Whether Pluggy credentials + item are configured. */
export async function pluggyConfigured(): Promise<boolean> {
  return !!(await getSetting('pluggy_client_id')) && !!(await getSetting('pluggy_item_id'))
}
