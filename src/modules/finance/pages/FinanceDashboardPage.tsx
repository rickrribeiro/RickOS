import React, { useEffect, useState } from 'react'
import { useFinanceStore } from '../store/financeStore'
import { MonthNav } from '../components/MonthNav'
import { DailySpending } from '../components/DailySpending'
import { PendingNotes } from '../components/PendingNotes'
import { formatMoney, sumByCurrency, sumInBase, shiftMonth, monthLabel, portfolioAtMonth, chargesInBase, startingBillInBase, splitIncome, formatMoneyCompact } from '../util'

/**
 * Saldo separado da conta (o Open Finance do Nubank sinaliza que existe, mas manda a lista vazia):
 * valor manual por mês, editado in-line. Mês sem registro herda o último valor anterior.
 */
function ReservedLine({
  amount,
  explicit,
  currency,
  onSave
}: {
  amount: number | null
  explicit: boolean
  currency: string
  onSave: (v: number) => void
}): React.ReactElement {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  function start(): void {
    setDraft(amount != null ? String(amount) : '')
    setEditing(true)
  }
  function commit(): void {
    setEditing(false)
    const v = parseFloat(draft.replace(',', '.'))
    if (draft.trim() === '' || isNaN(v) || v === amount) return
    onSave(Math.round(v * 100) / 100)
  }

  if (editing) {
    return (
      <div className="stat-card-sub" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        🔒 separado:
        <input
          autoFocus
          type="number"
          step="0.01"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setEditing(false)
          }}
          title="Enter salva · Esc cancela · vale a partir deste mês"
          style={{ width: 100, fontSize: 12, padding: '1px 4px' }}
        />
      </div>
    )
  }
  if (amount == null || amount === 0) {
    return (
      <button
        className="stat-card-sub"
        onClick={start}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', textAlign: 'left', font: 'inherit', fontSize: 12 }}
        title="Dinheiro separado na conta (o Open Finance não manda esse valor)"
      >
        + saldo separado
      </button>
    )
  }
  return (
    <div className="stat-card-sub">
      🔒 separado: {formatMoney(amount, currency)}
      {!explicit && <span title="Sem registro neste mês — mantém o último valor informado"> (mantido)</span>}{' '}
      <button
        onClick={start}
        style={{ background: 'none', border: 'none', padding: '0 2px', cursor: 'pointer', color: 'var(--text-muted)', font: 'inherit' }}
        title="Editar o saldo separado deste mês"
      >
        ✎
      </button>
    </div>
  )
}

export function FinanceDashboardPage(): React.ReactElement {
  const { accounts, accountBalances, accountReserved, setAccountReserved, categories, transactions, allTransactions, investmentMoves, budgets, investments, investmentHistory, month, base, rates, refresh, categoryName, categoryColor } =
    useFinanceStore()

  useEffect(() => {
    refresh()
  }, [])

  const income = transactions.filter((t) => t.type === 'income')
  const expense = transactions.filter((t) => t.type === 'expense')
  // salário fixo (categorias de receita marcadas como fixas) × entradas extras
  const { fixed: fixedIncome, extra: extraIncome } = splitIncome(income, categories)
  const expenseByCur = sumByCurrency(expense)
  // aplicações/resgates: fora de receitas/gastos, mostrados à parte
  const redemptionsByCur = sumByCurrency(investmentMoves.filter((t) => t.type === 'income'))
  const applicationsByCur = sumByCurrency(investmentMoves.filter((t) => t.type === 'expense'))

  // balances by currency (from accounts)
  // Saldo do mês selecionado: contas do Open Finance usam o saldo registrado NAQUELE mês (sem registro =
  // R$ 0); contas manuais usam o saldo cadastrado.
  const accountMonth = accounts.map((a) => {
    if (!a.externalId) return { a, balance: a.balance as number | null, syncedAt: null as string | null }
    const h = accountBalances.find((x) => x.accountId === a.id && x.month === month)
    return { a, balance: h ? h.balance : null, syncedAt: h ? h.syncedAt : null }
  })
  // saldo separado (manual): último registro até o mês selecionado
  const reservedOf = (accountId: number): { amount: number | null; explicit: boolean } => {
    let best: { month: string; amount: number } | null = null
    for (const r of accountReserved) if (r.accountId === accountId && r.month <= month && (!best || r.month > best.month)) best = r
    return { amount: best ? best.amount : null, explicit: best?.month === month }
  }
  const balByCur: Record<string, number> = {}
  for (const { a, balance } of accountMonth) {
    balByCur[a.currency] = (balByCur[a.currency] ?? 0) + (balance ?? 0) + (reservedOf(a.id).amount ?? 0)
  }

  // top expense categories this month (BRL-agnostic, sum absolute amounts)
  const byCat: Record<number, number> = {}
  for (const t of expense) if (t.categoryId != null) byCat[t.categoryId] = (byCat[t.categoryId] ?? 0) + t.amount
  const topCats = Object.entries(byCat)
    .map(([id, amt]) => ({ id: Number(id), amt }))
    .sort((a, b) => b.amt - a.amt)
    .slice(0, 5)
  const topMax = topCats[0]?.amt ?? 1

  // last 12 months net (expense) evolution
  const months: string[] = []
  for (let i = 11; i >= 0; i--) months.push(shiftMonth(month, -i))
  const evolution = months.map((m) => {
    const exp = allTransactions
      .filter((t) => t.type === 'expense' && t.date.slice(0, 7) === m)
      .reduce((s, t) => s + t.amount, 0)
    return { m, exp }
  })
  const evoMax = Math.max(1, ...evolution.map((e) => e.exp))

  // investments: portfolio value per month (carry-forward, converted to base)
  const portfolio = months.map((m) => ({ m, total: portfolioAtMonth(investments, investmentHistory, m, base, rates) }))
  const portMax = Math.max(1, ...portfolio.map((p) => p.total))
  const portfolioNow = portfolio[portfolio.length - 1]?.total ?? 0
  const portfolioPrev = portfolio[portfolio.length - 2]?.total ?? 0
  const portfolioDelta = portfolioNow - portfolioPrev

  const budgetTotal = budgets.reduce((s, b) => s + b.amount, 0)
  const spentTotal = expense.reduce((s, t) => s + t.amount, 0)

  // Converted to base currency (manual rates)
  const incomeBase = sumInBase(income, base, rates)
  const expenseBase = sumInBase(expense, base, rates)
  const netBase = incomeBase - expenseBase
  // sem extras = só o salário fixo
  const fixedBase = sumInBase(fixedIncome, base, rates)
  const netFixedBase = fixedBase - expenseBase

  // Fatura inicial: parcelas de compras anteriores que já caem neste mês (e no próximo)
  const startingBill = startingBillInBase(transactions, base, rates)
  const nextMonth = shiftMonth(month, 1)
  const startingNext = startingBillInBase(
    allTransactions.filter((t) => t.date.slice(0, 7) === nextMonth),
    base,
    rates
  )

  // Encargos (IOF, juros, multa): mês selecionado e ano corrente do mês selecionado
  const chargesMonth = chargesInBase(transactions, base, rates)
  const year = month.slice(0, 4)
  const chargesYear = chargesInBase(
    allTransactions.filter((t) => t.date.slice(0, 4) === year && t.date.slice(0, 7) <= month),
    base,
    rates
  )

  const money = (rec: Record<string, number>): string =>
    Object.keys(rec).length ? Object.entries(rec).map(([c, v]) => formatMoney(v, c)).join(' · ') : formatMoney(0)

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>💰 Finanças</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Visão do mês</p>
        </div>
        <MonthNav />
      </div>

      <div className="cards-grid">
        <div className="stat-card">
          <div className="stat-card-label">Saldo total (contas)</div>
          <div className="stat-card-value" style={{ fontSize: 16 }}>{money(balByCur)}</div>
          {accountMonth.map(({ a, balance, syncedAt }) => {
            const reserved = reservedOf(a.id)
            const hasReserved = (reserved.amount ?? 0) !== 0
            return (
              <React.Fragment key={a.id}>
                <div className="stat-card-sub">
                  {a.externalId ? '🏦 ' : ''}
                  {a.name}
                  {(accounts.length > 1 || hasReserved) && balance != null && ` · ${hasReserved ? 'em conta ' : ''}${formatMoney(balance, a.currency)}`}
                  {balance == null
                    ? ' · sem registro de saldo neste mês'
                    : syncedAt && ` · atualizado ${new Date(syncedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
                </div>
                <ReservedLine
                  amount={reserved.amount}
                  explicit={reserved.explicit}
                  currency={a.currency}
                  onSave={(v) => setAccountReserved(a.id, v)}
                />
              </React.Fragment>
            )
          })}
          {accounts.length === 0 && <div className="stat-card-sub">importe do Open Finance para trazer o saldo da conta</div>}
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Receitas do mês</div>
          <div className="stat-card-value" style={{ fontSize: 16, color: 'var(--success)' }}>{formatMoney(incomeBase, base)}</div>
          <div className="stat-card-sub">com extras</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--success)', marginTop: 6 }}>{formatMoney(fixedBase, base)}</div>
          <div className="stat-card-sub">
            sem extras (salário fixo{categories.some((c) => c.fixedIncome) ? `: ${categories.filter((c) => c.fixedIncome).map((c) => c.name).join(', ')}` : ''})
          </div>
          <div className="stat-card-sub" style={{ marginTop: 6 }}>
            entradas extras {formatMoney(sumInBase(extraIncome, base, rates), base)} · {extraIncome.length}{' '}
            {extraIncome.length === 1 ? 'entrada' : 'entradas'}
          </div>
          {Object.keys(redemptionsByCur).length > 0 && (
            <div className="stat-card-sub" title="Resgates de investimento: não contam como receita">
              + resgates de investimento {money(redemptionsByCur)}
            </div>
          )}
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Gastos do mês</div>
          <div className="stat-card-value" style={{ fontSize: 16, color: 'var(--danger)' }}>{money(expenseByCur)}</div>
          {Object.keys(applicationsByCur).length > 0 && (
            <div className="stat-card-sub" title="Aplicações em investimento: não contam como gasto">
              + aplicações em investimento {money(applicationsByCur)}
            </div>
          )}
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Meta (orçamento)</div>
          <div className="stat-card-value" style={{ fontSize: 16 }}>{formatMoney(spentTotal)} / {formatMoney(budgetTotal)}</div>
          {budgetTotal > 0 && (
            <div className="stat-card-sub" style={{ color: spentTotal > budgetTotal ? 'var(--danger)' : 'var(--text-muted)' }}>
              {spentTotal > budgetTotal ? '⚠ acima da meta' : `${Math.round((spentTotal / budgetTotal) * 100)}% usado`}
            </div>
          )}
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Saldo do mês em {base}</div>
          <div className="stat-card-value" style={{ fontSize: 16, color: netBase >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {formatMoney(netBase, base)}
          </div>
          <div className="stat-card-sub">com extras: {formatMoney(incomeBase, base)} − gastos {formatMoney(expenseBase, base)}</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6, color: netFixedBase >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {formatMoney(netFixedBase, base)}
          </div>
          <div className="stat-card-sub">sem extras: salário {formatMoney(fixedBase, base)} − gastos {formatMoney(expenseBase, base)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Fatura inicial do mês</div>
          <div className="stat-card-value" style={{ fontSize: 16 }}>{formatMoney(startingBill.total, base)}</div>
          <div className="stat-card-sub">
            {startingBill.count} {startingBill.count === 1 ? 'parcela' : 'parcelas'} de compras anteriores
            {expenseBase > 0 && startingBill.total > 0 && ` · ${Math.round((startingBill.total / expenseBase) * 100)}% dos gastos`}
          </div>
          <div className="stat-card-sub" style={{ color: 'var(--text-muted)' }}>
            {monthLabel(nextMonth)} já começa com {formatMoney(startingNext.total, base)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Encargos do mês</div>
          <div className="stat-card-value" style={{ fontSize: 16, color: chargesMonth.total > 0.004 ? 'var(--danger)' : undefined }}>
            {formatMoney(chargesMonth.total, base)}
          </div>
          <div className="stat-card-sub">
            IOF {formatMoney(chargesMonth.byKind.iof, base)} · Juros {formatMoney(chargesMonth.byKind.juros, base)} · Multa{' '}
            {formatMoney(chargesMonth.byKind.multa, base)}
          </div>
          <div className="stat-card-sub" style={{ color: 'var(--text-muted)' }}>
            {chargesMonth.count} {chargesMonth.count === 1 ? 'cobrança' : 'cobranças'} · {year} até agora: {formatMoney(chargesYear.total, base)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Investimentos em {base}</div>
          <div className="stat-card-value" style={{ fontSize: 16 }}>{formatMoney(portfolioNow, base)}</div>
          {portfolio.length > 1 && portfolioPrev > 0 && (
            <div className="stat-card-sub" style={{ color: portfolioDelta >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {portfolioDelta >= 0 ? '▲' : '▼'} {formatMoney(Math.abs(portfolioDelta), base)} vs. mês anterior
            </div>
          )}
          {portfolioNow > 0 && portfolioPrev <= 0 && <div className="stat-card-sub">primeiro mês registrado — a variação aparece a partir do próximo</div>}
        </div>
      </div>

      <PendingNotes />

      <DailySpending />

      <div className="chart-section" style={{ marginTop: 16 }}>
        <div className="chart-title">Top categorias (gastos do mês)</div>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {topCats.length === 0 && <div className="empty-hint">Sem gastos neste mês.</div>}
          {topCats.map((c) => (
            <div key={c.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 2 }}>
                <span>{categoryName(c.id)}</span>
                <span>{formatMoney(c.amt)}</span>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(c.amt / topMax) * 100}%`, background: categoryColor(c.id) }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="chart-section" style={{ marginTop: 16 }}>
        <div className="chart-title">Evolução de gastos (12 meses)</div>
        <div className="evo-bars">
          {evolution.map((e) => (
            <EvoBar key={e.m} month={e.m} value={e.exp} max={evoMax} title={formatMoney(e.exp)} />
          ))}
        </div>
      </div>

      <div className="chart-section" style={{ marginTop: 16 }}>
        <div className="chart-title">Evolução de investimentos (12 meses) · {base}</div>
        {portfolioNow === 0 && portMax === 1 ? (
          <div className="empty-hint">Sem investimentos registrados. Adicione em 📈 Investimentos.</div>
        ) : (
          <div className="evo-bars">
            {portfolio.map((p) => (
              <EvoBar
                key={p.m}
                month={p.m}
                value={p.total}
                max={portMax}
                title={formatMoney(p.total, base)}
                color="var(--success)"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EvoBar({ month, value, max, title, color }: {
  month: string
  value: number
  max: number
  title: string
  color?: string
}): React.ReactElement {
  const label = monthLabel(month)
  return (
    <div className="evo-bar-col" title={`${label}: ${title}`}>
      <div className="evo-bar-track">
        <span className="evo-bar-value">{value > 0 ? formatMoneyCompact(value) : ''}</span>
        <div className="evo-bar" style={{ height: `${(value / max) * 100}%`, background: color }} />
      </div>
      <span className="evo-bar-label">{label.slice(0, 3)}</span>
    </div>
  )
}
