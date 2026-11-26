import React, { useEffect, useState } from 'react'
import type { QuestionOut, QuestionRow } from '../../../../shared/estudos'
import { useStudyStore } from '../store/studyStore'
import { renderMarkdown } from '../markdown'
import { t } from '../../../i18n'

const KINDS: QuestionRow['kind'][] = ['recall', 'exercise', 'socratic', 'quiz']

/** Perguntas salvas do tópico/nó (sem IA). Um tópico não precisa ter perguntas para existir. */
export function QuestionsPanel(): React.ReactElement {
  const { activeTopicId, selectedNodeId } = useStudyStore()
  const [list, setList] = useState<QuestionOut[]>([])
  const [prompt, setPrompt] = useState('')
  const [reference, setReference] = useState('')
  const [hint, setHint] = useState('')
  const [kind, setKind] = useState<QuestionRow['kind']>('recall')
  const [error, setError] = useState('')

  async function load(): Promise<void> {
    if (activeTopicId == null) return
    setList(await window.api.estudos.questions({ topicId: activeTopicId, nodeId: selectedNodeId, includeArchived: true }))
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTopicId, selectedNodeId])

  async function add(): Promise<void> {
    if (activeTopicId == null) return
    setError('')
    try {
      await window.api.estudos.createQuestion({ topicId: activeTopicId, nodeId: selectedNodeId, kind, prompt, reference: reference || null, hint: hint || null })
      setPrompt('')
      setReference('')
      setHint('')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="questions-panel">
      <div className="source-form">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select value={kind} onChange={(e) => setKind(e.target.value as QuestionRow['kind'])}>
            {KINDS.map((k) => (
              <option key={k} value={k}>{t(`est.tipoPergunta.${k}`)}</option>
            ))}
          </select>
        </div>
        <textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t('est.perguntaPlaceholder')} />
        <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder={t('est.pistaOpcional')} />
        <textarea rows={2} value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t('est.referenciaOpcional')} />
        {error && <div className="study-error">{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary btn-sm" onClick={add} disabled={!prompt.trim()}>{t('est.salvarPergunta')}</button>
        </div>
      </div>
      <div className="list-stack">
        {!list.length && <div className="empty-hint">{t('est.semPerguntas')}</div>}
        {list.map((q) => (
          <div key={q.id} className={`list-row card-row ${q.status === 'archived' ? 'is-suspended' : ''}`}>
            <div className="card-row-text">
              <div>{q.prompt}</div>
              <div className="card-row-meta">
                <span className="project-chip">{t(`est.tipoPergunta.${q.kind}`)}</span>
                {q.revisit ? <span className="project-chip warn">{t('est.revisitar')}</span> : null}
                <span className="project-chip">{t('est.tentativas', { count: q.attempts })}</span>
              </div>
            </div>
            <div className="list-row-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => window.api.estudos.updateQuestion(q.id, { status: q.status === 'archived' ? 'active' : 'archived' }).then(load)}>
                {q.status === 'archived' ? t('est.reativar') : t('est.arquivar')}
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => window.confirm(t('est.excluirPergunta')) && window.api.estudos.deleteQuestion(q.id).then(load)}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Uma pergunta por vez: estímulo → minha resposta → (pista) → referência → resultado. */
export function QuestionRunner({ questions, onDone }: { questions: QuestionOut[]; onDone: () => void }): React.ReactElement {
  const [i, setI] = useState(0)
  const [answer, setAnswer] = useState('')
  const [help, setHelp] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const q = questions[i]

  function next(): void {
    setAnswer('')
    setHelp(null)
    setRevealed(false)
    if (i + 1 >= questions.length) onDone()
    else setI(i + 1)
  }

  async function record(outcome: 'ok' | 'partial' | 'miss' | 'skipped'): Promise<void> {
    await window.api.estudos.recordAttempt(q.id, { answer: answer || null, helpUsed: help, outcome })
    next()
  }

  if (!q) return <div className="empty-hint">{t('est.semPerguntas')}</div>

  return (
    <div className="flashcard test-card">
      <div className="flashcard-topic">
        {q.topicName} · {t(`est.tipoPergunta.${q.kind}`)} · {i + 1}/{questions.length}
        {q.revisit ? ` · ${t('est.revisitar')}` : ''}
      </div>
      <div className="flashcard-face">{q.prompt}</div>
      <textarea className="test-answer" rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={t('est.suaResposta')} />
      {q.hint && !help && !revealed && (
        <button className="btn btn-secondary btn-sm" onClick={() => setHelp('hint')}>{t('est.verPista')}</button>
      )}
      {help === 'hint' && q.hint && <div className="test-hint">💡 {q.hint}</div>}
      {revealed ? (
        <>
          <hr className="flashcard-sep" />
          <div className="flashcard-back md-preview-pane">{q.reference ? renderMarkdown(q.reference) : t('est.semReferencia')}</div>
          <div className="srs-buttons">
            <button className="btn btn-sm btn-danger" onClick={() => record('miss')}>{t('est.errei')}</button>
            <button className="btn btn-sm btn-secondary" onClick={() => record('partial')}>{t('est.parcial')}</button>
            <button className="btn btn-sm btn-primary" onClick={() => record('ok')}>{t('est.acertei')}</button>
          </div>
        </>
      ) : (
        <div className="srs-buttons">
          <button className="btn btn-secondary btn-sm" onClick={() => record('skipped')}>{t('est.pular')}</button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              if (!answer.trim() && !help) setHelp('reference')
              setRevealed(true)
            }}
          >
            {t('est.revelarReferencia')}
          </button>
        </div>
      )}
    </div>
  )
}
