import { create } from 'zustand'
import { Todo, TodoListFilters, TodoListResult } from '../../../types'

/** Tamanho da página de concluídas no TODO ("ver mais" carrega mais esse tanto). */
export const DONE_PAGE = 15

interface TodoState {
  todos: Todo[]
  /** Resultado filtrado/paginado da página TODO (vem do servidor). */
  list: TodoListResult
  /** Filtros da última consulta da página TODO; null = página não montada. */
  listFilters: TodoListFilters | null
  listLoading: boolean
  refresh: () => Promise<void>
  /** Consulta a página TODO com novos filtros (volta a mostrar só a 1ª página de concluídas). */
  loadList: (filters: Omit<TodoListFilters, 'doneLimit'>) => Promise<void>
  loadMoreDone: () => Promise<void>
  closeList: () => void
  capture: (title: string, notes?: string | null) => Promise<void>
  create: (title: string, status?: string, type?: string) => Promise<void>
  setStatus: (id: number, status: string) => Promise<void>
  update: (todo: Todo) => Promise<void>
  remove: (id: number) => Promise<void>
  inbox: () => Todo[]
  active: () => Todo[]
}

const EMPTY_LIST: TodoListResult = { open: [], done: [], doneTotal: 0, doneRecurring: 0, upcomingRecurring: 0 }
// descarta respostas atrasadas quando os filtros mudam rápido (busca digitando)
let listSeq = 0

/** Single store backing both the Inbox and the TODO views (they share the `todos` table). */
export const useTodoStore = create<TodoState>((set, get) => {
  async function fetchList(filters: TodoListFilters): Promise<void> {
    const seq = ++listSeq
    set({ listFilters: filters, listLoading: true })
    const list = await window.api.todos.list(filters)
    if (seq !== listSeq) return
    set({ list, listLoading: false })
  }

  return {
    todos: [],
    list: EMPTY_LIST,
    listFilters: null,
    listLoading: false,

    refresh: async () => {
      const filters = get().listFilters
      const [todos] = await Promise.all([window.api.todos.getAll(), filters ? fetchList(filters) : null])
      set({ todos })
    },

    loadList: (filters) => fetchList({ ...filters, doneLimit: DONE_PAGE }),

    loadMoreDone: async () => {
      const f = get().listFilters
      if (!f) return
      await fetchList({ ...f, doneLimit: (f.doneLimit ?? DONE_PAGE) + DONE_PAGE })
    },

    closeList: () => {
      listSeq++
      set({ listFilters: null, list: EMPTY_LIST, listLoading: false })
    },

    capture: async (title, notes = null) => {
      await window.api.todos.create(title, notes, 'inbox', 'quick-capture')
      await get().refresh()
    },

    create: async (title, status = 'inbox', type = 'projeto') => {
      await window.api.todos.create(title, null, status, 'manual', 0, null, null, 0, null, type)
      await get().refresh()
    },

    setStatus: async (id, status) => {
      const { todos, list } = get()
      const t = todos.find((x) => x.id === id) ?? list.open.find((x) => x.id === id) ?? list.done.find((x) => x.id === id)
      if (!t) return
      await window.api.todos.update(id, t.title, t.notes, status, t.priority, t.dueDate, t.projectId, t.recurrence, t.type)
      await get().refresh()
    },

    update: async (todo) => {
      await window.api.todos.update(
        todo.id,
        todo.title,
        todo.notes,
        todo.status,
        todo.priority,
        todo.dueDate,
        todo.projectId,
        todo.recurrence,
        todo.type
      )
      await get().refresh()
    },

    remove: async (id) => {
      await window.api.todos.delete(id)
      await get().refresh()
    },

    inbox: () => get().todos.filter((t) => t.status === 'inbox'),
    active: () => get().todos.filter((t) => t.status !== 'inbox')
  }
})
