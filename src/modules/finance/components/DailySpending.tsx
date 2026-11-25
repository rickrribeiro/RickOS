import React, { useMemo, useState } from 'react'
import { useFinanceStore } from '../store/financeStore'
import { convertToBase, currentMonth, formatMoney, formatMoneyCompact, monthLabel, shiftMonth, splitIncome, startingBillInBase, isStartingBillItem } from '../util'

const PLOT_H = 120

/**
 * Dia a dia do mês: gasto por dia e saldo acumulado contra a cota do salário fixo.
 * saldo(d) = (salário fixo / dias do mês) × d − gasto acumulado até d.
 */
export function DailySpending(): React.ReactElement {
  const { transactions, allTransactions, categories, month, base, rates } = useFinanceStore()
  const [hover, setHover] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)

  const data = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const daysInMonth = new Date(y, m, 0).getDate()
    const now = currentMonth()
    const refDay = month === now ? new Date().getDate() : month < now ? daysInMonth : 0

    const toBase = (t: { amount: number; currency: string }): number => convertToBase(t.amount, t.currency, base, rates)
    const fixedOf = (txs: typeof transactions): number => splitIncome(txs, categories).fixed.reduce((s, t) => s + toBase(t), 0)

    // salário fixo do mês; se ainda não caiu, estima pelo mês anterior
    let salary = fixedOf(transactions)
    let estimated = false
    if (salary <= 0) {
      const prev = shiftMonth(month, -1)
      salary = fixedOf(allTransactions.filter((t) => t.date.slice(0, 7) === prev))
      estimated = salary > 0
    }
    // cota = (salário − fatura inicial) / dias: as parcelas de compras antigas já estão comprometidas
    const startingBill = startingBillInBase(transactions, base, rates).total
    const available = Math.max(0, salary - startingBill)
    const allowance = available / daysInMonth

    const spent = new Array<number>(daysInMonth + 1).fill(0)
    for (const t of transactions) {
      // parcelas da fatura inicial já saíram da cota — não contam de novo como gasto do dia
      if (t.type !== 'expense' || isStartingBillItem(t)) continue
      const d = Number(t.date.slice(8, 10))
      if (d >= 1 && d <= daysInMonth) spent[d] += toBase(t)
    }
    const days = []
    let cum = 0
    for (let d = 1; d <= daysInMonth; d++) {
      cum += spent[d]
      days.push({ d, spent: spent[d], cum, quota: allowance * d, balance: allowance * d - cum, future: d > refDay })
    }
    const today = refDay > 0 ? days[refDay - 1] : null
    const remainingDays = daysInMonth - refDay
    return {
      daysInMonth,
      refDay,
      salary,
      startingBill,
      available,
      estimated,
      allowance,
      days,
      today,
      avgPerDay: today && refDay > 0 ? today.cum / refDay : 0,
      perDayLeft: remainingDays > 0 && today ? (available - today.cum) / remainingDays : null
    }
  }, [transactions, allTransactions, categories, month, base, rates])

  const past = data.days.filter((x) => !x.future)
  const spentMax = Math.max(data.allowance, ...past.map((x) => x.spent), 1)
  const balMax = Math.max(1, ...past.map((x) => Math.abs(x.balance)))
  const hovered = hover != null ? data.days[hover - 1] : null
  const dayLabel = (d: number): string => `${String(d).padStart(2, '0')}/${month.slice(5, 7)}`

  if (data.refDay === 0) {
    return (
      <div className="chart-section" style={{ marginTop: 16 }}>
        <div className="chart-title">Dia a dia</div>
        <div className="empty-hint">{monthLabel(month)} ainda não começou.</div>
      </div>
    )
  }

  const tile = (label: string, value: string, sub: string, color?: string): React.ReactElement => (
    <div style={{ flex: '1 1 150px', minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  )

  const columns = (kind: 'spent' | 'balance'): React.ReactElement => (
    <div style={{ position: 'relative', height: kind === 'spent' ? PLOT_H : PLOT_H * 1.4 }} onMouseLeave={() => setHover(null)}>
      {kind === 'spent' && data.allowance > 0 && (
        <div
          style={{ position: 'absolute', left: 0, right: 0, bottom: (data.allowance / spentMax) * PLOT_H, height: 1, background: 'var(--accent)', opacity: 0.8 }}
          title={`Cota diária ${formatMoney(data.allowance, base)}`}
        />
      )}
      {kind === 'balance' && <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'var(--border)' }} />}
      <div style={{ display: 'flex', height: '100%', alignItems: kind === 'spent' ? 'flex-end' : 'stretch' }}>
        {data.days.map((x) => {
          const isHover = hover === x.d
          const common: React.CSSProperties = {
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            height: '100%',
            background: isHover ? 'var(--bg-hover)' : undefined,
            borderRadius: 3,
            cursor: 'default'
          }
          if (kind === 'spent') {
            const over = data.allowance > 0 && x.spent > data.allowance
            return (
              <div key={x.d} style={{ ...common, alignItems: 'flex-end' }} onMouseEnter={() => setHover(x.d)} tabIndex={0} onFocus={() => setHover(x.d)} aria-label={`${dayLabel(x.d)}: gasto ${formatMoney(x.spent, base)}`}>
                {!x.future && x.spent > 0 && (
                  <div style={{ width: '70%', maxWidth: 14, height: Math.max(2, (x.spent / spentMax) * PLOT_H), background: over ? 'var(--danger)' : 'var(--text-secondary)', borderRadius: '3px 3px 0 0' }} />
                )}
              </div>
            )
          }
          const h = (Math.abs(x.balance) / balMax) * ((PLOT_H * 1.4) / 2 - 2)
          return (
            <div key={x.d} style={{ ...common, flexDirection: 'column', alignItems: 'center' }} onMouseEnter={() => setHover(x.d)} tabIndex={0} onFocus={() => setHover(x.d)} aria-label={`${dayLabel(x.d)}: saldo ${formatMoney(x.balance, base)}`}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', width: '70%', maxWidth: 14 }}>
                {!x.future && x.balance > 0 && <div style={{ width: '100%', height: h, background: 'var(--success)', borderRadius: '3px 3px 0 0' }} />}
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', width: '70%', maxWidth: 14 }}>
                {!x.future && x.balance < 0 && <div style={{ width: '100%', height: h, background: 'var(--danger)', borderRadius: '0 0 3px 3px' }} />}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const dayAxis = (
    <div style={{ display: 'flex', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
      {data.days.map((x) => (
        <span key={x.d} style={{ flex: 1, textAlign: 'center', fontWeight: x.d === data.refDay ? 700 : undefined, color: x.d === data.refDay ? 'var(--text-primary)' : undefined }}>
          {x.d === 1 || x.d % 5 === 0 || x.d === data.refDay ? x.d : ''}
        </span>
      ))}
    </div>
  )

  return (
    <div className="chart-section" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div className="chart-title" style={{ marginRight: 'auto' }}>
          Dia a dia · até {dayLabel(data.refDay)}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Ver gráfico' : 'Ver tabela'}
        </button>
      </div>

      {data.salary <= 0 && (
        <div style={{ fontSize: 12, color: 'var(--warning)', marginTop: 8 }}>
          Sem salário fixo neste mês nem no anterior: marque a categoria do salário como &quot;fixa&quot; em Categorias (e categorize as entradas) para ter a cota diária.
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '12px 0' }}>
        {tile(
          'Saldo até hoje',
          formatMoney(data.today?.balance ?? 0, base),
          `cota ${formatMoney(data.today?.quota ?? 0, base)} − gasto ${formatMoney(data.today?.cum ?? 0, base)}`,
          (data.today?.balance ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)'
        )}
        {tile(
          'Cota diária',
          formatMoney(data.allowance, base),
          `(${formatMoney(data.salary, base)} salário − ${formatMoney(data.startingBill, base)} fatura inicial) ÷ ${data.daysInMonth} dias${data.estimated ? ' · salário estimado pelo mês anterior' : ''}`
        )}
        {tile('Média gasta por dia', formatMoney(data.avgPerDay, base), `${data.refDay} ${data.refDay === 1 ? 'dia' : 'dias'}`)}
        {data.perDayLeft != null &&
          tile(
            'Dá para gastar por dia',
            formatMoney(Math.max(0, data.perDayLeft), base),
            `nos ${data.daysInMonth - data.refDay} dias que faltam`,
            data.perDayLeft >= 0 ? undefined : 'var(--danger)'
          )}
      </div>

      {showTable ? (
        <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
          <table className="report-table">
            <thead>
              <tr>
                <th>Dia</th>
                <th style={{ textAlign: 'right' }}>Gasto do dia</th>
                <th style={{ textAlign: 'right' }}>Gasto acumulado</th>
                <th style={{ textAlign: 'right' }}>Cota acumulada</th>
                <th style={{ textAlign: 'right' }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {past.map((x) => (
                <tr key={x.d}>
                  <td>{dayLabel(x.d)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(x.spent, base)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(x.cum, base)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(x.quota, base)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: x.balance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {formatMoney(x.balance, base)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>Gasto por dia{data.startingBill > 0 ? ' (sem as parcelas da fatura inicial)' : ''}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
              <span style={{ width: 12, height: 1, background: 'var(--accent)' }} /> cota diária {formatMoneyCompact(data.allowance)}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--danger)' }} /> acima da cota
            </span>
          </div>
          {columns('spent')}
          {dayAxis}
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '14px 0 4px' }}>Saldo acumulado (cota − gasto)</div>
          {columns('balance')}
          {dayAxis}

          {hovered && !hovered.future && (
            <div
              role="tooltip"
              style={{
                position: 'absolute',
                top: 20,
                [hovered.d <= data.daysInMonth / 2 ? 'right' : 'left']: 0,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '8px 10px',
                fontSize: 12,
                minWidth: 200,
                boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                pointerEvents: 'none',
                zIndex: 2
              }}
            >
              <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>Dia {dayLabel(hovered.d)}</div>
              {[
                ['Gasto do dia', hovered.spent],
                ['Gasto acumulado', hovered.cum],
                ['Cota acumulada', hovered.quota]
              ].map(([l, v]) => (
                <div key={l as string} style={{ display: 'flex', gap: 8 }}>
                  <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{l}</span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(v as number, base)}</strong>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 }}>
                <span style={{ flex: 1, color: 'var(--text-secondary)' }}>Saldo</span>
                <strong style={{ fontVariantNumeric: 'tabular-nums', color: hovered.balance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {formatMoney(hovered.balance, base)}
                </strong>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
