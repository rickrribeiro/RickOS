import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { Transaction } from '../../../types'
import { useFinanceStore } from '../store/financeStore'
import { convertToBase, currentMonth, formatMoney, formatMoneyCompact, monthLabel, shiftMonth, splitIncome, startingBillInBase, isStartingBillItem } from '../util'
import { t as tr } from '../../../i18n'

const PLOT_H = 120

/**
 * Dia a dia do mês: gasto por dia e saldo acumulado contra a cota do salário fixo.
 * saldo(d) = (salário fixo / dias do mês) × d − gasto acumulado até d.
 */
export function DailySpending(): React.ReactElement {
  const { transactions, allTransactions, categories, month, base, rates } = useFinanceStore()
  const [hover, setHover] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)
  // clique numa coluna de gasto: lista as transações do dia junto do ponteiro
  const [picked, setPicked] = useState<{ d: number; x: number; y: number } | null>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!picked) return
    const close = (e: Event): void => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !popRef.current?.contains(e.target as Node)) setPicked(null)
    }
    // rolar a página fecha (a posição é fixa); rolar a própria lista não
    const onScroll = (e: Event): void => {
      if (!popRef.current?.contains(e.target as Node)) setPicked(null)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    document.addEventListener('keydown', close)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
      document.removeEventListener('keydown', close)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [picked])

  useEffect(() => setPicked(null), [month])

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
    const dayTxs: Transaction[][] = Array.from({ length: daysInMonth + 1 }, () => [])
    for (const t of transactions) {
      // parcelas da fatura inicial já saíram da cota — não contam de novo como gasto do dia
      if (t.type !== 'expense' || isStartingBillItem(t)) continue
      const d = Number(t.date.slice(8, 10))
      if (d >= 1 && d <= daysInMonth) {
        spent[d] += toBase(t)
        dayTxs[d].push(t)
      }
    }
    for (const list of dayTxs) list.sort((a, b) => toBase(b) - toBase(a))
    const days = []
    let cum = 0
    for (let d = 1; d <= daysInMonth; d++) {
      cum += spent[d]
      days.push({ d, txs: dayTxs[d], spent: spent[d], cum, quota: allowance * d, balance: allowance * d - cum, future: d > refDay })
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
        <div className="chart-title">{tr('finance.diaADia')}</div>
        <div className="empty-hint">{monthLabel(month)} {tr('finance.aindaNaoComecou')}</div>
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
          title={tr('finance.cotaDiaria', { p0: formatMoney(data.allowance, base) })}
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
            cursor: kind === 'spent' && !x.future && x.txs.length > 0 ? 'pointer' : 'default'
          }
          if (kind === 'spent') {
            const over = data.allowance > 0 && x.spent > data.allowance
            return (
              <div
                key={x.d}
                style={{ ...common, alignItems: 'flex-end' }}
                onMouseEnter={() => setHover(x.d)}
                tabIndex={0}
                onFocus={() => setHover(x.d)}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={(e) => {
                  if (x.future) return
                  const r = e.currentTarget.getBoundingClientRect()
                  // teclado (Enter) chega com clientX/Y = 0: ancora na coluna
                  const px = e.clientX || r.left + r.width / 2
                  const py = e.clientY || r.top
                  setPicked((p) => (p?.d === x.d ? null : { d: x.d, x: px, y: py }))
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.currentTarget.click()
                  }
                }}
                aria-label={tr('finance.gasto3', { p0: dayLabel(x.d), p1: formatMoney(x.spent, base) })}>
                {!x.future && x.spent > 0 && (
                  <div style={{ width: '70%', maxWidth: 14, height: Math.max(2, (x.spent / spentMax) * PLOT_H), background: over ? 'var(--danger)' : 'var(--text-secondary)', borderRadius: '3px 3px 0 0' }} />
                )}
              </div>
            )
          }
          const h = (Math.abs(x.balance) / balMax) * ((PLOT_H * 1.4) / 2 - 2)
          return (
            <div key={x.d} style={{ ...common, flexDirection: 'column', alignItems: 'center' }} onMouseEnter={() => setHover(x.d)} tabIndex={0} onFocus={() => setHover(x.d)} aria-label={tr('finance.saldo', { p0: dayLabel(x.d), p1: formatMoney(x.balance, base) })}>
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
          {tr('finance.diaADiaAte', { p0: dayLabel(data.refDay) })}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowTable((v) => !v)}>
          {showTable ? tr('finance.verGrafico') : tr('finance.verTabela')}
        </button>
      </div>

      {data.salary <= 0 && (
        <div style={{ fontSize: 12, color: 'var(--warning)', marginTop: 8 }}>
          {tr('finance.semSalarioFixoNesteMes')}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '12px 0' }}>
        {tile(
          tr('finance.daily.saldoAteHoje'),
          formatMoney(data.today?.balance ?? 0, base),
          `cota ${formatMoney(data.today?.quota ?? 0, base)} − gasto ${formatMoney(data.today?.cum ?? 0, base)}`,
          (data.today?.balance ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)'
        )}
        {tile(
          tr('finance.daily.cotaDiaria'),
          formatMoney(data.allowance, base),
          tr('finance.daily.cotaFormula', { salary: formatMoney(data.salary, base), bill: formatMoney(data.startingBill, base), days: data.daysInMonth }) + (data.estimated ? tr('finance.daily.salarioEstimado') : '')
        )}
        {tile(tr('finance.daily.mediaPorDia'), formatMoney(data.avgPerDay, base), tr('finance.daily.nDias', { count: data.refDay }))}
        {data.perDayLeft != null &&
          tile(
            tr('finance.daily.daParaGastar'),
            formatMoney(Math.max(0, data.perDayLeft), base),
            tr('finance.daily.diasQueFaltam', { n: data.daysInMonth - data.refDay }),
            data.perDayLeft >= 0 ? undefined : 'var(--danger)'
          )}
      </div>

      {showTable ? (
        <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
          <table className="report-table">
            <thead>
              <tr>
                <th>{tr('finance.dia')}</th>
                <th style={{ textAlign: 'right' }}>{tr('finance.gastoDoDia')}</th>
                <th style={{ textAlign: 'right' }}>{tr('finance.gastoAcumulado')}</th>
                <th style={{ textAlign: 'right' }}>{tr('finance.cotaAcumulada')}</th>
                <th style={{ textAlign: 'right' }}>{tr('finance.saldo2')}</th>
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
            <span>{tr('finance.gastoPorDia')}{data.startingBill > 0 ? tr('finance.semAsParcelasDaFatura') : ''}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
              <span style={{ width: 12, height: 1, background: 'var(--accent)' }} /> {tr('finance.cotaDiaria2', { p0: formatMoneyCompact(data.allowance) })}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--danger)' }} /> {tr('finance.acimaDaCota')}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>· {tr('finance.daily.cliqueVerGastos')}</span>
          </div>
          {columns('spent')}
          {dayAxis}
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '14px 0 4px' }}>{tr('finance.saldoAcumuladoCotaGasto')}</div>
          {columns('balance')}
          {dayAxis}

          {hovered && !hovered.future && !picked && (
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
              <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{tr('finance.dia')} {dayLabel(hovered.d)}</div>
              {[
                [tr('finance.daily.gastoDoDia'), hovered.spent],
                [tr('finance.daily.gastoAcumulado'), hovered.cum],
                [tr('finance.daily.cotaAcumulada'), hovered.quota]
              ].map(([l, v]) => (
                <div key={l as string} style={{ display: 'flex', gap: 8 }}>
                  <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{l}</span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(v as number, base)}</strong>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 }}>
                <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{tr('finance.saldo2')}</span>
                <strong style={{ fontVariantNumeric: 'tabular-nums', color: hovered.balance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {formatMoney(hovered.balance, base)}
                </strong>
              </div>
            </div>
          )}
        </div>
      )}

      {picked && !showTable && <DayTxsPopover ref={popRef} picked={picked} day={data.days[picked.d - 1]} label={dayLabel(picked.d)} />}
    </div>
  )
}

const POP_W = 300
const POP_MAX_H = 320

/** Lista de gastos do dia, posicionada junto do ponteiro e mantida dentro da janela. */
const DayTxsPopover = React.forwardRef<
  HTMLDivElement,
  { picked: { x: number; y: number }; day: { txs: Transaction[]; spent: number }; label: string }
>(function DayTxsPopover({ picked, day, label }, ref) {
  const { categories, accounts, base } = useFinanceStore()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(POP_W, vw - 16)
  const left = Math.min(Math.max(8, picked.x + 12), vw - width - 8)
  const below = picked.y + 12 + POP_MAX_H <= vh - 8
  const pos: React.CSSProperties = below ? { top: picked.y + 12 } : { bottom: Math.max(8, vh - picked.y + 12) }
  const catOf = (id: number | null) => categories.find((c) => c.id === id)
  const accOf = (id: number | null) => accounts.find((a) => a.id === id)

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={tr('finance.daily.gastosDoDia', { dia: label })}
      style={{
        position: 'fixed',
        left,
        ...pos,
        width,
        maxHeight: POP_MAX_H,
        overflowY: 'auto',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '8px 10px',
        fontSize: 12,
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        zIndex: 1000
      }}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 6, color: 'var(--text-secondary)' }}>
        <span style={{ flex: 1 }}>{tr('finance.daily.gastosDoDia', { dia: label })}</span>
        <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(day.spent, base)}</strong>
      </div>
      {day.txs.length === 0 ? (
        <div style={{ color: 'var(--text-muted)' }}>{tr('finance.daily.semGastos')}</div>
      ) : (
        day.txs.map((t) => {
          const cat = catOf(t.categoryId)
          const acc = accOf(t.accountId)
          return (
            <div key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '4px 0', borderTop: '1px solid var(--border)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: cat?.color ?? 'var(--text-muted)', alignSelf: 'center' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.description ?? undefined}>
                  {t.description || tr('finance.daily.semDescricao')}
                  {t.installmentNumber && t.installmentTotal ? ` (${t.installmentNumber}/${t.installmentTotal})` : ''}
                </div>
                {(cat || acc) && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[cat?.name, acc?.name].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              <strong style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatMoney(t.amount, t.currency)}</strong>
            </div>
          )
        })
      )}
    </div>
  )
})
