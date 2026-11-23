import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { ChromeStatus, MonitorSummary, SkyPick, SkyPlace, SkyPreview } from '../../../../shared/flights'
import { formatMoney, skyKey } from '../../../../shared/flights'
import { errMsg } from '../store/flightStore'
import { Modal } from './Modal'

const dayLabel = (d: string): string => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '')
const dateText = (p: { depart: string; ret: string | null }): string => `${dayLabel(p.depart)}${p.ret ? ` → ${dayLabel(p.ret)}` : ''}`

const norm = (x: string): string => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Campo com busca (cidade, país ou IATA) e lista em ordem alfabética, agrupada por país. */
function PlacePicker(props: { places: SkyPlace[]; value: string; onChange: (iata: string) => void; placeholder: string }): React.ReactElement {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const current = props.places.find((p) => p.iata === props.value)
  const terms = norm(q).split(/\s+/).filter(Boolean)
  const match = (fields: (p: SkyPlace) => string): SkyPlace[] => props.places.filter((p) => terms.every((t) => norm(fields(p)).includes(t)))
  // cidade/IATA primeiro; país só se nenhuma cidade casar ("il" não deve listar tudo por causa de "Brasil")
  const byCity = match((p) => `${p.city} ${p.iata}`)
  const list = !terms.length ? props.places : byCity.length ? byCity : match((p) => `${p.city} ${p.iata} ${p.countryName}`)
  const multi = new Set(props.places.map((p) => p.country)).size > 1

  useEffect(() => {
    const close = (e: MouseEvent): void => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  function pick(p: SkyPlace): void {
    props.onChange(p.iata)
    setQ('')
    setOpen(false)
  }

  return (
    <div className="fm-picker" ref={box}>
      <input
        className="form-input"
        value={open ? q : current ? `${current.label} (${current.iata})` : ''}
        placeholder={props.placeholder}
        onFocus={() => (setOpen(true), setQ(''), setHi(0))}
        onChange={(e) => (setQ(e.target.value), setHi(0), setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setHi((h) => Math.min(h + 1, list.length - 1)))
          else if (e.key === 'ArrowUp') (e.preventDefault(), setHi((h) => Math.max(h - 1, 0)))
          else if (e.key === 'Enter' && list[hi]) (e.preventDefault(), pick(list[hi]))
          else if (e.key === 'Escape') (e.stopPropagation(), setOpen(false))
        }}
      />
      {open && (
        <div className="fm-suggest">
          {list.length === 0 && <div className="fm-muted" style={{ padding: '6px 10px' }}>Nada encontrado.</div>}
          {list.map((p, i) => (
            <React.Fragment key={p.iata}>
              {multi && (i === 0 || list[i - 1].country !== p.country) && <div className="fm-suggest-group">{p.countryName}</div>}
              <button type="button" className={`${i === hi ? 'hi' : ''} ${p.iata === props.value ? 'sel' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
                <span>{p.city}</span>
                <small>{p.iata}</small>
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

const SUGGESTED_ROUTES = 8

/** Aviso de conexão do Chrome, com o passo a passo para o caso encontrado. */
function ChromeCheck(props: { st: ChromeStatus | null; checking: boolean; forced: boolean; onRecheck: () => void; onForce: () => void }): React.ReactElement | null {
  const { st } = props
  if (!st) return <div className="fm-small fm-muted" style={{ marginBottom: 8 }}>Verificando a conexão com o Chrome…</div>
  if (st.unknown) return null
  if (st.ok)
    return (
      <div className="fm-small" style={{ marginBottom: 8 }}>
        <span className="fm-pill ok">✓ Chrome conectado ao Claude Code</span>
      </div>
    )
  return (
    <div className="fm-note warn fm-chromecheck">
      <b>{st.chrome ? 'O Chrome não está conectado ao Claude Code.' : 'O Chrome não está aberto.'}</b>
      {st.chrome && st.desktopHost && !st.desktopApp && (
        <div>A extensão Claude in Chrome está presa ao app Claude desktop, que está fechado.</div>
      )}
      {st.chrome && st.desktopHost && st.desktopApp && <div>A extensão Claude in Chrome está ligada ao app Claude desktop, não ao Claude Code.</div>}
      <ol>
        {st.chrome ? (
          <li>
            Feche o Chrome por completo (<b>⌘Q</b>) e abra de novo.
          </li>
        ) : (
          <li>Abra o Chrome.</li>
        )}
        <li>Confira se a extensão Claude in Chrome está ativa e logada.</li>
        <li>
          Se continuar, rode <code>claude --chrome</code> no terminal e use <code>/chrome</code> para reconectar.
        </li>
      </ol>
      <div className="fm-row" style={{ gap: 10 }}>
        <button className="btn btn-sm" type="button" disabled={props.checking} onClick={props.onRecheck}>
          {props.checking ? 'Verificando…' : '↻ Verificar de novo'}
        </button>
        {!props.forced ? (
          <button className="fm-linkbtn" type="button" onClick={props.onForce} title="A checagem olha os processos da máquina; se ela errar, dá para tentar assim mesmo">
            tentar mesmo assim
          </button>
        ) : (
          <span className="fm-small">vai tentar mesmo assim</span>
        )}
      </div>
    </div>
  )
}
const pairKey = (o: string, d: string): string => `${o}|${d}`

/** Checkbox com estado "parcial" (algumas datas da rota marcadas). */
function TriCheck(props: { state: 'none' | 'some' | 'all'; disabled?: boolean; onChange: () => void; label: string }): React.ReactElement {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = props.state === 'some'
  }, [props.state])
  return <input ref={ref} type="checkbox" checked={props.state === 'all'} disabled={props.disabled} onChange={props.onChange} aria-label={props.label} />
}

/**
 * Escolha das combinações para o Skyscanner pelo Chrome. A unidade é a ROTA: marcar uma rota
 * (sugerida ou escolhida no buscador) já marca todas as datas do intervalo; dá para desmarcar
 * datas uma a uma logo abaixo dela.
 */
export function SkyscannerModal(props: { m: MonitorSummary; initial?: SkyPick[]; onClose: () => void; onStarted: () => void }): React.ReactElement {
  const [pv, setPv] = useState<SkyPreview | null>(null)
  const [sel, setSel] = useState<Map<string, SkyPick>>(new Map())
  const [extra, setExtra] = useState<string[]>([]) // rotas adicionadas pelo buscador
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState('')
  const [notice, setNotice] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const [err, setErr] = useState('')
  const [starting, setStarting] = useState(false)
  const [chrome, setChrome] = useState<ChromeStatus | null>(null)
  const [restored, setRestored] = useState(0)
  const loaded = useRef(false)
  const selKey = `flights_sky_selection_${props.m.id}`
  // A seleção fica guardada (no servidor, vale para desktop e celular) para a próxima vez que abrir.
  useEffect(() => {
    if (!loaded.current) return
    const t = setTimeout(() => {
      window.api.settings.set(selKey, JSON.stringify([...sel.values()])).catch(() => undefined)
    }, 300)
    return () => clearTimeout(t)
  }, [sel])
  const [checking, setChecking] = useState(false)
  const [forced, setForced] = useState(false)

  async function checkChrome(): Promise<ChromeStatus | null> {
    setChecking(true)
    try {
      const st = await window.api.flightMon.chromeStatus()
      setChrome(st)
      return st
    } catch {
      const st = { ok: true, chrome: false, codeHost: false, desktopHost: false, desktopApp: false, unknown: true }
      setChrome(st)
      return st
    } finally {
      setChecking(false)
    }
  }
  // verifica ao abrir e ao voltar para a janela (depois de reabrir o Chrome, por exemplo)
  useEffect(() => {
    void checkChrome()
    const onFocus = (): void => void checkChrome()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  useEffect(() => {
    Promise.all([window.api.flightMon.skyscannerPreview(props.m.id), window.api.settings.get(selKey).catch(() => null)])
      .then(([r, savedRaw]) => {
        setPv(r)
        const saved = props.initial?.length ? [] : validSaved(r, savedRaw)
        let start: SkyPick[]
        if (props.initial?.length) start = props.initial.slice(0, r.maxPerRun)
        else if (saved.length) start = saved.slice(0, r.maxPerRun)
        else {
          // 1ª rota sugerida com todas as datas do intervalo
          const first = r.recommended[0]
          start = first ? datesFor(r, first.origin, first.destination).slice(0, r.maxPerRun) : []
        }
        setSel(new Map(start.map((c) => [skyKey(c), { origin: c.origin, destination: c.destination, depart: c.depart, ret: c.ret }])))
        setOpen(new Set(props.initial?.length || saved.length ? [] : start.slice(0, 1).map((c) => pairKey(c.origin, c.destination))))
        setRestored(saved.length)
        loaded.current = true
      })
      .catch((e) => setErr(errMsg(e)))
  }, [])

  const names = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of [...(pv?.origins ?? []), ...(pv?.destinations ?? [])]) map.set(p.iata, `${p.label} (${p.iata})`)
    return map
  }, [pv])
  const pairSet = useMemo(() => new Set(pv?.pairs ?? []), [pv])
  // rotas na ordem das sugestões (as com preço conhecido barato primeiro)
  const suggested = useMemo(() => [...new Set((pv?.recommended ?? []).map((c) => pairKey(c.origin, c.destination)))], [pv])
  // menor preço conhecido por rota
  const routeBest = useMemo(() => {
    const m = new Map<string, number>()
    for (const [k, v] of Object.entries(pv?.known ?? {})) {
      const [o, d] = k.split('|')
      const pk = pairKey(o, d)
      if (!m.has(pk) || v < (m.get(pk) as number)) m.set(pk, v)
    }
    return m
  }, [pv])
  const destOptions = (pv?.destinations ?? []).filter((d) => pairSet.has(pairKey(origin, d.iata)))
  const max = pv?.maxPerRun ?? 45
  const full = sel.size >= max

  const selectedPairs = [...new Set([...sel.values()].map((c) => pairKey(c.origin, c.destination)))]
  const shown = [...new Set([...extra, ...suggested.slice(0, SUGGESTED_ROUTES), ...selectedPairs])]

  function routeCombos(pk: string): SkyPick[] {
    if (!pv) return []
    const [o, d] = pk.split('|')
    return datesFor(pv, o, d)
  }
  function routeState(pk: string): 'none' | 'some' | 'all' {
    const all = routeCombos(pk)
    const n = all.filter((c) => sel.has(skyKey(c))).length
    return n === 0 ? 'none' : n === all.length ? 'all' : 'some'
  }

  function toggle(p: SkyPick, on?: boolean): void {
    setSel((prev) => {
      const next = new Map(prev)
      const k = skyKey(p)
      const want = on ?? !next.has(k)
      if (!want) next.delete(k)
      else if (next.size < max) next.set(k, { origin: p.origin, destination: p.destination, depart: p.depart, ret: p.ret })
      return next
    })
  }
  /** Marca todas as datas da rota (as consultadas nas últimas 12 h por último) ou desmarca todas. */
  function setRoute(pk: string, on: boolean): void {
    if (!pv) return
    const combos = routeCombos(pk)
    const fresh = combos.filter((c) => !pv.recent[skyKey(c)])
    const order = [...fresh, ...combos.filter((c) => pv.recent[skyKey(c)])]
    let skipped = 0
    const next = new Map(sel)
    for (const c of order) {
      const k = skyKey(c)
      if (!on) next.delete(k)
      else if (!next.has(k)) {
        if (next.size < max) next.set(k, c)
        else skipped++
      }
    }
    setSel(next)
    if (on) {
      setOpen((o) => new Set(o).add(pk))
      setNotice(skipped ? `Limite de ${max} combinações por busca: ${skipped} data(s) de ${names.get(pk.split('|')[0]) ?? pk} ficaram de fora. Desmarque outras para incluir.` : '')
    } else setNotice('')
  }
  function addRoute(o: string, d: string): void {
    const pk = pairKey(o, d)
    if (!pairSet.has(pk)) return
    setExtra((e) => [pk, ...e.filter((x) => x !== pk)]) // a mais recente no topo
    if (routeState(pk) === 'none') setRoute(pk, true)
    else setOpen((x) => new Set(x).add(pk))
    setDest('')
    listRef.current?.scrollTo({ top: 0 })
  }
  function toggleOpen(pk: string): void {
    setOpen((o) => {
      const n = new Set(o)
      if (n.has(pk)) n.delete(pk)
      else n.add(pk)
      return n
    })
  }
  function setTracked(on: boolean): void {
    if (!pv) return
    setSel((prev) => {
      const next = new Map(prev)
      for (const t of pv.tracked) {
        const k = skyKey(t)
        if (!on) next.delete(k)
        else if (next.size < max) next.set(k, t)
      }
      return next
    })
  }

  async function start(): Promise<void> {
    setStarting(true)
    setErr('')
    try {
      const st = await checkChrome()
      if (st && !st.ok && !forced) return
      await window.api.flightMon.skyscanner(props.m.id, [...sel.values()])
      props.onStarted()
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setStarting(false)
    }
  }

  const money = (minor: number | undefined | null): string | null => (minor != null && pv ? formatMoney({ amountMinor: minor, currency: pv.currency }) : null)
  const sessions = pv ? Math.ceil(sel.size / pv.perSession) : 0

  return (
    <Modal
      title="Buscar no Skyscanner (Claude + Chrome)"
      size="wide"
      onClose={props.onClose}
      footer={
        <>
          <span className="fm-grow fm-small">
            {sel.size} de no máx. {max} · {sessions} sessão(ões) do Claude de até {pv?.perSession ?? 5} combinações, uma após a outra. Acompanhe pelo Chrome.
          </span>
          <button className="btn btn-primary btn-sm" disabled={starting || !sel.size || !!pv?.busy || (!!chrome && !chrome.ok && !forced)} onClick={start} type="button">
            {starting ? 'Iniciando…' : `Pesquisar ${sel.size} combinação(ões)`}
          </button>
        </>
      }
    >
      <div className="fm-small" style={{ marginBottom: 8 }}>
        Chrome aberto com a extensão <b>Claude in Chrome</b> conectada. Se o Skyscanner pedir verificação, o Claude para (o app não contorna) e o resto volta para a fila. Cada sessão custa ~US$ 0,10–0,25 (equivalente API) — só abrir as ferramentas do Chrome já custa isso.
      </div>
      <ChromeCheck st={chrome} checking={checking} forced={forced} onRecheck={() => void checkChrome()} onForce={() => setForced(true)} />
      {pv?.busy && <div className="fm-note warn">Já há uma busca no Chrome em andamento (uma por vez).</div>}
      {err && <div className="fm-error">{err}</div>}
      {!pv ? (
        !err && <div className="fm-muted">Montando combinações…</div>
      ) : (
        <>
          {pv.tracked.length > 0 && (
            <div className="fm-note" style={{ margin: '4px 0 8px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="fm-grow">
                <b>{pv.tracked.length}</b> combinação(ões) acompanhada(s) — {pv.tracked.filter((t) => sel.has(skyKey(t))).length} marcada(s). Tudo que você pesquisa entra na aba Acompanhadas.
              </span>
              <button className="fm-linkbtn" type="button" onClick={() => setTracked(true)}>
                marcar acompanhadas
              </button>
              <button className="fm-linkbtn" type="button" onClick={() => setTracked(false)}>
                desmarcar
              </button>
            </div>
          )}

          <div className="fm-row" style={{ margin: '4px 0 6px' }}>
            <span className="fm-label" style={{ margin: 0 }}>
              Rotas
            </span>
            <span className="fm-small fm-grow">
              marcar a rota marca as {pv.dates.length} data(s) do intervalo{pv.datesTotal > pv.dates.length ? ` (de ${pv.datesTotal}; estreite a duração para ver todas)` : ''} · desmarque as que não quiser
            </span>
            <button className="fm-linkbtn" type="button" disabled={!sel.size} onClick={() => (setSel(new Map()), setNotice(''))}>
              limpar tudo
            </button>
          </div>
          {restored > 0 && (
            <div className="fm-small" style={{ marginBottom: 6 }}>
              ↺ {restored} combinação(ões) da última vez já marcada(s).
            </div>
          )}
          {notice && <div className="fm-note warn" style={{ marginBottom: 6 }}>{notice}</div>}

          <div className="fm-sky-list fm-sky-routes" ref={listRef}>
            {shown.length === 0 && <div className="fm-muted" style={{ padding: 8 }}>Nenhuma rota sugerida — adicione abaixo.</div>}
            {shown.map((pk) => {
              const [o, d] = pk.split('|')
              const st = routeState(pk)
              const combos = routeCombos(pk)
              const n = combos.filter((c) => sel.has(skyKey(c))).length
              const isOpen = open.has(pk)
              const best = money(routeBest.get(pk))
              return (
                <div className={`fm-sky-routebox ${st !== 'none' ? 'on' : ''}`} key={pk}>
                  <div className="fm-sky-row">
                    <TriCheck state={st} disabled={st === 'none' && full} onChange={() => setRoute(pk, st === 'none')} label={`Rota ${o} → ${d}`} />
                    <span className="fm-sky-route" onClick={() => toggleOpen(pk)}>
                      <b>{names.get(o) ?? o}</b> → {names.get(d) ?? d}
                    </span>
                    {suggested.indexOf(pk) >= 0 && suggested.indexOf(pk) < SUGGESTED_ROUTES && <span className="fm-pill outline">sugerida</span>}
                    {best && <span className="fm-pill ok" title="Melhor tarifa já vista nesta rota">{best}</span>}
                    <span className="fm-sky-date">
                      {n}/{combos.length} datas
                    </span>
                    <button className="fm-linkbtn fm-sky-caret" type="button" onClick={() => toggleOpen(pk)} aria-expanded={isOpen} title={isOpen ? 'Esconder datas' : 'Ver datas'}>
                      {isOpen ? '▴' : '▾'}
                    </button>
                  </div>
                  {isOpen && (
                    <div className="fm-datechips fm-sky-routedates">
                      {combos.map((p) => {
                        const k = skyKey(p)
                        const on = sel.has(k)
                        const pr = money(pv.known[k])
                        const rc = pv.recent[k]
                        return (
                          <button
                            key={k}
                            type="button"
                            className={`fm-datechip ${on ? 'on' : ''} ${rc ? 'recent' : ''}`}
                            disabled={!on && full}
                            onClick={() => toggle(p)}
                            title={rc ? `Consultado no Skyscanner às ${new Date(rc).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : undefined}
                          >
                            <span>{dateText(p)}</span>
                            <small>{pr ?? (rc ? 'consultado' : ' ')}</small>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="fm-label" style={{ margin: '12px 0 6px' }}>
            Adicionar outra rota ({pv.pairs.length} possíveis)
          </div>
          <div className="fm-sky-pick">
            <PlacePicker places={pv.origins} value={origin} onChange={(o) => (setOrigin(o), setDest(''))} placeholder="Buscar origem (cidade, país ou IATA)" />
            <span className="fm-muted">→</span>
            <PlacePicker places={destOptions} value={dest} onChange={(d) => addRoute(origin, d)} placeholder={origin ? 'Buscar destino (cidade, país ou IATA)' : 'Escolha a origem primeiro'} />
          </div>
          <div className="fm-small" style={{ marginTop: 4 }}>
            Ao escolher o destino, a rota entra na lista acima com todas as datas marcadas.
          </div>

          {sel.size > 0 && (
            <>
              <div className="fm-label" style={{ margin: '12px 0 6px' }}>
                Selecionadas ({sel.size})
              </div>
              <div className="fm-chips">
                {[...sel.entries()].map(([k, p]) => (
                  <span className="fm-chip" key={k}>
                    {p.origin}→{p.destination} {dateText(p)}
                    <button className="fm-x" type="button" onClick={() => toggle(p, false)} aria-label="Remover">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  )
}

/** Seleção guardada da última vez, só com o que ainda vale (rota do monitor, data no intervalo). */
function validSaved(pv: SkyPreview, raw: string | null): SkyPick[] {
  try {
    const arr: unknown = JSON.parse(raw || '[]')
    if (!Array.isArray(arr)) return []
    const pairs = new Set(pv.pairs)
    const dates = new Set(pv.dates.map((d) => `${d.depart}|${d.ret ?? '-'}`))
    return (arr as SkyPick[]).filter(
      (c) => c && typeof c.origin === 'string' && pairs.has(pairKey(c.origin, c.destination)) && dates.has(`${c.depart}|${c.ret ?? '-'}`)
    ).map((c) => ({ origin: c.origin, destination: c.destination, depart: c.depart, ret: c.ret ?? null }))
  } catch {
    return []
  }
}

/** Todas as datas do intervalo para uma rota. */
function datesFor(pv: SkyPreview, origin: string, destination: string): SkyPick[] {
  return pv.dates.map((d) => ({ origin, destination, depart: d.depart, ret: d.ret }))
}
