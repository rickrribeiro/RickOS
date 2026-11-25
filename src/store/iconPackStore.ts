import { create } from 'zustand'
import { DEFAULT_ICON_PACK, ICON_PACKS } from '../icons/packs'

const key = (): string => `rickos-icons-${window.desktop ? 'desktop' : 'web'}`

function read(): string {
  try {
    const v = localStorage.getItem(key())
    return v && ICON_PACKS.some((p) => p.id === v) ? v : DEFAULT_ICON_PACK
  } catch {
    return DEFAULT_ICON_PACK
  }
}

interface IconPackState {
  pack: string
  setPack: (id: string) => void
}

/** Pacote de ícones: salvo por dispositivo (desktop e web independentes), como a skin. */
export const useIconPackStore = create<IconPackState>((set) => ({
  pack: read(),
  setPack: (pack) => {
    try {
      if (pack === DEFAULT_ICON_PACK) localStorage.removeItem(key())
      else localStorage.setItem(key(), pack)
    } catch {
      /* sem storage: vale só nesta sessão */
    }
    set({ pack })
  }
}))
