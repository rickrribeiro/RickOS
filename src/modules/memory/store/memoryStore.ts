import { create } from 'zustand'
import type { MemoryCategory } from '../../../../shared/memory'

export type MemoryTab = 'overview' | 'memories' | 'inbox' | 'gaps' | 'interview' | 'timeline' | 'connections' | 'inspector' | 'settings'

interface MemoryState {
  tab: MemoryTab
  categories: MemoryCategory[]
  pending: number
  /** Memória aberta no painel de detalhes (qualquer aba pode abrir). */
  openId: number | null
  /** Pré-filtro ao navegar para a aba Memórias. */
  categoryFilter: number | null
  setTab: (t: MemoryTab) => void
  open: (id: number | null) => void
  goCategory: (id: number | null) => void
  loadCategories: () => Promise<void>
  loadPending: () => Promise<void>
}

const TAB_KEY = 'rickos:memoryTab'
const initialTab = (): MemoryTab => {
  try {
    return (localStorage.getItem(TAB_KEY) as MemoryTab) || 'overview'
  } catch {
    return 'overview'
  }
}

export const useMemoryStore = create<MemoryState>((set) => ({
  tab: initialTab(),
  categories: [],
  pending: 0,
  openId: null,
  categoryFilter: null,
  setTab: (tab) => {
    try {
      localStorage.setItem(TAB_KEY, tab)
    } catch {
      // armazenamento indisponível: só não lembra a aba
    }
    set({ tab })
  },
  open: (openId) => set({ openId }),
  goCategory: (categoryFilter) => {
    set({ categoryFilter, tab: 'memories' })
  },
  loadCategories: async () => set({ categories: await window.api.memory.categories(true) }),
  loadPending: async () => {
    const s = await window.api.memory.suggestions({ status: 'open', limit: 500 })
    set({ pending: s.length })
  }
}))
