import React, { useEffect, useState } from 'react'
import { Investment, InvestmentHistory } from '../../../types'
import { useFinanceStore } from '../store/financeStore'
import { MonthNav } from '../components/MonthNav'
import { InvestmentSummary } from '../components/InvestmentSummary'
import { formatMoney, sumByCurrency, monthLabel, investmentValueAtMonth, shiftMonth, comparableInvestmentDelta } from '../util'
import { investmentGroup, INVESTMENT_GROUPS, type InvestmentDetails, type InvestmentGroup } from '../../../../shared/finance'

function parseDetails(raw: string | null | undefined): InvestmentDetails | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as InvestmentDetails
  } catch {
    return null
  }
}

/** "CDB · 100% CDI · vence 05/2027 · bruto R$ 1.234 · IR R$ 12" — para diferenciar investimentos de nome igual. */
function detailsLine(inv: Investment): string | null {
  const d = parseDetails(inv.details)
  if (!d) return null
  const parts: string[] = []
  if (d.code && d.code !== inv.name) parts.push(d.code)
  if (d.rateText) parts.push(d.rateText)
  if (d.dueDate) parts.push(`vence ${d.dueDate.slice(5, 7)}/${d.dueDate.slice(0, 4)}`)
  if (d.quantity != null && !['CDB', 'LCI', 'LCA', 'Tesouro'].includes(d.kind)) parts.push(`${d.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 6 })} cotas`)
  if (d.gross != null && d.incomeTax) parts.push(`bruto ${formatMoney(d.gross, inv.currency)} · IR ${formatMoney(d.incomeTax, inv.currency)}`)
  if (d.iof) parts.push(`IOF ${formatMoney(d.iof, inv.currency)}`)
  return parts.join(' · ') || null
}

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
  onRemove,
  onRename
}: {
  investment: Investment
  onRename: (name: string) => void
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
    <div className="list-row" style={{ flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: '1 1 220px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span className="list-row-title" style={{ flex: '0 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={investment.externalName ?? investment.name}>
            {investment.name}
          </span>
          <button
            className="btn btn-secondary btn-sm"
            style={{ padding: '0 6px', flexShrink: 0, alignSelf: 'center', lineHeight: 1.4 }}
            title="Renomear (ex.: nome da caixinha)"
            onClick={() => {
              const n = prompt('Nome do investimento:', investment.name)?.trim()
              if (n && n !== investment.name) onRename(n)
            }}
          >
            ✎
          </button>
        </span>
        {detailsLine(investment) && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{detailsLine(investment)}</span>}
      </div>
      {investment.type && <span className="project-chip">{investment.type}</span>}
      {investment.externalId && (
        <span
          className="project-chip"
          title={`Sincronizado do Open Finance${parseDetails(investment.details)?.syncedAt ? ' em ' + new Date(parseDetails(investment.details)!.syncedAt).toLocaleString('pt-BR') : ''}${investment.externalName && investment.externalName !== investment.name ? ` · nome no banco: ${investment.externalName}` : ''}`}
        >
          🏦
        </span>
      )}
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
        <button className="btn btn-danger btn-sm" onClick={onRemove} title="Encerrar a partir deste mês (meses anteriores ficam como estão)">
          ✕
        </button>
      </div>
    </div>
  )
}

/** Registro mais recente do investimento até `month` (inclusive), ou null. */
function latestAt(history: InvestmentHistory[], investmentId: number, month: string): InvestmentHistory | null {
  let best: InvestmentHistory | null = null
  for (const h of history) {
    if (h.investmentId === investmentId && h.month <= month && (!best || h.month > best.month)) best = h
  }
  return best
}

/** Investimento encerrado neste mês ou antes: permite reabrir com um valor ou excluir de vez. */
function ClosedRow({
  investment,
  closedSince,
  onReopen,
  onDeleteAll
}: {
  investment: Investment
  closedSince: string
  onReopen: (amount: number) => void
  onDeleteAll: () => void
}): React.ReactElement {
  const [draft, setDraft] = useState('')
  const parsed = parseFloat(draft)
  const ok = draft.trim() !== '' && !isNaN(parsed)
  return (
    <div className="list-row" style={{ opacity: 0.75 }}>
      <span className="list-row-title">{investment.name}</span>
      {investment.type && <span className="project-chip">{investment.type}</span>}
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>encerrado desde {monthLabel(closedSince)}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{investment.currency}</span>
        <input
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ok && onReopen(parsed)}
          style={{ width: 110, textAlign: 'right' }}
          placeholder="valor"
        />
        <button className="btn btn-secondary btn-sm" onClick={() => onReopen(parsed)} disabled={!ok} title="Reabrir com este valor neste mês">
          Reabrir
        </button>
        <button className="btn btn-danger btn-sm" onClick={onDeleteAll} title="Excluir de todos os meses">
          🗑
        </button>
      </div>
    </div>
  )
}

export function InvestmentsPage(): React.ReactElement {
  const { investments, investmentHistory, month, refresh, addInvestment, setInvestmentValue, removeInvestment, closeInvestment, renameInvestment } =
    useFinanceStore()
  const [openGroups, setOpenGroups] = useState<Set<InvestmentGroup>>(new Set())
  const toggleGroup = (g: InvestmentGroup): void =>
    setOpenGroups((cur) => {
      const next = new Set(cur)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return next
    })
  const [pluggyReady, setPluggyReady] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncMsg, setSyncMsg] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    window.api.pluggy.status().then(setPluggyReady).catch(() => setPluggyReady(false))
  }, [])

  async function syncFromBank(): Promise<void> {
    setSyncBusy(true)
    setSyncMsg(null)
    try {
      const r = await window.api.pluggy.syncInvestments()
      let closedGone = 0
      if (r.vanished.length) {
        const list = r.vanished.slice(0, 10).map((v) => `• ${v.name}`).join('\n')
        const more = r.vanished.length > 10 ? `\n… e mais ${r.vanished.length - 10}` : ''
        if (confirm(`${r.vanished.length} investimento(s) não aparecem mais no banco:\n\n${list}${more}\n\nEncerrar a partir deste mês?`)) {
          const cur = new Date()
          const m = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
          for (const v of r.vanished) await window.api.investments.close(v.id, m)
          closedGone = r.vanished.length
        }
      }
      await refresh()
      const parts = [`${r.created} novos`, `${r.updated} atualizados`, `${r.closed + closedGone} encerrados`, `${r.movements ?? 0} movimentações`]
      setSyncMsg({ text: `Open Finance: ${parts.join(', ')}. Valores registrados no mês atual.`, ok: true })
    } catch (e) {
      setSyncMsg({ text: e instanceof Error ? e.message : String(e), ok: false })
    } finally {
      setSyncBusy(false)
    }
  }
  const [name, setName] = useState('')
  const [group, setGroup] = useState<InvestmentGroup | ''>('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('BRL')

  useEffect(() => {
    refresh()
  }, [])

  async function handleAdd(): Promise<void> {
    const v = parseFloat(amount)
    if (!name.trim() || isNaN(v) || !group) return
    // o rótulo do grupo vira o `type` — investmentGroup() reconhece cada rótulo
    const label = INVESTMENT_GROUPS.find((g) => g.id === group)?.label ?? null
    await addInvestment(name.trim(), label, v, currency)
    setName('')
    setGroup('')
    setAmount('')
  }

  // per-currency total for the selected month (carry-forward values)
  const monthItems = investments.map((i) => ({
    currency: i.currency,
    amount: investmentValueAtMonth(investmentHistory, i.id, month) ?? 0
  }))
  const totals = sumByCurrency(monthItems)
  const grandTotal = monthItems.reduce((s2, i) => s2 + i.amount, 0)

  // por mês: ativos (têm valor), encerrados (último registro é um encerramento) e futuros (ainda não existiam → ocultos)
  const active: Investment[] = []
  const closed: { investment: Investment; since: string }[] = []
  for (const i of investments) {
    const last = latestAt(investmentHistory, i.id, month)
    if (!last) continue
    if (last.closed) closed.push({ investment: i, since: last.month })
    else active.push(i)
  }

  function handleClose(i: Investment): void {
    if (!confirm(`Encerrar "${i.name}" a partir de ${monthLabel(month)}? Os meses anteriores ficam como estão.`)) return
    closeInvestment(i.id, month)
  }

  function handleDeleteAll(i: Investment): void {
    if (!confirm(`Excluir "${i.name}" de TODOS os meses? O histórico inteiro será apagado.`)) return
    removeInvestment(i.id)
  }
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
        </div>
        <MonthNav />
      </div>

      <InvestmentSummary />

      <div className="chart-section" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
          <select value={group} onChange={(e) => setGroup(e.target.value as InvestmentGroup | '')} title="Grupo do investimento">
            <option value="">Grupo…</option>
            {INVESTMENT_GROUPS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.icon} {g.label}
              </option>
            ))}
          </select>
          <input type="number" placeholder="Valor inicial" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 120 }} />
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!name.trim() || !group || isNaN(parseFloat(amount))}>
            + Adicionar
          </button>
        </div>
        {pluggyReady && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
            <button className="btn btn-secondary btn-sm" onClick={syncFromBank} disabled={syncBusy} title="Busca seus investimentos no banco (Pluggy) e registra o saldo líquido no mês atual">
              {syncBusy ? 'Atualizando…' : '🏦 Atualizar do Open Finance'}
            </button>
            {syncMsg && <span style={{ fontSize: 12, color: syncMsg.ok ? 'var(--success)' : 'var(--danger)' }}>{syncMsg.text}</span>}
          </div>
        )}
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          Registre o valor de cada investimento mês a mês (navegue pelos meses acima). Meses sem
          registro mantêm o último valor conhecido. ✕ encerra o investimento a partir do mês exibido;
          os meses anteriores não mudam.
        </p>
      </div>

      <div className="list-stack">
        {active.length === 0 && <div className="empty-hint">Nenhum investimento neste mês.</div>}
        {INVESTMENT_GROUPS.map((g) => {
          const items = active.filter((i) => investmentGroup(i.type, i.name) === g.id)
          if (!items.length && g.id === 'outros') return null
          const prevMonthKey = shiftMonth(month, -1)
          const val = (i: Investment, m: string): number => investmentValueAtMonth(investmentHistory, i.id, m) ?? 0
          const total = items.reduce((s2, i) => s2 + val(i, month), 0)
          // variação do grupo só entre itens com valor nos dois meses
          const cmpG = comparableInvestmentDelta(
            [...items, ...closed.map((c) => c.investment).filter((ci) => investmentGroup(ci.type, ci.name) === g.id)].map((i) => i.id),
            investmentHistory,
            month
          )
          const share = grandTotal > 0 ? (total / grandTotal) * 100 : 0
          const open = openGroups.has(g.id)
          return (
            <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                className="list-row"
                style={{ cursor: items.length ? 'pointer' : 'default', textAlign: 'left', width: '100%', opacity: items.length ? 1 : 0.55, font: 'inherit', color: 'inherit' }}
                onClick={() => items.length && toggleGroup(g.id)}
                disabled={!items.length}
                title={items.length ? (open ? 'Fechar detalhes' : 'Ver cada investimento') : 'Nenhum investimento neste grupo'}
              >
                <span style={{ fontSize: 18 }}>{g.icon}</span>
                <span className="list-row-title" style={{ fontWeight: 600 }}>
                  {g.label}
                  <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>
                    {items.length} {items.length === 1 ? 'item' : 'itens'}
                  </span>
                </span>
                {items.length > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{share.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>}
                {cmpG && items.length > 0 && <DeltaTag prev={cmpG.prev} curr={cmpG.now} currency="BRL" />}
                <span style={{ marginLeft: 'auto', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(total)}</span>
                <span style={{ width: 16, textAlign: 'center', color: 'var(--text-muted)' }}>{items.length ? (open ? '▲' : '▼') : ''}</span>
              </button>
              {open && (
                <div className="list-stack" style={{ marginLeft: 14, paddingLeft: 10, borderLeft: '2px solid var(--border)' }}>
                  {items
                    .slice()
                    .sort((a, b) => val(b, month) - val(a, month))
                    .map((i) => {
                      const explicit = investmentHistory.some((h) => h.investmentId === i.id && h.month === month)
                      const value = investmentValueAtMonth(investmentHistory, i.id, month)
                      const prevValue = investmentValueAtMonth(investmentHistory, i.id, prevMonthKey)
                      return (
                        <InvestmentRow
                          key={`${i.id}|${month}`}
                          investment={i}
                          value={value}
                          prevValue={prevValue}
                          isExplicit={explicit}
                          onSave={(v) => setInvestmentValue(i.id, month, v)}
                          onRemove={() => handleClose(i)}
                          onRename={(n) => renameInvestment(i.id, n)}
                        />
                      )
                    })}
                </div>
              )}
            </div>
          )
        })}
        {active.length > 0 && (
          <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setOpenGroups(openGroups.size ? new Set() : new Set(INVESTMENT_GROUPS.map((g) => g.id)))}>
            {openGroups.size ? 'Fechar todos' : 'Ver detalhes de todos'}
          </button>
        )}
      </div>

      {closed.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Encerrados ({closed.length})
          </div>
          <div className="list-stack">
            {closed.map(({ investment, since }) => (
              <ClosedRow
                key={`${investment.id}|${month}`}
                investment={investment}
                closedSince={since}
                onReopen={(v) => setInvestmentValue(investment.id, month, v)}
                onDeleteAll={() => handleDeleteAll(investment)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
