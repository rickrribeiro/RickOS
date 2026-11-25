import React, { useEffect, useState } from 'react'
import type { ProviderStatus } from '../../../../shared/flights'
import { openExternal } from '../../../api/createApi'
import { errMsg, useFlightStore } from '../store/flightStore'
import { Modal } from './Modal'
import { t } from '../../../i18n'

/** Credenciais por provedor (chaves em SENSITIVE_KEYS são criptografadas no servidor). */
const SECRET: Record<string, { key: string; label: string; placeholder: string }> = {
  travelpayouts: { key: 'flights_travelpayouts_token', label: t('flights.tokenDaApiTravelpayouts'), placeholder: t('flights.tokenPessoal') },
  duffel: { key: 'flights_duffel_token', label: t('flights.accessTokenLive'), placeholder: 'duffel_live_…' }
}

const CAPS: [keyof ProviderStatus['capabilities'], string][] = [
  ['livePrices', t('flights.precoAoVivo')],
  ['monthRange', t('flights.mesInteiroPorConsulta')],
  ['baggage', 'bagagem'],
  ['segments', t('flights.trechosConexoes')],
  ['automated', t('flights.execucaoAutomatica')]
]

function ProviderCard(props: { p: ProviderStatus; values: Record<string, string>; onSaved: () => void }): React.ReactElement {
  const { p } = props
  const sec = SECRET[p.id]
  const [secret, setSecret] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  async function saveSecret(): Promise<void> {
    await window.api.settings.set(sec.key, secret.trim())
    setSecret('')
    setMsg({ ok: true, text: t('flights.salvoCriptografado') })
    props.onSaved()
  }
  async function test(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      setMsg({ ok: true, text: await window.api.flightMon.testProvider(p.id) })
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) })
    } finally {
      setBusy(false)
    }
  }
  async function toggle(on: boolean): Promise<void> {
    await window.api.settings.set(p.id === 'skyscanner_chrome' ? 'flights_chrome_assisted' : `flights_provider_${p.id}_enabled`, on ? '1' : '0')
    props.onSaved()
  }
  const enabled = p.id === 'skyscanner_chrome' ? p.configured : p.enabled
  return (
    <div className="fm-section">
      <div className="fm-section-title">
        <span className={`fm-dot ${p.available ? 'active' : p.configured ? 'needs_config' : 'paused'}`} />
        <span className="fm-grow">{p.label}</span>
        {p.available ? <span className="fm-pill ok">{t('flights.disponivel')}</span> : <span className="fm-pill warn">{p.reason ?? t('flights.indisponivel')}</span>}
      </div>
      <div className="fm-row" style={{ gap: 4, marginBottom: 6 }}>
        {CAPS.map(([k, l]) => (
          <span key={k} className={`fm-pill ${p.capabilities[k] ? 'accent' : 'outline'}`}>
            {p.capabilities[k] ? '✓' : '✕'} {l}
          </span>
        ))}
        {p.capabilities.deepLink !== 'none' && <span className="fm-pill outline">{t('flights.link')} {p.capabilities.deepLink === 'offer' ? t('flights.oferta') : t('flights.pesquisa')}</span>}
        {p.kind === 'api' && <span className="fm-small">{t('flights.consultaSHoje', { usedToday: p.usedToday })}</span>}
      </div>
      <ul className="fm-small" style={{ margin: '0 0 6px 16px', padding: 0 }}>
        {p.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <div className="fm-row">
        {sec && (
          <>
            <input
              type="password"
              autoComplete="off"
              placeholder={props.values[sec.key] ? t('flights.configuradoDigiteParaTrocar') : sec.placeholder}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className="fm-grow"
              aria-label={sec.label}
            />
            <button className="btn btn-primary btn-sm" disabled={!secret.trim()} onClick={saveSecret} type="button">
              {t('flights.salvar')}
            </button>
          </>
        )}
        {(p.kind === 'api' || p.kind === 'assisted') && (
          <label className="fm-check fm-small">
            <input type="checkbox" checked={enabled} onChange={(e) => toggle(e.target.checked)} /> {p.kind === 'assisted' ? t('flights.ativarOptIn') : t('flights.habilitado')}
          </label>
        )}
        {sec && (
          <button className="btn btn-secondary btn-sm" onClick={test} disabled={busy || !props.values[sec.key]} type="button">
            {busy ? t('flights.testando') : t('flights.testarConexao')}
          </button>
        )}
        {p.docs.startsWith('http') && (
          <button className="fm-linkbtn" type="button" onClick={() => openExternal(p.docs)}>
            {t('flights.documentacao')}
          </button>
        )}
      </div>
      {msg && <div className={msg.ok ? 'fm-ok' : 'fm-error'}>{msg.text}</div>}
    </div>
  )
}

export function SourcesModal(props: { onClose: () => void }): React.ReactElement {
  const { providers, refreshProviders } = useFlightStore()
  const [values, setValues] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const load = async (): Promise<void> => {
    setValues(await window.api.settings.getAll())
    await refreshProviders()
  }
  useEffect(() => {
    void load()
  }, [])
  const set = (k: string, v: string): void => setValues((x) => ({ ...x, [k]: v }))
  async function saveExec(): Promise<void> {
    for (const k of ['flights_concurrency', 'flights_ai_model', 'flights_chrome_model', 'flights_promo_feeds', 'flights_osrm_url', 'flights_osrm_enabled', 'flights_ground_cost_per_km_minor', 'flights_ground_cost_currency', 'flights_travelpayouts_market'])
      if (values[k] != null) await window.api.settings.set(k, String(values[k]).trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }
  const automated = providers.filter((p) => p.kind === 'api' && p.available)
  return (
    <Modal title={t('flights.fontesExecucaoEIa')} onClose={props.onClose}>
      {automated.length === 0 && (
        <div className="fm-note warn" style={{ marginBottom: 10 }}>
          {t('flights.nenhumaFonteAutomaticaConfiguradaOs')}
        </div>
      )}
      <div className="fm-note" style={{ marginBottom: 10 }}>
        <b>{t('flights.skyscanner')}</b> {t('flights.naoTemApiAbertaAqui')}
      </div>
      {providers.map((p) => (
        <ProviderCard key={p.id} p={p} values={values} onSaved={load} />
      ))}
      <div className="fm-section">
        <div className="fm-section-title">{t('flights.execucaoEIa')}</div>
        <div className="fm-cols3">
          <label className="fm-field">
            <span className="fm-label">{t('flights.buscasSimultaneasMonitores')}</span>
            <input type="number" min={1} max={4} value={values.flights_concurrency ?? '1'} onChange={(e) => set('flights_concurrency', e.target.value)} />
          </label>
          <label className="fm-field">
            <span className="fm-label">{t('flights.modeloDaIaPassagens')}</span>
            <input value={values.flights_ai_model ?? 'haiku'} onChange={(e) => set('flights_ai_model', e.target.value)} placeholder={t('flights.haiku')} />
          </label>
          <label className="fm-field">
            <span className="fm-label">{t('flights.modeloDoSkyscannerChrome')}</span>
            <input value={values.flights_chrome_model ?? 'sonnet'} onChange={(e) => set('flights_chrome_model', e.target.value)} placeholder={t('flights.sonnet')} />
          </label>
          <label className="fm-field">
            <span className="fm-label">{t('flights.mercadoAviasales')}</span>
            <input value={values.flights_travelpayouts_market ?? 'br'} onChange={(e) => set('flights_travelpayouts_market', e.target.value)} placeholder={t('flights.br')} />
          </label>
          <label className="fm-field">
            <span className="fm-label">{t('flights.rotasTerrestresOsrm')}</span>
            <select value={values.flights_osrm_enabled ?? '1'} onChange={(e) => set('flights_osrm_enabled', e.target.value)}>
              <option value="1">{t('flights.ativadoSobDemandaComCache')}</option>
              <option value="0">{t('flights.desativadoSoAproximacao')}</option>
            </select>
          </label>
          <label className="fm-field">
            <span className="fm-label">{t('flights.servidorOsrm')}</span>
            <input value={values.flights_osrm_url ?? ''} onChange={(e) => set('flights_osrm_url', e.target.value)} placeholder={t('flights.httpsRouterProjectOsrmOrg')} />
          </label>
          <label className="fm-field">
            <span className="fm-label">{t('flights.custoTerrestreEstimadoPorKm')}</span>
            <span className="fm-row" style={{ flexWrap: 'nowrap' }}>
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder={t('flights.desconhecido')}
                value={values.flights_ground_cost_per_km_minor ? Number(values.flights_ground_cost_per_km_minor) / 100 : ''}
                onChange={(e) => set('flights_ground_cost_per_km_minor', e.target.value === '' ? '' : String(Math.round(Number(e.target.value) * 100)))}
              />
              <input value={values.flights_ground_cost_currency ?? 'BRL'} onChange={(e) => set('flights_ground_cost_currency', e.target.value.toUpperCase())} style={{ width: 64 }} maxLength={3} />
            </span>
          </label>
        </div>
        <label className="fm-field" style={{ marginTop: 8 }}>
          <span className="fm-label">{t('flights.feedsRssDePromocoesUm')}</span>
          <textarea
            rows={3}
            className="fm-mono"
            value={values.flights_promo_feeds ?? ''}
            placeholder={t('flights.httpsWwwMelhoresdestinosComBr')}
            onChange={(e) => set('flights_promo_feeds', e.target.value)}
          />
        </label>
        <div className="fm-small" style={{ marginTop: 6 }}>
          {t('flights.consumoDeIaApareceEm')}
        </div>
        <div className="fm-row" style={{ marginTop: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={saveExec} type="button">
            {t('flights.salvarExecucao')}
          </button>
          {saved && <span className="fm-ok">{t('flights.salvo')}</span>}
        </div>
      </div>
    </Modal>
  )
}
