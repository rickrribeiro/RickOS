import React, { useEffect, useState } from 'react'
import type { AlertEvent, CalendarDay, HistoryPoint, HistoryView, MonitorSummary, PlanView, PromoFeedView } from '../../../../shared/flights'
import { openExternal } from '../../../api/createApi'
import { formatMoney } from '../../../../shared/flights'
import { errMsg } from '../store/flightStore'
import { rel } from './ui'
import { t as tr, getLocale, weekdayNames } from '../../../i18n'

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; err: string } {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let live = true
    fn()
      .then((d) => live && (setData(d), setErr('')))
      .catch((e) => live && setErr(errMsg(e)))
    return () => {
      live = false
    }
  }, deps)
  return { data, err }
}

// ── Calendário ────────────────────────────────────────────────────────────────

export function PriceCalendar(props: { m: MonitorSummary; version: number }): React.ReactElement {
  const { data, err } = useLoad(() => window.api.flightMon.calendar(props.m.id), [props.m.id, props.version])
  if (err) return <div className="fm-error">{err}</div>
  if (!data) return <div className="fm-muted">{tr('flights.carregando')}</div>
  if (!data.length) return <div className="fm-empty">{tr('flights.semDatasFuturasConfiguradas')}</div>
  const prices = data.map((d) => d.minPrice?.amountMinor).filter((x): x is number => x != null)
  const min = prices.length ? Math.min(...prices) : null
  const months = new Map<string, CalendarDay[]>()
  for (const d of data) months.set(d.date.slice(0, 7), [...(months.get(d.date.slice(0, 7)) ?? []), d])
  return (
    <div>
      <div className="fm-note" style={{ marginBottom: 8 }}>
        {tr('flights.menorPrecoConhecidoNaoExcluido', { currency: props.m.config.currency })} <b>{tr('flights.nao')}</b> {tr('flights.significaQueNaoHaVoos')}
      </div>
      {[...months.entries()].map(([month, days]) => {
        const first = new Date(`${month}-01T12:00:00`).getDay()
        const firstDay = Number(days[0].date.slice(8, 10))
        const lead = (first + firstDay - 1) % 7
        return (
          <div key={month} style={{ marginBottom: 14 }}>
            <div className="fm-section-title">{new Date(`${month}-01T12:00:00`).toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' })}</div>
            <div className="fm-cal">
              {weekdayNames().map((d) => (
                <div key={d} className="fm-cal-head">
                  {d}
                </div>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <div key={`e${i}`} className="fm-cal-empty" />
              ))}
              {days.map((d) => (
                <div
                  key={d.date}
                  className={`fm-cal-day ${d.coverage === 'none' && !d.minPrice ? 'none' : ''} ${d.coverage === 'failed' ? 'failed' : ''} ${min != null && d.minPrice?.amountMinor === min ? 'cheap' : ''}`}
                  title={d.coverage === 'none' ? tr('flights.aindaNaoPesquisado') : d.coverage === 'failed' ? tr('flights.soHouveFalhasNestaData') : tr('flights.opcaoOes', { offers: d.offers })}
                >
                  <span>{Number(d.date.slice(8, 10))}</span>
                  {d.minPrice ? <b>{formatMoney(d.minPrice).replace(/,\d\d$/, '')}</b> : <span className="fm-small">{d.coverage === 'searched' ? tr('flights.semPreco') : d.coverage === 'failed' ? tr('flights.falhou') : ''}</span>}
                </div>
              ))}
            </div>
          </div>
        )
      })}
      <div className="fm-legend">
        <span>
          <i style={{ background: 'color-mix(in srgb, var(--success) 20%, transparent)', borderColor: 'var(--success)' }} />
          {tr('flights.menorPrecoDoPeriodo')}
        </span>
        <span>
          <i style={{ background: 'repeating-linear-gradient(135deg, transparent, transparent 3px, var(--bg-tertiary) 3px, var(--bg-tertiary) 5px)' }} />
          {tr('flights.naoPesquisado')}
        </span>
        <span>
          <i style={{ borderColor: 'var(--danger)' }} />
          {tr('flights.soFalhas')}
        </span>
      </div>
    </div>
  )
}

// ── Histórico ─────────────────────────────────────────────────────────────────

const PALETTE = ['var(--accent)', '#06b6d4', 'var(--warning)', 'var(--danger)', '#8b5cf6', '#ec4899', '#84cc16', '#f97316']

export function LineChart(props: { series: { label: string; points: HistoryPoint[] }[]; currency: string }): React.ReactElement {
  const all = props.series.flatMap((s) => s.points)
  if (all.length < 2) return <div className="fm-muted">{tr('flights.dadosInsuficientesParaOGrafico')}</div>
  const days = [...new Set(all.map((p) => p.day))].sort()
  const minV = Math.min(...all.map((p) => p.minor))
  const maxV = Math.max(...all.map((p) => p.minor))
  const W = 640
  const H = 200
  const pad = { l: 64, r: 10, t: 10, b: 24 }
  const x = (d: string): number => pad.l + (days.length === 1 ? 0 : (days.indexOf(d) / (days.length - 1)) * (W - pad.l - pad.r))
  const span = maxV - minV || maxV * 0.1 || 1
  const y = (v: number): number => pad.t + (1 - (v - minV + span * 0.05) / (span * 1.1)) * (H - pad.t - pad.b)
  const ticks = [minV, minV + span / 2, maxV]
  return (
    <div>
      <svg className="fm-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr('flights.historicoDePrecos')}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end">
              {formatMoney({ amountMinor: Math.round(t), currency: props.currency }).replace(/,\d\d$/, '')}
            </text>
          </g>
        ))}
        {[days[0], days[days.length - 1]].map((d, i) => (
          <text key={i} x={x(d)} y={H - 6} textAnchor={i ? 'end' : 'start'}>
            {d.slice(8, 10)}/{d.slice(5, 7)}
          </text>
        ))}
        {props.series.map((s, i) => (
          <g key={s.label}>
            <polyline fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} points={s.points.map((p) => `${x(p.day)},${y(p.minor)}`).join(' ')} />
            {s.points.map((p) => (
              <circle key={p.day} cx={x(p.day)} cy={y(p.minor)} r={2.5} fill={PALETTE[i % PALETTE.length]}>
                <title>{`${s.label} · ${p.day}: ${formatMoney({ amountMinor: p.minor, currency: props.currency })}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      {props.series.length > 1 && (
        <div className="fm-series-legend">
          {props.series.map((s, i) => (
            <span key={s.label}>
              <i style={{ background: PALETTE[i % PALETTE.length] }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function top(groups: Record<string, HistoryPoint[]>, n = 6): { label: string; points: HistoryPoint[] }[] {
  return Object.entries(groups)
    .map(([label, points]) => ({ label, points }))
    .sort((a, b) => Math.min(...a.points.map((p) => p.minor)) - Math.min(...b.points.map((p) => p.minor)))
    .slice(0, n)
}

export function HistoryPanel(props: { m: MonitorSummary; version: number }): React.ReactElement {
  const [days, setDays] = useState(60)
  const { data, err } = useLoad<HistoryView>(() => window.api.flightMon.history(props.m.id, days), [props.m.id, props.version, days])
  if (err) return <div className="fm-error">{err}</div>
  if (!data) return <div className="fm-muted">{tr('flights.carregando')}</div>
  return (
    <div>
      <div className="fm-row" style={{ marginBottom: 8 }}>
        <div className="fm-seg">
          {[14, 30, 60, 180].map((d) => (
            <button key={d} className={days === d ? 'active' : ''} onClick={() => setDays(d)} type="button">
              {tr('flights.dias2', { d })}
            </button>
          ))}
        </div>
        <span className="fm-small">{tr('flights.soObservacoesComparaveisMesmaMoeda', { currency: data.currency })}</span>
      </div>
      {data.note && <div className="fm-note" style={{ marginBottom: 8 }}>{data.note}</div>}
      <div className="fm-chart-card">
        <h4>{tr('flights.menorPrecoObservadoPorDia')}</h4>
        <LineChart series={[{ label: tr('flights.menorPreco'), points: data.overall }]} currency={data.currency} />
      </div>
      <div className="fm-cols">
        <div className="fm-chart-card">
          <h4>{tr('flights.porOrigem')}</h4>
          <LineChart series={top(data.byOrigin)} currency={data.currency} />
        </div>
        <div className="fm-chart-card">
          <h4>{tr('flights.porDestino')}</h4>
          <LineChart series={top(data.byDestination)} currency={data.currency} />
        </div>
      </div>
      <div className="fm-chart-card">
        <h4>{tr('flights.mudancasDePrecoNoMesmo')}</h4>
        {data.changes.length === 0 ? (
          <div className="fm-muted">{tr('flights.nenhumaMudancaRegistradaAinda')}</div>
        ) : (
          <table className="report-table" style={{ width: '100%', fontSize: 12 }}>
            <tbody>
              {data.changes.map((c) => (
                <tr key={c.offerId}>
                  <td>{c.label}</td>
                  <td>{formatMoney(c.from)}</td>
                  <td>→</td>
                  <td style={{ color: c.to.amountMinor < c.from.amountMinor ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{formatMoney(c.to)}</td>
                  <td className="fm-small">{rel(c.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Plano / cobertura ─────────────────────────────────────────────────────────

const STAGE_LABEL = { discovery: tr('flights.descoberta2'), deepen: tr('flights.aprofundamento'), validate: tr('flights.validacao') }
const STAGE_HINT = {
  discovery: tr('flights.amploEBaratoPorPar'),
  deepen: tr('flights.soParesPromissoresDataA'),
  validate: tr('flights.revalidaAoVivoAsMelhores')
}
const RUN_STATUS: Record<string, string> = {
  running: tr('flights.run.running'),
  done: tr('flights.run.done'),
  partial: tr('flights.run.partial'),
  failed: tr('flights.run.failed'),
  interrupted: tr('flights.run.interrupted'),
  budget: tr('flights.run.budget')
}

export function PlanPanel(props: { m: MonitorSummary; version: number; onRetry: () => void }): React.ReactElement {
  const { data, err } = useLoad<PlanView>(() => window.api.flightMon.plan(props.m.id), [props.m.id, props.version])
  const [showTasks, setShowTasks] = useState(false)
  if (err) return <div className="fm-error">{err}</div>
  if (!data) return <div className="fm-muted">{tr('flights.carregando')}</div>
  const c = data.coverage
  return (
    <div>
      <div className="fm-section">
        <div className="fm-section-title">{tr('flights.coberturaDaPesquisa')}</div>
        <div className="fm-cov" style={{ height: 8 }}>
          <span style={{ width: `${Math.min(100, c.percent)}%` }} />
        </div>
        <div className="fm-summary-bar" style={{ marginTop: 6 }}>
          <span>
            <b>{c.covered.toLocaleString(getLocale())}</b> {tr('flights.de2')} <b>{c.universe.toLocaleString(getLocale())}</b> {tr('flights.combinacoesAeroportoAeroportoDataPesquisadas', { percent: c.percent })}
          </span>
          <span>
            <b>{c.done}</b> {tr('flights.consultasOk')} <b>{c.pending}</b> {tr('flights.naFila')} <b>{c.failed}</b> {tr('flights.falhas')}
          </span>
        </div>
        <div className="fm-small" style={{ marginTop: 4 }}>
          {tr('flights.origens')} {data.airports.origins.join(', ') || '—'} {tr('flights.destinos')} {data.airports.destinations.join(', ') || '—'}
        </div>
        {data.warnings.map((w) => (
          <div key={w} className="fm-small" style={{ color: 'var(--warning)' }}>
            {w}
          </div>
        ))}
        {c.failed > 0 && (
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={props.onRetry} type="button">
            {tr('flights.recolocarFalhaSNaFila', { failed: c.failed })}
          </button>
        )}
      </div>
      <div className="fm-stage-grid">
        {(Object.keys(STAGE_LABEL) as (keyof typeof STAGE_LABEL)[]).map((s) => {
          const st = data.byStage[s]
          return (
            <div className="fm-stage" key={s}>
              <h4>{STAGE_LABEL[s]}</h4>
              <div className="fm-small">{STAGE_HINT[s]}</div>
              <div style={{ marginTop: 4 }}>
                ✓ {st.done} · ⏳ {st.pending + st.running} · ✕ {st.failed}
              </div>
            </div>
          )
        })}
      </div>
      <div className="fm-section">
        <div className="fm-section-title">{tr('flights.execucoesRecentes')}</div>
        {data.runs.length === 0 ? (
          <div className="fm-muted">{tr('flights.nenhumaExecucaoAinda')}</div>
        ) : (
          <table className="report-table" style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr>
                <th>{tr('flights.quando')}</th>
                <th>{tr('flights.tipo')}</th>
                <th>{tr('flights.status')}</th>
                <th>{tr('flights.consultas2')}</th>
                <th>{tr('flights.cache')}</th>
                <th>{tr('flights.ofertas')}</th>
                <th>{tr('flights.tokens')}</th>
                <th>{tr('flights.observacao')}</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{rel(r.startedAt)}</td>
                  <td>{r.trigger === 'schedule' ? tr('flights.agendada') : r.trigger === 'more' ? tr('flights.maisOpcoes') : r.trigger === 'assisted' ? tr('flights.skyscannerChrome') : tr('flights.manual2')}</td>
                  <td>{RUN_STATUS[r.status] ?? r.status}</td>
                  <td>{r.queries}</td>
                  <td>{r.cacheHits}</td>
                  <td>{r.offersFound}</td>
                  <td>{r.tokens ? r.tokens.toLocaleString(getLocale()) : '—'}</td>
                  <td className="fm-small">{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <button className="fm-linkbtn" onClick={() => setShowTasks(!showTasks)} type="button">
        {showTasks ? tr('flights.ocultar') : tr('flights.ver')} {tr('flights.consultasPlanejadas', { count: data.tasks.length })}
      </button>
      {showTasks && (
        <div className="fm-table-wrap" style={{ marginTop: 6, maxHeight: 360, overflowY: 'auto' }}>
          <table className="fm-table" style={{ minWidth: 700 }}>
            <thead>
              <tr>
                <th>{tr('flights.etapa')}</th>
                <th>{tr('flights.fonte')}</th>
                <th>{tr('flights.rota')}</th>
                <th>{tr('flights.data')}</th>
                <th>{tr('flights.status')}</th>
                <th>{tr('flights.result')}</th>
                <th>{tr('flights.menor')}</th>
                <th>{tr('flights.erro')}</th>
              </tr>
            </thead>
            <tbody>
              {data.tasks.map((t) => (
                <tr key={t.id}>
                  <td>{STAGE_LABEL[t.stage]}</td>
                  <td>{t.provider}</td>
                  <td className="nowrap">
                    {t.origin}→{t.destination}
                  </td>
                  <td className="nowrap">
                    {t.departDate}
                    {t.returnDate ? ` / ${t.returnDate}` : ''}
                  </td>
                  <td>{t.status}</td>
                  <td>{t.status === 'done' ? t.resultCount : ''}</td>
                  <td>{t.minPrice ? formatMoney(t.minPrice) : ''}</td>
                  <td className="fm-small">{t.lastError}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Alertas ───────────────────────────────────────────────────────────────────

export function AlertsPanel(props: { m: MonitorSummary; version: number; onEdit: () => void }): React.ReactElement {
  const { data, err } = useLoad<AlertEvent[]>(() => window.api.flightMon.alerts(props.m.id), [props.m.id, props.version])
  const a = props.m.config.alerts
  const rules = [
    a.priceBelow && tr('flights.alert.priceBelow', { price: formatMoney(a.priceBelow) }),
    a.dropPercent && tr('flights.alert.drop', { pct: a.dropPercent }),
    a.newLow && tr('flights.alert.newLow'),
    a.interesting && tr('flights.alert.interesting'),
    a.favoriteChanges && tr('flights.alert.favorite'),
    a.promoPosts && tr('flights.alert.promo')
  ].filter(Boolean)
  return (
    <div>
      <div className="fm-section">
        <div className="fm-section-title">{tr('flights.regrasAtivas')}</div>
        {rules.length ? (
          <ul className="fm-small" style={{ margin: '0 0 0 16px', padding: 0 }}>
            {rules.map((r) => (
              <li key={String(r)}>{r}</li>
            ))}
          </ul>
        ) : (
          <div className="fm-muted">{tr('flights.nenhumaRegra')}</div>
        )}
        <div className="fm-small" style={{ marginTop: 6 }}>
          {tr('flights.alertasSoConsideramOpcoes')} <b>{tr('flights.elegiveis2')}</b>{tr('flights.avaliadasDepoisDeCadaBusca')}
          {props.m.config.schedule.mode === 'manual' && tr('flights.atualizacaoManualAlertasSoDepois')}
        </div>
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={props.onEdit} type="button">
          {tr('flights.editarRegras')}
        </button>
      </div>
      {err && <div className="fm-error">{err}</div>}
      <div className="fm-section">
        <div className="fm-section-title">{tr('flights.disparados')}</div>
        {!data?.length ? (
          <div className="fm-muted">{tr('flights.nenhumAlertaDisparado')}</div>
        ) : (
          data.map((e) => (
            <div key={e.id} className="fm-row" style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="fm-pill accent">{e.kind}</span>
              <span className="fm-grow">{e.message}</span>
              <span className="fm-small">{rel(e.createdAt)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Promoções (RSS) ───────────────────────────────────────────────────────────

export function PromosPanel(props: { m: MonitorSummary; version: number; onStructure: (text: string) => void }): React.ReactElement {
  const [force, setForce] = useState(0)
  const { data, err } = useLoad<PromoFeedView>(() => window.api.flightMon.promos(props.m.id, force > 0), [props.m.id, props.version, force])
  return (
    <div>
      <div className="fm-note" style={{ marginBottom: 8 }}>
        {tr('flights.postsRecentesAte21Dias')}
        {props.m.config.alerts.promoPosts ? tr('flights.postsNovosGeramNotificacao1') : ''}
      </div>
      <div className="fm-row" style={{ marginBottom: 8 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setForce((n) => n + 1)} type="button">
          {tr('flights.atualizarFeeds')}
        </button>
        {data?.feeds.map((f) => (
          <span key={f.url} className={`fm-pill ${f.ok ? 'ok' : 'danger'}`} title={f.error ?? tr('flights.itensLido', { items: f.items, p1: rel(f.fetchedAt) })}>
            {new URL(f.url).hostname.replace(/^www\./, '')} {f.ok ? `· ${f.items}` : tr('flights.erro2')}
          </span>
        ))}
      </div>
      {data && data.keywords.length > 0 && <div className="fm-small" style={{ marginBottom: 8 }}>{tr('flights.procurandoPor')} {data.keywords.join(', ')}</div>}
      {err && <div className="fm-error">{err}</div>}
      {!data ? (
        <div className="fm-muted">{tr('flights.lendoFeeds')}</div>
      ) : data.posts.length === 0 ? (
        <div className="fm-empty">{tr('flights.nenhumPostRecenteMencionaAs')}</div>
      ) : (
        data.posts.map((p) => (
          <div key={p.link} className="fm-section" style={{ padding: 10 }}>
            <div className="fm-row" style={{ alignItems: 'flex-start' }}>
              <div className="fm-grow">
                <button className="fm-linkbtn" style={{ fontSize: 13, fontWeight: 600, textAlign: 'left' }} onClick={() => openExternal(p.link)} type="button">
                  {p.title} ↗
                </button>
                <div className="fm-small">
                  {p.source} · {p.publishedAt ? rel(p.publishedAt) : tr('flights.semData')}
                </div>
              </div>
              {p.prices[0] && <span className="fm-price muted">{p.prices[0]}</span>}
            </div>
            <div className="fm-row" style={{ gap: 4, marginTop: 4 }}>
              {p.both && <span className="fm-pill ok">{tr('flights.origemEDestino2')}</span>}
              {p.matches.map((k) => (
                <span key={k} className="fm-pill accent">
                  {k}
                </span>
              ))}
              <span className="fm-spacer" />
              <button className="fm-linkbtn" onClick={() => props.onStructure(`${p.title}\n${p.summary}\nFonte: ${p.source} (${p.link})`)} type="button" title={tr('flights.aIaTentaExtrairRotas')}>
                {tr('flights.estruturar')}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
