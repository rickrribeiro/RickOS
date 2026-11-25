import { create } from 'zustand'
import { Account, Category, Transaction, Budget, Investment, InvestmentHistory } from '../../../types'
import { currentMonth, setMoneyHidden } from '../util'
import { countsInTotals, type TransactionKind } from '../../../../shared/finance'

const HIDDEN_KEY = 'rickos:financeHidden'
const initialHidden = ((): boolean => {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1'
  } catch {
    return false
  }
})()
setMoneyHidden(initialHidden) // keep formatMoney in sync from first render

interface FinanceState {
  month: string
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[] // for `month`, só receitas/gastos reais (sem ignoradas, investimento nem transferência) — base de todo cálculo
  allTransactions: Transaction[] // for reports / evolution, mesmo critério
  investmentMoves: Transaction[] // for `month`, aplicações/resgates (não ignorados) — mostrados à parte
  monthListing: Transaction[] // for `month`, inclusive ignoradas — só para a lista da tela de Transações
  budgets: Budget[] // for `month`
  investments: Investment[]
  investmentHistory: InvestmentHistory[] // all-time monthly snapshots
  base: string
  rates: Record<string, number>
  hidden: boolean // privacy mode: mask money values

  setMonth: (m: string) => void
  toggleHidden: () => void
  refresh: () => Promise<void>
  saveFxConfig: (base: string, rates: Record<string, number>) => Promise<void>

  addAccount: (name: string, currency: string, balance: number) => Promise<void>
  removeAccount: (id: number) => Promise<void>
  addCategory: (name: string, type: string, color: string) => Promise<void>
  removeCategory: (id: number) => Promise<void>
  updateCategory: (id: number, name: string, color: string) => Promise<void>
  addTransaction: (t: Omit<Transaction, 'id'>) => Promise<void>
  updateTransaction: (t: Transaction) => Promise<void>
  removeTransaction: (id: number) => Promise<void>
  markTransactionValid: (id: number) => Promise<void>
  setTransactionKind: (id: number, kind: TransactionKind) => Promise<void>
  setTransactionPaymentMethod: (id: number, method: string | null) => Promise<void>
  importTransactions: (rows: Omit<Transaction, 'id'>[]) => Promise<number>
  setBudget: (categoryId: number, amount: number) => Promise<void>
  addInvestment: (name: string, type: string | null, amount: number, currency: string) => Promise<void>
  setInvestmentValue: (investmentId: number, month: string, amount: number) => Promise<void>
  removeInvestment: (id: number) => Promise<void>
  closeInvestment: (id: number, month: string) => Promise<void>
  renameInvestment: (id: number, name: string) => Promise<void>

  categoryName: (id: number | null) => string
  categoryColor: (id: number | null) => string
}

export const useFinanceStore = create<FinanceState>((set, get) => ({
  month: currentMonth(),
  accounts: [],
  categories: [],
  transactions: [],
  allTransactions: [],
  monthListing: [],
  investmentMoves: [],
  budgets: [],
  investments: [],
  investmentHistory: [],
  base: 'BRL',
  rates: {},
  hidden: initialHidden,

  setMonth: (m) => {
    set({ month: m })
    get().refresh()
  },

  toggleHidden: () => {
    const next = !get().hidden
    setMoneyHidden(next)
    try {
      localStorage.setItem(HIDDEN_KEY, next ? '1' : '0')
    } catch {
      // ignore storage errors
    }
    set({ hidden: next })
  },

  refresh: async () => {
    const month = get().month
    const [accounts, categories, transactions, allTransactions, budgets, investments, investmentHistory, base, ratesRaw] =
      await Promise.all([
        window.api.accounts.getAll(),
        window.api.categories.getAll(),
        window.api.transactions.getAll(month),
        window.api.transactions.getAll(),
        window.api.budgets.getForMonth(month),
        window.api.investments.getAll(),
        // guard: a stale preload (dev not fully restarted) may lack `history`
        window.api.investments.history ? window.api.investments.history() : Promise.resolve([]),
        window.api.settings.get('finance_base'),
        window.api.settings.get('finance_rates')
      ])
    let rates: Record<string, number> = {}
    try {
      rates = ratesRaw ? JSON.parse(ratesRaw) : {}
    } catch {
      rates = {}
    }
    const counts = countsInTotals
    set({
      accounts,
      categories,
      transactions: transactions.filter(counts),
      allTransactions: allTransactions.filter(counts),
      monthListing: transactions,
      investmentMoves: transactions.filter((t) => !t.ignoredReason && !!t.investment),
      budgets,
      investments,
      investmentHistory,
      base: base || 'BRL',
      rates
    })
  },

  saveFxConfig: async (base, rates) => {
    await window.api.settings.set('finance_base', base)
    await window.api.settings.set('finance_rates', JSON.stringify(rates))
    set({ base, rates })
  },

  addAccount: async (name, currency, balance) => {
    await window.api.accounts.create(name, currency, balance)
    await get().refresh()
  },
  removeAccount: async (id) => {
    await window.api.accounts.delete(id)
    await get().refresh()
  },
  addCategory: async (name, type, color) => {
    await window.api.categories.create(name, type, color)
    await get().refresh()
  },
  updateCategory: async (id, name, color) => {
    await window.api.categories.update(id, name, color)
    await get().refresh()
  },
  removeCategory: async (id) => {
    await window.api.categories.delete(id)
    await get().refresh()
  },
  addTransaction: async (t) => {
    await window.api.transactions.create(t.accountId, t.categoryId, t.amount, t.currency, t.type, t.description, t.date)
    await get().refresh()
  },
  updateTransaction: async (t) => {
    await window.api.transactions.update(t.id, t.accountId, t.categoryId, t.amount, t.currency, t.type, t.description, t.date)
    await get().refresh()
  },
  removeTransaction: async (id) => {
    await window.api.transactions.delete(id)
    await get().refresh()
  },
  setTransactionPaymentMethod: async (id, method) => {
    await window.api.transactions.setPaymentMethod(id, method)
    await get().refresh()
  },
  setTransactionKind: async (id, kind) => {
    await window.api.transactions.setKind(id, kind)
    await get().refresh()
  },
  markTransactionValid: async (id) => {
    await window.api.transactions.setIgnored(id, null)
    await get().refresh()
  },
  importTransactions: async (rows) => {
    const n = await window.api.transactions.bulk(rows)
    await get().refresh()
    return n
  },
  setBudget: async (categoryId, amount) => {
    await window.api.budgets.set(categoryId, get().month, amount)
    await get().refresh()
  },
  addInvestment: async (name, type, amount, currency) => {
    await window.api.investments.create(name, type, amount, currency, get().month)
    await get().refresh()
  },
  setInvestmentValue: async (investmentId, month, amount) => {
    await window.api.investments.setValue(investmentId, month, amount)
    await get().refresh()
  },
  removeInvestment: async (id) => {
    await window.api.investments.delete(id)
    await get().refresh()
  },
  renameInvestment: async (id, name) => {
    await window.api.investments.rename(id, name)
    await get().refresh()
  },
  closeInvestment: async (id, month) => {
    await window.api.investments.close(id, month)
    await get().refresh()
  },

  categoryName: (id) => get().categories.find((c) => c.id === id)?.name ?? '—',
  categoryColor: (id) => get().categories.find((c) => c.id === id)?.color ?? '#6b7280'
}))
