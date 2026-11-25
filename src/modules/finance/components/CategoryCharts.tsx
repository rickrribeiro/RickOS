import React, { useMemo, useState } from 'react'
import { Transaction } from '../../../types'
import { useFinanceStore } from '../store/financeStore'
import { convertToBase, formatMoney, formatMoneyCompact, monthLabel, shiftMonth } from '../util'

interface Period {
  from: string
  to: string
}

const OTHER = 'other'
const NONE = 'none'
type Key = number | typeof OTHER | typeof NONE

const RANK_LIMIT = 10 // barras ranqueadas: o resto vira "Outras"
const STACK_LIMIT = 5 // colunas empilhadas: 5 categorias + "Outras"
const MONTHS = 12

const shortMonth = (m: string): string =>
  new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')

/** Gráficos por categoria (Relatórios): ranking no período A e evolução mensal empilhada. */
export function CategoryCharts({ transactions, period, periodLabel }: { transactions: Transaction[]; period: Period; periodLabel: string }): React.ReactElement {
  const { base, rates, categoryName, categoryColor } = useFinanceStore()
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [hover, setHover] = useState<string | null>(null)
  const [showTable, setShowTable] = useState(false)

  const toBase = (t: Transaction): number => convertToBase(t.amount, t.currency, base, rates)
  const keyOf = (t: Transaction): Key => (t.categoryId == null ? NONE : t.categoryId)
  const nameOf = (k: Key): string => (k === OTHER ? 'Outras' : k === NONE ? 'Sem categoria' : categoryName(k))
  const colorOf = (k: Key): string => (k === OTHER || k === NONE ? 'var(--text-muted)' : categoryColor(k))

  // ── ranking no período ──
  const ranked = useMemo(() => {
    const by = new Map<Key, number>()
    for (const t of transactions) {
      const m = t.date.slice(0, 7)
      if (t.type !== type || m < period.from || m > period.to) continue
      by.set(keyOf(t), (by.get(keyOf(t)) ?? 0) + toBase(t))
    }
    const all = [...by.entries()].map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v)
    const total = all.reduce((s, r) => s + r.v, 0)
    const top = all.slice(0, RANK_LIMIT)
    const rest = all.slice(RANK_LIMIT).reduce((s, r) => s + r.v, 0)
    if (rest > 0) top.push({ k: OTHER, v: rest })
    return { rows: top, total }
  }, [transactions, type, period.from, period.to, base, rates])
  const rankMax = Math.max(1, ...ranked.rows.map((r) => r.v))

  // ── evolução mensal empilhada (12 meses até o fim do período) ──
  const stack = useMemo(() => {
    const months: string[] = []
    for (let i = MONTHS - 1; i >= 0; i--) months.push(shiftMonth(period.to, -i))
    const first = months[0]
    const byMonth = new Map<string, Map<Key, number>>()
    const totals = new Map<Key, number>()
    for (const t of transactions) {
      const m = t.date.slice(0, 7)
      if (t.type !== type || m < first || m > period.to) continue
      const k = keyOf(t)
      const v = toBase(t)
      if (!byMonth.has(m)) byMonth.set(m, new Map())
      byMonth.get(m)!.set(k, (byMonth.get(m)!.get(k) ?? 0) + v)
      totals.set(k, (totals.get(k) ?? 0) + v)
    }
    // séries fixas pela soma da janela (cor segue a categoria, não a posição)
    const series: Key[] = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, STACK_LIMIT).map(([k]) => k)
    const hasOther = totals.size > series.length
    if (hasOther) series.push(OTHER)
    const cols = months.map((m) => {
      const row = byMonth.get(m) ?? new Map<Key, number>()
      const parts = series.map((k) => {
        if (k !== OTHER) return { k, v: row.get(k) ?? 0 }
        let v = 0
        for (const [rk, rv] of row) if (!series.includes(rk)) v += rv
        return { k, v }
      })
      return { m, parts, total: parts.reduce((s, p) => s + p.v, 0) }
    })
    return { series, cols }
  }, [transactions, type, period.to, base, rates])

  const stackMax = Math.max(1, ...stack.cols.map((c) => c.total))
  const ticks = niceTicks(stackMax)
  const yMax = ticks[ticks.length - 1]
  const PLOT_H = 180
  const hovered = stack.cols.find((c) => c.m === hover)

  return (
    <div className="chart-section" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div className="chart-title" style={{ marginRight: 'auto' }}>Por categoria</div>
        {(['expense', 'income'] as const).map((t) => (
          <button key={t} className={`btn btn-sm ${type === t ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setType(t)}>
            {t === 'expense' ? 'Gastos' : 'Receitas'}
          </button>
        ))}
      </div>

      {/* Ranking */}
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '12px 0 8px' }}>
        {periodLabel} · total {formatMoney(ranked.total, base)}
      </div>
      {ranked.rows.length === 0 ? (
        <div className="empty-hint">Sem {type === 'expense' ? 'gastos' : 'receitas'} neste período.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ranked.rows.map((r) => {
            const share = ranked.total > 0 ? (r.v / ranked.total) * 100 : 0
            return (
              <div key={String(r.k)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 4 }}>
                  <span className="priority-dot" style={{ background: colorOf(r.k) }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(r.k)}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(r.v, base)}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 42, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {share.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                  </span>
                </div>
                <div style={{ height: 10, background: 'var(--bg-tertiary, var(--border))', borderRadius: 4 }}>
                  <div style={{ width: `${(r.v / rankMax) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: '0 4px 4px 0', minWidth: 2 }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Evolução empilhada */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '24px 0 8px' }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginRight: 'auto' }}>
          Evolução mensal · {monthLabel(stack.cols[0].m)} – {monthLabel(period.to)}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Ver gráfico' : 'Ver tabela'}
        </button>
      </div>

      {stack.series.length === 0 ? (
        <div className="empty-hint">Sem movimento nos últimos 12 meses.</div>
      ) : showTable ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="report-table">
            <thead>
              <tr>
                <th>Mês</th>
                {stack.series.map((k) => <th key={String(k)} style={{ textAlign: 'right' }}>{nameOf(k)}</th>)}
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {stack.cols.map((c) => (
                <tr key={c.m}>
                  <td style={{ textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{monthLabel(c.m)}</td>
                  {c.parts.map((p) => <td key={String(p.k)} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(p.v, base)}</td>)}
                  <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(c.total, base)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
            {/* eixo Y */}
            <div style={{ position: 'relative', width: 40, height: PLOT_H, flexShrink: 0 }}>
              {ticks.map((t) => (
                <span key={t} style={{ position: 'absolute', right: 0, bottom: (t / yMax) * PLOT_H - 6, fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {formatMoneyCompact(t)}
                </span>
              ))}
            </div>
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              {/* grade */}
              {ticks.map((t) => (
                <div key={t} style={{ position: 'absolute', left: 0, right: 0, bottom: (t / yMax) * PLOT_H + 18, height: 1, background: 'var(--border)' }} />
              ))}
              <div style={{ display: 'flex', alignItems: 'flex-end', height: PLOT_H + 18, position: 'relative' }} onMouseLeave={() => setHover(null)}>
                {stack.cols.map((c) => (
                  <div
                    key={c.m}
                    onMouseEnter={() => setHover(c.m)}
                    onFocus={() => setHover(c.m)}
                    onBlur={() => setHover(null)}
                    tabIndex={0}
                    aria-label={`${monthLabel(c.m)}: ${formatMoney(c.total, base)}`}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', cursor: 'default', outline: 'none', background: hover === c.m ? 'var(--bg-hover, rgba(127,127,127,0.08))' : undefined, borderRadius: 4 }}
                  >
                    {/* segmentos de baixo para cima, com 2px de respiro entre eles */}
                    <div style={{ width: '60%', maxWidth: 24, display: 'flex', flexDirection: 'column-reverse', gap: 2 }}>
                      {c.parts.filter((p) => p.v > 0).map((p, i, arr) => (
                        <div
                          key={String(p.k)}
                          style={{
                            height: Math.max(1, (p.v / yMax) * PLOT_H - 2),
                            background: colorOf(p.k),
                            borderRadius: i === arr.length - 1 ? '4px 4px 0 0' : 0
                          }}
                        />
                      ))}
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', height: 18, lineHeight: '18px' }}>{shortMonth(c.m)}</span>
                  </div>
                ))}
              </div>
              {hovered && (
                <div
                  role="tooltip"
                  style={{
                    position: 'absolute',
                    top: 0,
                    [stack.cols.indexOf(hovered) < MONTHS / 2 ? 'right' : 'left']: 0,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 12,
                    minWidth: 180,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                    pointerEvents: 'none',
                    zIndex: 2
                  }}
                >
                  <div style={{ textTransform: 'capitalize', color: 'var(--text-secondary)', marginBottom: 4 }}>{monthLabel(hovered.m)}</div>
                  {[...hovered.parts].reverse().map((p) => (
                    <div key={String(p.k)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 10, height: 2, background: colorOf(p.k), flexShrink: 0 }} />
                      <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{nameOf(p.k)}</span>
                      <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(p.v, base)}</strong>
                    </div>
                  ))}
                  <div style={{ display: 'flex', borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 }}>
                    <span style={{ flex: 1, color: 'var(--text-secondary)' }}>Total</span>
                    <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(hovered.total, base)}</strong>
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* legenda */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
            {stack.series.map((k) => (
              <span key={String(k)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: colorOf(k) }} />
                {nameOf(k)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** Ticks "redondos" (1, 2, 2.5, 5 × 10^n) cobrindo o máximo, 3–5 divisões. */
function niceTicks(max: number): number[] {
  const rough = max / 4
  const pow = Math.pow(10, Math.floor(Math.log10(rough)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => max / s <= 5) ?? 10 * pow
  const out: number[] = []
  for (let v = step; v < max + step; v += step) out.push(v)
  return [0, ...out]
}
