import { create } from 'zustand'
import type { AiConversation, AiConversationPatch, AiImageInput, AiPromptResponse, AiTurn } from '../../../../shared/aiConversations'

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

interface ConvState {
  conversations: AiConversation[]
  archived: AiConversation[]
  showArchived: boolean
  selectedId: string | null
  turns: Record<string, AiTurn[]>
  /** A tela do Prompt Runner está aberta (a conversa selecionada conta como vista). */
  viewing: boolean
  loaded: boolean
  setViewing: (v: boolean) => void
  markSeen: (id: string) => void
  refresh: () => Promise<void>
  setShowArchived: (v: boolean) => Promise<void>
  select: (id: string | null) => Promise<void>
  loadTurns: (id: string) => Promise<void>
  create: (params: AiConversationPatch) => Promise<AiConversation>
  update: (id: string, patch: AiConversationPatch) => Promise<void>
  remove: (id: string, removeWorktree?: boolean) => Promise<void>
  send: (id: string, text: string, images?: AiImageInput[]) => Promise<void>
  cancel: (id: string) => Promise<void>
  respond: (id: string, requestId: string, r: AiPromptResponse) => Promise<void>
  /** Liga a escuta do SSE (uma vez por app). */
  listen: () => void
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
    const conversations = await window.api.conv.list(false)
    set({ conversations, loaded: true })
    const st = get()
    if (st.viewing && st.selectedId) st.markSeen(st.selectedId)
    if (get().showArchived) set({ archived: await window.api.conv.list(true) })
  },

  setShowArchived: async (v) => {
    set({ showArchived: v })
    if (v) set({ archived: await window.api.conv.list(true) })
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
    const r = await window.api.conv.get(id)
    if (!r) return
    set((s) => ({
      turns: { ...s.turns, [id]: r.turns },
      conversations: r.conversation.archived ? s.conversations : upsert(s.conversations, r.conversation)
    }))
  },

  create: async (params) => {
    const c = await window.api.conv.create(params)
    set((s) => ({
      conversations: upsert(s.conversations, c),
      turns: { ...s.turns, [c.id]: [] }
    }))
    return c
  },

  update: async (id, patch) => {
    const c = await window.api.conv.update(id, patch)
    if (!c) return
    set((s) => ({
      conversations: c.archived ? s.conversations.filter((x) => x.id !== id) : upsert(s.conversations, c),
      archived: c.archived ? upsert(s.archived, c) : s.archived.filter((x) => x.id !== id)
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

  listen: () => {
    if (unlisten) return
    unlisten = window.api.conv.onUpdate((u) => {
      const s = get()
      if (u.removed) {
        set({
          conversations: s.conversations.filter((x) => x.id !== u.conversationId)
        })
        return
      }
      if (u.conversation) {
        const c = u.conversation
        set({ conversations: c.archived ? s.conversations.filter((x) => x.id !== c.id) : upsert(s.conversations, c) })
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
