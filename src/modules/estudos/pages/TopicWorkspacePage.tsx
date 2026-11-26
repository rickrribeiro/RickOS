import React, { useEffect, useState } from 'react'
import { useUIStore } from '../../../store/uiStore'
import { useStudyStore } from '../store/studyStore'
import { RoadmapTree } from '../components/RoadmapTree'
import { NoteEditor } from '../components/NoteEditor'
import { FlashcardPanel } from '../components/FlashcardPanel'
import { QuestionsPanel } from '../components/QuestionsPanel'
import { SourcePanel } from '../components/SourcePanel'
import { LessonPanel } from '../components/LessonPanel'
import { PlanPanel } from '../components/PlanPanel'
import { ModeloExportModal } from '../components/ModeloRoadmap'
import { QuizModal } from '../components/QuizModal'
import { MaterialPanel, NoteReview } from '../components/MaterialPanel'
import { TopicEditor } from '../components/TopicEditor'
import type { PinnedAction } from '../../../../shared/estudos'
import { t as tr } from '../../../i18n'

type Tab = 'caderno' | 'cartoes' | 'perguntas'
type Pane = 'leitura' | 'notas'
const PANE_KEY = 'rickos:studyPane'
const READER_KEY = 'rickos:studyReader'

function loadPref<T extends string>(key: string, fallback: T, allowed: T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null
    return v && allowed.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}
function savePref(key: string, v: string): void {
  try {
    localStorage.setItem(key, v)
  } catch { /* sem storage */ }
}

/**
 * Caderno do tópico. Desktop: roteiro | leitura (fonte/aula) | minhas notas. Celular: alterna
 * Leitura / Minhas notas sem perder rascunho nem posição (os dois painéis ficam montados).
 */
export function TopicWorkspacePage(): React.ReactElement {
  const { setPage } = useUIStore()
  const { topics, activeTopicId, nodes, selectedNodeId, refreshActive, refreshTopics, topicMeta, focus, clearFocus, selectNode } = useStudyStore()
  const [tab, setTab] = useState<Tab>('caderno')
  const [pane, setPane] = useState<Pane>(() => loadPref<Pane>(PANE_KEY, 'notas', ['leitura', 'notas']))
  const [reader, setReader] = useState<'on' | 'off'>(() => loadPref<'on' | 'off'>(READER_KEY, 'on', ['on', 'off']))
  const [roadmapOpen, setRoadmapOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 900)
  const [quizOpen, setQuizOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [readerTab, setReaderTab] = useState<'fontes' | 'aula' | 'material'>('fontes')
  const [subBusy, setSubBusy] = useState(false)
  const [modeloOpen, setModeloOpen] = useState(false)
  const [pinned, setPinned] = useState<PinnedAction | null>(null)
  const topic = topics.find((x) => x.id === activeTopicId) ?? null

  useEffect(() => {
    if (activeTopicId != null && !topics.some((x) => x.id === activeTopicId)) refreshTopics()
    if (activeTopicId != null) refreshActive()
    window.api.estudos.prefs().then((p) => setPinned(p.pinned))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTopicId])

  // foco vindo do Continuar / Home
  useEffect(() => {
    if (!focus) return
    if (focus.target === 'source') {
      setTab('caderno')
      setReader('on')
      setPane('leitura')
    } else if (focus.target === 'cards') {
      setTab('cartoes')
      clearFocus()
    } else if (focus.target === 'test') {
      setTab('perguntas')
      clearFocus()
    } else if (focus.target === 'lesson') {
      setTab('caderno')
      setReader('on')
      setReaderTab('aula')
      setPane('leitura')
      clearFocus()
    } else if (focus.target === 'note') {
      setTab('caderno')
      setPane('notas')
      if (focus.refId === -1) {
        setRoadmapOpen(true)
        setPlanOpen(true)
      }
      clearFocus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus])

  if (!topic || !topicMeta) {
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
  const isPinned = !!pinned && pinned.topicId === topic.id && pinned.nodeId === selectedNodeId

  async function togglePin(): Promise<void> {
    const p = isPinned ? null : { topicId: topic!.id, nodeId: selectedNodeId, target: 'note' as const, refId: null }
    await window.api.estudos.setPinned(p)
    setPinned(p)
  }

  async function runExport(fn: () => Promise<{ ok: boolean; message?: string; error?: string } | boolean>): Promise<void> {
    const r = await fn()
    if (typeof r === 'boolean') {
      if (r) alert(tr('estudos.backupJsonExportado'))
    } else if (r.ok) alert(r.message || tr('estudos.exportado'))
    else if (r.error) alert(tr('est.falha', { erro: r.error }))
  }

  function choosePane(p: Pane): void {
    setPane(p)
    savePref(PANE_KEY, p)
  }
  function toggleReader(): void {
    const v = reader === 'on' ? 'off' : 'on'
    setReader(v)
    savePref(READER_KEY, v)
  }

  return (
    <div className="module-page study-workspace-page">
      <div className="module-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setPage('estudos')}>←</button>
          <span className="priority-dot" style={{ background: topic.color }} />
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>
              {topic.name}
              {topicMeta.kind === 'language' && topicMeta.targetLanguage && <span className="project-chip" style={{ marginLeft: 8 }}>🗣 {topicMeta.targetLanguage}</span>}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {topicMeta.goal ? `${topicMeta.goal} · ` : ''}
              {tr('estudos.concluidos2', { done, count: nodes.length, pct })}
            </p>
          </div>
        </div>
        <div className="study-header-actions">
          <button className={`btn btn-sm ${isPinned ? 'btn-primary' : 'btn-secondary'}`} onClick={togglePin} title={tr('est.fixarDica')}>
            {isPinned ? tr('est.fixado') : tr('est.fixar')}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setPlanOpen(true)} title={tr('est.roteiroDica')}>{tr('est.roteiroBotao')}</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>{tr('estudos.editar')}</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setQuizOpen(true)} title={tr('estudos.gerarUmQuizAPartir')}>{tr('estudos.quiz2')}</button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={subBusy}
            title={tr('est.sugerirSubtopicosDica')}
            onClick={async () => {
              setSubBusy(true)
              try {
                await window.api.estudos.suggestSubtopics(topic.id, selectedNodeId)
                setTab('caderno')
                setReader('on')
                setReaderTab('material')
                setPane('leitura')
              } catch (e) {
                alert(e instanceof Error ? e.message : String(e))
              } finally {
                setSubBusy(false)
              }
            }}
          >
            {tr('est.sugerirSubtopicos')}
          </button>
          <details className="study-more">
            <summary className="btn btn-secondary btn-sm">{tr('est.exportar')}</summary>
            <div className="study-more-menu">
              <button className="btn btn-secondary btn-sm" onClick={() => setModeloOpen(true)} title={tr('est.modeloExportDica')}>{tr('est.modeloExportBotao')}</button>
              <button className="btn btn-secondary btn-sm" onClick={() => runExport(() => window.api.study.exportMarkdown(topic.id))}>{tr('estudos.cadernoMd')}</button>
              <button className="btn btn-secondary btn-sm" onClick={() => runExport(() => window.api.study.exportJson(topic.id))}>{tr('estudos.json2')}</button>
              <button className="btn btn-secondary btn-sm" onClick={() => runExport(() => window.api.study.exportFolder(topic.id))}>{tr('estudos.pasta2')}</button>
            </div>
          </details>
        </div>
      </div>

      <div className="study-tabs" role="tablist">
        {(['caderno', 'cartoes', 'perguntas'] as Tab[]).map((x) => (
          <button key={x} role="tab" aria-selected={tab === x} className={`study-tab ${tab === x ? 'active' : ''}`} onClick={() => setTab(x)}>
            {tr(`est.aba.${x}`)}
          </button>
        ))}
      </div>

      {/* Os painéis ficam montados (display) para manter rascunho e rolagem ao trocar de aba. */}
      <div style={{ display: tab === 'caderno' ? 'block' : 'none' }}>
        <div className={`study-notebook ${reader === 'on' ? 'with-reader' : ''} ${roadmapOpen ? '' : 'no-roadmap'}`}>
          <div className={`study-col study-col-roadmap ${roadmapOpen ? '' : 'collapsed'}`}>
            <button className="chart-title study-collapse" onClick={() => setRoadmapOpen(!roadmapOpen)} aria-expanded={roadmapOpen}>
              {roadmapOpen ? '▾' : '▸'} {tr('estudos.roadmap2')}
            </button>
            {roadmapOpen && <RoadmapTree />}
          </div>
          <div className="study-pane-switch" role="tablist">
            <button role="tab" aria-selected={pane === 'leitura'} className={`study-tab ${pane === 'leitura' ? 'active' : ''}`} onClick={() => choosePane('leitura')}>{tr('est.leituraAba')}</button>
            <button role="tab" aria-selected={pane === 'notas'} className={`study-tab ${pane === 'notas' ? 'active' : ''}`} onClick={() => choosePane('notas')}>{tr('est.minhasNotas')}</button>
          </div>
          {/* no desktop "ocultar leitura" esconde a coluna; no celular a alternância manda */}
          <div className={`study-col study-col-reader ${pane === 'leitura' ? 'pane-on' : 'pane-off'} ${reader === 'off' ? 'reader-off' : ''}`}>
            <div className="reader-tabs">
              <button className={`study-tab ${readerTab === 'fontes' ? 'active' : ''}`} onClick={() => setReaderTab('fontes')}>{tr('est.fontes')}</button>
              <button className={`study-tab ${readerTab === 'aula' ? 'active' : ''}`} onClick={() => setReaderTab('aula')}>{tr('est.aula')}</button>
              <button className={`study-tab ${readerTab === 'material' ? 'active' : ''}`} onClick={() => setReaderTab('material')}>{tr('est.material')}</button>
            </div>
            <div style={{ display: readerTab === 'fontes' ? 'block' : 'none' }}>
              <SourcePanel />
            </div>
            {readerTab === 'aula' && <LessonPanel />}
            {readerTab === 'material' && <MaterialPanel onOpenLesson={() => setReaderTab('aula')} onOpenCards={() => setTab('cartoes')} />}
          </div>
          <div className={`study-col study-col-note ${pane === 'notas' ? 'pane-on' : 'pane-off'}`}>
            <div className="chart-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{tr('est.minhasNotas')}</span>
              <button className="link-btn desktop-only" onClick={toggleReader}>{reader === 'on' ? tr('est.ocultarLeitura') : tr('est.mostrarLeituraPainel')}</button>
            </div>
            <NoteEditor />
            <NoteReview />
          </div>
        </div>
      </div>
      {tab === 'cartoes' && <FlashcardPanel />}
      {tab === 'perguntas' && <QuestionsPanel key={selectedNodeId ?? 'topic'} />}

      {quizOpen && <QuizModal topic={topic} onClose={() => setQuizOpen(false)} />}
      {modeloOpen && <ModeloExportModal topicId={topic.id} onClose={() => setModeloOpen(false)} />}
      {planOpen && (
        <PlanPanel
          topic={topicMeta}
          onClose={() => setPlanOpen(false)}
          onApproved={async (lessonId) => {
            setPlanOpen(false)
            await refreshActive()
            // abre a primeira aula (a abertura do roteiro já está lá, sem nova chamada)
            if (lessonId != null) {
              const l = await window.api.estudos.lesson(lessonId)
              await selectNode(l.lesson.nodeId)
            }
            setReader('on')
            setReaderTab('aula')
            setPane('leitura')
          }}
        />
      )}
      {editing && <TopicEditor topic={topicMeta} onClose={() => setEditing(false)} onSaved={() => { refreshTopics(); refreshActive() }} />}
    </div>
  )
}
