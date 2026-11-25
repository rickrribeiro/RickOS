import React, { useEffect, useState } from 'react'
import { useUIStore } from '../../../store/uiStore'
import { StudyTopic, StudyTopicHours } from '../../../types'
import { useStudyStore } from '../store/studyStore'
import { TopicEditor, TOPIC_STATUS_LABEL } from '../components/TopicEditor'
import { StudySearch } from '../components/StudySearch'
import { t as tr } from '../../../i18n'

interface Progress {
  done: number
  total: number
  cards: number
}

export function EstudosDashboardPage(): React.ReactElement {
  const { setPage } = useUIStore()
  const { topics, refreshTopics, setActiveTopic, removeTopic, dueCards, refreshDue } = useStudyStore()
  const [progress, setProgress] = useState<Record<number, Progress>>({})
  const [hours, setHours] = useState<StudyTopicHours[]>([])
  const [editing, setEditing] = useState<StudyTopic | null>(null)
  const [creating, setCreating] = useState(false)

  async function loadProgress(): Promise<void> {
    const entries = await Promise.all(
      topics.map(async (t) => {
        const [nodes, cards] = await Promise.all([window.api.study.nodes(t.id), window.api.study.flashcards(t.id)])
        return [t.id, { done: nodes.filter((n) => n.status === 'done').length, total: nodes.length, cards: cards.length }] as const
      })
    )
    setProgress(Object.fromEntries(entries))
  }

  useEffect(() => {
    refreshTopics()
    refreshDue()
    window.api.tasks.studyHours().then(setHours)
  }, [])

  useEffect(() => {
    if (topics.length) loadProgress()
  }, [topics])

  async function openTopic(id: number): Promise<void> {
    await setActiveTopic(id)
    setPage('estudos-topic')
  }

  async function importTopic(kind: 'json' | 'folder'): Promise<void> {
    const r = kind === 'json' ? await window.api.study.importJson() : await window.api.study.importFolder()
    if (r.ok) {
      await refreshTopics()
      if (r.topicId) await openTopic(r.topicId)
    } else if (r.error) {
      alert(tr('estudos.falhaAoImportar', { error: r.error }))
    }
  }

  const activeTopics = topics.filter((t) => t.status === 'studying').length
  const totalDone = Object.values(progress).reduce((s, p) => s + p.done, 0)

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{tr('estudos.estudos')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {tr('estudos.topicosRoadmapAnotacoesFlashcardsRevisao')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setPage('estudos-review')}>
            {tr('estudos.revisoes2', { count: dueCards.length })}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => importTopic('json')} title={tr('estudos.importarBackupJsonDeUm')}>{tr('estudos.json')}</button>
          <button className="btn btn-secondary btn-sm" onClick={() => importTopic('folder')} title={tr('estudos.importarPastaMarkdownObsidian')}>{tr('estudos.pasta')}</button>
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>{tr('estudos.topico')}</button>
        </div>
      </div>

      <div className="cards-grid">
        <div className="stat-card">
          <div className="stat-card-label">{tr('estudos.topicosAtivos')}</div>
          <div className="stat-card-value">{activeTopics}</div>
          <div className="stat-card-sub">{topics.length} {tr('estudos.noTotal')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">{tr('estudos.itensConcluidos')}</div>
          <div className="stat-card-value">{totalDone}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">{tr('estudos.revisoesPendentes')}</div>
          <div className="stat-card-value" style={{ color: dueCards.length ? 'var(--warning, #f59e0b)' : 'var(--success)' }}>
            {dueCards.length}
          </div>
          <div className="stat-card-sub">{tr('estudos.flashcardsVencidosHoje')}</div>
        </div>
      </div>

      {hours.length > 0 && (
        <>
          <h3 className="dash-heading">{tr('estudos.horasDeFocoPorTopico')}</h3>
          <div className="chart-section">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(() => {
                const max = Math.max(...hours.map((h) => h.minutes), 1)
                return hours.map((h) => (
                  <div key={h.topicId}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 2 }}>
                      <span>{h.topicName}</span>
                      <span>{Math.floor(h.minutes / 60)}{tr('estudos.hM', { p0: h.minutes % 60 })}</span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(h.minutes / max) * 100}%` }} />
                    </div>
                  </div>
                ))
              })()}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              {tr('estudos.vinculeUmaTarefaAUm')}
            </p>
          </div>
        </>
      )}

      <h3 className="dash-heading">{tr('estudos.buscar')}</h3>
      <StudySearch />

      <h3 className="dash-heading">{tr('estudos.topicos')}</h3>
      <div className="list-stack">
        {topics.length === 0 && <div className="empty-hint">{tr('estudos.nenhumTopicoCrieOPrimeiro')}</div>}
        {topics.map((t) => {
          const p = progress[t.id] ?? { done: 0, total: 0, cards: 0 }
          const pct = p.total ? Math.round((p.done / p.total) * 100) : 0
          return (
            <div key={t.id} className="list-row">
              <span className="priority-dot" style={{ background: t.color }} />
              <button className="list-row-title" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => openTopic(t.id)}>
                {t.name}
              </button>
              {t.category && <span className="project-chip">{t.category}</span>}
              <span className="project-chip">{TOPIC_STATUS_LABEL[t.status] ?? t.status}</span>
              <div className="bar-track" style={{ width: 120 }} title={tr('estudos.concluidos', { done: p.done, total: p.total })}>
                <div className="bar-fill" style={{ width: `${pct}%`, background: t.color }} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 34, textAlign: 'right' }}>{pct}%</span>
              <span className="project-chip" title={tr('estudos.flashcards')}>🃏 {p.cards}</span>
              <div className="list-row-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => openTopic(t.id)}>{tr('estudos.abrir')}</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(t)}>{tr('estudos.editar')}</button>
                <button className="btn btn-danger btn-sm" onClick={() => window.confirm(tr('estudos.excluirETodoOConteudo', { name: t.name })) && removeTopic(t.id)}>✕</button>
              </div>
            </div>
          )
        })}
      </div>

      {(creating || editing) && <TopicEditor topic={editing} onClose={() => { setCreating(false); setEditing(null) }} />}
    </div>
  )
}
