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
const MOVE_START = /^\s*(resgate|aplica[cç][aã]o|aplic\.?|investimento|dinheiro guardado|dinheiro resgatado)\b|\bvalor (transferido para|recebido de) investimentos?\b/i
const PRODUCTS = /\b(rdb|cdb|lci|lca|cra|cri|tesouro direto|tesouro selic|cofrinho|caixinha)\b/i

/** Operações do Open Finance que são pagamento/transferência a terceiros — nunca aplicação, mesmo se a categoria disser "Investments". */
const PAYMENT_OPERATIONS = new Set(['PIX', 'TED', 'DOC', 'BOLETO', 'CONVENIO_ARRECADACAO', 'CARTAO', 'TRANSFERENCIA_MESMA_INSTITUICAO', 'SAQUE'])

/**
 * Aplicação/resgate de investimento. Sinais, em ordem: operationType do Open Finance
 * (RESGATE_APLIC_FINANCEIRA = resgate; RENDIMENTO_APLIC_FINANCEIRA = rendimento, receita real),
 * descrição ("Resgate RDB", "Valor transferido para Investimentos"…) e, por último, a categoria
 * "Investments" da Pluggy — só quando a operação não é um pagamento a terceiros (um Pix para uma
 * corretora de câmbio como a Wise vem categorizado como "Investments", mas é gasto).
 */
export function detectInvestmentMove(description: string | null | undefined, category?: string | null, operationType?: string | null): boolean {
  const d = description ?? ''
  const op = (operationType ?? '').toUpperCase()
  if (op === 'RENDIMENTO_APLIC_FINANCEIRA') return false
  if (REAL_INCOME.test(d)) return false
  if (op === 'RESGATE_APLIC_FINANCEIRA') return true
  if (MOVE_START.test(d) || PRODUCTS.test(d)) return true
  return !!category && PLUGGY_INVESTMENT_CATEGORIES.has(category.toLowerCase()) && !PAYMENT_OPERATIONS.has(op)
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

// ── Natureza da transação ──────────────────────────────────────────────────────

/** normal = receita/gasto real; investment = aplicação/resgate; transfer = entre contas próprias. */
export type TransactionKind = 'normal' | 'investment' | 'transfer'

export function transactionKind(t: { investment?: number | null; transfer?: number | null }): TransactionKind {
  if (t.investment) return 'investment'
  if (t.transfer) return 'transfer'
  return 'normal'
}

/** Entra nos totais de receita/gasto (orçamento, dashboard, relatórios…)? */
export function countsInTotals(t: { ignoredReason?: string | null; investment?: number | null; transfer?: number | null }): boolean {
  return !t.ignoredReason && !t.investment && !t.transfer
}

/** Transferência entre contas do próprio usuário (categoria "Same person transfer" do Pluggy ou descrição explícita). */
export function detectOwnTransfer(description: string | null | undefined, category?: string | null): boolean {
  if (category && normalizeText(category).startsWith('same person transfer')) return true
  return /\b(transfer[eê]ncia entre contas|entre contas pr[oó]prias|mesma titularidade)\b/i.test(description ?? '')
}

// ── Forma de pagamento ─────────────────────────────────────────────────────────

export type PaymentMethod = 'credito' | 'debito' | 'pix' | 'ted' | 'boleto' | 'transferencia' | 'saque' | 'deposito'

export const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: string }[] = [
  { id: 'credito', label: 'Cartão de crédito', icon: '💳' },
  { id: 'debito', label: 'Cartão de débito', icon: '💳' },
  { id: 'pix', label: 'Pix', icon: '⚡' },
  { id: 'ted', label: 'TED/DOC', icon: '🏦' },
  { id: 'boleto', label: 'Boleto', icon: '🧾' },
  { id: 'transferencia', label: 'Transferência', icon: '🔄' },
  { id: 'saque', label: 'Saque', icon: '💵' },
  { id: 'deposito', label: 'Depósito', icon: '📥' }
]

export function paymentMethodLabel(id: string | null | undefined): string {
  return PAYMENT_METHODS.find((p) => p.id === id)?.label ?? 'Não identificada'
}

/** operationType do Open Finance (conta corrente) → forma de pagamento. */
const OPERATION_TYPE_MAP: Record<string, PaymentMethod> = {
  PIX: 'pix',
  TED: 'ted',
  DOC: 'ted',
  BOLETO: 'boleto',
  CONVENIO_ARRECADACAO: 'boleto',
  CARTAO: 'debito',
  TRANSFERENCIA_MESMA_INSTITUICAO: 'transferencia',
  SAQUE: 'saque',
  DEPOSITO: 'deposito'
}

/**
 * Forma de pagamento: conta de cartão de crédito → crédito; senão o que o banco informar
 * (paymentData.paymentMethod, operationType); por último, pistas da descrição. null = não deu para saber.
 */
export function detectPaymentMethod(
  description: string | null | undefined,
  hints: { accountType?: string | null; paymentMethod?: string | null; operationType?: string | null } = {}
): PaymentMethod | null {
  if (hints.accountType === 'CREDIT') return 'credito'
  const pm = (hints.paymentMethod ?? '').toUpperCase()
  if (pm && OPERATION_TYPE_MAP[pm]) return OPERATION_TYPE_MAP[pm]
  const op = (hints.operationType ?? '').toUpperCase()
  if (op && OPERATION_TYPE_MAP[op]) return OPERATION_TYPE_MAP[op]
  const d = normalizeText(description ?? '')
  if (!d) return null
  if (/\bpix\b/.test(d)) return 'pix'
  if (/\bboleto\b/.test(d)) return 'boleto'
  if (/\b(ted|doc)\b/.test(d)) return 'ted'
  if (/\b(compra no debito|debito visa|debito master|cartao de debito|compra debito)\b/.test(d)) return 'debito'
  if (/\bsaque\b/.test(d)) return 'saque'
  // "depósito" sozinho costuma ser nome de loja (depósito de bebidas); exige contexto bancário
  if (/\bdeposito (recebido|em conta|em dinheiro|bancario|via|por envelope|identificado)\b/.test(d)) return 'deposito'
  if (/^transferencia (enviada|recebida)\b/.test(d)) return 'transferencia'
  // parcela "n/N" só existe em cartão de crédito
  if (/(?<![\d/])\d{1,2}\s*\/\s*\d{1,2}(?![\d/])/.test(d)) {
    const m = /(?<![\d/])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d/])/.exec(d)!
    const n = Number(m[1])
    const tot = Number(m[2])
    if (n >= 1 && tot >= 2 && n <= tot) return 'credito'
  }
  if (/\b(cartao de credito|credito de ")/.test(d)) return 'credito'
  return null
}

// ── Investimentos do Open Finance ──────────────────────────────────────────────

/** Detalhes guardados de um investimento sincronizado do Open Finance (Pluggy). */
export interface InvestmentDetails {
  source: 'pluggy'
  kind: string // tipo amigável: CDB, Tesouro, Fundo, Ação, FII…
  rateText: string | null // ex.: "100% CDI", "12,5% a.a."
  dueDate: string | null // YYYY-MM-DD
  issuer: string | null
  gross: number | null // valor bruto (antes de IR/IOF)
  incomeTax: number | null // IR
  iof: number | null
  withdrawable: number | null // disponível para resgate
  quantity: number | null
  code: string | null // ticker
  syncedAt: string // ISO
}

const PLUGGY_KIND: Record<string, string> = {
  CDB: 'CDB', LCI: 'LCI', LCA: 'LCA', LC: 'LC', CRI: 'CRI', CRA: 'CRA', LIG: 'LIG', LF: 'LF', DEBENTURES: 'Debênture', TREASURY: 'Tesouro',
  RETIREMENT: 'Previdência', PGBL: 'PGBL', VGBL: 'VGBL',
  INVESTMENT_FUND: 'Fundo', STOCK_FUND: 'Fundo de ações', MULTIMARKET_FUND: 'Fundo multimercado', EXCHANGE_FUND: 'Fundo cambial',
  FIXED_INCOME_FUND: 'Fundo de renda fixa', FIP_FUND: 'FIP', OFFSHORE_FUND: 'Fundo offshore', ETF_FUND: 'Fundo de ETF',
  STOCK: 'Ação', BDR: 'BDR', REAL_ESTATE_FUND: 'FII', DERIVATIVES: 'Derivativo', OPTION: 'Opção', ETF: 'ETF', STRUCTURED_NOTE: 'COE'
}

export function pluggyInvestmentKind(type: string | null | undefined, subtype: string | null | undefined): string {
  return PLUGGY_KIND[subtype ?? ''] ?? PLUGGY_KIND[type ?? ''] ?? (type === 'FIXED_INCOME' ? 'Renda fixa' : 'Investimento')
}

/** "100% CDI", "IPCA + 6% a.a.", "12,5% a.a." — a partir de rate/rateType/fixedAnnualRate. */
export function pluggyRateText(rate: number | null | undefined, rateType: string | null | undefined, fixedAnnualRate: number | null | undefined): string | null {
  const fmt = (n: number): string => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  if (rateType && rate != null) {
    if (rateType === 'IPCA' || rateType === 'IGPM') return `${rateType}${fixedAnnualRate ? ` + ${fmt(fixedAnnualRate)}% a.a.` : ''}`
    return `${fmt(rate)}% ${rateType}`
  }
  if (fixedAnnualRate != null) return `${fmt(fixedAnnualRate)}% a.a.`
  return null
}

// ── Recorrência (assinaturas, contas fixas, salário) ─────────────────────────

/**
 * Chave do "estabelecimento" para agrupar recorrências: descrição sem acentos, sem números,
 * sem códigos de pedido (ex.: "Airbnb * Hm984pdp2m" → "airbnb") e com o tipo.
 */
export function recurringKey(description: string | null | undefined, type: string): string {
  let d = normalizeText(description ?? '')
  d = d.replace(/\*\s*\S*\d\S*/g, ' ') // códigos após "*" com dígitos
  d = d.replace(/[0-9]+/g, ' ').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim()
  return d ? `${type}:${d}` : ''
}

interface RecurringCandidate {
  id: number
  date: string
  amount: number
  type: string
  description: string | null
  ignoredReason?: string | null
  investment?: number | null
  transfer?: number | null
  installmentTotal?: number | null
}

const INSTALLMENT_RE = /(?<![\d/])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d/])/
const CHARGE_RE = /\b(iof|juros|multa|encargos?)\b/i

const dayDiff = (a: string, b: string): number => (Date.parse(b) - Date.parse(a)) / 86_400_000

/**
 * Ids das transações recorrentes: mesma chave, ≥ 3 ocorrências encadeadas com ~1 mês entre elas
 * (25–35 dias) e valor variando até 10%. Parcelas, encargos, ignoradas, investimentos e
 * transferências ficam de fora. Regra igual à da análise de recorrência da Pluggy.
 */
export function detectRecurringIds(txs: RecurringCandidate[]): Set<number> {
  const groups = new Map<string, RecurringCandidate[]>()
  for (const t of txs) {
    if (t.ignoredReason || t.investment || t.transfer) continue
    if (t.installmentTotal && t.installmentTotal >= 2) continue // parcela (campo do Open Finance)
    const d = t.description ?? ''
    if (CHARGE_RE.test(d)) continue
    const inst = INSTALLMENT_RE.exec(d)
    if (inst && Number(inst[2]) >= 2 && Number(inst[1]) <= Number(inst[2])) continue
    const k = recurringKey(d, t.type)
    if (!k) continue
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(t)
  }
  const out = new Set<number>()
  for (const list of groups.values()) {
    if (list.length < 3) continue
    list.sort((a, b) => a.date.localeCompare(b.date))
    // encadeia: de cada transação, a próxima ~1 mês depois com valor parecido
    for (let i = 0; i < list.length; i++) {
      const chain = [list[i]]
      let cur = list[i]
      for (let j = i + 1; j < list.length; j++) {
        const gap = dayDiff(cur.date, list[j].date)
        if (gap < 25) continue
        if (gap > 35) break
        if (Math.abs(list[j].amount - cur.amount) <= 0.1 * Math.max(cur.amount, list[j].amount)) {
          chain.push(list[j])
          cur = list[j]
        }
      }
      if (chain.length >= 3) for (const c of chain) out.add(c.id)
    }
  }
  return out
}

// ── Dias úteis (feriados nacionais do Brasil) ──────────────────────────────────

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function easter(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

const ymd = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Feriados nacionais (fixos + Carnaval, Sexta-feira Santa e Corpus Christi) como YYYY-MM-DD. */
export function brazilHolidays(year: number): Set<string> {
  const fixed = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map((md) => `${year}-${md}`)
  const e = easter(year)
  const shift = (days: number): string => ymd(new Date(e.getFullYear(), e.getMonth(), e.getDate() + days))
  return new Set([...fixed, shift(-48), shift(-47), shift(-2), shift(60)])
}

/** Primeiro dia útil (seg–sex, fora feriados nacionais) do mês, como YYYY-MM-DD. */
export function firstBusinessDay(year: number, month: number): string {
  const holidays = brazilHolidays(year)
  for (let day = 1; day <= 31; day++) {
    const d = new Date(year, month - 1, day)
    if (d.getMonth() !== month - 1) break
    const wd = d.getDay()
    if (wd !== 0 && wd !== 6 && !holidays.has(ymd(d))) return ymd(d)
  }
  return ymd(new Date(year, month - 1, 1))
}

// ── Estornos ───────────────────────────────────────────────────────────────────

export const REFUND_REASON = 'Estorno de compra'
export const REFUNDED_REASON = 'Compra estornada'

/** Estorno/crédito de compra (não é pagamento de fatura nem resgate). */
export function isRefund(t: { type: string; description: string | null; paymentMethod?: string | null; investment?: number | null }): boolean {
  if (t.type !== 'income' || t.investment) return false
  const d = normalizeText(t.description ?? '')
  if (/^pagamento recebido\b|\bfatura\b/.test(d)) return false
  return /^(estorno|credito de ")|\bestorno\b/.test(d)
}

/** Loja citada no estorno: 'Crédito de "WEIXIN*Ctrip. Com"' → 'weixin*ctrip. com'; "Estorno de compra" → null. */
export function refundMerchant(description: string | null): string | null {
  const m = /cr[eé]dito de "([^"]+)"/i.exec(description ?? '')
  return m ? normalizeText(m[1]) : null
}

interface RefundTx {
  id: number
  date: string
  amount: number
  type: string
  description: string | null
  paymentMethod?: string | null
  investment?: number | null
  ignoredReason?: string | null
  refundOf?: number | null
}

/**
 * Pareia estornos com a compra original: compra até 90 dias antes (ou no mesmo dia); valor igual
 * (±1 centavo) ou, quando o estorno cita a loja ou é de IOF, até 5% de diferença (câmbio); se cita a
 * loja, a descrição da compra tem de começar por ela. Fica com a compra de valor mais próximo. Estornos já decididos (refundOf != null) e compras já ignoradas ficam de fora.
 * Retorna pares [estornoId, compraId].
 */
export function pairRefunds(txs: RefundTx[]): [number, number][] {
  const purchases = txs
    .filter((t) => t.type === 'expense' && !t.ignoredReason)
    .sort((a, b) => b.date.localeCompare(a.date))
  const taken = new Set<number>()
  const out: [number, number][] = []
  const refunds = txs.filter((t) => t.refundOf == null && !t.ignoredReason && isRefund(t)).sort((a, b) => a.date.localeCompare(b.date))
  for (const r of refunds) {
    const merchant = refundMerchant(r.description)
    const isIofRefund = /\biof\b/i.test(r.description ?? '')
    const rd = Date.parse(r.date)
    // compra internacional estornada volta com outro câmbio: com loja identificada (ou estorno de IOF)
    // aceita até 5% de diferença e fica com a mais próxima em valor; sem loja, só valor exato.
    const tolerant = !!merchant || isIofRefund
    const candidates = purchases.filter((p) => {
      if (taken.has(p.id)) return false
      const diff = Math.abs(p.amount - r.amount)
      if (tolerant ? diff > Math.max(0.011, 0.05 * p.amount) : diff > 0.011) return false
      const days = (rd - Date.parse(p.date)) / 86_400_000
      if (days < 0 || days > 90) return false
      const pd = normalizeText(p.description ?? '')
      if (isIofRefund !== /\biof\b/.test(pd)) return false
      return !merchant || pd.startsWith(merchant.slice(0, 12))
    })
    const match = candidates.sort((a, b) => Math.abs(a.amount - r.amount) - Math.abs(b.amount - r.amount) || b.date.localeCompare(a.date))[0]
    if (match) {
      taken.add(match.id)
      out.push([r.id, match.id])
    }
  }
  return out
}

// ── Grupos de investimento ─────────────────────────────────────────────────────

export type InvestmentGroup = 'renda-fixa' | 'bolsa' | 'fundos' | 'crypto' | 'tesouro' | 'outros'

export const INVESTMENT_GROUPS: { id: InvestmentGroup; label: string; icon: string }[] = [
  { id: 'renda-fixa', label: 'Renda fixa', icon: '🏦' },
  { id: 'bolsa', label: 'Bolsa de valores', icon: '📊' },
  { id: 'fundos', label: 'Fundos de investimento', icon: '🧺' },
  { id: 'crypto', label: 'Crypto', icon: '🪙' },
  { id: 'tesouro', label: 'Tesouro direto', icon: '🇧🇷' },
  { id: 'outros', label: 'Outros', icon: '📦' }
]

/** Grupo de investimento salvo no banco (os de `INVESTMENT_GROUPS` são os padrão; dá para criar mais). */
export interface InvestmentGroupDef {
  key: string // padrão: o id de INVESTMENT_GROUPS; criados: "g<timestamp>"
  label: string
  icon: string
  sortOrder: number
  builtin: number // 1 = padrão (não pode excluir; recebe os itens pela inferência do tipo)
}

/**
 * Grupo efetivo de um investimento: o escolhido pelo usuário (`groupKey`, se o grupo ainda existe)
 * ou o inferido pelo tipo/nome.
 */
export function resolveInvestmentGroup(
  inv: { type: string | null; name: string; groupKey?: string | null },
  existingKeys: ReadonlySet<string>
): string {
  if (inv.groupKey && existingKeys.has(inv.groupKey)) return inv.groupKey
  return investmentGroup(inv.type, inv.name)
}

/**
 * Grupo pelo tipo amigável do investimento (o que a sincronização grava em `type`, ex.: "CDB",
 * "Ação", "FII", "Fundo de renda fixa", "Tesouro") ou pelo texto livre de um investimento manual.
 */
export function investmentGroup(type: string | null | undefined, name?: string | null): InvestmentGroup {
  const t = normalizeText(`${type ?? ''} ${type ? '' : (name ?? '')}`)
  if (/\b(cripto|crypto|bitcoin|btc|eth|ethereum|usdt|solana)\b/.test(t)) return 'crypto'
  if (/\btesouro\b/.test(t)) return 'tesouro'
  if (/\bfii\b|fundo imobiliario/.test(t)) return 'bolsa' // FII é negociado em bolsa
  if (/\b(fundo|fundos|fip|previdencia|pgbl|vgbl)\b/.test(t)) return 'fundos'
  if (/\b(acao|acoes|bdr|etf|opcao|derivativo|stock|bolsa)\b/.test(t)) return 'bolsa'
  if (/\b(cdb|rdb|lci|lca|lc|cri|cra|lig|lf|debenture|renda fixa|poupanca|caixinha)\b/.test(t)) return 'renda-fixa'
  return 'outros'
}
