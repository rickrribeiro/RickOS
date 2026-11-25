import React, { useState } from 'react'
import type { Project, ProjectStatus } from '../../../types'
import { useUIStore } from '../../../store/uiStore'
import { useProjectStore } from '../store/projectStore'
import { fmtDate, fmtMinutes } from '../lib/constants'
import { renderMarkdown } from '../../estudos/markdown'
import { ChangelogModal } from './ChangelogModal'
import type { ProjectCycle } from '../../../types'
import { t } from '../../../i18n'

/** Estante: projetos concluídos/encerrados e ciclos fechados — o histórico do que terminou. */
export function ProjectShelf({ projects, onStatus }: { projects: Project[]; onStatus: (p: Project, to: ProjectStatus) => void }): React.ReactElement {
  const { overview, cycles, projects: all } = useProjectStore()
  const { openProject } = useUIStore()
  const [openRetro, setOpenRetro] = useState<number | null>(null)
  const [changelog, setChangelog] = useState<ProjectCycle | null>(null)
  const done = projects.filter((p) => p.status === 'concluido').sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''))
  const dropped = projects.filter((p) => p.status === 'encerrado').sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''))
  const closedCycles = cycles.filter((c) => c.status === 'concluido').sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''))
  const name = (id: number): string => all.find((p) => p.id === id)?.name ?? '—'

  const row = (p: Project): React.ReactElement => {
    const ov = overview[p.id]
    const days = p.createdAt && p.closedAt ? Math.max(1, Math.round((new Date(p.closedAt).getTime() - new Date(p.createdAt).getTime()) / 86400000)) : null
    return (
      <div key={p.id} className="ph-shelf-item" style={{ ['--pc' as string]: p.color }}>
        <div className="ph-shelf-head">
          <button className="ph-linkbtn ph-shelf-name" onClick={() => openProject(p.id)}>{p.name}</button>
          <span className="ph-muted">{fmtDate(p.closedAt)}</span>
        </div>
        <div className="ph-muted">
          {ov ? fmtMinutes(ov.minutesTotal) : t('projects.0h')}
          {days ? t('projects.dias', { days }) : ''}
          {p.closeReason ? ` · ${p.closeReason}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          {p.retrospective && (
            <button className="btn btn-secondary btn-sm" onClick={() => setOpenRetro(openRetro === p.id ? null : p.id)}>
              {openRetro === p.id ? t('projects.ocultar') : t('projects.retrospectiva2')}
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => onStatus(p, 'fila')}>{t('projects.reabrir')}</button>
        </div>
        {openRetro === p.id && p.retrospective && <div className="md-preview-pane ph-retro-view">{renderMarkdown(p.retrospective)}</div>}
      </div>
    )
  }

  return (
    <div className="ph-shelf">
      <section>
        <h3 className="ph-section-title">{t('projects.concluidos')} <span className="kanban-count">{done.length}</span></h3>
        <div className="ph-shelf-grid">{done.length ? done.map(row) : <div className="empty-hint">{t('projects.nenhumAindaOPrimeiroVai')}</div>}</div>
      </section>
      <section>
        <h3 className="ph-section-title">{t('projects.ciclosEntregues')} <span className="kanban-count">{closedCycles.length}</span></h3>
        <div className="list-stack">
          {closedCycles.length === 0 && <div className="empty-hint">{t('projects.nenhumCicloFechado')}</div>}
          {closedCycles.map((c) => (
            <div key={c.id} className="list-row">
              <span className="list-row-title">
                <strong>{name(c.projectId)}</strong> · {c.name}
                {c.goal ? <span className="ph-muted"> — {c.goal}</span> : null}
              </span>
              <span className="ph-muted">
                {fmtDate(c.closedAt)}
                {c.extensions ? t('projects.extensaoOes', { extensions: c.extensions }) : ''}
              </span>
              <button className="btn btn-secondary btn-sm" onClick={() => setChangelog(c)}>{t('projects.changelog')}</button>
            </div>
          ))}
        </div>
      </section>
      {changelog && <ChangelogModal cycle={changelog} onClose={() => setChangelog(null)} />}
      <section>
        <h3 className="ph-section-title">{t('projects.encerrados')} <span className="kanban-count">{dropped.length}</span></h3>
        <div className="ph-shelf-grid">{dropped.length ? dropped.map(row) : <div className="empty-hint">{t('projects.nadaEncerrado')}</div>}</div>
      </section>
    </div>
  )
}
