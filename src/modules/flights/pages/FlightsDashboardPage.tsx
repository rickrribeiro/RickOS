import React, { useEffect, useMemo, useState } from 'react'
import type { MonitorSummary } from '../../../../shared/flights'
import { formatMoney } from '../../../../shared/flights'
import { useUIStore } from '../../../store/uiStore'
import { useTripStore } from '../../travel/store/tripStore'
import { MonitorEditor } from '../components/MonitorEditor'
import { SourcesModal } from '../components/SourcesModal'
import { rel, StateBadge } from '../components/ui'
import { errMsg, useFlightStore } from '../store/flightStore'
import '../flights.css'
import { t as tr } from '../../../i18n'

function MonitorCard(props: { m: MonitorSummary; canSearch: boolean; onOpen: () => void; onEdit: () => void; onError: (e: string) => void }): React.ReactElement {
  const { m } = props
  const [busy, setBusy] = useState(false)
  const act = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      props.onError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }
  const stop = (e: React.MouseEvent): void => e.stopPropagation()
  const cov = m.coverage
  return (
    <div
      className={`fm-card ${m.status === 'paused' ? 'paused' : ''}`}
      onClick={props.onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && props.onOpen()}
    >
      <div className="fm-card-head">
        <span className="fm-card-name" title={m.name}>
          {m.name}
        </span>
        <StateBadge state={m.state} />
      </div>
      <div className="fm-route" title={`${m.originSummary} → ${m.destinationSummary}`}>
        <b>{m.originSummary}</b> → <b>{m.destinationSummary}</b>
      </div>
      <div className="fm-small">{m.dateSummary}</div>
      <div className="fm-card-prices">
        {m.minPrice ? (
          <span className="fm-price" title={m.eligibleCount ? tr('flights.menorPrecoEntreAsOpcoes') : tr('flights.menorPrecoComVerificacaoPendente')}>
            {formatMoney(m.minPrice)}
          </span>
        ) : (
          <span className="fm-price muted">{m.offerCount ? tr('flights.semElegiveis') : tr('flights.semPrecos')}</span>
        )}
        {m.minVerifiedPrice && m.minVerifiedPrice.amountMinor !== m.minPrice?.amountMinor && (
          <span className="fm-small" title={tr('flights.menorPrecoConfirmadoAoVivo')}>
            {tr('flights.aoVivo', { p0: formatMoney(m.minVerifiedPrice) })}
          </span>
        )}
        {m.minVerifiedPrice && m.minVerifiedPrice.amountMinor === m.minPrice?.amountMinor && <span className="fm-pill ok">{tr('flights.aoVivo2')}</span>}
        {m.minPrice && !m.eligibleCount && <span className="fm-pill warn">{tr('flights.verificacaoPendente2')}</span>}
        {m.trend && (
          <span className={`fm-trend ${m.trend.direction}`} title={tr('flights.menorPrecoComparavelUltimos3')}>
            {m.trend.direction === 'down' ? '▼' : m.trend.direction === 'up' ? '▲' : '='} {Math.abs(m.trend.deltaPercent)}%
          </span>
        )}
      </div>
      <div className="fm-card-meta">
        <span>
          {tr('flights.elegivelIs', { eligibleCount: m.eligibleCount })}{m.pendingCount ? tr('flights.pendenteS', { pendingCount: m.pendingCount }) : ''}
        </span>
        <span title={m.lastSuccessAt ?? ''}>{tr('flights.buscaOk')} {rel(m.lastSuccessAt)}</span>
        {m.nextRunAt && <span title={m.nextRunAt}>{tr('flights.proxima')} {rel(m.nextRunAt)}</span>}
      </div>
      <div title={tr('flights.coberturaDeCombinacoes', { covered: cov.covered, universe: cov.universe, percent: cov.percent })}>
        <div className="fm-cov">
          <span style={{ width: `${Math.min(100, cov.percent)}%` }} />
        </div>
        <div className="fm-small" style={{ marginTop: 2 }}>
          {tr('flights.cobertura2', { percent: cov.percent })}{cov.pending ? tr('flights.naFila2', { pending: cov.pending }) : ''}
          {cov.failed ? tr('flights.falhaS', { failed: cov.failed }) : ''}
        </div>
      </div>
      {m.stateDetail && <div className={`fm-state-detail ${m.state === 'error' ? 'error' : ''}`}>{m.stateDetail}</div>}
      <div className="fm-card-actions" onClick={stop}>
        <button
          className="btn btn-primary"
          disabled={busy || m.state === 'running' || m.state === 'needs_config' || !props.canSearch}
          title={!props.canSearch ? tr('flights.nenhumaFonteAutomaticaConfigurada') : m.state === 'needs_config' ? tr('flights.completeAConfiguracao') : tr('flights.executarNovaBusca')}
          onClick={() => act(() => window.api.flightMon.run(m.id))}
          type="button"
        >
          {m.state === 'running' ? tr('flights.buscando') : tr('flights.buscar')}
        </button>
        <button className="btn btn-secondary" onClick={props.onEdit} type="button">
          {tr('flights.editar2')}
        </button>
        {m.status !== 'draft' && (
          <button className="btn btn-secondary" disabled={busy} onClick={() => act(() => window.api.flightMon.setStatus(m.id, m.status === 'paused' ? 'active' : 'paused'))} type="button">
            {m.status === 'paused' ? tr('flights.retomar') : tr('flights.pausar')}
          </button>
        )}
        <button className="btn btn-secondary" disabled={busy} onClick={() => act(() => window.api.flightMon.duplicate(m.id))} type="button" title={tr('flights.duplicar')}>
          ⧉
        </button>
        <button
          className="btn btn-danger"
          disabled={busy}
          type="button"
          title={tr('flights.excluir')}
          onClick={() => window.confirm(tr('flights.excluirComTodoOHistorico2', { name: m.name })) && act(() => window.api.flightMon.delete(m.id))}
        >
          🗑
        </button>
      </div>
    </div>
  )
}

export function FlightsDashboardPage(): React.ReactElement {
  const { monitors, providers, loaded, error, refresh, refreshProviders, open } = useFlightStore()
  const { trips, refresh: refreshTrips } = useTripStore()
  const setPage = useUIStore((s) => s.setPage)
  const [editing, setEditing] = useState<{ monitor: MonitorSummary | null; ai: boolean } | null>(null)
  const [sources, setSources] = useState(false)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'attention'>('all')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    void refresh()
    void refreshProviders()
    void refreshTrips()
    const off = window.api.flightMon.onChanged(() => void refresh())
    return off
  }, [])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return monitors.filter((m) => {
      if (filter === 'active' && m.status !== 'active') return false
      if (filter === 'paused' && m.status !== 'paused') return false
      if (filter === 'attention' && !['error', 'needs_config'].includes(m.state)) return false
      return !t || `${m.name} ${m.originSummary} ${m.destinationSummary}`.toLowerCase().includes(t)
    })
  }, [monitors, q, filter])

  const automated = providers.filter((p) => p.kind === 'api' && p.available)
  const openMonitor = (id: number): void => {
    open(id)
    setPage('flight-monitor')
  }

  return (
    <div className="module-page fm-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{tr('flights.monitoramentoDePassagens')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{tr('flights.descubraCompareEAcompanhePassagens')}</p>
        </div>
      </div>

      <div className="fm-toolbar">
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({ monitor: null, ai: false })} type="button">
          {tr('flights.novoMonitoramento2')}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ monitor: null, ai: true })} type="button">
          {tr('flights.criarComIa')}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setSources(true)} type="button">
          {tr('flights.fontesEExecucao')}
        </button>
        <span className="fm-spacer" />
        <div className="fm-seg">
          {(
            [
              ['all', tr('flights.todos')],
              ['active', tr('flights.ativos')],
              ['paused', tr('flights.pausados')],
              ['attention', tr('flights.atencao')]
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)} type="button">
              {l}
            </button>
          ))}
        </div>
        <input type="search" placeholder={tr('flights.filtrar')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="fm-providers-strip">
        <span className="fm-muted">{tr('flights.fontes')}</span>
        {providers.map((p) => (
          <span key={p.id} className={`fm-pill ${p.available ? 'ok' : 'outline'}`} title={p.reason ?? ''}>
            {p.available ? '●' : '○'} {p.label}
          </span>
        ))}
        {loaded && automated.length === 0 && (
          <button className="fm-linkbtn" onClick={() => setSources(true)} type="button">
            {tr('flights.nenhumaFonteAutomaticaConfigurar')}
          </button>
        )}
      </div>

      {msg && (
        <div className="fm-note danger" style={{ marginBottom: 10 }}>
          {msg}{' '}
          <button className="fm-linkbtn" onClick={() => setMsg('')} type="button">
            {tr('flights.fechar2')}
          </button>
        </div>
      )}
      {error && <div className="fm-note danger">{error}</div>}

      {loaded && monitors.length === 0 ? (
        <div className="fm-empty">
          <h3>{tr('flights.nenhumMonitoramentoAinda')}</h3>
          <p className="fm-muted">{tr('flights.exSudesteAsiaticoSalvadorOu')}</p>
          <div className="fm-row" style={{ justifyContent: 'center', marginTop: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setEditing({ monitor: null, ai: true })} type="button">
              {tr('flights.descreverParaAIa')}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ monitor: null, ai: false })} type="button">
              {tr('flights.montarManualmente')}
            </button>
          </div>
        </div>
      ) : (
        <div className="fm-grid">
          {shown.map((m) => (
            <MonitorCard key={m.id} m={m} canSearch={automated.length > 0} onOpen={() => openMonitor(m.id)} onEdit={() => setEditing({ monitor: m, ai: false })} onError={setMsg} />
          ))}
          {loaded && shown.length === 0 && <div className="empty-hint">{tr('flights.nadaComEsseFiltro')}</div>}
        </div>
      )}

      {editing && (
        <MonitorEditor
          monitor={editing.monitor}
          startWithAi={editing.ai}
          trips={trips}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null)
            void refresh()
            if (!editing.monitor) openMonitor(id)
          }}
        />
      )}
      {sources && (
        <SourcesModal
          onClose={() => {
            setSources(false)
            void refresh()
          }}
        />
      )}
    </div>
  )
}
