import { create } from 'zustand'
import type { AiConversation, AiConversationPatch, AiImageInput, AiPromptResponse, AiTurn, ConvListQuery } from '../../../../shared/aiConversations'
import { CONV_PAGE_SIZE } from '../../../../shared/aiConversations'

/**
 * Conversas do Prompt Runner. O servidor é dono das execuções; aqui só espelhamos a
 * lista, os turnos da conversa aberta e as atualizações ao vivo (`conv:update`).
 */

/**
 * "Não lida": a conversa foi atualizada (turno terminou) depois da última vez que você a
 * viu. O `seenAt` fica no servidor, então ler no celular limpa o destaque no desktop.
 */
export function isUnseen(c: AiConversation): boolean {
  return !c.running && !!c.seenAt && c.updatedAt > c.seenAt
}

let unlisten: (() => void) | null = null

/** Filtro da lista (busca e projeto). Vazio = listas normais; senão a busca vai ao servidor. */
export interface ConvFilter {
  q: string
  projectId: number | 'none' | null
}

interface ConvResults {
  key: string
  items: AiConversation[]
  hasMore: boolean
  loading: boolean
}

const filterActive = (f: ConvFilter): boolean => !!f.q.trim() || f.projectId != null
const filterKey = (f: ConvFilter, archived: boolean): string => JSON.stringify([f.q.trim().toLowerCase(), f.projectId, archived])

/** Cursor para a próxima página: a última conversa não fixada já carregada. */
function cursorOf(list: AiConversation[]): ConvListQuery['after'] {
  const last = [...list].reverse().find((c) => !c.pinned)
  return last ? { updatedAt: last.updatedAt, id: last.id } : null
}

function appendUnique(list: AiConversation[], more: AiConversation[]): AiConversation[] {
  const ids = new Set(list.map((c) => c.id))
  return [...list, ...more.filter((c) => !ids.has(c.id))]
}

/** Atualiza a conversa nos resultados da busca (sem inserir: ela pode não casar com o filtro). */
function patchResults(r: ConvResults | null, c: AiConversation, archivedView: boolean): ConvResults | null {
  if (!r || !r.items.some((x) => x.id === c.id)) return r
  if (!!c.archived !== archivedView) return { ...r, items: r.items.filter((x) => x.id !== c.id) }
  return { ...r, items: r.items.map((x) => (x.id === c.id ? { ...x, ...c } : x)) }
}

interface ConvState {
  conversations: AiConversation[]
  archived: AiConversation[]
  showArchived: boolean
  selectedId: string | null
  turns: Record<string, AiTurn[]>
  /** Há turnos mais antigos no servidor do que os carregados. */
  turnsHasMore: Record<string, boolean>
  loadingOlder: string | null
  hasMore: { active: boolean; archived: boolean }
  loadingMore: boolean
  filter: ConvFilter
  results: ConvResults | null
  /** Projetos com conversa (para o filtro) e se há conversa sem projeto. */
  projectIds: number[]
  hasNoProject: boolean
  /** A tela do Prompt Runner está aberta (a conversa selecionada conta como vista). */
  viewing: boolean
  loaded: boolean
  setViewing: (v: boolean) => void
  markSeen: (id: string) => void
  refresh: () => Promise<void>
  setShowArchived: (v: boolean) => Promise<void>
  select: (id: string | null) => Promise<void>
  loadTurns: (id: string) => Promise<void>
  loadOlderTurns: (id: string) => Promise<void>
  /** Próxima página da lista visível (busca, arquivadas ou ativas). */
  loadMore: () => Promise<void>
  setFilter: (f: ConvFilter) => Promise<void>
  create: (params: AiConversationPatch) => Promise<AiConversation>
  update: (id: string, patch: AiConversationPatch) => Promise<void>
  remove: (id: string, removeWorktree?: boolean) => Promise<void>
  send: (id: string, text: string, images?: AiImageInput[]) => Promise<void>
  cancel: (id: string) => Promise<void>
  respond: (id: string, requestId: string, r: AiPromptResponse) => Promise<void>
  /** Liga a escuta do SSE (uma vez por app). */
  listen: () => void
  /**
   * Turno mostrado como "rodando" numa conversa que o servidor diz estar parada (evento
   * perdido, servidor reiniciado…): recarrega os turnos do servidor.
   */
  checkStale: (c: AiConversation) => void
}

function upsert(list: AiConversation[], c: AiConversation): AiConversation[] {
  const i = list.findIndex((x) => x.id === c.id)
  const next = i >= 0 ? list.map((x) => (x.id === c.id ? { ...x, ...c } : x)) : [c, ...list]
  return next.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
}

export const useConvStore = create<ConvState>((set, get) => ({
  conversations: [],
  archived: [],
  showArchived: false,
  selectedId: null,
  turns: {},
  turnsHasMore: {},
  loadingOlder: null,
  hasMore: { active: false, archived: false },
  loadingMore: false,
  filter: { q: '', projectId: null },
  results: null,
  projectIds: [],
  hasNoProject: false,
  viewing: false,
  loaded: false,

  setViewing: (v) => {
    set({ viewing: v })
    const id = get().selectedId
    if (v && id) get().markSeen(id)
  },

  markSeen: (id) => {
    const c = get().conversations.find((x) => x.id === id) ?? get().archived.find((x) => x.id === id)
    if (!c || c.running || !isUnseen(c)) return
    // otimista: some o destaque já; o servidor confirma via conv:update
    set((s) => ({ conversations: s.conversations.map((x) => (x.id === id ? { ...x, seenAt: x.updatedAt } : x)) }))
    window.api.conv.markSeen(id).catch(() => {
      // sem rede: tenta de novo na próxima visita
    })
  },

  refresh: async () => {
    // recarrega do topo mantendo quantas páginas já estavam na tela
    const loadedRest = (list: AiConversation[]): number => Math.max(CONV_PAGE_SIZE, list.filter((c) => !c.pinned).length)
    const page = await window.api.conv.list({ archived: false, limit: loadedRest(get().conversations) })
    set((s) => ({
      conversations: page.items,
      hasMore: { ...s.hasMore, active: page.hasMore },
      projectIds: page.projectIds ?? s.projectIds,
      hasNoProject: page.hasNoProject ?? s.hasNoProject,
      loaded: true
    }))
    const st = get()
    if (st.viewing && st.selectedId) st.markSeen(st.selectedId)
    for (const c of page.items) st.checkStale(c)
    if (get().showArchived) {
      const arch = await window.api.conv.list({ archived: true, limit: loadedRest(get().archived) })
      set((s) => ({ archived: arch.items, hasMore: { ...s.hasMore, archived: arch.hasMore } }))
    }
    if (filterActive(get().filter)) await get().setFilter(get().filter)
  },

  setShowArchived: async (v) => {
    set({ showArchived: v })
    if (filterActive(get().filter)) void get().setFilter(get().filter)
    if (v) {
      const arch = await window.api.conv.list({ archived: true })
      set((s) => ({ archived: arch.items, hasMore: { ...s.hasMore, archived: arch.hasMore } }))
    }
  },

  setFilter: async (f) => {
    set({ filter: f })
    if (!filterActive(f)) {
      set({ results: null })
      return
    }
    const archived = get().showArchived
    const key = filterKey(f, archived)
    set((s) => ({ results: s.results?.key === key ? { ...s.results, loading: true } : { key, items: [], hasMore: false, loading: true } }))
    try {
      const page = await window.api.conv.list({ archived, q: f.q.trim(), projectId: f.projectId })
      if (get().results?.key !== key) return // filtro mudou no meio
      set({ results: { key, items: page.items, hasMore: page.hasMore, loading: false } })
    } catch (err) {
      if (get().results?.key === key) set((s) => ({ results: s.results ? { ...s.results, loading: false } : null }))
      throw err
    }
  },

  loadMore: async () => {
    const st = get()
    if (st.loadingMore) return
    const r = st.results
    if (r) {
      if (!r.hasMore || r.loading) return
      set({ loadingMore: true })
      try {
        const page = await window.api.conv.list({ archived: st.showArchived, q: st.filter.q.trim(), projectId: st.filter.projectId, after: cursorOf(r.items) })
        const cur = get().results
        if (cur?.key === r.key) set({ results: { ...cur, items: appendUnique(cur.items, page.items), hasMore: page.hasMore } })
      } finally {
        set({ loadingMore: false })
      }
      return
    }
    const archived = st.showArchived
    const list = archived ? st.archived : st.conversations
    if (!(archived ? st.hasMore.archived : st.hasMore.active)) return
    const after = cursorOf(list)
    if (!after) return
    set({ loadingMore: true })
    try {
      const page = await window.api.conv.list({ archived, after })
      set((s) =>
        archived
          ? { archived: appendUnique(s.archived, page.items), hasMore: { ...s.hasMore, archived: page.hasMore } }
          : { conversations: appendUnique(s.conversations, page.items), hasMore: { ...s.hasMore, active: page.hasMore } }
      )
    } finally {
      set({ loadingMore: false })
    }
  },

  select: async (id) => {
    set({ selectedId: id })
    if (id) {
      get().markSeen(id)
      await get().loadTurns(id)
      get().markSeen(id)
    }
  },

  loadTurns: async (id) => {
    // já tem turnos na tela: recarrega a partir do mais antigo deles (não perde o que foi paginado)
    const sinceId = get().turns[id]?.[0]?.id ?? null
    const r = await window.api.conv.get(id, { sinceId })
    if (!r) return
    set((s) => ({
      turns: { ...s.turns, [id]: r.turns },
      turnsHasMore: { ...s.turnsHasMore, [id]: r.hasMoreTurns },
      conversations: r.conversation.archived ? s.conversations : upsert(s.conversations, r.conversation)
    }))
  },

  loadOlderTurns: async (id) => {
    const st = get()
    const list = st.turns[id]
    if (st.loadingOlder === id || !list?.length || !st.turnsHasMore[id]) return
    set({ loadingOlder: id })
    try {
      const page = await window.api.conv.olderTurns(id, list[0].id)
      set((s) => {
        const cur = s.turns[id] ?? []
        const ids = new Set(cur.map((t) => t.id))
        return {
          turns: { ...s.turns, [id]: [...page.turns.filter((t) => !ids.has(t.id)), ...cur] },
          turnsHasMore: { ...s.turnsHasMore, [id]: page.hasMore }
        }
      })
    } finally {
      set({ loadingOlder: null })
    }
  },

  create: async (params) => {
    const c = await window.api.conv.create(params)
    set((s) => ({
      conversations: upsert(s.conversations, c),
      turns: { ...s.turns, [c.id]: [] },
      turnsHasMore: { ...s.turnsHasMore, [c.id]: false }
    }))
    return c
  },

  update: async (id, patch) => {
    const c = await window.api.conv.update(id, patch)
    if (!c) return
    set((s) => ({
      conversations: c.archived ? s.conversations.filter((x) => x.id !== id) : upsert(s.conversations, c),
      archived: c.archived ? upsert(s.archived, c) : s.archived.filter((x) => x.id !== id),
      results: patchResults(s.results, c, s.showArchived)
    }))
  },

  remove: async (id, removeWorktree) => {
    await window.api.conv.delete(id, removeWorktree)
    set((s) => {
      const turns = { ...s.turns }
      delete turns[id]
      return {
        conversations: s.conversations.filter((x) => x.id !== id),
        archived: s.archived.filter((x) => x.id !== id),
        results: s.results ? { ...s.results, items: s.results.items.filter((x) => x.id !== id) } : null,
        selectedId: s.selectedId === id ? null : s.selectedId,
        turns
      }
    })
  },

  send: async (id, text, images) => {
    await window.api.conv.send(id, text, images)
  },

  cancel: async (id) => {
    await window.api.conv.cancel(id)
  },

  respond: async (id, requestId, r) => {
    await window.api.conv.respond(id, requestId, r)
  },

  checkStale: (c) => {
    if (c.running) return
    const list = get().turns[c.id]
    if (list?.some((t) => t.status === 'running')) void get().loadTurns(c.id)
  },

  listen: () => {
    if (unlisten) return
    // servidor reiniciou / rede voltou: eventos perdidos não voltam, então recarrega tudo
    window.api.conv.onReconnect(() => {
      const st = get()
      st.refresh().catch(() => undefined)
      if (st.selectedId) void st.loadTurns(st.selectedId)
    })
    // rede de segurança: com um turno "rodando" na tela, confere o servidor de tempos em tempos
    setInterval(() => {
      const st = get()
      if (document.visibilityState !== 'visible' || !st.selectedId) return
      const turns = st.turns[st.selectedId]
      if (turns?.some((t) => t.status === 'running')) st.refresh().catch(() => undefined)
    }, 45_000)
    unlisten = window.api.conv.onUpdate((u) => {
      const s = get()
      if (u.removed) {
        set({
          conversations: s.conversations.filter((x) => x.id !== u.conversationId),
          results: s.results ? { ...s.results, items: s.results.items.filter((x) => x.id !== u.conversationId) } : null
        })
        return
      }
      if (u.conversation) {
        const c = u.conversation
        set({
          conversations: c.archived ? s.conversations.filter((x) => x.id !== c.id) : upsert(s.conversations, c),
          results: patchResults(s.results, c, s.showArchived)
        })
        get().checkStale(c)
        // resposta chegou com você olhando a conversa → já conta como vista
        if (s.viewing && s.selectedId === c.id && document.visibilityState === 'visible' && isUnseen(c)) get().markSeen(c.id)
      }
      if (u.turn) {
        const t = u.turn
        const list = s.turns[u.conversationId]
        if (!list) return // conversa não carregada: busca tudo ao abrir
        const i = list.findIndex((x) => x.id === t.id)
        const next = i >= 0 ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t]
        set({ turns: { ...get().turns, [u.conversationId]: next } })
      }
    })
    // voltou para a aba do navegador com a conversa aberta → conta como vista
    document.addEventListener('visibilitychange', () => {
      const st = get()
      if (document.visibilityState === 'visible' && st.viewing && st.selectedId) st.markSeen(st.selectedId)
    })
  }
}))

/** Conversas com resposta não lida e com pedido esperando você (para badges). */
export function useRunnerAttention(): { unseen: number; pending: number } {
  // seletores que devolvem números: o zustand só re-renderiza quando a contagem muda
  const pending = useConvStore((s) => s.conversations.filter((c) => !!c.pendingPrompts).length)
  const unseen = useConvStore(
    (s) => s.conversations.filter((c) => !c.pendingPrompts && isUnseen(c) && !(s.viewing && s.selectedId === c.id)).length
  )
  return { unseen, pending }
}
