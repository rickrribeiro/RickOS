import React, { useEffect, useState } from 'react'
import { useUIStore } from '../../../store/uiStore'
import { useStudyStore } from '../store/studyStore'
import { RoadmapTree } from '../components/RoadmapTree'
import { NoteEditor } from '../components/NoteEditor'
import { FlashcardPanel } from '../components/FlashcardPanel'
import { QuizModal } from '../components/QuizModal'
import { GapsModal } from '../components/GapsModal'
import { t as tr } from '../../../i18n'

export function TopicWorkspacePage(): React.ReactElement {
  const { setPage } = useUIStore()
  const { topics, activeTopicId, nodes, refreshActive, refreshTopics } = useStudyStore()
  const [quizOpen, setQuizOpen] = useState(false)
  const [gapsOpen, setGapsOpen] = useState(false)
  const topic = topics.find((t) => t.id === activeTopicId) ?? null

  useEffect(() => {
    if (!topics.length) refreshTopics()
    if (activeTopicId != null) refreshActive()
  }, [activeTopicId])

  if (!topic) {
    return (
      <div className="module-page">
        <div className="empty-hint">
          {tr('estudos.nenhumTopicoSelecionado')} <button className="btn btn-secondary btn-sm" onClick={() => setPage('estudos')}>{tr('estudos.voltarAosEstudos')}</button>
        </div>
      </div>
    )
  }

  const done = nodes.filter((n) => n.status === 'done').length
  const pct = nodes.length ? Math.round((done / nodes.length) * 100) : 0

  async function runExport(fn: () => Promise<{ ok: boolean; message?: string; error?: string } | boolean>): Promise<void> {
    const r = await fn()
    if (typeof r === 'boolean') {
      if (r) alert(tr('estudos.backupJsonExportado'))
    } else if (r.ok) alert(r.message || tr('estudos.exportado'))
    else if (r.error) alert('Falha: ' + r.error)
  }

  return (
    <div className="module-page">
      <div className="module-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setPage('estudos')}>←</button>
          <span className="priority-dot" style={{ background: topic.color }} />
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>{topic.name}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {tr('estudos.concluidos2', { done, count: nodes.length, pct })}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={() => setQuizOpen(true)} title={tr('estudos.gerarUmQuizAPartir')}>{tr('estudos.quiz2')}</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setGapsOpen(true)} title={tr('estudos.detectarPreRequisitosItensFaltando')}>{tr('estudos.lacunas')}</button>
          <button className="btn btn-secondary btn-sm" onClick={() => runExport(() => window.api.study.exportMarkdown(topic.id))} title={tr('estudos.gerarCadernoMdDoTopico')}>{tr('estudos.cadernoMd')}</button>
          <button className="btn btn-secondary btn-sm" onClick={() => runExport(() => window.api.study.exportJson(topic.id))} title={tr('estudos.backupJsonDoTopico')}>{tr('estudos.json2')}</button>
          <button className="btn btn-secondary btn-sm" onClick={() => runExport(() => window.api.study.exportFolder(topic.id))} title={tr('estudos.exportarPastaMarkdownObsidian')}>{tr('estudos.pasta2')}</button>
        </div>
      </div>

      <div className="study-workspace">
        <div className="study-col study-col-roadmap">
          <div className="chart-title">{tr('estudos.roadmap2')}</div>
          <RoadmapTree />
        </div>
        <div className="study-col study-col-note">
          <div className="chart-title">{tr('estudos.anotacoes')}</div>
          <NoteEditor />
        </div>
        <div className="study-col study-col-cards">
          <div className="chart-title">{tr('estudos.flashcards2')}</div>
          <FlashcardPanel />
        </div>
      </div>

      {quizOpen && <QuizModal topic={topic} onClose={() => setQuizOpen(false)} />}
      {gapsOpen && <GapsModal topic={topic} onClose={() => setGapsOpen(false)} />}
    </div>
  )
}
