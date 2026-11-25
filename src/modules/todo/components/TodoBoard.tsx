import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Todo } from '../../../types'
import { STATUSES, STATUS_LABELS, TodoStatus, dueMeta, priorityDef, todoTypeDef } from '../constants'
import { t as tr } from '../../../i18n'

interface Props {
  open: Todo[]
  done: Todo[]
  doneTotal: number
  doneRemaining: number
  donePage: number
  loading: boolean
  selectedId: number | null
  projectName: (id: number | null) => string | null
  onMove: (id: number, status: TodoStatus) => void
  onEdit: (t: Todo) => void
  onSelect: (id: number) => void
  onCyclePriority: (t: Todo) => void
  onLoadMoreDone: () => void
}

interface DragState {
  id: number
  from: TodoStatus
  pointerId: number
  startX: number
  startY: number
  x: number
  y: number
  offX: number
  offY: number
  el: HTMLElement
  ghost: HTMLElement | null
  scroller: HTMLElement | null
  over: TodoStatus | null
  raf: number
  /** remove os listeners de window registrados no início do arraste */
  unlisten: () => void
}

const DRAG_THRESHOLD = 5
const EDGE = 60

/**
 * Quadro estilo scrum (A fazer · Fazendo · Concluído). Arrastar usa pointer events
 * (não o drag-and-drop do HTML5) para funcionar igual com mouse e no toque do celular:
 * com mouse arrasta o card inteiro; no toque, pela alça ⠿ (o resto do card rola a página).
 */
export function TodoBoard(props: Props): React.ReactElement {
  const { open, done, doneTotal, doneRemaining, donePage, loading, selectedId } = props
  const drag = useRef<DragState | null>(null)
  const suppressClick = useRef(false)
  const [dragId, setDragId] = useState<number | null>(null)
  const [overCol, setOverCol] = useState<TodoStatus | null>(null)
  // status já movido aqui mas ainda não refletido pelo servidor (evita o card "voltar" por um instante)
  const [pending, setPending] = useState<Record<number, TodoStatus>>({})

  useEffect(() => setPending({}), [open, done])
  useEffect(() => () => endDrag(false), [])

  const columns = useMemo(() => {
    const cols: Record<TodoStatus, Todo[]> = { todo: [], doing: [], done: [] }
    for (const t of [...open, ...done]) {
      const st = (pending[t.id] ?? t.status) as TodoStatus
      if (cols[st]) cols[st].push(pending[t.id] ? { ...t, status: st } : t)
    }
    return cols
  }, [open, done, pending])

  function colAt(x: number, y: number): TodoStatus | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    return (el?.closest('[data-col]')?.getAttribute('data-col') as TodoStatus | null) ?? null
  }

  function placeGhost(d: DragState): void {
    if (d.ghost) d.ghost.style.transform = `translate(${d.x - d.offX}px, ${d.y - d.offY}px) rotate(1.5deg)`
  }

  // rola a página quando o card chega perto da borda (no celular as colunas ficam empilhadas)
  function autoScroll(): void {
    const d = drag.current
    if (!d || !d.ghost) return
    const s = d.scroller
    if (s) {
      const r = s.getBoundingClientRect()
      let dy = 0
      if (d.y < r.top + EDGE) dy = -Math.ceil((r.top + EDGE - d.y) / 4)
      else if (d.y > r.bottom - EDGE) dy = Math.ceil((d.y - (r.bottom - EDGE)) / 4)
      if (dy) {
        s.scrollTop += dy
        const over = colAt(d.x, d.y)
        if (over !== d.over) {
          d.over = over
          setOverCol(over)
        }
      }
    }
    d.raf = requestAnimationFrame(autoScroll)
  }

  function onMove(e: PointerEvent): void {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    d.x = e.clientX
    d.y = e.clientY
    if (!d.ghost) {
      if (Math.hypot(d.x - d.startX, d.y - d.startY) < DRAG_THRESHOLD) return
      const r = d.el.getBoundingClientRect()
      const g = d.el.cloneNode(true) as HTMLElement
      g.classList.add('todo-card-ghost')
      g.style.width = `${r.width}px`
      document.body.appendChild(g)
      d.ghost = g
      setDragId(d.id)
      d.raf = requestAnimationFrame(autoScroll)
    }
    e.preventDefault()
    placeGhost(d)
    const over = colAt(d.x, d.y)
    if (over !== d.over) {
      d.over = over
      setOverCol(over)
    }
  }

  function endDrag(commit: boolean): void {
    const d = drag.current
    if (!d) return
    d.unlisten()
    drag.current = null
    cancelAnimationFrame(d.raf)
    if (d.ghost) {
      d.ghost.remove()
      suppressClick.current = true
      setTimeout(() => (suppressClick.current = false), 0)
      if (commit && d.over && d.over !== d.from) {
        const to = d.over
        setPending((p) => ({ ...p, [d.id]: to }))
        props.onMove(d.id, to)
      }
    }
    setDragId(null)
    setOverCol(null)
  }

  function onPointerDown(e: React.PointerEvent<HTMLElement>, t: Todo, status: TodoStatus): void {
    if (e.button !== 0 || drag.current) return
    const target = e.target as HTMLElement
    if (target.closest('button, input, select, a, textarea')) return
    const onHandle = !!target.closest('.todo-card-handle')
    // no toque só a alça arrasta; o resto do card continua rolando a página
    if (e.pointerType !== 'mouse' && !onHandle) return
    if (e.pointerType === 'mouse') e.preventDefault() // evita selecionar texto
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    drag.current = {
      id: t.id,
      from: status,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      offX: e.clientX - r.left,
      offY: e.clientY - r.top,
      el,
      ghost: null,
      scroller: el.closest('.module-page') as HTMLElement | null,
      over: null,
      raf: 0,
      unlisten: () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
      }
    }
    const onUp = (ev: PointerEvent): void => {
      if (ev.pointerId === drag.current?.pointerId) endDrag(true)
    }
    const onCancel = (): void => endDrag(false)
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  return (
    <div className="todo-board">
      {STATUSES.map((st) => {
        const items = columns[st]
        const count = st === 'done' ? doneTotal - done.length + items.length : items.length
        return (
          <section key={st} data-col={st} className={`todo-col todo-col-${st} ${overCol === st ? 'drag-over' : ''}`}>
            <header className="todo-col-head">
              <span>{STATUS_LABELS[st]}</span>
              <span className="kanban-count">{count}</span>
            </header>
            <div className="todo-col-body">
              {items.length === 0 && <div className="todo-col-empty">{tr('todo.arrasteUmCardParaCa')}</div>}
              {items.map((t) => renderCard(t, st))}
              {st === 'done' && doneRemaining > 0 && (
                <button className="btn btn-secondary btn-sm todo-more" onClick={props.onLoadMoreDone} disabled={loading}>
                  {loading ? tr('todo.carregando') : tr('todo.verMaisDe', { p0: Math.min(donePage, doneRemaining), doneRemaining })}
                </button>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )

  function renderCard(t: Todo, status: TodoStatus): React.ReactElement {
    const isDone = status === 'done'
    const prio = priorityDef(t.priority)
    const due = dueMeta(t.dueDate, isDone)
    const proj = props.projectName(t.projectId)
    const type = todoTypeDef(t.type)
    const style = {
      '--prio': prio.color,
      ...(t.priority > 0 ? {} : { borderLeftColor: 'var(--border)' })
    } as React.CSSProperties
    return (
      <div
        key={t.id}
        className={`todo-card ${t.priority > 0 ? 'has-prio' : ''} ${isDone ? 'is-done' : ''} ${
          selectedId === t.id ? 'selected' : ''
        } ${dragId === t.id ? 'dragging' : ''}`}
        style={style}
        onPointerDown={(e) => onPointerDown(e, t, status)}
        onClick={() => {
          if (suppressClick.current) return
          props.onSelect(t.id)
          props.onEdit(t)
        }}
        title={tr('todo.arrasteParaMudarDeColuna')}
      >
        <div className="todo-card-top">
          <span className="todo-card-handle" aria-hidden>
            ⠿
          </span>
          <span className="todo-card-title">{t.title}</span>
          <button
            className="priority-dot"
            title={tr('todo.prioridadeCliquePAlternar', { label: prio.label })}
            style={{ background: prio.color }}
            onClick={(e) => {
              e.stopPropagation()
              props.onCyclePriority(t)
            }}
          />
        </div>
        <div className="todo-card-meta">
          <span className="todo-type-chip" title={tr('todo.tipo2', { label: type.label })} style={{ borderColor: type.color, color: type.color }}>
            {type.icon} {type.label}
          </span>
          {proj && <span className="project-chip">{proj}</span>}
          {t.recurrence && <span title={tr('todo.tarefaRecorrente')}>🔁</span>}
          {t.notes && t.notes.trim() && <span title={t.notes}>📝</span>}
          {due && <span className={`due-badge ${due.cls}`}>{due.label}</span>}
        </div>
      </div>
    )
  }
}
