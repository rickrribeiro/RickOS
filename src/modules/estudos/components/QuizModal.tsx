import React, { useEffect, useRef, useState } from 'react'
import { StudyTopic, StudyQuizAttempt } from '../../../types'
import { t, getLocale } from '../../../i18n'
import { promptQuiz } from '../../../../shared/prompts/estudos/quiz'

interface Question {
  question: string
  options: string[]
  answerIndex: number
}

function extractQuiz(raw: string): Question[] | null {
  if (!raw) return null
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const first = s.indexOf('[')
  const last = s.lastIndexOf(']')
  if (first >= 0 && last > first) s = s.slice(first, last + 1)
  try {
    const v = JSON.parse(s)
    if (!Array.isArray(v)) return null
    return v
      .map((q: Record<string, unknown>) => ({
        question: String(q.question ?? '').trim(),
        options: Array.isArray(q.options) ? q.options.map((o) => String(o)) : [],
        answerIndex: Number(q.answerIndex)
      }))
      .filter((q) => q.question && q.options.length >= 2 && q.answerIndex >= 0 && q.answerIndex < q.options.length)
  } catch {
    return null
  }
}

type Phase = 'setup' | 'generating' | 'taking' | 'result'

export function QuizModal({ topic, onClose }: { topic: StudyTopic; onClose: () => void }): React.ReactElement {
  const [phase, setPhase] = useState<Phase>('setup')
  const [error, setError] = useState('')
  const [questions, setQuestions] = useState<Question[]>([])
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [attempts, setAttempts] = useState<StudyQuizAttempt[]>([])
  const runId = useRef<string | null>(null)
  const startedAt = useRef<number>(0)

  useEffect(() => {
    window.api.study.quizAttempts(topic.id).then(setAttempts)
    const offDone = window.api.ai.onDone(({ runId: rid, ok, output, error: err }) => {
      if (rid !== runId.current) return
      runId.current = null
      if (!ok) {
        setError(err || t('estudos.falhaAoGerarQuiz'))
        setPhase('setup')
        return
      }
      const qs = extractQuiz(output)
      if (!qs || !qs.length) {
        setError(t('estudos.aIaNaoDevolveuUm'))
        setPhase('setup')
        return
      }
      setQuestions(qs)
      setAnswers(new Array(qs.length).fill(-1))
      setCurrent(0)
      startedAt.current = Date.now()
      setPhase('taking')
    })
    return offDone
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function generate(): Promise<void> {
    setError('')
    // gather the topic's notes as source material
    const [nodes, notes] = await Promise.all([window.api.study.nodes(topic.id), window.api.study.allNotes()])
    const topicNotes = notes.filter((n) => n.topicId === topic.id && n.content.trim())
    if (topicNotes.length === 0) {
      setError(t('estudos.semAnotacoesNesteTopicoPara'))
      return
    }
    const nodeTitle = (id: number | null): string => (id == null ? topic.name : nodes.find((n) => n.id === id)?.title ?? '')
    const material = topicNotes.map((n) => `## ${nodeTitle(n.nodeId)}\n${n.content}`).join('\n\n')
    setPhase('generating')
    const prompt = promptQuiz({ topico: topic.name, material: material.slice(0, 12000) })
    try {
      const rid = await window.api.ai.start({ prompt, chamada: 'estudos.quiz', save: false, source: 'estudos' })
      runId.current = rid
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('setup')
    }
  }

  function choose(optIdx: number): void {
    setAnswers((prev) => {
      const next = [...prev]
      next[current] = optIdx
      return next
    })
  }

  async function finish(): Promise<void> {
    const score = questions.reduce((s, q, i) => s + (answers[i] === q.answerIndex ? 1 : 0), 0)
    const durationMs = Date.now() - startedAt.current
    await window.api.study.saveQuizAttempt(topic.id, score, questions.length, durationMs)
    setAttempts(await window.api.study.quizAttempts(topic.id))
    setPhase('result')
  }

  const q = questions[current]
  const score = questions.reduce((s, qq, i) => s + (answers[i] === qq.answerIndex ? 1 : 0), 0)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 460, maxWidth: 620 }}>
        <h2>{t('estudos.quiz')} {topic.name}</h2>

        {phase === 'setup' && (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {t('estudos.geraUmQuizDeMultipla')}
            </p>
            {error && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>{error}</div>}
            {attempts.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="chart-title" style={{ fontSize: 13 }}>{t('estudos.historico')}</div>
                <div className="list-stack" style={{ marginTop: 6 }}>
                  {attempts.slice(0, 6).map((a) => (
                    <div key={a.id} className="list-row">
                      <span className="list-row-title">{new Date(a.createdAt).toLocaleString(getLocale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="project-chip">{a.score}/{a.total} · {a.total ? Math.round((a.score / a.total) * 100) : 0}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={onClose}>{t('estudos.fechar')}</button>
              <button className="btn btn-primary btn-sm" onClick={generate}>{t('estudos.gerarQuiz')}</button>
            </div>
          </>
        )}

        {phase === 'generating' && <div className="empty-hint" style={{ padding: 30 }}>{t('estudos.gerandoQuiz')}</div>}

        {phase === 'taking' && q && (
          <>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('estudos.questaoDe', { p0: current + 1 })} {questions.length}</p>
            <div style={{ fontSize: 15, fontWeight: 600, margin: '8px 0 12px' }}>{q.question}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {q.options.map((opt, i) => (
                <button
                  key={i}
                  className={`btn btn-sm ${answers[current] === i ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                  onClick={() => choose(i)}
                >
                  {String.fromCharCode(65 + i)}. {opt}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              {current > 0 && <button className="btn btn-secondary btn-sm" onClick={() => setCurrent((c) => c - 1)}>{t('estudos.voltar')}</button>}
              {current < questions.length - 1 ? (
                <button className="btn btn-primary btn-sm" onClick={() => setCurrent((c) => c + 1)} disabled={answers[current] < 0}>{t('estudos.proxima')}</button>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={finish} disabled={answers[current] < 0}>{t('estudos.finalizar')}</button>
              )}
            </div>
          </>
        )}

        {phase === 'result' && (
          <>
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ fontSize: 36, fontWeight: 700 }}>{Math.round((score / questions.length) * 100)}%</div>
              <div style={{ color: 'var(--text-secondary)' }}>{score} {t('estudos.deCorretas', { count: questions.length })}</div>
            </div>
            <div className="list-stack" style={{ maxHeight: 260, overflowY: 'auto' }}>
              {questions.map((qq, i) => {
                const ok = answers[i] === qq.answerIndex
                return (
                  <div key={i} className="list-row" style={{ alignItems: 'flex-start' }}>
                    <span>{ok ? '✅' : '❌'}</span>
                    <span className="list-row-title" style={{ whiteSpace: 'normal' }}>
                      {qq.question}
                      <br />
                      <span style={{ fontSize: 12, color: 'var(--success)' }}>{t('estudos.correta')} {qq.options[qq.answerIndex]}</span>
                      {!ok && answers[i] >= 0 && (
                        <span style={{ fontSize: 12, color: 'var(--danger)', marginLeft: 8 }}>{t('estudos.sua')} {qq.options[answers[i]]}</span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setPhase('setup')}>{t('estudos.novoQuiz')}</button>
              <button className="btn btn-primary btn-sm" onClick={onClose}>{t('estudos.concluir')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
