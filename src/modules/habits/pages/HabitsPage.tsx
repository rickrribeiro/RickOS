import React, { useEffect, useState } from 'react'
import { Habit } from '../../../types'
import { useHabitStore } from '../store/habitStore'
import { HabitStats } from '../components/HabitStats'
import { localDateStr } from '../../../utils/dates'
import { t, getLocale } from '../../../i18n'

const SUGGESTED = [t('habits.sug.gym'), t('habits.sug.japanese'), t('habits.sug.meditate'), t('habits.sug.sleep'), t('habits.sug.noAlcohol'), t('habits.sug.reviewTodo')]

function offsetDay(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return localDateStr(d)
}

function formatDayLabel(dateStr: string): string {
  const today = localDateStr(new Date())
  if (dateStr === today) return t('habits.hoje')
  if (dateStr === offsetDay(today, -1)) return t('habits.ontem')
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString(getLocale(), { weekday: 'long', day: '2-digit', month: '2-digit' })
}

function HabitEditor({ habit, onClose }: { habit: Habit; onClose: () => void }): React.ReactElement {
  const { update } = useHabitStore()
  const [name, setName] = useState(habit.name)
  const [frequency, setFrequency] = useState(habit.frequency)
  const [target, setTarget] = useState(habit.target)
  const [active, setActive] = useState(habit.active === 1)

  async function save(): Promise<void> {
    if (!name.trim()) return
    await update({ ...habit, name: name.trim(), frequency, target, active: active ? 1 : 0 })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 360 }}>
        <h2>{t('habits.editarHabito')}</h2>
        <div className="editor-field">
          <label>{t('habits.nome')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="editor-row">
          <div className="editor-field">
            <label>{t('habits.frequencia')}</label>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              <option value="daily">{t('habits.diaria')}</option>
              <option value="weekly">{t('habits.semanal')}</option>
            </select>
          </div>
          <div className="editor-field">
            <label>{t('habits.meta')} {frequency === 'weekly' ? t('habits.xSemana') : t('habits.xDia')}</label>
            <input type="number" min={1} value={target} onChange={(e) => setTarget(Number(e.target.value) || 1)} />
          </div>
        </div>
        <div className="editor-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none' }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> {t('habits.ativo')}
          </label>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>{t('habits.cancelar')}</button>
          <button className="btn btn-primary btn-sm" onClick={save}>{t('habits.salvar')}</button>
        </div>
      </div>
    </div>
  )
}

export function HabitsPage(): React.ReactElement {
  const { habits, refresh, create, remove, toggle, isDone, streak, weekRate, last7, date, setDate } = useHabitStore()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<Habit | null>(null)

  useEffect(() => {
    refresh()
  }, [])

  async function handleAdd(value?: string): Promise<void> {
    const v = (value ?? name).trim()
    if (!v) return
    if (habits.some((h) => h.name.toLowerCase() === v.toLowerCase())) return
    await create(v, 'daily', 1)
    if (!value) setName('')
  }

  const activeHabits = habits.filter((h) => h.active === 1)
  const doneCount = activeHabits.filter((h) => isDone(h.id)).length
  const missingSuggestions = SUGGESTED.filter((s) => !habits.some((h) => h.name.toLowerCase() === s.toLowerCase()))
  const today = localDateStr(new Date())
  const isToday = date === today

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t('habits.habitos')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {t('habits.concluidos', { doneCount, count: activeHabits.length })}
          </p>
        </div>
        <div className="date-nav">
          <button className="date-nav-btn" onClick={() => setDate(offsetDay(date, -1))} title={t('habits.diaAnterior')}>
            ‹
          </button>
          <span className="date-display">{formatDayLabel(date)}</span>
          <button
            className="date-nav-btn"
            onClick={() => setDate(offsetDay(date, 1))}
            disabled={isToday}
            title={t('habits.proximoDia')}
          >
            ›
          </button>
          {!isToday && (
            <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={() => setDate(today)}>
              {t('habits.hoje')}
            </button>
          )}
        </div>
      </div>

      <div className="quick-add-row">
        <input
          type="text"
          placeholder={t('habits.novoHabitoExAcademia')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button className="btn btn-primary" onClick={() => handleAdd()}>{t('habits.adicionar')}</button>
      </div>

      {missingSuggestions.length > 0 && (
        <div className="suggested-row">
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('habits.sugestoes')}</span>
          {missingSuggestions.map((s) => (
            <button key={s} className="btn btn-secondary btn-sm" onClick={() => handleAdd(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}

      <div className="list-stack" style={{ marginTop: 12 }}>
        {habits.length === 0 && <div className="empty-hint">{t('habits.nenhumHabitoAinda')}</div>}
        {habits.map((h) => {
          const done = isDone(h.id)
          const cells = last7(h.id)
          const inactive = h.active !== 1
          return (
            <div key={h.id} className="list-row" style={{ opacity: inactive ? 0.5 : 1 }}>
              <button
                className={`habit-toggle ${done ? 'done' : ''}`}
                onClick={() => toggle(h.id)}
                title={done ? t('habits.concluidoHoje') : t('habits.marcarHoje')}
              >
                {done ? '✓' : ''}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: done ? 'var(--success)' : 'var(--text-primary)', fontSize: 14 }}>
                  {h.name}
                  {h.frequency === 'weekly' && (
                    <span className="project-chip" style={{ marginLeft: 8 }}>{t('habits.metaSem', { target: h.target })}</span>
                  )}
                </div>
                <div className="habit-grid">
                  {cells.map((c) => (
                    <span key={c.date} className={`habit-cell ${c.done ? 'on' : ''}`} title={c.date} />
                  ))}
                </div>
              </div>
              <div className="habit-stats">
                <span title={t('habits.sequencia')}>🔥 {streak(h.id)}</span>
                <span title={t('habits.ultimos7Dias')}>{weekRate(h.id)}/7</span>
              </div>
              <div className="list-row-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(h)}>{t('habits.editar')}</button>
                <button className="btn btn-danger btn-sm" onClick={() => remove(h.id)}>{t('habits.excluir')}</button>
              </div>
            </div>
          )
        })}
      </div>

      <HabitStats />

      {editing && <HabitEditor habit={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
