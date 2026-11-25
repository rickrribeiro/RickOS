import React, { useEffect, useState } from 'react'
import { Todo } from '../../../types'
import { useTodoStore, DONE_PAGE } from '../store/todoStore'
import { useProjectStore } from '../../projects/store/projectStore'
import { TodoEditor } from '../components/TodoEditor'
import { TodoBoard } from '../components/TodoBoard'
import { AiPlanModal } from '../components/AiPlanModal'
import { PRIORITIES, STATUSES, STATUS_LABELS, TodoStatus, TODO_TYPES, priorityDef, dueMeta, todoTypeDef } from '../constants'
import { localDateStr, timeAgo } from '../../../utils/dates'
import { t as tr } from '../../../i18n'

type StatusFilter = 'all' | 'todo' | 'doing' | 'done'

export function TodoPage(): React.ReactElement {
  const { list, listLoading, loadList, loadMoreDone, closeList, create, setStatus, update, remove } = useTodoStore()
  const { projects, refresh: refreshProjects } = useProjectStore()
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [projectFilter, setProjectFilter] = useState<number | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [recurringFilter, setRecurringFilter] = useState<'all' | 'yes' | 'no'>('all')
  const [newType, setNewType] = useState<string>('projeto')
  const [editing, setEditing] = useState<Todo | null>(null)
  const [planOpen, setPlanOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [view, setView] = useState<'list' | 'board'>(() => {
    try {
      return localStorage.getItem('rickos:todoView') === 'board' ? 'board' : 'list'
    } catch {
      return 'list'
    }
  })
  function changeView(v: 'list' | 'board'): void {
    setView(v)
    try {
      localStorage.setItem('rickos:todoView', v)
    } catch {
      /* sem storage: vale só nesta sessão */
    }
  }
  const [showUpcoming, setShowUpcoming] = useState(() => {
    try {
      return localStorage.getItem('rickos:todoShowUpcomingRecurring') === '1'
    } catch {
      return false
    }
  })
  function toggleUpcoming(v: boolean): void {
    setShowUpcoming(v)
    try {
      localStorage.setItem('rickos:todoShowUpcomingRecurring', v ? '1' : '0')
    } catch {
      /* sem storage: vale só nesta sessão */
    }
  }
  const [doneCollapsed, setDoneCollapsed] = useState(() => localStorage.getItem('rickos:todoDoneCollapsed') === '1')

  function toggleDone(): void {
    setDoneCollapsed((c) => {
      localStorage.setItem('rickos:todoDoneCollapsed', c ? '0' : '1')
      return !c
    })
  }

  // busca com debounce; os outros filtros consultam na hora
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const h = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(h)
  }, [search])

  useEffect(() => {
    refreshProjects()
    return () => closeList()
  }, [])

  // filtros, busca, ordenação e paginação das concluídas ficam no servidor (todos:list)
  useEffect(() => {
    loadList({
      search: debouncedSearch,
      status: statusFilter,
      type: typeFilter,
      recurring: recurringFilter,
      showUpcomingRecurring: showUpcoming,
      today: localDateStr(new Date()),
      projectId: projectFilter === 'all' ? null : projectFilter
    })
  }, [debouncedSearch, statusFilter, typeFilter, recurringFilter, showUpcoming, projectFilter])

  const projectName = (id: number | null): string | null =>
    id === null ? null : projects.find((p) => p.id === id)?.name ?? null

  const openItems = list.open
  const doneItems = list.done
  const doneRemaining = list.doneTotal - doneItems.length
  // o que está visível na lista (para a navegação por teclado)
  const items = doneCollapsed && view === 'list' ? openItems : [...openItems, ...doneItems]

  async function handleAdd(): Promise<void> {
    const v = text.trim()
    if (!v) return
    await create(v, 'todo', newType)
    setText('')
  }

  function cyclePriority(t: Todo): void {
    const next = (t.priority + 1) % PRIORITIES.length
    update({ ...t, priority: next })
  }

  function postpone(t: Todo): void {
    const base = t.dueDate ? new Date(`${t.dueDate}T00:00:00`) : new Date()
    base.setDate(base.getDate() + 1)
    update({ ...t, dueDate: localDateStr(base) })
  }

  // Keyboard shortcuts on the list: ↑↓ select, Space toggle done, p postpone, e edit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (document.activeElement?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (editing || planOpen) return
      if (items.length === 0) return

      const idx = items.findIndex((t) => t.id === selectedId)
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedId(items[Math.min(items.length - 1, idx < 0 ? 0 : idx + 1)].id)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedId(items[Math.max(0, idx < 0 ? 0 : idx - 1)].id)
      } else if (idx >= 0) {
        const t = items[idx]
        if (e.key === ' ' || e.key === 'x') {
          e.preventDefault()
          setStatus(t.id, t.status === 'done' ? 'todo' : 'done')
        } else if (e.key === 'p') {
          e.preventDefault()
          postpone(t)
        } else if (e.key === 'e') {
          e.preventDefault()
          setEditing(t)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selectedId, editing, planOpen])

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{tr('todo.todo2')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {tr('todo.emAbertoFeitasRecorrentes', { count: openItems.length, doneTotal: list.doneTotal, doneRecurring: list.doneRecurring })}
            <span style={{ color: 'var(--text-muted)', marginLeft: 10 }}>
              {tr('todo.navegarEspacoConcluirPAdiar')}
            </span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setPlanOpen(true)} title={tr('todo.emBreve')}>
            {tr('todo.planejarComIa')}
          </button>
          <div className="seg-toggle">
            <button className={`seg-btn ${view === 'list' ? 'active' : ''}`} onClick={() => changeView('list')}>
              {tr('todo.lista')}
            </button>
            <button className={`seg-btn ${view === 'board' ? 'active' : ''}`} onClick={() => changeView('board')}>
              {tr('todo.quadro')}
            </button>
          </div>
        </div>
      </div>

      <div className="quick-add-row">
        <input
          type="text"
          placeholder={tr('todo.novaTarefa')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <select value={newType} onChange={(e) => setNewType(e.target.value)} title={tr('todo.tipoDaNovaTarefa')}>
          {TODO_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.icon} {t.label}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={handleAdd}>
          {tr('todo.adicionar')}
        </button>
      </div>

      <div className="todo-toolbar">
        <input
          type="text"
          placeholder={tr('todo.buscar')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: '1 1 110px', minWidth: 100 }}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
          <option value="all">{tr('todo.todosOsStatus')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">{tr('todo.todosOsTipos')}</option>
          {TODO_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.icon} {t.label}
            </option>
          ))}
        </select>
        <select value={recurringFilter} onChange={(e) => setRecurringFilter(e.target.value as 'all' | 'yes' | 'no')}>
          <option value="all">{tr('todo.recorrenciaTodas')}</option>
          <option value="yes">{tr('todo.recorrentes')}</option>
          <option value="no">{tr('todo.naoRecorrentes')}</option>
        </select>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        >
          <option value="all">{tr('todo.todosOsProjetos')}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <label
          className="todo-toolbar-check"
          title={tr('todo.recorrentesConcluidasVoltamParaA')}
        >
          <input type="checkbox" checked={showUpcoming} onChange={(e) => toggleUpcoming(e.target.checked)} />
          {tr('todo.mostrarRecorrentes')}
          {!showUpcoming && list.upcomingRecurring > 0 && (
            <span style={{ color: 'var(--text-muted)' }}>({list.upcomingRecurring})</span>
          )}
        </label>
      </div>

      {view === 'board' && (
        <TodoBoard
          open={openItems}
          done={doneItems}
          doneTotal={list.doneTotal}
          doneRemaining={doneRemaining}
          donePage={DONE_PAGE}
          loading={listLoading}
          selectedId={selectedId}
          projectName={projectName}
          onMove={(id, st: TodoStatus) => void setStatus(id, st)}
          onEdit={setEditing}
          onSelect={setSelectedId}
          onCyclePriority={cyclePriority}
          onLoadMoreDone={loadMoreDone}
        />
      )}

      {view === 'list' && (
      <div className="list-stack">
        {openItems.length === 0 && list.doneTotal === 0 && !listLoading && (
          <div className="empty-hint">{tr('todo.nenhumaTarefaEncontrada')}</div>
        )}
        {openItems.map((t) => renderRow(t))}
        {list.doneTotal > 0 && (
          <button className="todo-divider" onClick={toggleDone} title={doneCollapsed ? tr('todo.mostrarConcluidas') : tr('todo.ocultarConcluidas')}>
            <span className={`nav-group-chevron ${doneCollapsed ? 'collapsed' : ''}`}>▾</span>
            <span>{tr('todo.concluidas', { doneTotal: list.doneTotal })}</span>
          </button>
        )}
        {!doneCollapsed && doneItems.map((t) => renderRow(t))}
        {!doneCollapsed && doneRemaining > 0 && (
          <button className="btn btn-secondary btn-sm todo-more" onClick={loadMoreDone} disabled={listLoading}>
            {listLoading ? tr('todo.carregando') : tr('todo.verMaisDe', { p0: Math.min(DONE_PAGE, doneRemaining), doneRemaining })}
          </button>
        )}
      </div>
      )}

      {editing && <TodoEditor todo={editing} onClose={() => setEditing(null)} />}
      {planOpen && <AiPlanModal onClose={() => setPlanOpen(false)} />}
    </div>
  )

  function renderRow(t: Todo): React.ReactElement {
    const done = t.status === 'done'
    const prio = priorityDef(t.priority)
    const due = dueMeta(t.dueDate, done)
    const proj = projectName(t.projectId)
    const type = todoTypeDef(t.type)
    return (
      <div
        key={t.id}
        className={`list-row ${selectedId === t.id ? 'selected' : ''}`}
        onClick={() => setSelectedId(t.id)}
      >
              <input
                type="checkbox"
                checked={done}
                onChange={() => setStatus(t.id, done ? 'todo' : 'done')}
              />
              <button
                className="priority-dot"
                title={tr('todo.prioridadeCliquePAlternar', { label: prio.label })}
                style={{ background: prio.color }}
                onClick={() => cyclePriority(t)}
              />
              <span
                className="list-row-title"
                style={{
                  textDecoration: done ? 'line-through' : 'none',
                  color: done ? 'var(--text-muted)' : 'var(--text-primary)'
                }}
              >
                {t.title}
              </span>
              {t.notes && t.notes.trim() && (
                <button
                  className="note-badge"
                  title={t.notes}
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditing(t)
                  }}
                >
                  📝
                </button>
              )}
              <span
                className="todo-type-chip"
                title={tr('todo.tipo2', { label: type.label })}
                style={{ borderColor: type.color, color: type.color }}
              >
                {type.icon} {type.label}
              </span>
              {proj && <span className="project-chip">{proj}</span>}
              {t.recurrence && <span title={tr('todo.tarefaRecorrente')}>🔁</span>}
              {due && <span className={`due-badge ${due.cls}`}>{due.label}</span>}
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }} title={tr('todo.criadaEm', { p0: new Date(t.createdAt).toLocaleString('pt-BR') })}>⏳ {timeAgo(t.createdAt)}</span>
              <select
                value={t.status}
                onChange={(e) => setStatus(t.id, e.target.value)}
                style={{ fontSize: 12, padding: '2px 6px' }}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <div className="list-row-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(t)}>
                  {tr('todo.editar')}
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => remove(t.id)}>
                  {tr('todo.excluir')}
                </button>
              </div>
      </div>
    )
  }
}
