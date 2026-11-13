import { create } from 'zustand'
import type { AiConversation, AiConversationPatch, AiImageInput, AiPromptResponse, AiTurn } from '../../../../shared/aiConversations'

/**
 * Conversas do Prompt Runner. O servidor é dono das execuções; aqui só espelhamos a
 * lista, os turnos da conversa aberta e as atualizações ao vivo (`conv:update`).
 */

const UNSEEN_KEY = 'rickos:runnerUnseen'

function loadUnseen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(UNSEEN_KEY) || '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}
function saveUnseen(ids: string[]): void {
  try {
    localStorage.setItem(UNSEEN_KEY, JSON.stringify(ids))
  } catch {
    // armazenamento indisponível
  }
}

interface ConvState {
  conversations: AiConversation[]
  archived: AiConversation[]
  showArchived: boolean
  selectedId: string | null
  turns: Record<string, AiTurn[]>
  /** Conversas que terminaram enquanto não estavam abertas. */
  unseen: string[]
  loaded: boolean
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
  /** Liga a escuta do SSE; devolve a função para desligar. */
  listen: () => () => void
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
  unseen: loadUnseen(),
  loaded: false,

  refresh: async () => {
    const conversations = await window.api.conv.list(false)
    set({ conversations, loaded: true })
    if (get().showArchived) set({ archived: await window.api.conv.list(true) })
  },

  setShowArchived: async (v) => {
    set({ showArchived: v })
    if (v) set({ archived: await window.api.conv.list(true) })
  },

  select: async (id) => {
    const unseen = id ? get().unseen.filter((x) => x !== id) : get().unseen
    saveUnseen(unseen)
    set({ selectedId: id, unseen })
    if (id) await get().loadTurns(id)
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
    set((s) => ({ conversations: upsert(s.conversations, c), turns: { ...s.turns, [c.id]: [] } }))
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

  listen: () =>
    window.api.conv.onUpdate((u) => {
      const s = get()
      if (u.removed) {
        set({ conversations: s.conversations.filter((x) => x.id !== u.conversationId) })
        return
      }
      if (u.conversation) {
        const c = u.conversation
        const prev = s.conversations.find((x) => x.id === c.id)
        // terminou fora da tela → marca como não vista
        let unseen = s.unseen
        if (prev?.running && !c.running && s.selectedId !== c.id && !unseen.includes(c.id)) {
          unseen = [...unseen, c.id]
          saveUnseen(unseen)
        }
        set({
          conversations: c.archived ? s.conversations.filter((x) => x.id !== c.id) : upsert(s.conversations, c),
          unseen
        })
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
}))
