import React, { useCallback, useEffect, useState } from 'react'
import type { ClaudeUsageLimit, ClaudeUsageSnapshot } from '../../../../../shared/aiConversations'
import { timeAgo } from '../../../../utils/dates'
import { t as tr, getLocale } from '../../../../i18n'

const OPEN_KEY = 'rickos.runner.usageOpen'

function limitLabel(l: ClaudeUsageLimit): string {
  if (l.kind === 'session') return l.scope ? tr('ai.5h2', { scope: l.scope }) : tr('ai.limits.5h')
  return l.scope && !/^all models$/i.test(l.scope) ? tr('ai.limits.weekScope', { scope: l.scope }) : tr('ai.limits.weekly')
}

/** "3h 20min" (até 24h) ou "seg 10:00": quando o limite zera. */
function resetLabel(l: ClaudeUsageLimit): string | null {
  if (!l.resetsAt) return null
  const at = new Date(l.resetsAt)
  const min = Math.round((at.getTime() - Date.now()) / 60000)
  if (min <= 0) return tr('time.now')
  if (min < 60) return `${min}min`
  if (min < 24 * 60) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return `${h}h${m ? String(m).padStart(2, '0') : ''}`
  }
  const day = at.toLocaleDateString(getLocale(), { weekday: 'short' }).replace('.', '')
  return `${day} ${at.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' })}`
}

function updated(iso: string): string {
  const t = timeAgo(iso)
  return t === tr('time.now') ? tr('ai.limits.updatedNow') : tr('ai.limits.updatedAgo', { t })
}

const level = (p: number): string => (p >= 90 ? 'hot' : p >= 70 ? 'warm' : '')

/** Limites de 5 horas e semanal do Claude (o mesmo do `/usage`) e do Codex, por conta, com botão de atualizar. */
export function UsageLimits(): React.ReactElement {
  const [data, setData] = useState<ClaudeUsageSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(OPEN_KEY)
      if (v) return v === '1'
    } catch {
      // ignora
    }
    return window.innerWidth >= 900 // no celular começa recolhido

  })
  const [, tick] = useState(0)

  const load = useCallback(async (refresh: boolean) => {
    setLoading(true)
    setError(null)
    try {
      setData(await window.api.conv.usageLimits(refresh))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(false)
    const iv = window.setInterval(() => tick((x) => x + 1), 60_000) // "zera em…" / "há X min"
    return () => window.clearInterval(iv)
  }, [load])

  const toggle = (): void => {
    const next = !open
    setOpen(next)
    try {
      localStorage.setItem(OPEN_KEY, next ? '1' : '0')
    } catch {
      // ignora
    }
  }

  const accounts = data?.accounts ?? []
  const multi = accounts.length > 1
  const mixed = accounts.some((a) => a.provider === 'codex') && accounts.some((a) => a.provider === 'claude')
  const name = (a: ClaudeUsageSnapshot['accounts'][number]): string => (mixed && a.provider === 'claude' ? tr('ai.claude', { label: a.label }) : a.label)

  return (
    <div className="cv-usage">
      <div className="cv-usage-head">
        <button className="cv-usage-title" onClick={toggle} aria-expanded={open}>
          <span>{open ? '▾' : '▸'}</span> {tr('ai.limitesDeUso')}
          {!open &&
            accounts.map((a) => {
              const s = a.limits.find((l) => l.kind === 'session')
              const w = a.limits.find((l) => l.kind === 'week' && (!l.scope || /all models/i.test(l.scope)))
              if (!s && !w) return null
              return (
                <span key={a.configDir} className="cv-usage-mini">
                  {multi && <i>{name(a)}</i>}
                  {s && (
                    <>
                      {tr('ai.5h')} <b className={level(s.percent)}>{s.percent}%</b>
                    </>
                  )}
                  {w && (
                    <>
                      {' '}{tr('ai.sem')} <b className={level(w.percent)}>{w.percent}%</b>
                    </>
                  )}
                </span>
              )
            })}
        </button>
        <button
          className="cv-usage-refresh"
          onClick={() => void load(true)}
          disabled={loading}
          title={data ? tr('ai.cliqueParaLerOsLimites', { p0: updated(data.fetchedAt) }) : tr('ai.atualizar')}
          aria-label={tr('ai.atualizarLimites')}
        >
          <span className={loading ? 'spin' : ''}>↻</span>
        </button>
      </div>

      {open && (
        <div className="cv-usage-body">
          {error && <div className="cv-usage-err">{error}</div>}
          {!data && !error && <div className="cv-usage-note">{loading ? tr('ai.lendoOsLimites') : '—'}</div>}
          {accounts.map((a) => (
            <div key={a.configDir} className="cv-usage-acc">
              {multi && <div className="cv-usage-acc-name">{name(a)}</div>}
              {a.error && <div className="cv-usage-err">{a.error}</div>}
              {!a.error && !a.limits.length && (
                <div className="cv-usage-note">
                  {a.unavailable ? tr('ai.limitesIndisponiveisAgoraOUsage') : a.raw || tr('ai.semLimitesInformadosPeloUsage')}
                </div>
              )}
              {a.limits.map((l, i) => (
                <div key={i} className={`cv-usage-row ${level(l.percent)}`} title={l.resetsText ? tr('ai.zera', { p0: limitLabel(l), percent: l.percent, resetsText: l.resetsText }) : undefined}>
                  <span className="cv-usage-label">{limitLabel(l)}</span>
                  <span className="cv-usage-bar">
                    <span style={{ width: `${l.percent}%` }} />
                  </span>
                  <span className="cv-usage-pct">{l.percent}%</span>
                  <span className="cv-usage-reset">{resetLabel(l) ? `↺ ${resetLabel(l)}` : ''}</span>
                </div>
              ))}
              {a.staleAt && <div className="cv-usage-note">{tr('ai.ultimaLeitura')} {updated(a.staleAt).replace('atualizado ', '')} {tr('ai.oUsageNaoTrouxeOs')}</div>}
            </div>
          ))}
          {data && <div className="cv-usage-note">{updated(data.fetchedAt)}</div>}
        </div>
      )}
    </div>
  )
}
