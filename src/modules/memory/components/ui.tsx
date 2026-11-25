import React, { useEffect, useRef, useState } from 'react'
import type { MemoryCategory, MemoryStatus, MemoryType, PersonalMemory, Reliability, Sensitivity } from '../../../../shared/memory'
import { RELIABILITY_LABEL, SENSITIVITY_LABEL, STATUS_LABEL, TYPE_LABEL } from '../../../../shared/memory'
import type { JobView } from '../api'
import { t as tr, getLocale } from '../../../i18n'

export function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return withTime ? d.toLocaleString(getLocale(), { dateStyle: 'short', timeStyle: 'short' }) : d.toLocaleDateString(getLocale())
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const s = (Date.now() - Date.parse(iso)) / 1000
  if (s < 60) return tr('time.now')
  if (s < 3600) return tr('time.ago.min', { n: Math.floor(s / 60) })
  if (s < 86400) return tr('time.ago.h', { n: Math.floor(s / 3600) })
  if (s < 86400 * 30) return tr('time.ago.d', { n: Math.floor(s / 86400) })
  return fmtDate(iso)
}

export function TypeChip({ type }: { type: MemoryType }): React.ReactElement {
  return <span className={`mem-chip${type === 'INFERENCE' ? ' warn' : type === 'INSTRUCTION' ? ' accent' : ''}`}>{TYPE_LABEL[type]}</span>
}

export function SensChip({ s }: { s: Sensitivity }): React.ReactElement | null {
  if (s === 'NORMAL') return null
  return (
    <span className={`mem-chip ${s === 'RESTRICTED' ? 'danger' : 'warn'}`} title={tr('memory.sensibilidadeEfetivaMemoriaOuCategoria')}>
      {s === 'RESTRICTED' ? '🔒' : '🔐'} {SENSITIVITY_LABEL[s]}
    </span>
  )
}

export function StatusChip({ status }: { status: MemoryStatus }): React.ReactElement | null {
  if (status === 'active') return null
  return <span className={`mem-chip${status === 'unconfirmed' || status === 'outdated' ? ' warn' : ''}`}>{STATUS_LABEL[status]}</span>
}

export function ReliabilityChip({ r }: { r: Reliability }): React.ReactElement | null {
  if (r === 'stated') return null
  return <span className={`mem-chip${r === 'inferred' ? ' warn' : ''}`}>{RELIABILITY_LABEL[r]}</span>
}

export function CategoryLabel({ cats, id }: { cats: MemoryCategory[]; id: number | null }): React.ReactElement {
  const c = cats.find((x) => x.id === id)
  return <span className="mem-chip">{c ? `${c.icon} ${c.name}` : tr('memory.semCategoria')}</span>
}

export function MemoryCard({ m, cats, onOpen }: { m: PersonalMemory; cats: MemoryCategory[]; onOpen: (id: number) => void }): React.ReactElement {
  const dim = m.status !== 'active'
  return (
    <button className={`mem-card${dim ? ' dim' : ''}`} onClick={() => onOpen(m.id)}>
      <div className="mem-card-title">
        {m.pinned && <span title={tr('memory.fixada')}>📌</span>}
        <span>{m.title}</span>
      </div>
      {m.content.trim() !== m.title.trim() && m.content.trim() !== `${m.title.trim()}.` && <div className="mem-card-body">{m.content}</div>}
      <div className="mem-meta">
        <CategoryLabel cats={cats} id={m.categoryId} />
        <TypeChip type={m.type} />
        <StatusChip status={m.status} />
        <SensChip s={m.effectiveSensitivity} />
        <ReliabilityChip r={m.reliability} />
        {m.tags.map((t) => (
          <span key={t} className="mem-chip tag">
            #{t}
          </span>
        ))}
        <span className="mem-muted" style={{ marginLeft: 'auto' }}>
          {m.useCount > 0 ? tr('memory.usada', { useCount: m.useCount }) : ''}
          {relTime(m.updatedAt)}
        </span>
      </div>
    </button>
  )
}

export function Modal({ title, onClose, children, wide }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }): React.ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal mem-modal" style={wide ? { maxWidth: 880 } : undefined} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="mem-detail-head">
          <h2 style={{ margin: 0, fontSize: 16 }}>{title}</h2>
          <button className="btn btn-secondary btn-sm" onClick={onClose} aria-label={tr('memory.fechar')}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }): React.ReactElement {
  return (
    <div className="mem-empty">
      <div className="big">{icon}</div>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  )
}

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

const JOB_LABEL: Record<string, string> = {
  text: tr('memory.organizandoOTextoEmMemorias'),
  analyze: tr('memory.analisandoSuasMemorias'),
  consolidation: tr('memory.consolidandoMemorias'),
  migration: tr('memory.migrandoABaseDeConhecimento'),
  'import-md': tr('memory.extraindoMemoriasDoMarkdown'),
  gaps: tr('memory.procurandoLacunas'),
  'gap-answer': tr('memory.lendoSuaResposta'),
  agent_batch: tr('memory.memoryAgentProcessandoEventos')
}
export const jobLabel = (k: string): string => JOB_LABEL[k] ?? k

/** Acompanha um job em background (eventos SSE + polling de reserva). */
export function useJob(onDone?: (j: JobView) => void): { job: JobView | null; track: (id: number) => void; clear: () => void } {
  const [job, setJob] = useState<JobView | null>(null)
  const idRef = useRef<number | null>(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  useEffect(() => {
    const finish = (j: JobView): void => {
      setJob(j)
      if (j.status === 'done' || j.status === 'failed') {
        idRef.current = null
        doneRef.current?.(j)
      }
    }
    const off = window.api.memory.onJob((p) => {
      if (p.id === idRef.current) window.api.memory.job(p.id).then((j) => j && finish(j))
    })
    const t = setInterval(() => {
      if (idRef.current) window.api.memory.job(idRef.current).then((j) => j && finish(j))
    }, 4000)
    return () => {
      off()
      clearInterval(t)
    }
  }, [])
  return {
    job,
    track: (id: number) => {
      idRef.current = id
      setJob({ id, kind: '', status: 'running', attempts: 0, error: null, stats: {}, createdAt: '', startedAt: null, finishedAt: null })
      window.api.memory.job(id).then((j) => j && setJob(j))
    },
    clear: () => setJob(null)
  }
}

export function JobBanner({ job, onClose }: { job: JobView | null; onClose: () => void }): React.ReactElement | null {
  if (!job) return null
  if (job.status === 'running' || job.status === 'queued')
    return (
      <div className="mem-job" role="status">
        <span className="mem-spin" /> {tr('memory.issoPodeLevarAlgunsSegundos', { p0: jobLabel(job.kind) })}
      </div>
    )
  if (job.status === 'failed')
    return (
      <div className="mem-job err" role="alert">
        ⚠️ {job.error ?? tr('memory.falhou')}{' '}
        <button className="btn btn-secondary btn-sm" onClick={onClose}>
          {tr('memory.ok')}
        </button>
      </div>
    )
  const st = job.stats as { proposed?: number; created?: number; suggested?: number; skipped?: string; calls?: number }
  const n = st.proposed ?? st.suggested ?? st.created ?? 0
  return (
    <div className="mem-job" role="status">
      ✅ {jobLabel(job.kind)}: {st.skipped ? st.skipped : n ? tr('memory.sugestaoOesNoInbox', { n }) : tr('memory.nadaNovoQueValhaLembrar')}.
      <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ marginLeft: 'auto' }}>
        {tr('memory.ok')}
      </button>
    </div>
  )
}

/** Recarrega quando o servidor avisa que algo mudou na memória. */
export function useMemoryRefresh(fn: () => void): void {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => window.api.memory.onUpdated(() => ref.current()), [])
}
