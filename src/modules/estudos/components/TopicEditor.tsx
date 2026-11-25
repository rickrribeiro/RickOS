import React, { useState } from 'react'
import { StudyTopic } from '../../../types'
import { useStudyStore } from '../store/studyStore'
import { t } from '../../../i18n'

export const TOPIC_STATUSES = ['studying', 'planned', 'paused', 'completed'] as const
export const TOPIC_STATUS_LABEL: Record<string, string> = {
  studying: t('estudos.estudando'),
  planned: t('estudos.planejado'),
  paused: t('estudos.pausado'),
  completed: t('estudos.concluido')
}
const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7', '#ec4899']

/** Create (topic=null) or edit a study topic. Mirrors TodoEditor. */
export function TopicEditor({ topic, onClose }: { topic: StudyTopic | null; onClose: () => void }): React.ReactElement {
  const { createTopic, updateTopic } = useStudyStore()
  const [name, setName] = useState(topic?.name ?? '')
  const [category, setCategory] = useState(topic?.category ?? '')
  const [status, setStatus] = useState(topic?.status ?? 'studying')
  const [priority, setPriority] = useState(topic?.priority ?? 0)
  const [targetDate, setTargetDate] = useState(topic?.targetDate ?? '')
  const [color, setColor] = useState(topic?.color ?? COLORS[0])

  async function save(): Promise<void> {
    if (!name.trim()) return
    if (topic) {
      await updateTopic({ ...topic, name: name.trim(), category: category.trim() || null, status, priority, targetDate: targetDate || null, color })
    } else {
      await createTopic(name.trim(), category.trim() || null, status, targetDate || null, priority, color)
    }
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 380 }}>
        <h2>{topic ? t('estudos.editarTopico') : t('estudos.novoTopico')}</h2>
        <div className="editor-field">
          <label>{t('estudos.nome')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder={t('estudos.exKubernetes')} />
        </div>
        <div className="editor-row">
          <div className="editor-field">
            <label>{t('estudos.categoria')}</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t('estudos.exDevopsIdioma')} />
          </div>
          <div className="editor-field">
            <label>{t('estudos.status')}</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {TOPIC_STATUSES.map((s) => (
                <option key={s} value={s}>{TOPIC_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
        </div>
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
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>{t('estudos.cancelar')}</button>
          <button className="btn btn-primary btn-sm" onClick={save}>{t('estudos.salvar')}</button>
        </div>
      </div>
    </div>
  )
}
