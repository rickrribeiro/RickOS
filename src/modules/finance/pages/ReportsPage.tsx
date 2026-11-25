import React, { useEffect, useMemo, useState } from 'react'
import { Transaction } from '../../../types'
import { useFinanceStore } from '../store/financeStore'
import { formatMoney, monthLabel, shiftMonth, convertToBase, currentMonth } from '../util'
import { CategoryCharts } from '../components/CategoryCharts'
import { t as tr, getLocale } from '../../../i18n'

/** Intervalo de meses inclusivo (YYYY-MM). */
interface Period {
  from: string
  to: string
}

const inPeriod = (t: Transaction, p: Period): boolean => {
  const m = t.date.slice(0, 7)
  return m >= p.from && m <= p.to
}

function periodLabel(p: Period): string {
  if (p.from === p.to) return monthLabel(p.from)
  const [fy, fm] = p.from.split('-')
  const [ty, tm] = p.to.split('-')
  if (fy === ty && fm === '01' && tm === '12') return fy
  return `${monthLabel(p.from)} – ${monthLabel(p.to)}`
}

/** Comparações prontas, ancoradas no mês atual. */
function presets(anchor: string): { key: string; label: string; a: Period; b: Period }[] {
  const y = Number(anchor.slice(0, 4))
  return [
    { key: 'mom', label: tr('finance.mesMesAnterior'), a: { from: anchor, to: anchor }, b: { from: shiftMonth(anchor, -1), to: shiftMonth(anchor, -1) } },
    { key: 'yoy', label: tr('finance.mesMesmoMesDoAno'), a: { from: anchor, to: anchor }, b: { from: shiftMonth(anchor, -12), to: shiftMonth(anchor, -12) } },
    {
      key: 'q',
      label: tr('finance.ultimos3Meses3Anteriores'),
      a: { from: shiftMonth(anchor, -2), to: anchor },
      b: { from: shiftMonth(anchor, -5), to: shiftMonth(anchor, -3) }
    },
    {
      key: 'ytd',
      label: tr('finance.anoAteAgoraMesmoPeriodo'),
      a: { from: `${y}-01`, to: anchor },
      b: { from: `${y - 1}-01`, to: shiftMonth(anchor, -12) }
    },
    { key: 'year', label: tr('finance.anoPassadoRetrasado'), a: { from: `${y - 1}-01`, to: `${y - 1}-12` }, b: { from: `${y - 2}-01`, to: `${y - 2}-12` } }
  ]
}

/** Variação A vs B. `goodWhenUp`: receita subir é bom; gasto subir é ruim. */
function Delta({ a, b, base, goodWhenUp }: { a: number; b: number; base: string; goodWhenUp: boolean }): React.ReactElement {
  const diff = a - b
  if (Math.abs(diff) < 0.005) return <span style={{ color: 'var(--text-muted)' }}>=</span>
  const up = diff > 0
  const good = up === goodWhenUp
  const pct = b !== 0 ? (diff / Math.abs(b)) * 100 : null
  return (
    <span style={{ color: good ? 'var(--success)' : 'var(--danger)', whiteSpace: 'nowrap' }}>
      {up ? '▲' : '▼'} {formatMoney(Math.abs(diff), base)}
      {pct != null && (
        <span style={{ fontSize: 11, marginLeft: 4 }}>
          ({up ? '+' : '−'}
          {Math.abs(pct).toLocaleString(getLocale(), { maximumFractionDigits: 1 })}%)
        </span>
      )}
    </span>
  )
}

function PeriodPicker({ label, value, onChange }: { label: string; value: Period; onChange: (p: Period) => void }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12 }}>
      <span style={{ color: 'var(--text-secondary)', minWidth: 70 }}>{label}</span>
      <input type="month" value={value.from} onChange={(e) => e.target.value && onChange({ from: e.target.value, to: value.to < e.target.value ? e.target.value : value.to })} />
      <span style={{ color: 'var(--text-muted)' }}>{tr('finance.ate')}</span>
      <input type="month" value={value.to} onChange={(e) => e.target.value && onChange({ from: value.from > e.target.value ? e.target.value : value.from, to: e.target.value })} />
    </div>
  )
}

export function ReportsPage(): React.ReactElement {
  const { allTransactions, base, rates, refresh, categoryName, categoryColor } = useFinanceStore()
  const anchor = currentMonth()
  const presetList = useMemo(() => presets(anchor), [anchor])
  const [presetKey, setPresetKey] = useState('mom')
  const [pa, setPa] = useState<Period>(presetList[0].a)
  const [pb, setPb] = useState<Period>(presetList[0].b)

  useEffect(() => {
    refresh()
  }, [])

  const toBase = (t: Transaction): number => convertToBase(t.amount, t.currency, base, rates)

  // All months that actually have movement, from 2015 onward, newest first (convertido para a moeda base).
  const rows = useMemo(() => {
    const byMonth: Record<string, { income: number; expense: number }> = {}
    for (const t of allTransactions) {
      const m = t.date.slice(0, 7)
      if (m < '2015-01') continue
      if (!byMonth[m]) byMonth[m] = { income: 0, expense: 0 }
      if (t.type === 'income') byMonth[m].income += toBase(t)
      else if (t.type === 'expense') byMonth[m].expense += toBase(t)
    }
    return Object.entries(byMonth)
      .map(([m, v]) => ({ m, income: v.income, expense: v.expense, net: v.income - v.expense }))
      .sort((a, b) => b.m.localeCompare(a.m)) // newest first
  }, [allTransactions, base, rates])

  const totals = rows.reduce(
    (s, r) => ({ income: s.income + r.income, expense: s.expense + r.expense }),
    { income: 0, expense: 0 }
  )

  // ── Comparação ──
  const cmp = useMemo(() => {
    const sum = (p: Period, type: string, cat?: number | null): number =>
      allTransactions
        .filter((t) => t.type === type && inPeriod(t, p) && (cat === undefined || t.categoryId === cat))
        .reduce((s, t) => s + toBase(t), 0)
    const summary = {
      income: [sum(pa, 'income'), sum(pb, 'income')] as const,
      expense: [sum(pa, 'expense'), sum(pb, 'expense')] as const
    }
    const catIds = new Set<number | null>()
    for (const t of allTransactions) if (inPeriod(t, pa) || inPeriod(t, pb)) catIds.add(t.categoryId)
    const byCat = (type: string) =>
      [...catIds]
        .map((id) => ({ id, a: sum(pa, type, id), b: sum(pb, type, id) }))
        .filter((r) => r.a > 0.004 || r.b > 0.004)
        .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b))
    return { summary, expenseCats: byCat('expense'), incomeCats: byCat('income') }
  }, [allTransactions, pa, pb, base, rates])

  function applyPreset(key: string): void {
    setPresetKey(key)
    const p = presetList.find((x) => x.key === key)
    if (p) {
      setPa(p.a)
      setPb(p.b)
    }
  }

  const netA = cmp.summary.income[0] - cmp.summary.expense[0]
  const netB = cmp.summary.income[1] - cmp.summary.expense[1]
  const catLabel = (id: number | null): string => (id == null ? tr('finance.semCategoria') : categoryName(id))

  const catRows = (title: string, items: { id: number | null; a: number; b: number }[], goodWhenUp: boolean): React.ReactElement => (
    <>
      <tr>
        <td colSpan={4} style={{ fontWeight: 600, color: 'var(--text-secondary)', paddingTop: 14 }}>{title}</td>
      </tr>
      {items.length === 0 && (
        <tr>
          <td colSpan={4} style={{ color: 'var(--text-muted)' }}>{tr('finance.semMovimentoNosDoisPeriodos')}</td>
        </tr>
      )}
      {items.map((r) => (
        <tr key={String(r.id)}>
          <td>
            <span className="priority-dot" style={{ background: r.id == null ? 'var(--text-muted)' : categoryColor(r.id), marginRight: 6, display: 'inline-block' }} />
            {catLabel(r.id)}
          </td>
          <td style={{ textAlign: 'right' }}>{formatMoney(r.a, base)}</td>
          <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{formatMoney(r.b, base)}</td>
          <td style={{ textAlign: 'right' }}>
            <Delta a={r.a} b={r.b} base={base} goodWhenUp={goodWhenUp} />
          </td>
        </tr>
      ))}
    </>
  )

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{tr('finance.relatorios')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {tr('finance.valoresEmConvertidosPeloCambio', { base })}
          </p>
        </div>
      </div>

      <div className="chart-section">
        <div className="chart-title">{tr('finance.compararPeriodos')}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
          {presetList.map((p) => (
            <button key={p.key} className={`btn btn-sm ${presetKey === p.key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => applyPreset(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          <PeriodPicker label={tr('finance.periodoA')} value={pa} onChange={(p) => { setPa(p); setPresetKey('') }} />
          <PeriodPicker label={tr('finance.compararComB')} value={pb} onChange={(p) => { setPb(p); setPresetKey('') }} />
        </div>

        <div className="cards-grid" style={{ marginBottom: 12 }}>
          {[
            { label: tr('finance.receitas'), a: cmp.summary.income[0], b: cmp.summary.income[1], good: true, color: 'var(--success)' },
            { label: tr('finance.gastos'), a: cmp.summary.expense[0], b: cmp.summary.expense[1], good: false, color: 'var(--danger)' },
            { label: tr('finance.saldo2'), a: netA, b: netB, good: true, color: netA >= 0 ? 'var(--success)' : 'var(--danger)' }
          ].map((c) => (
            <div key={c.label} className="stat-card">
              <div className="stat-card-label">{c.label}</div>
              <div className="stat-card-value" style={{ fontSize: 16, color: c.color }}>{formatMoney(c.a, base)}</div>
              <div className="stat-card-sub">
                {tr('finance.vs2', { p0: formatMoney(c.b, base) })} <Delta a={c.a} b={c.b} base={base} goodWhenUp={c.good} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="report-table">
            <thead>
              <tr>
                <th>{tr('finance.categoria')}</th>
                <th style={{ textAlign: 'right' }} title={periodLabel(pa)}>{tr('finance.a')} {periodLabel(pa)}</th>
                <th style={{ textAlign: 'right' }} title={periodLabel(pb)}>{tr('finance.b')} {periodLabel(pb)}</th>
                <th style={{ textAlign: 'right' }}>{tr('finance.variacaoAB')}</th>
              </tr>
            </thead>
            <tbody>
              {catRows('Gastos', cmp.expenseCats, false)}
              {catRows('Receitas', cmp.incomeCats, true)}
            </tbody>
          </table>
        </div>
      </div>

      <CategoryCharts transactions={allTransactions} period={pa} periodLabel={`${tr('finance.periodoA')} · ${periodLabel(pa)}`} />

      <div className="chart-section" style={{ marginTop: 16 }}>
        <div className="chart-title">
          {tr('finance.mesAMes', { count: rows.length })} {rows.length === 1 ? tr('finance.mes2') : tr('finance.meses')} {tr('finance.comMovimentoDesde2015')}
        </div>
        {rows.length === 0 ? (
          <div className="empty-hint">{tr('finance.semTransacoesRegistradas')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="report-table">
              <thead>
                <tr>
                  <th>{tr('finance.mes')}</th>
                  <th style={{ textAlign: 'right' }}>{tr('finance.receitas')}</th>
                  <th style={{ textAlign: 'right' }}>{tr('finance.despesas')}</th>
                  <th style={{ textAlign: 'right' }}>{tr('finance.saldo2')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.m}>
                    <td style={{ textTransform: 'capitalize' }}>{monthLabel(r.m)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--success)' }}>{formatMoney(r.income, base)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{formatMoney(r.expense, base)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: r.net >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {formatMoney(r.net, base)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                  <td>{tr('finance.total2')}</td>
                  <td style={{ textAlign: 'right', color: 'var(--success)' }}>{formatMoney(totals.income, base)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{formatMoney(totals.expense, base)}</td>
                  <td style={{ textAlign: 'right', color: totals.income - totals.expense >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {formatMoney(totals.income - totals.expense, base)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
