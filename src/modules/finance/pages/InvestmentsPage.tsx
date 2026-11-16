import React, { useEffect, useState } from 'react'
import { Investment } from '../../../types'
import { useFinanceStore } from '../store/financeStore'
import { MonthNav } from '../components/MonthNav'
import { formatMoney, sumByCurrency, monthLabel, investmentValueAtMonth, shiftMonth } from '../util'

const CURRENCIES = ['BRL', 'USD', 'JPY', 'EUR']

/** Tag de variação vs. mês anterior: ▲ R$ 1.234,00 · +5,2% (some quando não houve mudança). */
function DeltaTag({ prev, curr, currency }: { prev: number | null; curr: number | null; currency: string }): React.ReactElement | null {
  if (prev == null || curr == null) return null
  const diff = curr - prev
  if (Math.abs(diff) < 0.005) return null
  const up = diff > 0
  const pct = prev !== 0 ? (diff / Math.abs(prev)) * 100 : null
  const pctText =
    pct != null
      ? ` · ${up ? '+' : '−'}${Math.abs(pct).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
      : ''
  return (
    <span className={`delta-tag ${up ? 'up' : 'down'}`} title="Variação em relação ao mês anterior">
      {up ? '▲' : '▼'} {formatMoney(Math.abs(diff), currency)}
      {pctText}
    </span>
  )
}

/** A single investment row with an editable value for the selected month. */
function InvestmentRow({
  investment,
  value,
  prevValue,
  isExplicit,
  onSave,
  onRemove
}: {
  investment: Investment
  value: number | null // carried-forward value for the month (null if none yet)
  prevValue: number | null // carried-forward value for the previous month
  isExplicit: boolean // true if there's a snapshot for this exact month
  onSave: (amount: number) => void
  onRemove: () => void
}): React.ReactElement {
  const [draft, setDraft] = useState(value != null ? String(value) : '')
  useEffect(() => {
    setDraft(value != null ? String(value) : '')
  }, [value, isExplicit])

  const parsed = parseFloat(draft)
  const dirty = draft.trim() !== '' && !isNaN(parsed) && (value == null || parsed !== value)

  function commit(): void {
    if (isNaN(parsed)) return
    onSave(parsed)
  }

  return (
    <div className="list-row">
      <span className="list-row-title">{investment.name}</span>
      {investment.type && <span className="project-chip">{investment.type}</span>}
      <span style={{ fontSize: 11, color: isExplicit ? 'var(--success)' : 'var(--text-muted)' }}>
        {isExplicit ? '● registrado' : value != null ? 'mantido' : 'sem valor'}
      </span>
      <DeltaTag prev={prevValue} curr={value} currency={investment.currency} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{investment.currency}</span>
        <input
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          style={{ width: 110, textAlign: 'right' }}
          placeholder="valor"
        />
        <button className="btn btn-primary btn-sm" onClick={commit} disabled={!dirty}>
          Salvar
        </button>
        <button className="btn btn-danger btn-sm" onClick={onRemove} title="Excluir investimento">
          ✕
        </button>
      </div>
    </div>
  )
}

export function InvestmentsPage(): React.ReactElement {
  const { investments, investmentHistory, month, refresh, addInvestment, setInvestmentValue, removeInvestment } =
    useFinanceStore()
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('BRL')

  useEffect(() => {
    refresh()
  }, [])

  async function handleAdd(): Promise<void> {
    const v = parseFloat(amount)
    if (!name.trim() || isNaN(v)) return
    await addInvestment(name.trim(), type.trim() || null, v, currency)
    setName('')
    setType('')
    setAmount('')
  }

  // per-currency total for the selected month (carry-forward values)
  const monthItems = investments.map((i) => ({
    currency: i.currency,
    amount: investmentValueAtMonth(investmentHistory, i.id, month) ?? 0
  }))
  const totals = sumByCurrency(monthItems)
  const prevMonth = shiftMonth(month, -1)
  const prevTotals = sumByCurrency(
    investments.map((i) => ({ currency: i.currency, amount: investmentValueAtMonth(investmentHistory, i.id, prevMonth) ?? 0 }))
  )

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>📈 Investimentos</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {monthLabel(month)} · Total:{' '}
            {Object.entries(totals)
              .map(([c, v]) => formatMoney(v, c))
              .join(' · ') || formatMoney(0)}
          </p>
          {Object.keys(totals).length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {Object.entries(totals).map(([c, v]) => (
                <DeltaTag key={c} prev={prevTotals[c] ?? 0} curr={v} currency={c} />
              ))}
            </div>
          )}
        </div>
        <MonthNav />
      </div>

      <div className="chart-section" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
          <input placeholder="Tipo (ex: ação, cripto)" value={type} onChange={(e) => setType(e.target.value)} />
          <input type="number" placeholder="Valor inicial" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 120 }} />
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button className="btn btn-primary btn-sm" onClick={handleAdd}>
            + Adicionar
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          Registre o valor de cada investimento mês a mês (navegue pelos meses acima). Meses sem
          registro mantêm o último valor conhecido.
        </p>
      </div>

      <div className="list-stack">
        {investments.length === 0 && <div className="empty-hint">Nenhum investimento.</div>}
        {investments.map((i) => {
          const explicit = investmentHistory.some((h) => h.investmentId === i.id && h.month === month)
          const value = investmentValueAtMonth(investmentHistory, i.id, month)
          const prevValue = investmentValueAtMonth(investmentHistory, i.id, shiftMonth(month, -1))
          return (
            <InvestmentRow
              key={`${i.id}|${month}`}
              investment={i}
              value={value}
              prevValue={prevValue}
              isExplicit={explicit}
              onSave={(v) => setInvestmentValue(i.id, month, v)}
              onRemove={() => removeInvestment(i.id)}
            />
          )
        })}
      </div>
    </div>
  )
}
