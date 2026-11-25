import React, { useMemo, useState } from 'react'
import { useFinanceStore } from '../store/financeStore'
import { comparableInvestmentDelta, convertToBase, formatMoney, investmentValueAtMonth, monthLabel, shiftMonth } from '../util'

const fmtPct = (n: number): string => `${n >= 0 ? '+' : '−'}${Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`

/**
 * Topo de Investimentos (mês selecionado): total e variação vs mês anterior, valorização (variação
 * descontados aportes e resgates — o quanto rendeu de fato), proventos recebidos e o fluxo do mês.
 * Aportes/resgates/proventos vêm das movimentações do Open Finance.
 */
export function InvestmentSummary(): React.ReactElement {
  const { investments, investmentHistory, investmentMovements, month, base, rates } = useFinanceStore()
  const [showProv, setShowProv] = useState(false)

  const s = useMemo(() => {
    const totalAt = (m: string): number =>
      investments.reduce((sum, i) => sum + convertToBase(investmentValueAtMonth(investmentHistory, i.id, m) ?? 0, i.currency, base, rates), 0)
    const now = totalAt(month)
    // variação só entre investimentos com valor nos dois meses (os que entraram/saíram do registro
    // não viram variação falsa); fluxos (aportes/resgates) só desses mesmos investimentos
    const cmp = comparableInvestmentDelta(investments.map((i) => i.id), investmentHistory, month)
    const prev = cmp ? cmp.prev : null
    const cmpExternal = new Set(investments.filter((i) => cmp?.ids.includes(i.id) && i.externalId).map((i) => i.externalId as string))

    const inMonth = investmentMovements.filter((m) => m.date.slice(0, 7) === month)
    const flows = inMonth.filter((m) => cmpExternal.has(m.externalInvestmentId))
    const sum = (types: string[]): number => flows.filter((m) => types.includes(m.type)).reduce((a, m) => a + (m.netAmount ?? m.amount), 0)
    const sumAll = (types: string[]): number => inMonth.filter((m) => types.includes(m.type)).reduce((a, m) => a + (m.netAmount ?? m.amount), 0)
    const contributions = sum(['BUY'])
    const withdrawals = sum(['SELL', 'AMORTIZATION'])
    const taxes = sumAll(['TAX'])
    const allContributions = sumAll(['BUY'])
    const allWithdrawals = sumAll(['SELL', 'AMORTIZATION'])
    const provList = inMonth.filter((m) => m.type === 'INTEREST')
    const dividends = provList.reduce((a, m) => a + (m.netAmount ?? m.amount), 0)
    const byAsset = new Map<string, { kind: string | null; total: number; n: number }>()
    for (const p of provList) {
      const k = p.investmentName ?? '—'
      const cur = byAsset.get(k) ?? { kind: p.investmentKind, total: 0, n: 0 }
      cur.total += p.netAmount ?? p.amount
      cur.n++
      byAsset.set(k, cur)
    }
    const year = month.slice(0, 4)
    const dividendsYear = investmentMovements
      .filter((m) => m.type === 'INTEREST' && m.date.slice(0, 4) === year && m.date.slice(0, 7) <= month)
      .reduce((a, m) => a + (m.netAmount ?? m.amount), 0)

    const variation = cmp ? cmp.now - cmp.prev : null
    const appreciation = variation != null ? variation - (contributions - withdrawals) : null
    return {
      now,
      prev,
      variation,
      appreciation,
      contributions,
      withdrawals,
      allContributions,
      allWithdrawals,
      taxes,
      entered: cmp?.entered ?? 0,
      left: cmp?.left ?? 0,
      dividends,
      dividendsYear,
      year,
      byAsset: [...byAsset.entries()].sort((a, b) => b[1].total - a[1].total),
      hasMovements: investmentMovements.length > 0
    }
  }, [investments, investmentHistory, investmentMovements, month, base, rates])

  const color = (n: number | null): string | undefined => (n == null ? undefined : n >= 0 ? 'var(--success)' : 'var(--danger)')
  const signed = (n: number): string => `${n >= 0 ? '+' : '−'}${formatMoney(Math.abs(n), base)}`

  return (
    <div className="chart-section" style={{ marginBottom: 12 }}>
      <div className="cards-grid" style={{ marginTop: 0 }}>
        <div className="stat-card">
          <div className="stat-card-label">Total investido</div>
          <div className="stat-card-value" style={{ fontSize: 16 }}>{formatMoney(s.now, base)}</div>
          <div className="stat-card-sub" style={{ color: color(s.variation) }}>
            {s.variation == null
              ? 'sem base de comparação com o mês anterior'
              : `${signed(s.variation)} vs. ${monthLabel(shiftMonth(month, -1))}${s.prev ? ` (${fmtPct((s.variation / s.prev) * 100)})` : ''}`}
            {(s.entered > 0 || s.left > 0) && s.variation != null && (
              <span style={{ display: 'block', color: 'var(--text-muted)' }}>
                sem contar {[s.entered && `${s.entered} que entraram`, s.left && `${s.left} que saíram`].filter(Boolean).join(' e ')} do registro
              </span>
            )}
          </div>
        </div>
        <div className="stat-card" title="Variação descontando o dinheiro que entrou (aportes) e saiu (resgates): o quanto os investimentos renderam ou perderam de fato.">
          <div className="stat-card-label">Valorização no mês</div>
          <div className="stat-card-value" style={{ fontSize: 16, color: color(s.appreciation) }}>
            {s.appreciation == null ? '—' : signed(s.appreciation)}
          </div>
          <div className="stat-card-sub">
            {s.appreciation == null
              ? 'precisa de investimentos com valor neste mês e no anterior'
              : `variação ${signed(s.variation!)} − aportes ${formatMoney(s.contributions, base)} + resgates ${formatMoney(s.withdrawals, base)}${s.prev ? ` · ${fmtPct((s.appreciation / s.prev) * 100)}` : ''}`}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Proventos no mês</div>
          <div className="stat-card-value" style={{ fontSize: 16, color: s.dividends > 0 ? 'var(--success)' : undefined }}>{formatMoney(s.dividends, base)}</div>
          <div className="stat-card-sub">
            {s.byAsset.length > 0 ? (
              <button className="btn btn-sm" style={{ padding: 0, background: 'transparent', border: 'none', color: 'var(--accent)' }} onClick={() => setShowProv((v) => !v)}>
                {s.byAsset.length} {s.byAsset.length === 1 ? 'ativo' : 'ativos'} {showProv ? '▲' : '▼'}
              </button>
            ) : (
              'nenhum no mês'
            )}{' '}
            · {s.year} até agora: {formatMoney(s.dividendsYear, base)}
          </div>
          {showProv && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {s.byAsset.map(([name, v]) => (
                <div key={name} style={{ display: 'flex', gap: 6, fontSize: 12 }}>
                  <span style={{ flex: 1, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {name}
                    {v.kind ? ` · ${v.kind}` : ''}
                  </span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(v.total, base)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Aportes e resgates</div>
          <div className="stat-card-value" style={{ fontSize: 16 }}>{signed(s.allContributions - s.allWithdrawals)}</div>
          <div className="stat-card-sub">
            aportes {formatMoney(s.allContributions, base)} · resgates {formatMoney(s.allWithdrawals, base)}
            {s.taxes > 0 && ` · impostos ${formatMoney(s.taxes, base)}`}
          </div>
        </div>
      </div>
      {!s.hasMovements && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          Proventos, aportes e resgates vêm do Open Finance: clique em &quot;Atualizar do Open Finance&quot; para trazer as movimentações.
        </div>
      )}
    </div>
  )
}
