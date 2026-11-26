import React, { useEffect, useRef, useState } from 'react'
import type { LessonRow, LessonView, RunRow, TurnRow } from '../../../../shared/estudos'
import { useStudyStore } from '../store/studyStore'
import { renderMarkdown } from '../markdown'
import { IaDiagnostico } from './IaSettings'
import { t } from '../../../i18n'

interface TutorPayload {
  tipo?: string
  minhaResposta?: { entendi: string; corrigir: string; proximaTentativa: string } | null
  hipoteses?: string[]
  doPlano?: boolean
}

const newKey = (): string => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)

/**
 * Aula conversacional (prompt B) do item selecionado. Abrir/reabrir lê o que está salvo (zero
 * chamadas); cada envio é UMA chamada. Notas e cartões só entram por ação minha.
 */
export function LessonPanel(): React.ReactElement {
  const { activeTopicId, selectedNodeId, refreshActive } = useStudyStore()
  const [lesson, setLesson] = useState<LessonRow | null>(null)
  const [briefing, setBriefing] = useState<LessonView['briefing']>(null)
  const [turns, setTurns] = useState<TurnRow[]>([])
  const [running, setRunning] = useState<RunRow | null>(null)
  const [lastError, setLastError] = useState<{ status: string; error: string } | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [added, setAdded] = useState<Set<number>>(new Set())
  const keyRef = useRef(newKey())

  async function load(open = false): Promise<void> {
    if (activeTopicId == null) return
    const r = open || !lesson ? await window.api.estudos.openLesson(activeTopicId, selectedNodeId) : await window.api.estudos.lesson(lesson.id)
    setLesson(r.lesson)
    setBriefing(r.briefing)
    setTurns(r.turns)
    setRunning(r.running)
    if (!r.running) {
      const runs = await window.api.estudos.iaRuns({ topicId: activeTopicId, limit: 10 })
      const last = runs.find((x) => x.operation === 'aula' && x.nodeId === r.lesson.nodeId)
      const lastTurn = r.turns[r.turns.length - 1]
      setLastError(last && lastTurn?.role === 'me' && ['error', 'invalid', 'timeout', 'canceled'].includes(last.status) ? { status: last.status, error: last.error ?? '' } : null)
    }
  }

  useEffect(() => {
    setLesson(null)
    load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTopicId, selectedNodeId])

  useEffect(() => {
    return window.api.estudos.onIa((e) => {
      if (e.operation === 'aula' && e.topicId === activeTopicId && (e.nodeId ?? null) === (selectedNodeId ?? null)) load()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTopicId, selectedNodeId, lesson?.id])

  // turno novo do tutor: rola até o COMEÇO dele (respostas longas se leem de cima); enviando: rola ao fim
  const turnsBox = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const box = turnsBox.current
    if (!box) return
    if (running) {
      box.scrollTop = box.scrollHeight
      return
    }
    const ultimos = box.querySelectorAll<HTMLElement>('.lesson-turn.tutor')
    const alvo = ultimos[ultimos.length - 1]
    if (alvo) box.scrollTop = alvo.offsetTop - 4 // .lesson-turns é position: relative
    else box.scrollTop = box.scrollHeight
  }, [turns.length, running])

  async function send(msg?: string): Promise<void> {
    if (!lesson) return
    const body = (msg ?? text).trim()
    if (!body) return
    setError('')
    try {
      const r = await window.api.estudos.sendTurn(lesson.id, body, keyRef.current)
      keyRef.current = newKey() // próxima mensagem, nova chave (a mesma chave = mesmo envio)
      setText('')
      setRunning(r.status === 'running' ? r : null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function addToNote(turn: TurnRow): Promise<void> {
    if (activeTopicId == null) return
    await window.api.estudos.appendToNote(activeTopicId, selectedNodeId, turn.content)
    setAdded(new Set([...added, turn.id]))
    refreshActive()
  }

  if (!lesson) return <div className="empty-hint">…</div>

  return (
    <div className="lesson-panel">
      <div className="lesson-head">
        <strong>{lesson.title}</strong>
        {lesson.resumePhrase && <span className="study-hint">↩ {lesson.resumePhrase}</span>}
        {briefing && (
          <details className="lesson-brief">
            <summary className="study-hint">{t('est.briefingDaAula')}</summary>
            <pre>{briefing.request}</pre>
          </details>
        )}
      </div>
      <div className="lesson-turns" ref={turnsBox}>
        {!turns.length && (
          <div className="empty-hint">
            {t('est.aulaVazia')}
            <div style={{ marginTop: 8 }}>
              <button className="btn btn-primary btn-sm" disabled={!!running} onClick={() => send(t('est.comecarAulaMsg'))}>{t('est.comecarAula')}</button>
            </div>
          </div>
        )}
        {turns.map((turn) => {
          let p: TutorPayload = {}
          try {
            p = turn.payload ? JSON.parse(turn.payload) : {}
          } catch { /* payload antigo */ }
          return (
            <div key={turn.id} className={`lesson-turn ${turn.role}`}>
              <div className="lesson-turn-role">{turn.role === 'me' ? t('est.eu') : p.doPlano ? t('est.tutorAbertura') : t('est.tutor')}</div>
              {turn.role === 'tutor' && p.minhaResposta && (
                <div className="lesson-feedback">
                  <div><strong>{t('est.entendi')}</strong> {p.minhaResposta.entendi}</div>
                  <div><strong>{t('est.corrigir')}</strong> {p.minhaResposta.corrigir}</div>
                  <div><strong>{t('est.proximaTentativa')}</strong> {p.minhaResposta.proximaTentativa}</div>
                </div>
              )}
              <div className="md-preview-pane">{renderMarkdown(turn.content)}</div>
              {turn.role === 'tutor' && p.hipoteses && p.hipoteses.length > 0 && <div className="study-hint">{t('est.hipoteses')} {p.hipoteses.join(' · ')}</div>}
              {turn.role === 'tutor' && (
                <div className="lesson-turn-actions">
                  <button className="link-btn" disabled={added.has(turn.id)} onClick={() => addToNote(turn)}>{added.has(turn.id) ? t('est.adicionadoNota') : t('est.adicionarNota')}</button>
                </div>
              )}
            </div>
          )
        })}
        {running && (
          <div className="lesson-turn tutor pending">
            {t('est.tutorPensando')} <button className="link-btn" onClick={() => window.api.estudos.iaCancel(running.id).then(() => load())}>{t('est.cancelar')}</button>
          </div>
        )}
        {lastError && !running && (
          <div className="study-error">
            {t(`est.run.${lastError.status}` as 'est.run.error', { erro: lastError.error })}{' '}
            <button className="btn btn-secondary btn-sm" onClick={() => lesson && window.api.estudos.retryTurn(lesson.id).then(() => load())}>{t('est.tentarDeNovo')}</button>
            <IaDiagnostico />
          </div>
        )}
      </div>
      {lesson.openQuestion && <div className="lesson-open">❓ {lesson.openQuestion}</div>}
      <div className="lesson-input">
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send()
          }}
          placeholder={t('est.aulaPlaceholder')}
          disabled={!!running}
        />
        <button className="btn btn-primary btn-sm" disabled={!!running || !text.trim()} onClick={() => send()}>{t('est.enviar')}</button>
      </div>
      <p className="study-hint">{t('est.aulaUmaChamada')}</p>
      {error && <div className="study-error">{error}</div>}
    </div>
  )
}
