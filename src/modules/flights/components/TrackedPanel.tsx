import React, { useEffect, useState } from 'react'
import type { MonitorSummary, SkyPick, TrackedCombo, TrackedView } from '../../../../shared/flights'
import { formatMoney } from '../../../../shared/flights'
import { openExternal } from '../../../api/createApi'
import { errMsg } from '../store/flightStore'
import { LineChart } from './Panels'
import { rel } from './ui'
import { t as tr, getLocale } from '../../../i18n'

const short = (minor: number, currency: string): string => formatMoney({ amountMinor: minor, currency }).replace(/,\d\d$/, '')
const dm = (d: string): string => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const dayLabel = (d: string): string => new Date(`${d}T12:00:00`).toLocaleDateString(getLocale(), { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '')

function Delta(props: { c: TrackedCombo }): React.ReactElement {
  const { latest, previous } = props.c
  if (!latest || !previous) return <span className="fm-muted">—</span>
  const d = latest.amountMinor - previous.amountMinor
  if (d === 0) return <span className="fm-muted">=</span>
  const pct = Math.round((Math.abs(d) / previous.amountMinor) * 100)
  return (
    <span className={d < 0 ? 'fm-delta down' : 'fm-delta up'} title={tr('flights.antes', { p0: formatMoney(previous) })}>
      {d < 0 ? '▼' : '▲'} {short(Math.abs(d), latest.currency)} ({pct}%)
    </span>
  )
}

/**
 * Combinações acompanhadas: o que você pesquisou no Skyscanner entra aqui. Mostra o menor
 * preço de cada combinação em cada dia de leitura, para ver a variação e comparar entre elas.
 */
export function TrackedPanel(props: { m: MonitorSummary; version: number; onResearch: (picks: SkyPick[]) => void }): React.ReactElement {
  const [data, setData] = useState<TrackedView | null>(null)
  const [err, setErr] = useState('')
  const [chart, setChart] = useState<Set<string> | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let live = true
    window.api.flightMon
      .tracked(props.m.id)
      .then((d) => live && (setData(d), setErr('')))
      .catch((e) => live && setErr(errMsg(e)))
    return () => {
      live = false
    }
  }, [props.m.id, props.version, tick])

  if (err) return <div className="fm-error">{err}</div>
  if (!data) return <div className="fm-muted">{tr('flights.carregando')}</div>
  if (!data.combos.length)
    return <div className="fm-empty">{tr('flights.nenhumaCombinacaoAcompanhadaAindaTudo')}</div>

  const cur = data.currency
  const key = (c: SkyPick): string => `${c.origin}|${c.destination}|${c.depart}|${c.ret ?? '-'}`
  const future = data.combos.filter((c) => !c.past)
  const priced = future.filter((c) => c.latest)
  const cheapest = priced[0]?.latest?.amountMinor ?? null
  // menor preço de cada coluna (dia de leitura) para destacar
  const colMin = new Map(data.days.map((d) => [d, Math.min(...data.combos.map((c) => c.points.find((p) => p.day === d)?.minor ?? Infinity))]))
  const chartKeys = chart ?? new Set(priced.slice(0, 5).map(key))
  const series = data.combos
    .filter((c) => chartKeys.has(key(c)) && c.points.length)
    .map((c) => ({ label: `${c.origin}→${c.destination} ${dm(c.depart)}${c.ret ? `–${dm(c.ret)}` : ''}`, points: c.points }))

  async function untrack(c: TrackedCombo): Promise<void> {
    try {
      await window.api.flightMon.untrack(props.m.id, { origin: c.origin, destination: c.destination, depart: c.depart, ret: c.ret })
      setTick((t) => t + 1)
    } catch (e) {
      setErr(errMsg(e))
    }
  }
  function toggleChart(c: TrackedCombo): void {
    const next = new Set(chartKeys)
    if (next.has(key(c))) next.delete(key(c))
    else next.add(key(c))
    setChart(next)
  }

  return (
    <div>
      <div className="fm-row" style={{ marginBottom: 8 }}>
        <span className="fm-small fm-grow">
          {tr('flights.combinacaoOesFuturasMenorPreco', { count: future.length })}
        </span>
        <button className="btn btn-primary btn-sm" type="button" disabled={!future.length} onClick={() => props.onResearch(future.map((c) => ({ origin: c.origin, destination: c.destination, depart: c.depart, ret: c.ret })))}>
          {tr('flights.pesquisarDeNovoNoSkyscanner')}
        </button>
      </div>

      <div className="fm-chart-card">
        <h4>{tr('flights.variacaoDiaADia')} {series.length ? tr('flights.noGraficoMarqueNaTabela', { count: series.length }) : ''}</h4>
        {data.days.length < 2 ? (
          <div className="fm-muted">
            {tr('flights.porEnquantoSoHaLeitura')} {data.days[0] ? dm(data.days[0]) : tr('flights.nenhumDia')}{tr('flights.oGraficoApareceAPartir')}
          </div>
        ) : (
          <LineChart series={series} currency={cur} />
        )}
      </div>

      <div className="fm-table-wrap">
        <table className="report-table fm-tracked">
          <thead>
            <tr>
              <th title={tr('flights.noGrafico')}>📈</th>
              <th>{tr('flights.rotaEDatas')}</th>
              <th>{tr('flights.ultimo')}</th>
              <th>{tr('flights.variacao')}</th>
              <th>{tr('flights.menorJaVisto')}</th>
              {data.days.map((d) => (
                <th key={d} className="fm-num">
                  {dm(d)}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {data.combos.map((c) => (
              <tr key={key(c)} className={c.past ? 'past' : c.latest && c.latest.amountMinor === cheapest ? 'best' : ''}>
                <td>
                  <input type="checkbox" checked={chartKeys.has(key(c))} disabled={!c.points.length} onChange={() => toggleChart(c)} aria-label={tr('flights.mostrarNoGrafico')} />
                </td>
                <td className="fm-tracked-route">
                  <div>
                    <b>{c.originLabel}</b> → {c.destinationLabel}
                  </div>
                  <div className="fm-small">
                    {dayLabel(c.depart)}
                    {c.ret ? ` → ${dayLabel(c.ret)}` : ''}
                    {c.past ? tr('flights.jaPassou') : ''}
                    {c.lastCheckedAt ? tr('flights.skyscanner2', { p0: rel(c.lastCheckedAt) }) : tr('flights.aindaNaoLidaNoSkyscanner')}
                    {c.offers ? tr('flights.ofertaS', { offers: c.offers }) : ''}
                  </div>
                </td>
                <td className="fm-num">
                  {c.latest ? <b>{formatMoney(c.latest)}</b> : <span className="fm-muted">{tr('flights.semPreco')}</span>}
                  {c.latest && c.latest.amountMinor === cheapest && !c.past && <div className="fm-pill ok">{tr('flights.maisBarata')}</div>}
                </td>
                <td className="fm-num">
                  <Delta c={c} />
                </td>
                <td className="fm-num">{c.best ? formatMoney(c.best) : '—'}</td>
                {data.days.map((d) => {
                  const p = c.points.find((x) => x.day === d)
                  return (
                    <td key={d} className={`fm-num ${p && p.minor === colMin.get(d) ? 'colbest' : ''}`}>
                      {p ? short(p.minor, cur) : <span className="fm-muted">·</span>}
                    </td>
                  )
                })}
                <td className="fm-nowrap">
                  <button className="fm-linkbtn" type="button" onClick={() => openExternal(c.url)} title={tr('flights.abrirAPesquisaNoSkyscanner')}>
                    ↗
                  </button>{' '}
                  <button className="fm-x" type="button" onClick={() => void untrack(c)} title={tr('flights.pararDeAcompanhar')} aria-label={tr('flights.pararDeAcompanhar')}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="fm-small" style={{ marginTop: 6 }}>
        {tr('flights.colunasDiasEmQueHouve')}
      </div>
    </div>
  )
}
