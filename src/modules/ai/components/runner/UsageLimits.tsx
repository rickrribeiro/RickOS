import React, { useCallback, useEffect, useState } from 'react'
import type { ClaudeUsageLimit, ClaudeUsageSnapshot } from '../../../../../shared/aiConversations'
import { timeAgo } from '../../../../utils/dates'

const OPEN_KEY = 'rickos.runner.usageOpen'

function limitLabel(l: ClaudeUsageLimit): string {
  if (l.kind === 'session') return l.scope ? `5h · ${l.scope}` : '5 horas'
  return l.scope && !/^all models$/i.test(l.scope) ? `Sem. ${l.scope}` : 'Semanal'
}

/** "3h 20min" (até 24h) ou "seg 10:00": quando o limite zera. */
function resetLabel(l: ClaudeUsageLimit): string | null {
  if (!l.resetsAt) return null
  const at = new Date(l.resetsAt)
  const min = Math.round((at.getTime() - Date.now()) / 60000)
  if (min <= 0) return 'agora'
  if (min < 60) return `${min}min`
  if (min < 24 * 60) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return `${h}h${m ? String(m).padStart(2, '0') : ''}`
  }
  const day = at.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  return `${day} ${at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

function updated(iso: string): string {
  const t = timeAgo(iso)
  return t === 'agora' ? 'atualizado agora' : `atualizado há ${t}`
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
  const name = (a: ClaudeUsageSnapshot['accounts'][number]): string => (mixed && a.provider === 'claude' ? `Claude · ${a.label}` : a.label)

  return (
    <div className="cv-usage">
      <div className="cv-usage-head">
        <button className="cv-usage-title" onClick={toggle} aria-expanded={open}>
          <span>{open ? '▾' : '▸'}</span> Limites de uso
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
                      5h <b className={level(s.percent)}>{s.percent}%</b>
                    </>
                  )}
                  {w && (
                    <>
                      {' '}sem <b className={level(w.percent)}>{w.percent}%</b>
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
          title={data ? `${updated(data.fetchedAt)} · clique para ler os limites de novo` : 'Atualizar'}
          aria-label="Atualizar limites"
        >
          <span className={loading ? 'spin' : ''}>↻</span>
        </button>
      </div>

      {open && (
        <div className="cv-usage-body">
          {error && <div className="cv-usage-err">{error}</div>}
          {!data && !error && <div className="cv-usage-note">{loading ? 'Lendo os limites…' : '—'}</div>}
          {accounts.map((a) => (
            <div key={a.configDir} className="cv-usage-acc">
              {multi && <div className="cv-usage-acc-name">{name(a)}</div>}
              {a.error && <div className="cv-usage-err">{a.error}</div>}
              {!a.error && !a.limits.length && <div className="cv-usage-note">{a.raw || 'Sem limites informados pelo /usage.'}</div>}
              {a.limits.map((l, i) => (
                <div key={i} className={`cv-usage-row ${level(l.percent)}`} title={l.resetsText ? `${limitLabel(l)}: ${l.percent}% · zera ${l.resetsText}` : undefined}>
                  <span className="cv-usage-label">{limitLabel(l)}</span>
                  <span className="cv-usage-bar">
                    <span style={{ width: `${l.percent}%` }} />
                  </span>
                  <span className="cv-usage-pct">{l.percent}%</span>
                  <span className="cv-usage-reset">{resetLabel(l) ? `↺ ${resetLabel(l)}` : ''}</span>
                </div>
              ))}
            </div>
          ))}
          {data && <div className="cv-usage-note">{updated(data.fetchedAt)}</div>}
        </div>
      )}
    </div>
  )
}
