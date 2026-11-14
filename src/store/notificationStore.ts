import { create } from 'zustand'
import { AppNotification, NotificationScope } from '../types'
import { subscribe } from '../api/transport'

interface NotificationState {
  items: AppNotification[]
  unread: number
  loaded: boolean
  load: () => Promise<void>
  markRead: (id: number, read?: boolean) => Promise<void>
  markAllRead: (scope?: NotificationScope) => Promise<void>
  remove: (id: number) => Promise<void>
  clear: (onlyRead?: boolean, scope?: NotificationScope) => Promise<void>
}

/** Avisos do Prompt Runner (os antigos tinham source 'ia', mas sempre page 'ai-runner'). */
export const isClaudeNotification = (n: Pick<AppNotification, 'source' | 'page'>): boolean =>
  n.source === 'claude' || n.page === 'ai-runner'

export const inScope = (n: AppNotification, scope?: NotificationScope): boolean =>
  !scope || (scope === 'claude') === isClaudeNotification(n)

const countUnread = (items: AppNotification[]): number => items.filter((n) => !n.readAt).length

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  unread: 0,
  loaded: false,

  load: async () => {
    const [items, unread] = await Promise.all([
      window.api.notifications.list(100),
      window.api.notifications.unreadCount()
    ])
    set({ items, unread, loaded: true })
  },

  // Otimista: atualiza a UI na hora; o evento 'notifications:updated' reconcilia depois.
  markRead: async (id, read = true) => {
    const items = get().items.map((n) =>
      n.id === id ? { ...n, readAt: read ? n.readAt ?? new Date().toISOString() : null } : n
    )
    set({ items, unread: countUnread(items) })
    await window.api.notifications.markRead(id, read)
  },

  markAllRead: async (scope) => {
    const now = new Date().toISOString()
    const items = get().items.map((n) => (inScope(n, scope) ? { ...n, readAt: n.readAt ?? now } : n))
    set({ items, unread: countUnread(items) })
    await window.api.notifications.markAllRead(scope)
  },

  remove: async (id) => {
    const items = get().items.filter((n) => n.id !== id)
    set({ items, unread: countUnread(items) })
    await window.api.notifications.delete(id)
  },

  clear: async (onlyRead = false, scope) => {
    const items = get().items.filter((n) => !inScope(n, scope) || (onlyRead && !n.readAt))
    set({ items, unread: countUnread(items) })
    await window.api.notifications.clear(onlyRead, scope)
  }
}))

// Mantém badge/lista em sincronia entre desktop e celular (SSE do servidor).
let wired = false
export function wireNotifications(): void {
  if (wired) return
  wired = true
  void useNotificationStore.getState().load().catch(() => undefined)
  subscribe('notifications:updated', () => {
    void useNotificationStore.getState().load().catch(() => undefined)
  })
}
