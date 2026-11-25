import React from 'react'
import type { OfferView, Slice } from '../../../../shared/flights'
import { fmtMinutes, formatMoney } from '../../../../shared/flights'
import { openExternal } from '../../../api/createApi'
import { fmtLocal, VerificationBadge } from './ui'
import { t, getLocale } from '../../../i18n'

function bagText(o: OfferView): string {
  const b = o.baggage
  const c = b.checked == null ? t('flights.bag.checkedUnknown') : b.checked === 0 ? t('flights.bag.noChecked') : t('flights.bag.checked', { n: b.checked })
  const h = b.carryOn == null ? t('flights.bag.carryUnknown') : b.carryOn === 0 ? t('flights.bag.noCarry') : t('flights.bag.carry', { n: b.carryOn })
  return `${c} · ${h}`
}

function Leg(props: { s: Slice; o: OfferView; title: string }): React.ReactElement {
  const { s, o } = props
  if (!s.segments.length) {
    return (
      <div>
        <div className="fm-leg-title">
          {props.title}: {s.from} → {s.to}
        </div>
        <div className="fm-note warn">
          {t('flights.aFonteInformaSoO', { p0: fmtLocal(s.departLocal), p1: fmtLocal(s.arriveLocal), stops: s.stops })}{s.carriers.length ? `, ${s.carriers.join('/')}` : ''}
          {s.firstFlightNumber ? t('flights.voo', { p0: s.carriers[0] ?? '', firstFlightNumber: s.firstFlightNumber }) : ''}
          {s.via?.length ? t('flights.escalasEmTemposDeConexao', { p0: s.via.join(', ') }) : t('flights.aeroportosETemposDeConexao')}
        </div>
      </div>
    )
  }
  return (
    <div className="fm-timeline">
      <div className="fm-leg-title">
        {props.title}: {s.from} → {s.to} · {fmtMinutes(s.durationMin)}
      </div>
      {s.segments.map((g, i) => {
        const conn = i < s.segments.length - 1 ? o.connections.find((c) => c.arriveAirport === g.to && c.departAirport === s.segments[i + 1].from) : null
        return (
          <React.Fragment key={i}>
            <div className="fm-seg-row">
              <div className="fm-seg-rail">
                <i />
                <span />
              </div>
              <div className="fm-seg-body">
                <div>
                  <b>{fmtLocal(g.departLocal)}</b> {g.from}
                  {g.terminalFrom ? t('flights.t', { terminalFrom: g.terminalFrom }) : ''} → <b>{fmtLocal(g.arriveLocal)}</b> {g.to}
                  {g.terminalTo ? t('flights.t2', { terminalTo: g.terminalTo }) : ''}
                </div>
                <div className="fm-small">
                  {g.marketingCarrier}
                  {g.flightNumber} {g.operatingCarrier && g.operatingCarrier !== g.marketingCarrier ? t('flights.operadoPor', { operatingCarrier: g.operatingCarrier }) : ''} · {fmtMinutes(g.durationMin)}
                  {g.aircraft ? ` · ${g.aircraft}` : ''} {t('flights.horariosLocais')}
                </div>
              </div>
            </div>
            {conn && (
              <div className={`fm-layover ${conn.airportChange || (conn.minutes != null && conn.minutes < 60) ? 'danger' : conn.overnight ? 'warn' : conn.stopover ? 'stopover' : ''}`}>
                {t('flights.conexaoEm')} <b>{conn.airport}</b>: {fmtMinutes(conn.minutes)}
                {conn.airportChange && t('flights.trocaDeAeroportoDeslocamentoPor', { arriveAirport: conn.arriveAirport, departAirport: conn.departAirport })}
                {conn.overnight && t('flights.madrugada')}
                {conn.minutes != null && conn.minutes < 60 && t('flights.conexaoCurta')}
                {conn.stopover && t('flights.daParaUmStopoverVerifique')}
                {o.selfTransfer === true && t('flights.selfTransferRetirarEDespachar')}
                {o.selfTransfer == null && t('flights.bilheteUnicoNaoVerificado')}
              </div>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export function OfferDetail(props: { o: OfferView }): React.ReactElement {
  const { o } = props
  const c = o.cost
  return (
    <div className="fm-detail">
      <div>
        <Leg s={o.slices[0]} o={o} title={t('flights.ida')} />
        {o.slices[1] && <Leg s={o.slices[1]} o={o} title={t('flights.volta2')} />}
        <div className="fm-small" style={{ marginTop: 6 }}>
          {t('flights.condicoesDeTransitoVistoNao')}
        </div>
      </div>
      <div>
        <dl className="fm-kv">
          <dt>{t('flights.tarifa')}</dt>
          <dd>
            {formatMoney(o.price)}
            {c.fareInCurrency && c.fareInCurrency.currency !== o.price.currency ? ` ≈ ${formatMoney(c.fareInCurrency)}` : ''}
            {o.previousPrice && t('flights.antes2', { p0: formatMoney(o.previousPrice) })}
          </dd>
          <dt>{t('flights.bagagem')}</dt>
          <dd>{bagText(o)}</dd>
          <dt>{t('flights.terrestre')}</dt>
          <dd>
            {c.ground.status === 'none'
              ? '—'
              : t('flights.ate5', { label: c.ground.label, p1: fmtMinutes(c.ground.minutes), p2: c.ground.amount ? formatMoney(c.ground.amount) : t('flights.custoDesconhecido'), p3: c.ground.status === 'manual' ? 'informado' : c.ground.status === 'estimated' ? 'estimado' : 'desconhecido' })}
          </dd>
          <dt>{t('flights.custoTotal')}</dt>
          <dd>
            {formatMoney(c.total)} <span className={`fm-pill ${c.totalStatus === 'verified' ? 'ok' : c.totalStatus === 'estimated' ? 'warn' : 'danger'}`}>{c.totalStatus === 'verified' ? t('flights.verificado') : c.totalStatus === 'estimated' ? t('flights.estimado') : t('flights.incompleto')}</span>
          </dd>
          <dt>{t('flights.portaAPorta')}</dt>
          <dd>{fmtMinutes(c.doorToDoorMinutes)}</dd>
          <dt>{t('flights.reembolso')}</dt>
          <dd>{o.refundable == null ? t('flights.naoVerificado') : o.refundable ? t('flights.permitido') : t('flights.naoReembolsavel')}</dd>
          <dt>{t('flights.fonte')}</dt>
          <dd>
            {o.sourceLabel} <VerificationBadge v={o.verification} stale={o.stale} /> {t('flights.cotado')} {new Date(o.observedAt).toLocaleString(getLocale())}
            {o.sources.length > 1 ? t('flights.vistoTambemEm', { p0: o.sources.join(', ') }) : ''}
          </dd>
          <dt>{t('flights.pontuacao')}</dt>
          <dd title={Object.entries(o.scoreParts).map(([k, v]) => `${k}: ${Math.round(v * 100)}%`).join('\n')}>
            {o.score} — {Object.entries(o.scoreParts).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(' · ')}
          </dd>
        </dl>
        {o.checks.length > 0 && (
          <ul className="fm-checks" style={{ marginTop: 8 }}>
            {o.checks.map((ch, i) => (
              <li key={i}>
                <span>{ch.level === 'fail' ? '⛔' : ch.level === 'unknown' ? '❓' : ch.level === 'warn' ? '⚠️' : 'ℹ️'}</span>
                <span>{ch.message}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="fm-row" style={{ marginTop: 8 }}>
          {o.deepLink && (
            <button className="btn btn-primary btn-sm" type="button" onClick={() => openExternal(o.deepLink!)}>
              {o.linkKind === 'offer' ? t('flights.abrirOferta') : t('flights.abrirPesquisaEm', { p0: o.sourceLabel.split(' ')[0] })}
            </button>
          )}
          {o.searchLinks.map((l) => (
            <button key={l.url} className="btn btn-secondary btn-sm" type="button" onClick={() => openExternal(l.url)} title={t('flights.abreUmaPesquisaEquivalenteNao')}>
              {l.label} ↗
            </button>
          ))}
        </div>
        <div className="fm-small" style={{ marginTop: 4 }}>
          {o.linkKind === 'offer' ? t('flights.linkDiretoInformadoPelaFonte') : t('flights.linksDePesquisaAbremA')}
        </div>
      </div>
    </div>
  )
}
