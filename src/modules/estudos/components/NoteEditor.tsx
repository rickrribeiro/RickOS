import React, { useEffect, useRef, useState } from 'react'
import { useStudyStore } from '../store/studyStore'
import { renderMarkdown } from '../markdown'
import { t, getLocale } from '../../../i18n'
import type { AcaoTutor } from '../../../../shared/prompts/estudos/tutor'

function fmt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleString(getLocale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const TUTOR_ACTIONS: { key: AcaoTutor; label: string }[] = [
  { key: 'simple', label: t('estudos.expliqueSimples') },
  { key: 'summary', label: t('estudos.resuma') },
  { key: 'exercise', label: t('estudos.exercicio') },
  { key: 'gaps', label: t('estudos.oQueFalta') },
  { key: 'socratic', label: t('estudos.tutorSocratico') },
  { key: 'recall', label: t('estudos.revisaoAtiva') }
]

/** Split-view Markdown note editor (textarea | live preview) with debounced autosave. */
export function NoteEditor(): React.ReactElement {
  const { note, selectedNodeId, nodes, saveNote, activeTopicId } = useStudyStore()
  const [draft, setDraft] = useState(note?.content ?? '')
  const [savedAt, setSavedAt] = useState<string | null>(note?.updatedAt ?? null)
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle')
  const [whereStopped, setWhereStopped] = useState('')
  const [preview, setPreview] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const area = useRef<HTMLTextAreaElement | null>(null)
  const draftRef = useRef(draft)
  draftRef.current = draft

  // posição e "onde parei" desta nota (checkpoint no servidor: vale para os dois clientes)
  useEffect(() => {
    if (activeTopicId == null) return
    let alive = true
    window.api.estudos.checkpoint(activeTopicId, selectedNodeId, 'note', null).then((cp) => {
      if (!alive) return
      setWhereStopped(cp?.whereStopped ?? '')
      try {
        const pos = cp?.position ? JSON.parse(cp.position) : null
        const el = area.current
        if (el && typeof pos?.cursor === 'number') {
          requestAnimationFrame(() => {
            const c = Math.min(pos.cursor, el.value.length)
            el.setSelectionRange(c, c)
            if (typeof pos.scroll === 'number') el.scrollTop = pos.scroll
          })
        }
      } catch { /* posição antiga inválida */ }
    })
    return () => {
      alive = false
    }
  }, [activeTopicId, selectedNodeId, note?.id])

  function checkpoint(where?: string): void {
    if (activeTopicId == null) return
    const el = area.current
    const position = el ? JSON.stringify({ cursor: el.selectionStart, scroll: Math.round(el.scrollTop) }) : null
    if (cpTimer.current) clearTimeout(cpTimer.current)
    const topicId = activeTopicId
    const nodeId = selectedNodeId
    cpTimer.current = setTimeout(() => {
      window.api.estudos.saveCheckpoint({ topicId, nodeId, target: 'note', position, ...(where !== undefined ? { whereStopped: where } : {}) })
    }, where !== undefined ? 0 : 1500)
  }

  // IA tutor
  const [tutorRunning, setTutorRunning] = useState(false)
  const [tutorOut, setTutorOut] = useState('')
  const [tutorLabel, setTutorLabel] = useState('')
  const tutorRunId = useRef<string | null>(null)

  useEffect(() => {
    const offChunk = window.api.ai.onChunk((rid, text) => {
      if (rid && rid === tutorRunId.current) setTutorOut((o) => o + text)
    })
    const offDone = window.api.ai.onDone(({ runId: rid, ok, output, error }) => {
      if (rid !== tutorRunId.current) return
      tutorRunId.current = null
      setTutorRunning(false)
      setTutorOut(ok ? output : error || 'Falha.')
    })
    return () => {
      offChunk()
      offDone()
    }
  }, [])

  async function runTutor(acao: AcaoTutor, label: string): Promise<void> {
    const content = draft.trim()
    if (!content || tutorRunning) return
    setTutorLabel(label)
    setTutorOut('')
    setTutorRunning(true)
    try {
      const rid = await window.api.ai.start({ chamada: 'estudos.tutor', params: { acao, conteudo: content }, save: false, source: 'estudos' })
      tutorRunId.current = rid
    } catch (e) {
      setTutorRunning(false)
      setTutorOut(e instanceof Error ? e.message : String(e))
    }
  }

  function appendToNote(): void {
    const merged = `${draft.trimEnd()}\n\n## ${tutorLabel}\n${tutorOut.trim()}\n`
    onChange(merged)
    persist(merged)
    setTutorOut('')
  }

  const title = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId)?.title ?? t('estudos.item') : t('estudos.visaoGeralTopico')

  // reset when selection changes or the loaded note arrives
  useEffect(() => {
    setDraft(note?.content ?? '')
    setSavedAt(note?.updatedAt ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, note?.id])

  async function persist(v: string): Promise<void> {
    setSaveState('saving')
    try {
      await saveNote(v)
      setSavedAt(new Date().toISOString())
      // outra tecla durante o envio: continua "não salvo" até o próximo autosave
      setSaveState(draftRef.current === v ? 'saved' : 'dirty')
    } catch {
      setSaveState('error') // o rascunho continua na tela; nada se perde
    }
  }

  function onChange(v: string): void {
    setDraft(v)
    setSaveState('dirty')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => persist(v), 800)
    checkpoint()
  }

  function flush(): void {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (saveState === 'dirty' || saveState === 'error') persist(draft)
    checkpoint()
  }

  // salva ao sair da tela / trocar de nó
  useEffect(() => {
    // ids capturados aqui: no cleanup o store já aponta para o nó novo
    const topicId = activeTopicId
    const nodeId = selectedNodeId
    return () => {
      if (timer.current && topicId != null) {
        clearTimeout(timer.current)
        timer.current = null
        window.api.study.saveNote(topicId, nodeId, draftRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, activeTopicId])

  return (
    <div className="note-editor">
      <div className="note-editor-head">
        <strong>{title}</strong>
        <span className={`save-state save-${saveState}`} aria-live="polite">
          {saveState === 'saving' && t('est.salvando')}
          {saveState === 'dirty' && t('est.naoSalvo')}
          {saveState === 'error' && t('est.erroAoSalvar')}
          {(saveState === 'saved' || saveState === 'idle') && `${t('estudos.salvo')} ${fmt(savedAt)}`}
        </span>
        <button className="btn btn-secondary btn-sm" onClick={() => setPreview(!preview)}>{preview ? t('est.esconderPrevia') : t('est.mostrarPrevia')}</button>
      </div>
      <div className="where-stopped">
        <input
          value={whereStopped}
          onChange={(e) => setWhereStopped(e.target.value)}
          onBlur={() => checkpoint(whereStopped)}
          onKeyDown={(e) => e.key === 'Enter' && checkpoint(whereStopped)}
          placeholder={t('est.ondePareiPlaceholder')}
        />
      </div>
      <div className={`md-split ${preview ? '' : 'md-split-single'}`}>
        <textarea
          ref={area}
          className="md-input"
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          onBlur={flush}
          onKeyUp={() => checkpoint()}
          onClick={() => checkpoint()}
          placeholder={t('estudos.escrevaEmMarkdownTituloNegrito')}
          spellCheck={false}
        />
        {preview && (
          <div className="md-preview-pane">
            {draft.trim() ? renderMarkdown(draft) : <div className="empty-hint">{t('estudos.preVisualizacaoApareceAqui')}</div>}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('estudos.tutor')}</span>
        {TUTOR_ACTIONS.map((a) => (
          <button
            key={a.key}
            className="btn btn-secondary btn-sm"
            disabled={tutorRunning || !draft.trim()}
            title={draft.trim() ? '' : t('estudos.escrevaUmaAnotacaoPrimeiro')}
            onClick={() => runTutor(a.key, a.label)}
          >
            {a.label}
          </button>
        ))}
      </div>

      {(tutorRunning || tutorOut) && (
        <div className="chart-section" style={{ marginTop: 8 }}>
          <div className="chart-title" style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{tutorLabel}{tutorRunning ? t('estudos.pensando') : ''}</span>
            {!tutorRunning && tutorOut && (
              <span style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(tutorOut)}>{t('estudos.copiar')}</button>
                <button className="btn btn-secondary btn-sm" onClick={appendToNote}>{t('estudos.anexarANota')}</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setTutorOut('')}>{t('estudos.fechar')}</button>
              </span>
            )}
          </div>
          <div className="md-preview-pane" style={{ marginTop: 6, minHeight: 0 }}>
            {tutorOut ? renderMarkdown(tutorOut) : <div className="empty-hint">…</div>}
          </div>
        </div>
      )}
    </div>
  )
}
