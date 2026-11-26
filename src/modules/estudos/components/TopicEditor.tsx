import React, { useState } from 'react'
import type { TopicRow, TopicStatus } from '../../../../shared/estudos'
import { t } from '../../../i18n'

export const TOPIC_STATUSES = ['studying', 'planned', 'paused', 'completed'] as const
export const TOPIC_STATUS_LABEL: Record<string, string> = {
  studying: t('estudos.estudando'),
  planned: t('estudos.planejado'),
  paused: t('estudos.pausado'),
  completed: t('estudos.concluido')
}
const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7', '#ec4899']

/** Idiomas sugeridos (códigos BCP-47); o campo aceita qualquer código. */
export const LANG_SUGGESTIONS = ['zh', 'en', 'es', 'ja', 'ko', 'fr', 'de', 'it', 'pt-BR']

/** Cria (topic=null) ou edita um tópico. O idioma da interface não muda aqui. */
export function TopicEditor({ topic, onClose, onSaved }: { topic: TopicRow | null; onClose: () => void; onSaved?: (t: TopicRow) => void }): React.ReactElement {
  const [name, setName] = useState(topic?.name ?? '')
  const [category, setCategory] = useState(topic?.category ?? '')
  const [status, setStatus] = useState<TopicStatus>(topic?.status ?? 'studying')
  const [priority, setPriority] = useState(topic?.priority ?? 0)
  const [targetDate, setTargetDate] = useState(topic?.targetDate ?? '')
  const [color, setColor] = useState(topic?.color ?? COLORS[0])
  const [kind, setKind] = useState<'general' | 'language'>(topic?.kind ?? 'general')
  const [targetLanguage, setTargetLanguage] = useState(topic?.targetLanguage ?? '')
  const [explanationLanguage, setExplanationLanguage] = useState(topic?.explanationLanguage ?? '')
  const [goal, setGoal] = useState(topic?.goal ?? '')
  const [readingMode, setReadingMode] = useState<'hidden' | 'visible'>(topic?.readingMode ?? 'hidden')
  const [error, setError] = useState('')

  async function save(): Promise<void> {
    if (!name.trim()) return
    const input = {
      name: name.trim(),
      category: category.trim() || null,
      status,
      priority,
      targetDate: targetDate || null,
      color,
      kind,
      targetLanguage: kind === 'language' ? targetLanguage.trim() || null : null,
      explanationLanguage: explanationLanguage.trim() || null,
      goal: goal.trim() || null,
      readingMode
    }
    try {
      const saved = topic ? await window.api.estudos.updateTopic(topic.id, input) : await window.api.estudos.createTopic(input)
      onSaved?.(saved)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal study-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{topic ? t('estudos.editarTopico') : t('estudos.novoTopico')}</h2>
        <div className="editor-field">
          <label>{t('estudos.nome')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder={t('estudos.exKubernetes')} />
        </div>
        <div className="editor-field">
          <label>{t('est.objetivo')}</label>
          <textarea rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={t('est.objetivoPlaceholder')} />
        </div>
        <div className="editor-row">
          <div className="editor-field">
            <label>{t('est.tipoTopico')}</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as 'general' | 'language')}>
              <option value="general">{t('est.tipoGeral')}</option>
              <option value="language">{t('est.tipoIdioma')}</option>
            </select>
          </div>
          <div className="editor-field">
            <label>{t('estudos.status')}</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as TopicStatus)}>
              {TOPIC_STATUSES.map((s) => (
                <option key={s} value={s}>{TOPIC_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
        </div>
        {kind === 'language' && (
          <div className="editor-row">
            <div className="editor-field">
              <label>{t('est.idiomaAlvo')}</label>
              <input list="study-langs" value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)} placeholder="zh" />
            </div>
            <div className="editor-field">
              <label>{t('est.leitura')}</label>
              <select value={readingMode} onChange={(e) => setReadingMode(e.target.value as 'hidden' | 'visible')}>
                <option value="hidden">{t('est.leituraOculta')}</option>
                <option value="visible">{t('est.leituraVisivel')}</option>
              </select>
            </div>
          </div>
        )}
        <div className="editor-row">
          <div className="editor-field">
            <label>{t('est.idiomaExplicacao')}</label>
            <input list="study-langs" value={explanationLanguage} onChange={(e) => setExplanationLanguage(e.target.value)} placeholder="pt-BR" />
          </div>
          <div className="editor-field">
            <label>{t('estudos.categoria')}</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t('estudos.exDevopsIdioma')} />
          </div>
        </div>
        <datalist id="study-langs">
          {LANG_SUGGESTIONS.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
        <div className="editor-row">
          <div className="editor-field">
            <label>{t('estudos.prioridade')}</label>
            <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
              <option value={0}>{t('estudos.nenhuma')}</option>
              <option value={1}>{t('estudos.baixa')}</option>
              <option value={2}>{t('estudos.media')}</option>
              <option value={3}>{t('estudos.alta')}</option>
            </select>
          </div>
          <div className="editor-field">
            <label>{t('estudos.metaData')}</label>
            <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </div>
        </div>
        <div className="editor-field">
          <label>{t('estudos.cor')}</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                title={c}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: c,
                  border: color === c ? '2px solid var(--text-primary)' : '2px solid transparent',
                  cursor: 'pointer'
                }}
              />
            ))}
          </div>
        </div>
        {error && <div className="study-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>{t('estudos.cancelar')}</button>
          <button className="btn btn-primary btn-sm" onClick={save}>{t('estudos.salvar')}</button>
        </div>
      </div>
    </div>
  )
}
