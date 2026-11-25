import React, { useEffect, useState } from 'react'
import type { AiDraft, Cabin, FlightMonitor, GroundOption, MonitorConfig, Money, Need, SortStrategy } from '../../../../shared/flights'
import { CABIN_LABEL, defaultMonitorConfig, fmtMinutes, fromMinor, STRATEGY_LABEL, toMinor } from '../../../../shared/flights'
import type { Trip } from '../../../types'
import type { ValidationResult } from '../api'
import { errMsg, useFlightStore } from '../store/flightStore'
import { DatesEditor } from './DatesEditor'
import { LocationPicker, PlaceSearch } from './LocationPicker'
import { Modal } from './Modal'
import { t as tr, getLocale } from '../../../i18n'

const CURRENCIES = ['BRL', 'USD', 'EUR', 'JPY', 'GBP', 'THB']
const SAVED_COUNTRIES_KEY = 'flights_saved_forbidden_countries'
const parseCodes = (v: string | null | undefined): string[] => {
  try {
    const a: unknown = JSON.parse(v || '[]')
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string' && /^[A-Z]{2}$/.test(x)) : []
  } catch {
    return []
  }
}
const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x) => b.includes(x))
const NEED_LABEL: Record<Need, string> = { required: tr('flights.obrigatoria'), preferred: tr('flights.preferencia'), any: tr('flights.tantoFaz') }

function Counter(props: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }): React.ReactElement {
  return (
    <div className="fm-field">
      <span className="fm-label">{props.label}</span>
      <span className="fm-counter">
        <button type="button" onClick={() => props.onChange(Math.max(props.min, props.value - 1))} aria-label={tr('flights.menos', { label: props.label })}>
          −
        </button>
        <b>{props.value}</b>
        <button type="button" onClick={() => props.onChange(Math.min(props.max, props.value + 1))} aria-label={tr('flights.mais', { label: props.label })}>
          +
        </button>
      </span>
    </div>
  )
}

/** Valor monetário em unidades (ex.: 4500,00) ↔ centavos. Vazio = null. */
function MoneyInput(props: { value: Money | null; currency: string; onChange: (m: Money | null) => void; placeholder?: string }): React.ReactElement {
  const cur = props.value?.currency ?? props.currency
  return (
    <span className="fm-row" style={{ gap: 4, flexWrap: 'nowrap' }}>
      <input
        type="number"
        min={0}
        step="any"
        placeholder={props.placeholder ?? tr('flights.semLimite')}
        value={props.value ? fromMinor(props.value.amountMinor, cur) : ''}
        onChange={(e) => props.onChange(e.target.value === '' ? null : { amountMinor: toMinor(Number(e.target.value), cur), currency: cur })}
      />
      <select value={cur} onChange={(e) => props.value && props.onChange({ amountMinor: toMinor(fromMinor(props.value.amountMinor, cur), e.target.value), currency: e.target.value })} style={{ width: 80 }}>
        {[...new Set([cur, ...CURRENCIES])].map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
    </span>
  )
}

function NeedSelect(props: { value: Need; onChange: (n: Need) => void }): React.ReactElement {
  return (
    <select value={props.value} onChange={(e) => props.onChange(e.target.value as Need)}>
      {(Object.keys(NEED_LABEL) as Need[]).map((n) => (
        <option key={n} value={n}>
          {NEED_LABEL[n]}
        </option>
      ))}
    </select>
  )
}

/** Lista de códigos (países/aeroportos/companhias) como chips. */
function CodeChips(props: { codes: string[]; onChange: (c: string[]) => void; kind: 'country' | 'airport' | 'carrier'; placeholder: string }): React.ReactElement {
  const [txt, setTxt] = useState('')
  return (
    <div className="fm-chips">
      {props.codes.map((c) => (
        <span className="fm-chip" key={c}>
          <span>{c}</span>
          <button type="button" className="fm-x" onClick={() => props.onChange(props.codes.filter((x) => x !== c))} aria-label={tr('flights.remover2', { c })}>
            ✕
          </button>
        </span>
      ))}
      {props.kind === 'carrier' ? (
        <input
          value={txt}
          placeholder={props.placeholder}
          maxLength={2}
          onChange={(e) => setTxt(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && /^[A-Z0-9]{2}$/.test(txt)) {
              e.preventDefault()
              if (!props.codes.includes(txt)) props.onChange([...props.codes, txt])
              setTxt('')
            }
          }}
        />
      ) : (
        <PlaceSearch placeholder={props.placeholder} kinds={[props.kind]} onPick={(s) => !props.codes.includes(s.code) && props.onChange([...props.codes, s.code])} />
      )}
    </div>
  )
}

function GroundList(props: { list: GroundOption[]; onChange: (l: GroundOption[]) => void; currency: string }): React.ReactElement {
  if (!props.list.length) return <div className="fm-small">{tr('flights.nenhumDeslocamentoTerrestreUseSugerir')}</div>
  return (
    <div>
      {props.list.map((g, i) => {
        const set = (p: Partial<GroundOption>): void => props.onChange(props.list.map((x, j) => (j === i ? { ...x, ...p, source: 'manual' } : x)))
        return (
          <div className="fm-window" key={`${g.airport}-${i}`}>
            <b>{g.airport}</b>→
            <input value={g.toLabel} onChange={(e) => set({ toLabel: e.target.value })} style={{ width: 120 }} aria-label={tr('flights.destinoFinal')} />
            <label className="fm-row fm-small" style={{ gap: 4 }}>
              {tr('flights.tempo')}
              <input type="number" min={0} value={g.minutes ?? ''} onChange={(e) => set({ minutes: e.target.value === '' ? null : Number(e.target.value) })} /> {tr('flights.min')}
            </label>
            <label className="fm-row fm-small" style={{ gap: 4 }}>
              {tr('flights.custo')}
              <input
                type="number"
                min={0}
                step="any"
                value={g.costMinor != null ? fromMinor(g.costMinor, g.currency) : ''}
                placeholder="?"
                onChange={(e) => set({ costMinor: e.target.value === '' ? null : toMinor(Number(e.target.value), g.currency) })}
                style={{ width: 80 }}
              />
              {g.currency}
            </label>
            <span className={`fm-pill ${g.source === 'manual' ? 'ok' : 'warn'}`}>{g.source === 'manual' ? tr('flights.informado') : g.source === 'osrm' ? tr('flights.rotaEstimada') : tr('flights.aproximacao')}</span>
            <button type="button" className="fm-x" onClick={() => props.onChange(props.list.filter((_, j) => j !== i))} aria-label={tr('flights.remover3')}>
              ✕
            </button>
          </div>
        )
      })}
      <div className="fm-small">{tr('flights.tempo2')} {props.list.some((g) => g.minutes) ? tr('flights.ex', { p0: fmtMinutes(props.list.find((g) => g.minutes)?.minutes) }) : ''} {tr('flights.eCustoEntramNoCusto')}</div>
    </div>
  )
}

/** Assistente "Criar com IA": 1 chamada, resposta validada, preenche o formulário para revisão. */
function AiBox(props: { currency: string; onDraft: (d: AiDraft) => void }): React.ReactElement {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function go(): Promise<void> {
    setBusy(true)
    setErr('')
    try {
      props.onDraft(await window.api.flightMon.aiDraft(text, props.currency))
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="fm-section fm-ai">
      <div className="fm-section-title">{tr('flights.criarComIa')}</div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={tr('flights.exVouPassarSemanasPelo')}
      />
      <div className="fm-row" style={{ marginTop: 6 }}>
        <button className="btn btn-primary btn-sm" type="button" onClick={go} disabled={busy || text.trim().length < 8}>
          {busy ? tr('flights.interpretando') : tr('flights.gerarConfiguracao')}
        </button>
        <span className="fm-small">{tr('flights.aIaSoSugereCodigos')}</span>
      </div>
      {err && <div className="fm-error">{err}</div>}
    </div>
  )
}

export function MonitorEditor(props: { monitor?: FlightMonitor | null; startWithAi?: boolean; trips: Trip[]; onClose: () => void; onSaved: (id: number) => void }): React.ReactElement {
  const m = props.monitor
  const [name, setName] = useState(m?.name ?? '')
  const [tripId, setTripId] = useState<number | null>(m?.tripId ?? null)
  const [cfg, setCfg] = useState<MonitorConfig>(m?.config ?? defaultMonitorConfig())
  const [advanced, setAdvanced] = useState(false)
  const [showAi, setShowAi] = useState(!!props.startWithAi)
  const [draftInfo, setDraftInfo] = useState<AiDraft | null>(null)
  const [val, setVal] = useState<ValidationResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const providers = useFlightStore((s) => s.providers)
  // Seleção salva de "Países proibidos para conexão": já vem marcada em monitor novo.
  const [savedCountries, setSavedCountries] = useState<string[] | null>(null)

  useEffect(() => {
    window.api.settings
      .get(SAVED_COUNTRIES_KEY)
      .then((v) => {
        const list = parseCodes(v)
        setSavedCountries(list)
        if (!m && list.length) setCfg((c) => ({ ...c, constraints: { ...c.constraints, forbiddenConnectionCountries: [...new Set([...c.constraints.forbiddenConnectionCountries, ...list])] } }))
      })
      .catch(() => setSavedCountries([]))
  }, []) // só na abertura

  async function saveCountries(): Promise<void> {
    const list = [...cfg.constraints.forbiddenConnectionCountries]
    try {
      await window.api.settings.set(SAVED_COUNTRIES_KEY, JSON.stringify(list))
      setSavedCountries(list)
    } catch (e) {
      setErr(errMsg(e))
    }
  }
  const countriesSaved = savedCountries !== null && sameSet(savedCountries, cfg.constraints.forbiddenConnectionCountries)

  useEffect(() => {
    const t = setTimeout(() => {
      window.api.flightMon.validate(cfg).then(setVal).catch(() => setVal(null))
    }, 350)
    return () => clearTimeout(t)
  }, [cfg])

  const up = <K extends keyof MonitorConfig>(k: K, v: MonitorConfig[K]): void => setCfg((c) => ({ ...c, [k]: v }))
  const con = (p: Partial<MonitorConfig['constraints']>): void => setCfg((c) => ({ ...c, constraints: { ...c.constraints, ...p } }))
  const pref = (p: Partial<MonitorConfig['preferences']>): void => setCfg((c) => ({ ...c, preferences: { ...c.preferences, ...p } }))

  async function save(status: 'active' | 'draft'): Promise<void> {
    setBusy(true)
    setErr('')
    try {
      const input = { name: name.trim() || autoName(cfg), status, tripId, config: cfg }
      const r = m ? await window.api.flightMon.update(m.id, input) : await window.api.flightMon.create(input)
      props.onSaved(r.id)
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const autoProviders = providers.filter((p) => p.capabilities.automated)
  const errors = val?.errors ?? []

  return (
    <Modal
      title={m ? tr('flights.editar', { name: m.name }) : tr('flights.novoMonitoramento')}
      onClose={props.onClose}
      headExtra={
        <div className="fm-seg" aria-label={tr('flights.modoDoFormulario')}>
          <button type="button" className={!advanced ? 'active' : ''} onClick={() => setAdvanced(false)}>
            {tr('flights.simples')}
          </button>
          <button type="button" className={advanced ? 'active' : ''} onClick={() => setAdvanced(true)}>
            {tr('flights.avancado')}
          </button>
        </div>
      }
      footer={
        <>
          <div className="fm-summary-bar fm-grow">
            {val ? (
              <>
                <span>
                  <b>{val.origins.length}</b> {tr('flights.origemNs')} <b>{val.destinations.length}</b> {tr('flights.destinoS')}
                </span>
                <span>
                  <b>{val.dates}</b> {tr('flights.combinacaoOesDeDatas')}
                </span>
                <span>
                  {tr('flights.universo')} <b>{val.universe.toLocaleString(getLocale())}</b>
                </span>
                <span title={tr('flights.consultasDaEtapaDeDescoberta')}>
                  {tr('flights.descoberta')} <b>{val.discoveryQueries}</b> {tr('flights.consultas')}
                </span>
                {!val.providers.length && <span className="fm-pill warn">{tr('flights.semFonteAutomaticaConfigurada')}</span>}
              </>
            ) : (
              <span>{tr('flights.validando')}</span>
            )}
          </div>
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => save('draft')} disabled={busy}>
            {tr('flights.salvarRascunho')}
          </button>
          <button className="btn btn-primary btn-sm" type="button" onClick={() => save('active')} disabled={busy} title={errors[0] ?? ''}>
            {busy ? tr('flights.salvando') : errors.length ? tr('flights.salvarFicaAguardandoConfiguracao') : m ? tr('flights.salvar') : tr('flights.criarMonitoramento')}
          </button>
        </>
      }
    >
      {!showAi ? (
        <button className="fm-linkbtn" type="button" onClick={() => setShowAi(true)} style={{ marginBottom: 8 }}>
          {tr('flights.criarComIaAPartir')}
        </button>
      ) : (
        <AiBox
          currency={cfg.currency}
          onDraft={(d) => {
            const saved = savedCountries ?? []
            setCfg({ ...d.config, constraints: { ...d.config.constraints, forbiddenConnectionCountries: [...new Set([...d.config.constraints.forbiddenConnectionCountries, ...saved])] } })
            if (!name.trim() || draftInfo) setName(d.name)
            setDraftInfo(d)
          }}
        />
      )}
      {draftInfo && (
        <div className="fm-note info" style={{ marginBottom: 10 }}>
          <b>{tr('flights.sugestaoDaIa')}{draftInfo.cached ? tr('flights.doCache0Tokens') : ''} {tr('flights.reviseAntesDeSalvar')}</b>
          {draftInfo.explanations.length > 0 && (
            <ul>
              {draftInfo.explanations.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          )}
          {draftInfo.questions.length > 0 && (
            <>
              <div style={{ marginTop: 4 }}>{tr('flights.emAberto')}</div>
              <ul>
                {draftInfo.questions.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </>
          )}
          {draftInfo.warnings.length > 0 && (
            <ul style={{ color: 'var(--warning)' }}>
              {draftInfo.warnings.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="fm-section">
        <div className="fm-cols">
          <label className="fm-field">
            <span className="fm-label">{tr('flights.nome')}</span>
            <input value={name} placeholder={autoName(cfg)} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </label>
          <label className="fm-field">
            <span className="fm-label">{tr('flights.viagemOpcional')}</span>
            <select value={tripId ?? ''} onChange={(e) => setTripId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {props.trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.destination}
                  {t.startDate ? ` (${t.startDate})` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="fm-section">
        <div className="fm-section-title">{tr('flights.origemEDestino')}</div>
        <div className="fm-stack">
          <LocationPicker label={tr('flights.deOnde')} value={cfg.origins} onChange={(v) => up('origins', v)} advanced={advanced} currency={cfg.currency} />
          <LocationPicker
            label={tr('flights.paraOnde')}
            value={cfg.destinations}
            onChange={(v) => up('destinations', v)}
            advanced={advanced}
            currency={cfg.currency}
            onGround={(g) => setCfg((c) => ({ ...c, ground: [...c.ground.filter((x) => x.airport !== g.airport), g] }))}
          />
        </div>
        {(cfg.origins.include.length && cfg.destinations.include.length ? val?.warnings ?? [] : []).map((w) => (
          <div className="fm-small" style={{ color: 'var(--warning)', marginTop: 4 }} key={w}>
            {w}
          </div>
        ))}
        {(advanced || cfg.ground.length > 0) && (
          <div style={{ marginTop: 8 }}>
            <span className="fm-label">{tr('flights.deslocamentoTerrestreAPartirDe')}</span>
            <GroundList list={cfg.ground} onChange={(l) => up('ground', l)} currency={cfg.currency} />
          </div>
        )}
      </div>

      <div className="fm-section">
        <div className="fm-section-title">{tr('flights.datas')}</div>
        <DatesEditor value={cfg.dates} onChange={(v) => up('dates', v)} advanced={advanced} />
      </div>

      <div className="fm-section">
        <div className="fm-section-title">{tr('flights.passageirosEBagagem')}</div>
        <div className="fm-row" style={{ gap: 16, alignItems: 'flex-start' }}>
          <Counter label={tr('flights.adultos')} value={cfg.passengers.adults} min={1} max={9} onChange={(n) => up('passengers', { ...cfg.passengers, adults: n, infants: Math.min(cfg.passengers.infants, n) })} />
          <Counter label={tr('flights.criancas')} value={cfg.passengers.children} min={0} max={8} onChange={(n) => up('passengers', { ...cfg.passengers, children: n })} />
          <Counter label={tr('flights.bebes')} value={cfg.passengers.infants} min={0} max={cfg.passengers.adults} onChange={(n) => up('passengers', { ...cfg.passengers, infants: n })} />
          <label className="fm-field">
            <span className="fm-label">{tr('flights.cabine')}</span>
            <select value={cfg.passengers.cabin} onChange={(e) => up('passengers', { ...cfg.passengers, cabin: e.target.value as Cabin })}>
              {(Object.keys(CABIN_LABEL) as Cabin[]).map((c) => (
                <option key={c} value={c}>
                  {CABIN_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="fm-cols3" style={{ marginTop: 8 }}>
          <label className="fm-field">
            <span className="fm-label">{tr('flights.malaDespachada')}</span>
            <span className="fm-row" style={{ flexWrap: 'nowrap' }}>
              <NeedSelect value={cfg.baggage.checked} onChange={(n) => up('baggage', { ...cfg.baggage, checked: n })} />
              {cfg.baggage.checked !== 'any' && (
                <select value={cfg.baggage.checkedCount} onChange={(e) => up('baggage', { ...cfg.baggage, checkedCount: Number(e.target.value) })} style={{ width: 70 }} aria-label={tr('flights.quantidadeDeMalas')}>
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {tr('flights.text', { n })}
                    </option>
                  ))}
                </select>
              )}
            </span>
          </label>
          <label className="fm-field">
            <span className="fm-label">{tr('flights.bagagemDeMao')}</span>
            <NeedSelect value={cfg.baggage.carryOn} onChange={(n) => up('baggage', { ...cfg.baggage, carryOn: n })} />
          </label>
          {advanced && (
            <label className="fm-field">
              <span className="fm-label">{tr('flights.tarifaReembolsavel')}</span>
              <NeedSelect value={cfg.baggage.refundable} onChange={(n) => up('baggage', { ...cfg.baggage, refundable: n })} />
            </label>
          )}
        </div>
        <div className="fm-small" style={{ marginTop: 4 }}>
          {tr('flights.obrigatoriaViraRestricaoTarifaSem')}
        </div>
      </div>

      <div className="fm-section">
        <div className="fm-section-title">
          {tr('flights.restricoesObrigatorias')} <span className="fm-muted">{tr('flights.violouSaiDaListaDe')}</span>
        </div>
        <div className="fm-cols">
          <label className="fm-field">
            <span className="fm-label">{tr('flights.maxDeConexoes')}</span>
            <select value={cfg.constraints.maxStops ?? ''} onChange={(e) => con({ maxStops: e.target.value === '' ? null : Number(e.target.value) })}>
              <option value="">{tr('flights.semLimite2')}</option>
              <option value="0">{tr('flights.soVooDireto')}</option>
              <option value="1">{tr('flights.ate1')}</option>
              <option value="2">{tr('flights.ate2')}</option>
              <option value="3">{tr('flights.ate3')}</option>
            </select>
          </label>
          <label className="fm-field">
            <span className="fm-label">{tr('flights.precoMaximo')}</span>
            <MoneyInput value={cfg.constraints.maxPrice} currency={cfg.currency} onChange={(mp) => con({ maxPrice: mp })} />
          </label>
        </div>
        <div className="fm-field" style={{ marginTop: 8 }}>
          <span className="fm-label">{tr('flights.paisesProibidosParaConexao')}</span>
          <div className="fm-row" style={{ gap: 4, marginBottom: 4 }}>
            {[
              ['US', 'EUA'],
              ['CA', 'Canadá'],
              ['GB', 'Reino Unido'],
              ['CN', 'China']
            ].map(([c, l]) => (
              <button
                key={c}
                type="button"
                className={`fm-pill ${cfg.constraints.forbiddenConnectionCountries.includes(c) ? 'danger' : 'outline'}`}
                style={{ cursor: 'pointer' }}
                onClick={() =>
                  con({
                    forbiddenConnectionCountries: cfg.constraints.forbiddenConnectionCountries.includes(c)
                      ? cfg.constraints.forbiddenConnectionCountries.filter((x) => x !== c)
                      : [...cfg.constraints.forbiddenConnectionCountries, c]
                  })
                }
              >
                {cfg.constraints.forbiddenConnectionCountries.includes(c) ? '✓ ' : '+ '}
                {l}
              </button>
            ))}
          </div>
          <CodeChips kind="country" codes={cfg.constraints.forbiddenConnectionCountries} onChange={(c) => con({ forbiddenConnectionCountries: c })} placeholder={tr('flights.outroPais')} />
          <div className="fm-row" style={{ gap: 6, marginTop: 4 }}>
            <button className="btn btn-sm" type="button" disabled={savedCountries === null || countriesSaved} onClick={() => void saveCountries()} title={tr('flights.monitoresNovosJaAbremCom')}>
              {tr('flights.salvarSelecao')}
            </button>
            <span className="fm-small">
              {countriesSaved
                ? savedCountries?.length
                  ? tr('flights.selecaoSalvaMonitoresNovosJa')
                  : tr('flights.nenhumaSelecaoSalva')
                : savedCountries?.length
                  ? tr('flights.salva', { p0: savedCountries.join(', ') })
                  : tr('flights.salveParaJaVirMarcada')}
            </span>
          </div>
        </div>
        {advanced && (
          <>
            <div className="fm-cols" style={{ marginTop: 8 }}>
              <div className="fm-field">
                <span className="fm-label">{tr('flights.aeroportosProibidosParaConexao')}</span>
                <CodeChips kind="airport" codes={cfg.constraints.forbiddenConnectionAirports} onChange={(c) => con({ forbiddenConnectionAirports: c })} placeholder={tr('flights.aeroporto')} />
              </div>
              <div className="fm-field">
                <span className="fm-label">{tr('flights.companhiasProibidasIataEnter')}</span>
                <CodeChips kind="carrier" codes={cfg.constraints.forbiddenCarriers} onChange={(c) => con({ forbiddenCarriers: c })} placeholder={tr('flights.exAa')} />
              </div>
            </div>
            <div className="fm-cols3" style={{ marginTop: 8 }}>
              <label className="fm-field">
                <span className="fm-label">{tr('flights.duracaoMaxHPorTrecho')}</span>
                <input type="number" min={1} max={96} value={cfg.constraints.maxTotalDurationHours ?? ''} onChange={(e) => con({ maxTotalDurationHours: e.target.value === '' ? null : Number(e.target.value) })} />
              </label>
              <label className="fm-field">
                <span className="fm-label">{tr('flights.conexaoMinMin')}</span>
                <input type="number" min={0} value={cfg.constraints.minConnectionMinutes ?? ''} onChange={(e) => con({ minConnectionMinutes: e.target.value === '' ? null : Number(e.target.value) })} />
              </label>
              <label className="fm-field">
                <span className="fm-label">{tr('flights.conexaoMaxH')}</span>
                <input
                  type="number"
                  min={1}
                  value={cfg.constraints.maxConnectionMinutes != null ? cfg.constraints.maxConnectionMinutes / 60 : ''}
                  onChange={(e) => con({ maxConnectionMinutes: e.target.value === '' ? null : Math.round(Number(e.target.value) * 60) })}
                />
              </label>
            </div>
          </>
        )}
        <div className="fm-row" style={{ marginTop: 8, gap: 14 }}>
          <label className="fm-check">
            <input type="checkbox" checked={cfg.constraints.forbidSelfTransfer} onChange={(e) => con({ forbidSelfTransfer: e.target.checked })} /> {tr('flights.proibirSelfTransfer')}
          </label>
          <label className="fm-check">
            <input type="checkbox" checked={cfg.constraints.forbidAirportChange} onChange={(e) => con({ forbidAirportChange: e.target.checked })} /> {tr('flights.proibirTrocaDeAeroporto')}
          </label>
          {advanced && (
            <label className="fm-check">
              <input type="checkbox" checked={cfg.constraints.forbidOvernightConnections} onChange={(e) => con({ forbidOvernightConnections: e.target.checked })} /> {tr('flights.proibirConexaoDeMadrugada')}
            </label>
          )}
        </div>
      </div>

      <div className="fm-section">
        <div className="fm-section-title">
          {tr('flights.preferencias')} <span className="fm-muted">{tr('flights.naoExcluemSoOrdenamPontuacao')}</span>
        </div>
        <div className="fm-cols">
          <label className="fm-field">
            <span className="fm-label">{tr('flights.ordenarPor')}</span>
            <select value={cfg.preferences.strategy} onChange={(e) => pref({ strategy: e.target.value as SortStrategy })}>
              {(Object.keys(STRATEGY_LABEL) as SortStrategy[]).map((s) => (
                <option key={s} value={s}>
                  {STRATEGY_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="fm-field">
            <span className="fm-label">{tr('flights.conexoes')}</span>
            <select value={cfg.preferences.connectionStyle} onChange={(e) => pref({ connectionStyle: e.target.value as MonitorConfig['preferences']['connectionStyle'] })}>
              <option value="short">{tr('flights.curtas50150Min')}</option>
              <option value="comfortable">{tr('flights.confortaveis1h305h')}</option>
              <option value="long_ok">{tr('flights.longasAceitaveis')}</option>
              <option value="any">{tr('flights.tantoFaz')}</option>
            </select>
          </label>
        </div>
        {advanced && (
          <>
            <span className="fm-label" style={{ marginTop: 10 }}>
              {tr('flights.pesosDoCustoBeneficio0')}
            </span>
            <div className="fm-weights">
              {(
                [
                  ['price', tr('flights.precoCusto')],
                  ['duration', tr('flights.duracao')],
                  ['stops', tr('flights.nConexoes')],
                  ['connections', tr('flights.confortoDasConexoes')],
                  ['schedule', tr('flights.horarios')],
                  ['carriers', tr('flights.companhiasPreferidas')]
                ] as const
              ).map(([k, l]) => (
                <label key={k}>
                  {l}: <b>{cfg.preferences.weights[k]}</b>
                  <input type="range" min={0} max={10} value={cfg.preferences.weights[k]} onChange={(e) => pref({ weights: { ...cfg.preferences.weights, [k]: Number(e.target.value) } })} />
                </label>
              ))}
            </div>
            <div className="fm-cols" style={{ marginTop: 8 }}>
              <div className="fm-field">
                <span className="fm-label">{tr('flights.companhiasPreferidasIataEnter')}</span>
                <CodeChips kind="carrier" codes={cfg.preferences.preferredCarriers} onChange={(c) => pref({ preferredCarriers: c })} placeholder={tr('flights.exQr')} />
              </div>
              <div className="fm-field">
                <span className="fm-label">{tr('flights.chegadaConvenienteHoraLocal')}</span>
                <span className="fm-row">
                  <input type="time" value={cfg.preferences.arrivalWindow?.from ?? ''} onChange={(e) => pref({ arrivalWindow: e.target.value ? { from: e.target.value, to: cfg.preferences.arrivalWindow?.to ?? '22:00' } : null })} />
                  –
                  <input type="time" value={cfg.preferences.arrivalWindow?.to ?? ''} onChange={(e) => cfg.preferences.arrivalWindow && pref({ arrivalWindow: { ...cfg.preferences.arrivalWindow, to: e.target.value } })} />
                </span>
              </div>
            </div>
            <div className="fm-row" style={{ marginTop: 8, gap: 14 }}>
              <label className="fm-check">
                <input type="checkbox" checked={cfg.preferences.preferNightFlights} onChange={(e) => pref({ preferNightFlights: e.target.checked })} /> {tr('flights.prefiroVoosNoturnos')}
              </label>
              <label className="fm-check">
                <input type="checkbox" checked={cfg.preferences.avoidSeparateTickets} onChange={(e) => pref({ avoidSeparateTickets: e.target.checked })} /> {tr('flights.evitarBilhetesSeparados')}
              </label>
              <label className="fm-row fm-small" style={{ gap: 4 }}>
                {tr('flights.destacarStopoversDeAte')}
                <input type="number" min={6} max={96} style={{ width: 64 }} value={cfg.preferences.stopoverMaxHours ?? ''} placeholder="—" onChange={(e) => pref({ stopoverMaxHours: e.target.value === '' ? null : Number(e.target.value) })} />{tr('flights.h')}
              </label>
            </div>
          </>
        )}
      </div>

      {advanced && (
        <div className="fm-section">
          <div className="fm-section-title">{tr('flights.execucaoOrcamentoEAlertas')}</div>
          <div className="fm-cols3">
            <label className="fm-field">
              <span className="fm-label">{tr('flights.atualizacao')}</span>
              <select value={cfg.schedule.mode} onChange={(e) => up('schedule', { ...cfg.schedule, mode: e.target.value as MonitorConfig['schedule']['mode'] })}>
                <option value="manual">{tr('flights.manual')}</option>
                <option value="daily">{tr('flights.diaria')}</option>
                <option value="hours">{tr('flights.aCadaXHoras')}</option>
                <option value="adaptive">{tr('flights.adaptativaMaisFrequentePertoDa')}</option>
              </select>
            </label>
            {cfg.schedule.mode === 'daily' && (
              <label className="fm-field">
                <span className="fm-label">{tr('flights.hora')}</span>
                <input type="number" min={0} max={23} value={cfg.schedule.hour} onChange={(e) => up('schedule', { ...cfg.schedule, hour: Number(e.target.value) })} />
              </label>
            )}
            {cfg.schedule.mode === 'hours' && (
              <label className="fm-field">
                <span className="fm-label">{tr('flights.intervaloHMin3')}</span>
                <input type="number" min={3} max={168} value={cfg.schedule.everyHours} onChange={(e) => up('schedule', { ...cfg.schedule, everyHours: Number(e.target.value) })} />
              </label>
            )}
            <label className="fm-field">
              <span className="fm-label">{tr('flights.moedaDeComparacao')}</span>
              <select value={cfg.currency} onChange={(e) => up('currency', e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="fm-cols3" style={{ marginTop: 8 }}>
            <label className="fm-field">
              <span className="fm-label">{tr('flights.consultasPorExecucao')}</span>
              <input type="number" min={1} max={500} value={cfg.budget.maxQueriesPerRun} onChange={(e) => up('budget', { ...cfg.budget, maxQueriesPerRun: Number(e.target.value) })} />
            </label>
            <label className="fm-field">
              <span className="fm-label">{tr('flights.consultasPorDia')}</span>
              <input type="number" min={1} max={2000} value={cfg.budget.maxQueriesPerDay} onChange={(e) => up('budget', { ...cfg.budget, maxQueriesPerDay: Number(e.target.value) })} />
            </label>
            <label className="fm-field">
              <span className="fm-label">{tr('flights.tempoMaxMin')}</span>
              <input type="number" min={1} max={120} value={cfg.budget.maxRunMinutes} onChange={(e) => up('budget', { ...cfg.budget, maxRunMinutes: Number(e.target.value) })} />
            </label>
            <label className="fm-field">
              <span className="fm-label">{tr('flights.chamadasDeIaPorDia')}</span>
              <input type="number" min={0} max={10} value={cfg.budget.maxAiCallsPerRun} onChange={(e) => up('budget', { ...cfg.budget, maxAiCallsPerRun: Number(e.target.value) })} />
            </label>
            <label className="fm-field">
              <span className="fm-label">{tr('flights.opcoesExibidas0Auto')}</span>
              <input type="number" min={0} max={100} value={cfg.displayTarget} onChange={(e) => up('displayTarget', Number(e.target.value))} />
            </label>
          </div>
          {autoProviders.length > 0 && (
            <div className="fm-field" style={{ marginTop: 8 }}>
              <span className="fm-label">{tr('flights.fontesDesteMonitorNenhumaMarcada')}</span>
              <div className="fm-row" style={{ gap: 14 }}>
                {autoProviders.map((p) => (
                  <label className="fm-check" key={p.id} title={p.reason ?? ''}>
                    <input
                      type="checkbox"
                      checked={cfg.providers.includes(p.id)}
                      onChange={(e) => up('providers', e.target.checked ? [...cfg.providers, p.id] : cfg.providers.filter((x) => x !== p.id))}
                    />
                    {p.label} {!p.available && <span className="fm-pill warn">{tr('flights.indisponivel')}</span>}
                  </label>
                ))}
              </div>
            </div>
          )}
          <span className="fm-label" style={{ marginTop: 10 }}>
            {tr('flights.alertasNotificacaoDoRickosSem')}
          </span>
          <div className="fm-row" style={{ gap: 14 }}>
            <label className="fm-row fm-small" style={{ gap: 4 }}>
              {tr('flights.precoAbaixoDe')}
              <MoneyInput value={cfg.alerts.priceBelow} currency={cfg.currency} onChange={(mp) => up('alerts', { ...cfg.alerts, priceBelow: mp })} placeholder="—" />
            </label>
            <label className="fm-row fm-small" style={{ gap: 4 }}>
              {tr('flights.quedaDe')}
              <input type="number" min={1} max={90} style={{ width: 60 }} value={cfg.alerts.dropPercent ?? ''} placeholder="—" onChange={(e) => up('alerts', { ...cfg.alerts, dropPercent: e.target.value === '' ? null : Number(e.target.value) })} />%
            </label>
            <label className="fm-check">
              <input type="checkbox" checked={cfg.alerts.newLow} onChange={(e) => up('alerts', { ...cfg.alerts, newLow: e.target.checked })} /> {tr('flights.novoMenorPrecoComparavel')}
            </label>
            <label className="fm-check">
              <input type="checkbox" checked={cfg.alerts.interesting} onChange={(e) => up('alerts', { ...cfg.alerts, interesting: e.target.checked })} /> {tr('flights.vooNovoMuitoBemPontuado')}
            </label>
            <label className="fm-check">
              <input type="checkbox" checked={cfg.alerts.promoPosts} onChange={(e) => up('alerts', { ...cfg.alerts, promoPosts: e.target.checked })} /> {tr('flights.postDePromocaoNosBlogs')}
            </label>
            <label className="fm-check">
              <input type="checkbox" checked={cfg.alerts.favoriteChanges} onChange={(e) => up('alerts', { ...cfg.alerts, favoriteChanges: e.target.checked })} /> {tr('flights.mudancasEmFavoritas')}
            </label>
          </div>
          <label className="fm-field" style={{ marginTop: 8 }}>
            <span className="fm-label">{tr('flights.notas')}</span>
            <textarea value={cfg.notes} onChange={(e) => up('notes', e.target.value)} rows={2} />
          </label>
        </div>
      )}

      {errors.length > 0 && (
        <div className="fm-note warn">
          {tr('flights.paraBuscarAindaFalta')}
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {err && <div className="fm-error">{err}</div>}
    </Modal>
  )
}

export function autoName(c: MonitorConfig): string {
  const o = c.origins.include[0]?.label.replace(/ \(.*\)$/, '')
  const d = c.destinations.include[0]?.label.replace(/ \(.*\)$/, '')
  return o && d ? `${o}${c.origins.include.length > 1 ? ' +' : ''} → ${d}${c.destinations.include.length > 1 ? ' +' : ''}` : tr('flights.novoMonitoramento')
}
