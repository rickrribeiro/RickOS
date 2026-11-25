import React, { useEffect, useState } from 'react'
import type { EligibilityStatus, MonitorSummary, OfferPage, OfferQuery, OfferView, SortStrategy } from '../../../../shared/flights'
import { fmtMinutes, formatMoney, STRATEGY_LABEL } from '../../../../shared/flights'
import { errMsg } from '../store/flightStore'
import { Modal } from './Modal'
import { OfferDetail } from './OfferDetail'
import { fmtLocal, VerificationBadge } from './ui'
import { t as tr, getLocale } from '../../../i18n'

const STATUS_TABS: { id: EligibilityStatus; label: string; hint: string }[] = [
  { id: 'eligible', label: tr('flights.elegiveis'), hint: tr('flights.cumpremTodasAsRestricoesObrigatorias') },
  { id: 'pending', label: tr('flights.verificacaoPendente'), hint: tr('flights.faltaInformacaoParaConfirmarAlguma') },
  { id: 'excluded', label: tr('flights.excluidos'), hint: tr('flights.violamAlgumaRestricaoVejaO') }
]

function CompareModal(props: { offers: OfferView[]; onClose: () => void }): React.ReactElement {
  const o = props.offers
  const best = (vals: (number | null)[]): number => {
    const ok = vals.filter((v): v is number => v != null)
    return ok.length ? Math.min(...ok) : NaN
  }
  const row = (label: string, vals: (number | null)[], fmt: (v: number | null, i: number) => React.ReactNode): React.ReactElement => {
    const b = best(vals)
    return (
      <tr>
        <th>{label}</th>
        {vals.map((v, i) => (
          <td key={i} className={v != null && v === b && vals.filter((x) => x === b).length < vals.length ? 'best' : ''}>
            {fmt(v, i)}
          </td>
        ))}
      </tr>
    )
  }
  const txt = (label: string, f: (x: OfferView) => React.ReactNode): React.ReactElement => (
    <tr>
      <th>{label}</th>
      {o.map((x) => (
        <td key={x.id}>{f(x)}</td>
      ))}
    </tr>
  )
  return (
    <Modal title={tr('flights.compararOpcoes', { count: o.length })} onClose={props.onClose} size="wide">
      <div className="fm-compare">
        <table>
          <thead>
            <tr>
              <th />
              {o.map((x) => (
                <th key={x.id}>
                  {x.origin} → {x.destination}
                  <div className="fm-small">{fmtLocal(x.slices[0].departLocal)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {row(tr('flights.tarifa'), o.map((x) => x.cost.fareInCurrency?.amountMinor ?? null), (_, i) => formatMoney(o[i].cost.fareInCurrency ?? o[i].price))}
            {row(tr('flights.custoTotal'), o.map((x) => x.cost.total?.amountMinor ?? null), (_, i) => (
              <>
                {formatMoney(o[i].cost.total)} <span className="fm-small">({o[i].cost.totalStatus === 'verified' ? tr('flights.verificado') : o[i].cost.totalStatus === 'estimated' ? tr('flights.estimado') : tr('flights.incompleto')})</span>
              </>
            ))}
            {row(tr('flights.duracao'), o.map((x) => x.totalDurationMin), (v) => fmtMinutes(v))}
            {row(tr('flights.portaAPorta'), o.map((x) => x.cost.doorToDoorMinutes), (v) => fmtMinutes(v))}
            {row(tr('flights.conexoes'), o.map((x) => x.stops), (v, i) => `${v} ${o[i].connections.length ? `(${o[i].connections.map((c) => `${c.airport} ${fmtMinutes(c.minutes)}`).join(', ')})` : ''}`)}
            {txt(tr('flights.bagagem'), (x) => (x.baggage.checked == null ? tr('flights.naoVerificado') : tr('flights.bag.despachadas', { n: x.baggage.checked })))}
            {txt(tr('flights.companhias'), (x) => x.carriers.join(', ') || '—')}
            {txt(tr('flights.chegada'), (x) => fmtLocal(x.slices[0].arriveLocal))}
            {txt(tr('flights.riscos'), (x) => x.checks.filter((c) => c.level !== 'info').map((c) => c.message).join(' · ') || '—')}
            {txt(tr('flights.destaques'), (x) => x.highlights.join(' · ') || '—')}
            {row(tr('flights.pontuacao'), o.map((x) => -x.score), (_, i) => o[i].score)}
            {txt(tr('flights.fonte'), (x) => <VerificationBadge v={x.verification} stale={x.stale} />)}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

export function ResultsExplorer(props: { m: MonitorSummary; version: number; onMore: (n: number) => void; canSearch: boolean }): React.ReactElement {
  const { m } = props
  const [status, setStatus] = useState<EligibilityStatus>('eligible')
  // "ocultar antigas" fica lembrado neste navegador
  const [q, setQ] = useState<OfferQuery>(() => {
    try {
      return { page: 1, hideStale: localStorage.getItem('fm-hide-stale') === '1' }
    } catch {
      return { page: 1 }
    }
  })
  const [search, setSearch] = useState('')
  const [data, setData] = useState<OfferPage | null>(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const [cmp, setCmp] = useState<Map<number, OfferView>>(new Map())
  const [showCmp, setShowCmp] = useState(false)
  const [moreN, setMoreN] = useState(10)

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        setData(await window.api.flightMon.offers(m.id, { ...q, status, search }))
        setErr('')
      } catch (e) {
        setErr(errMsg(e))
      }
    }, 120)
    return () => clearTimeout(t)
  }, [m.id, q, status, search, props.version])

  const set = (p: Partial<OfferQuery>): void => setQ((x) => ({ ...x, ...p, page: p.page ?? 1 }))
  const sortBy = (s: OfferQuery['sort']): void => set({ sort: s })
  const hideStale = (on: boolean): void => {
    set({ hideStale: on })
    try {
      localStorage.setItem('fm-hide-stale', on ? '1' : '0')
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
  }
  const toggleCmp = (o: OfferView): void => {
    const n = new Map(cmp)
    if (n.has(o.id)) n.delete(o.id)
    else if (n.size < 4) n.set(o.id, o)
    setCmp(n)
  }
  const fav = async (o: OfferView): Promise<void> => {
    await window.api.flightMon.favorite(o.id, !o.favorite)
    setQ((x) => ({ ...x }))
  }
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const th = (label: string, s?: OfferQuery['sort']): React.ReactElement => (
    <th className={s ? 'sortable' : ''} onClick={s ? () => sortBy(s) : undefined} aria-sort={q.sort === s ? 'ascending' : undefined}>
      {label}
      {s && q.sort === s ? ' ▲' : ''}
    </th>
  )

  return (
    <div>
      <div className="fm-tabs" role="tablist">
        {STATUS_TABS.map((t) => (
          <button key={t.id} className={status === t.id ? 'active' : ''} onClick={() => setStatus(t.id)} title={t.hint} type="button">
            {t.label}
            <span className={`fm-pill ${t.id === 'eligible' ? 'ok' : t.id === 'pending' ? 'warn' : ''}`}>{data?.counts[t.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {data?.coverageNote && <div className="fm-note info" style={{ marginBottom: 8 }}>{data.coverageNote}</div>}

      <div className="fm-filters">
        <input type="search" placeholder={tr('flights.buscarAeroportoCiaData')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={q.sort ?? ''} onChange={(e) => set({ sort: (e.target.value || undefined) as OfferQuery['sort'] })} aria-label={tr('flights.ordenacao')}>
          <option value="">{tr('flights.padrao')} {STRATEGY_LABEL[m.config.preferences.strategy]}</option>
          {(Object.keys(STRATEGY_LABEL) as SortStrategy[]).map((s) => (
            <option key={s} value={s}>
              {STRATEGY_LABEL[s]}
            </option>
          ))}
          <option value="depart">{tr('flights.dataDePartida')}</option>
          <option value="recent">{tr('flights.cotacaoMaisRecente')}</option>
        </select>
        <select value={q.origins?.[0] ?? ''} onChange={(e) => set({ origins: e.target.value ? [e.target.value] : undefined })} aria-label={tr('flights.origem')}>
          <option value="">{tr('flights.todasAsOrigens')}</option>
          {data?.facets.origins.map((x) => <option key={x}>{x}</option>)}
        </select>
        <select value={q.destinations?.[0] ?? ''} onChange={(e) => set({ destinations: e.target.value ? [e.target.value] : undefined })} aria-label={tr('flights.destino')}>
          <option value="">{tr('flights.todosOsDestinos')}</option>
          {data?.facets.destinations.map((x) => <option key={x}>{x}</option>)}
        </select>
        <select value={q.maxStops ?? ''} onChange={(e) => set({ maxStops: e.target.value === '' ? null : Number(e.target.value) })} aria-label={tr('flights.conexoes')}>
          <option value="">{tr('flights.qualquerNDeConexoes')}</option>
          <option value="0">{tr('flights.direto')}</option>
          <option value="1">{tr('flights.ate1')}</option>
          <option value="2">{tr('flights.ate2')}</option>
        </select>
        <select value={q.carriers?.[0] ?? ''} onChange={(e) => set({ carriers: e.target.value ? [e.target.value] : undefined })} aria-label={tr('flights.companhia')}>
          <option value="">{tr('flights.todasAsCias')}</option>
          {data?.facets.carriers.map((x) => <option key={x}>{x}</option>)}
        </select>
        <select value={q.verification?.[0] ?? ''} onChange={(e) => set({ verification: e.target.value ? [e.target.value as 'live'] : undefined })} aria-label={tr('flights.verificacao')}>
          <option value="">{tr('flights.qualquerVerificacao')}</option>
          <option value="live">{tr('flights.soAoVivo')}</option>
          <option value="cached">{tr('flights.soCache')}</option>
          <option value="imported">{tr('flights.importados')}</option>
          <option value="assisted">{tr('flights.assistidos')}</option>
        </select>
        <label className="fm-check fm-small">
          <input type="checkbox" checked={!!q.favoritesOnly} onChange={(e) => set({ favoritesOnly: e.target.checked })} /> {tr('flights.favoritos')}
        </label>
        <label className="fm-check fm-small" title={tr('flights.escondeCotacoesAntigasNaoRevistas')}>
          <input
            type="checkbox"
            checked={!!q.hideStale}
            onChange={(e) => hideStale(e.target.checked)}
          />{' '}
          {tr('flights.ocultarAntigas')}
        </label>
        <label className="fm-check fm-small" title={tr('flights.diversificaOrigemPaisDataCompanhia')}>
          <input type="checkbox" checked={q.diversify !== false} onChange={(e) => set({ diversify: e.target.checked })} /> {tr('flights.diversificar')}
        </label>
      </div>

      {err && <div className="fm-error">{err}</div>}

      {data && data.total === 0 ? (
        <div className="fm-empty">
          {data.counts.eligible + data.counts.pending + data.counts.excluded === 0 ? (
            <>
              <h3>{tr('flights.nenhumVooEncontradoAinda')}</h3>
              <p className="fm-muted">{tr('flights.rodeUmaBuscaOuImporte')}</p>
            </>
          ) : status === 'eligible' ? (
            <>
              <h3>{tr('flights.nenhumVooElegivelPelosFiltros')}</h3>
              <p className="fm-muted">
                {tr('flights.comVerificacaoPendenteEExcluido', { pending: data.counts.pending, excluded: data.counts.excluded })}
              </p>
            </>
          ) : (
            <p className="fm-muted">{tr('flights.nadaNestaAbaComOs')}</p>
          )}
          {q.hideStale && data.counts.eligible + data.counts.pending + data.counts.excluded > 0 && (
            <p className="fm-small">
              {tr('flights.ocultarAntigasEstaLigado')}{' '}
              <button className="fm-linkbtn" type="button" onClick={() => hideStale(false)}>
                {tr('flights.mostrarAsAntigas')}
              </button>
            </p>
          )}
        </div>
      ) : (
        <div className="fm-table-wrap">
          <table className="fm-table">
            <thead>
              <tr>
                <th title={tr('flights.comparar24')}>⇄</th>
                <th>★</th>
                {th(tr('flights.origem'))}
                {th(tr('flights.destino'))}
                {th(tr('flights.partida'), 'depart')}
                {th(tr('flights.chegada'))}
                {th(tr('flights.preco'), 'price')}
                {th(tr('flights.custoTotal'), 'total_cost')}
                {th(tr('flights.duracao'), 'duration')}
                {th(tr('flights.conex'), 'stops')}
                {th(tr('flights.via'))}
                {th(tr('flights.cia'))}
                {th(tr('flights.bagagem'))}
                {th(tr('flights.fonteCotacao'), 'recent')}
                {th(tr('flights.nota'), 'value')}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((o) => (
                <React.Fragment key={o.id}>
                  <tr className={`main ${open === o.id ? 'open' : ''} ${o.available ? '' : 'gone'}`} onClick={() => setOpen(open === o.id ? null : o.id)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={cmp.has(o.id)} disabled={!cmp.has(o.id) && cmp.size >= 4} onChange={() => toggleCmp(o)} aria-label={tr('flights.comparar')} />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className={`fm-star ${o.favorite ? 'on' : ''}`} onClick={() => fav(o)} aria-label={tr('flights.favoritar')} type="button">
                        {o.favorite ? '★' : '☆'}
                      </button>
                    </td>
                    <td className="nowrap">
                      <b>{o.origin}</b> <span className="fm-small">{o.originCountry}</span>
                    </td>
                    <td className="nowrap">
                      <b>{o.destination}</b>
                    </td>
                    <td className="nowrap">
                      {fmtLocal(o.slices[0].departLocal)}
                      {o.returnDate && <div className="fm-small">{tr('flights.volta')} {fmtLocal(o.slices[1]?.departLocal)}</div>}
                    </td>
                    <td className="nowrap">{fmtLocal(o.slices[0].arriveLocal)}</td>
                    <td className="num">
                      <span className="strong">{formatMoney(o.price)}</span>
                      {o.cost.fareInCurrency && o.cost.fareInCurrency.currency !== o.price.currency && <div className="fm-small">≈ {formatMoney(o.cost.fareInCurrency)}</div>}
                      {o.previousPrice && o.previousPrice.amountMinor !== o.price.amountMinor && (
                        <div className="fm-small" style={{ color: o.previousPrice.amountMinor > o.price.amountMinor ? 'var(--success)' : 'var(--danger)' }}>
                          {tr('flights.antes', { p0: formatMoney(o.previousPrice) })}
                        </div>
                      )}
                    </td>
                    <td className="num" title={o.cost.totalStatus}>
                      {formatMoney(o.cost.total)}
                      <div className="fm-small">{o.cost.totalStatus === 'verified' ? tr('flights.verificado') : o.cost.totalStatus === 'estimated' ? tr('flights.estimado') : tr('flights.incompleto')}</div>
                    </td>
                    <td className="num">{fmtMinutes(o.totalDurationMin)}</td>
                    <td className="num">{o.stops}</td>
                    <td className="nowrap">{o.connections.length ? o.connections.map((c) => c.airport).join(' · ') : o.stops ? <span className="fm-small">?</span> : '—'}</td>
                    <td>{o.carriers.join(', ') || '—'}</td>
                    <td className="nowrap">{o.baggage.checked == null ? <span className="fm-pill warn">{tr('flights.naoVerificado')}</span> : tr('flights.desp', { checked: o.baggage.checked })}</td>
                    <td>
                      <VerificationBadge v={o.verification} stale={o.stale} />
                      <div className="fm-small">{new Date(o.observedAt).toLocaleDateString(getLocale())}</div>
                    </td>
                    <td className="num">
                      {o.score}
                      {o.highlights.length > 0 && (
                        <div className="fm-highlights">
                          {o.highlights.slice(0, 2).map((h) => (
                            <span key={h} className="fm-pill accent" title={h}>
                              {h.length > 22 ? `${h.slice(0, 22)}…` : h}
                            </span>
                          ))}
                        </div>
                      )}
                      {status !== 'eligible' && <div className="fm-small" style={{ maxWidth: 200, whiteSpace: 'normal' }}>{o.checks.find((c) => c.level === (status === 'excluded' ? 'fail' : 'unknown'))?.message}</div>}
                    </td>
                  </tr>
                  {open === o.id && (
                    <tr>
                      <td colSpan={15}>
                        <OfferDetail o={o} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          {data && (
            <div className="fm-pager">
              <span className="fm-muted">
                {tr('flights.opcaoOesMetaDeExibicao', { total: data.total, displayTarget: data.displayTarget })}
              </span>
              <span className="fm-spacer" />
              <select value={data.pageSize} onChange={(e) => set({ pageSize: Number(e.target.value) })} aria-label={tr('flights.itensPorPagina')}>
                {[data.displayTarget, 10, 20, 30, 50].filter((v, i, a) => a.indexOf(v) === i).map((n) => (
                  <option key={n} value={n}>
                    {tr('flights.porPagina', { n })}
                  </option>
                ))}
              </select>
              <button className="btn btn-secondary btn-sm" disabled={data.page <= 1} onClick={() => set({ page: data.page - 1 })} type="button">
                ‹
              </button>
              <span>
                {data.page}/{pages}
              </span>
              <button className="btn btn-secondary btn-sm" disabled={data.page >= pages} onClick={() => set({ page: data.page + 1 })} type="button">
                ›
              </button>
            </div>
          )}
        </div>
      )}

      <div className="fm-row" style={{ marginTop: 10 }}>
        <span className="fm-muted">{tr('flights.buscarMaisOpcoes')}</span>
        <select value={moreN} onChange={(e) => setMoreN(Number(e.target.value))} aria-label={tr('flights.quantasOpcoesAMais')}>
          {[5, 10, 20, 30].map((n) => (
            <option key={n} value={n}>
              +{n}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary btn-sm" disabled={!props.canSearch} onClick={() => props.onMore(moreN)} type="button" title={props.canSearch ? tr('flights.exploraCombinacoesAindaNaoConsultadas') : tr('flights.semFonteAutomaticaDisponivelOu')}>
          {tr('flights.buscarMaisOpcoes2')}
        </button>
      </div>

      {cmp.size > 0 && (
        <div className="fm-compare-bar">
          {tr('flights.selecionadaS', { size: cmp.size })}
          <button className="btn btn-primary btn-sm" disabled={cmp.size < 2} onClick={() => setShowCmp(true)} type="button">
            {tr('flights.comparar')}
          </button>
          <button className="fm-linkbtn" onClick={() => setCmp(new Map())} type="button">
            {tr('flights.limpar')}
          </button>
        </div>
      )}
      {showCmp && <CompareModal offers={[...cmp.values()]} onClose={() => setShowCmp(false)} />}
    </div>
  )
}
