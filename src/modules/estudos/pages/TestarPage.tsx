import React, { useEffect, useState } from 'react'
import { useUIStore } from '../../../store/uiStore'
import type { LibraryTopic, QuestionOut } from '../../../../shared/estudos'
import { QuestionRunner } from '../components/QuestionsPanel'
import { t } from '../../../i18n'

/**
 * "Testar o que ficou": perguntas salvas (erros para revisitar primeiro) + atalho para os
 * cartões vencidos. Só lê o que já está salvo — zero chamadas de IA.
 */
export function TestarPage(): React.ReactElement {
  const { setPage } = useUIStore()
  const [topics, setTopics] = useState<LibraryTopic[]>([])
  const [topicId, setTopicId] = useState<string>('')
  const [onlyRevisit, setOnlyRevisit] = useState(false)
  const [questions, setQuestions] = useState<QuestionOut[] | null>(null)
  const [due, setDue] = useState(0)
  const [running, setRunning] = useState(false)

  async function load(): Promise<void> {
    const [lib, q] = await Promise.all([window.api.estudos.library(), window.api.estudos.queue(topicId ? { topicId: Number(topicId) } : {})])
    setTopics(lib)
    setDue(q.items.length)
    const qs = await window.api.estudos.questions(topicId ? { topicId: Number(topicId) } : {})
    setQuestions(onlyRevisit ? qs.filter((x) => x.revisit) : qs)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId, onlyRevisit])

  return (
    <div className="module-page">
      <div className="module-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setPage('estudos')}>←</button>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t('est.testarTitulo')}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('est.testarSub')}</p>
          </div>
        </div>
      </div>

      <div className="study-time">
        <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
          <option value="">{t('est.topicosAtivos')}</option>
          {topics.map((x) => (
            <option key={x.id} value={x.id}>{x.name}</option>
          ))}
        </select>
        <label className="study-check">
          <input type="checkbox" checked={onlyRevisit} onChange={(e) => setOnlyRevisit(e.target.checked)} />
          {t('est.soErros')}
        </label>
        <button className="btn btn-secondary btn-sm" onClick={() => setPage('estudos-review')} disabled={!due}>{t('est.fazerCartoes', { count: due })}</button>
      </div>

      {running && questions ? (
        <QuestionRunner
          questions={questions}
          onDone={() => {
            setRunning(false)
            load()
          }}
        />
      ) : (
        <div className="chart-section" style={{ textAlign: 'center', padding: 32 }}>
          {questions && questions.length ? (
            <>
              <div style={{ marginBottom: 12 }}>{t('est.perguntasProntas', { count: questions.length, revisitar: questions.filter((q) => q.revisit).length })}</div>
              <button className="btn btn-primary" onClick={() => setRunning(true)}>{t('est.comecar')}</button>
            </>
          ) : (
            <div className="empty-hint">{due ? t('est.semPerguntasMasCartoes') : t('est.semPerguntasNemCartoes')}</div>
          )}
        </div>
      )}
    </div>
  )
}
