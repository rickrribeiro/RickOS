import React, { useEffect, useState } from 'react'
import { Todo } from '../../../types'
import { useTodoStore } from '../store/todoStore'
import { useProjectStore } from '../../projects/store/projectStore'
import { PRIORITIES, STATUSES, STATUS_LABELS, TODO_TYPES } from '../constants'
import { t as tr } from '../../../i18n'

interface TodoEditorProps {
  todo: Todo
  onClose: () => void
}

/** Modal to edit every field of a todo. Shared by the TODO list and Inbox processing. */
export function TodoEditor({ todo, onClose }: TodoEditorProps): React.ReactElement {
  const { update } = useTodoStore()
  const { projects, refresh: refreshProjects } = useProjectStore()

  const [title, setTitle] = useState(todo.title)
  const [notes, setNotes] = useState(todo.notes ?? '')
  // Keep the real status (inbox stays inbox until the user explicitly promotes it).
  const [status, setStatus] = useState(todo.status)
  const [priority, setPriority] = useState(todo.priority)
  const [type, setType] = useState(todo.type ?? 'projeto')

  // Inbox items can be promoted; show 'inbox' as an option so it can also be kept.
  const statusOptions = todo.status === 'inbox' ? ['inbox', ...STATUSES] : STATUSES
  const [dueDate, setDueDate] = useState(todo.dueDate ?? '')
  const [projectId, setProjectId] = useState<number | null>(todo.projectId)

  // recurrence: '' (none) | 'everyNDays' | 'dayOfMonth' | 'afterCompletion'
  const parsedRec = (() => {
    try {
      return todo.recurrence ? (JSON.parse(todo.recurrence) as { type: string; n?: number; day?: number }) : null
    } catch {
      return null
    }
  })()
  const [recType, setRecType] = useState<string>(parsedRec?.type ?? '')
  const [recN, setRecN] = useState<number>(parsedRec?.n ?? 7)
  const [recDay, setRecDay] = useState<number>(parsedRec?.day ?? 1)

  useEffect(() => {
    if (projects.length === 0) refreshProjects()
  }, [])

  function buildRecurrence(): string | null {
    if (!recType) return null
    if (recType === 'everyNDays') return JSON.stringify({ type: 'everyNDays', n: recN })
    if (recType === 'afterCompletion') return JSON.stringify({ type: 'afterCompletion', n: recN })
    if (recType === 'dayOfMonth') return JSON.stringify({ type: 'dayOfMonth', day: recDay })
    return null
  }

  async function handleSave(): Promise<void> {
    if (!title.trim()) return
    await update({
      ...todo,
      title: title.trim(),
      notes: notes.trim() || null,
      status,
      priority,
      dueDate: dueDate || null,
      projectId,
      recurrence: buildRecurrence(),
      type
    })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 380 }}>
        <h2>{todo.status === 'inbox' ? tr('todo.processarItem') : tr('todo.editarTarefa')}</h2>

        <div className="editor-field">
          <label>{tr('todo.titulo')}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>

        <div className="editor-field">
          <label>{tr('todo.notas')}</label>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="editor-field">
          <label>{tr('todo.tipo')}</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {TODO_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="editor-row">
          <div className="editor-field">
            <label>{tr('todo.status')}</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="editor-field">
            <label>{tr('todo.prioridade')}</label>
            <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="editor-row">
          <div className="editor-field">
            <label>{tr('todo.vencimento')}</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="editor-field">
            <label>{tr('todo.projeto')}</label>
            <select
              value={projectId ?? ''}
              onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{tr('todo.nenhum')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="editor-row">
          <div className="editor-field">
            <label>{tr('todo.repetir')}</label>
            <select value={recType} onChange={(e) => setRecType(e.target.value)}>
              <option value="">{tr('todo.naoRepetir')}</option>
              <option value="everyNDays">{tr('todo.aCadaNDias')}</option>
              <option value="dayOfMonth">{tr('todo.diaXDoMes')}</option>
              <option value="afterCompletion">{tr('todo.nDiasAposConcluir')}</option>
            </select>
          </div>
          {(recType === 'everyNDays' || recType === 'afterCompletion') && (
            <div className="editor-field">
              <label>{tr('todo.nDias')}</label>
              <input type="number" min={1} value={recN} onChange={(e) => setRecN(Number(e.target.value) || 1)} />
            </div>
          )}
          {recType === 'dayOfMonth' && (
            <div className="editor-field">
              <label>{tr('todo.diaDoMes')}</label>
              <input type="number" min={1} max={31} value={recDay} onChange={(e) => setRecDay(Number(e.target.value) || 1)} />
            </div>
          )}
        </div>
        {recType && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {tr('todo.aoConcluirUmaNovaTarefa')}
          </p>
        )}

        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            {tr('todo.cancelar')}
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSave}>
            {tr('todo.salvar')}
          </button>
        </div>
      </div>
    </div>
  )
}
