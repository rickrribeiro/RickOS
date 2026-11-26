import { useUIStore } from '../../store/uiStore'

/** Abas de Configurações, agrupadas por tipo de configuração (a ordem é a da tela). */
export const SETTINGS_TABS = ['preferencias', 'integracoes', 'ia', 'dados'] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]

export const SETTINGS_TAB_ICON: Record<SettingsTab, string> = {
  preferencias: '⚙️',
  integracoes: '🔗',
  ia: '🤖',
  dados: '🗄️'
}

const KEY = 'settings_tab'
let pendente: SettingsTab | null = null
let integracaoPendente: string | null = null

const ehAba = (v: unknown): v is SettingsTab => typeof v === 'string' && (SETTINGS_TABS as readonly string[]).includes(v)

/** Aba inicial: a pedida por `openSettings(aba)` ou a última aberta neste navegador. Não consome o pedido (ver `clearSettingsRequest`). */
export function initialSettingsTab(): SettingsTab {
  if (pendente) return pendente
  try {
    const salvo = localStorage.getItem(KEY)
    if (ehAba(salvo)) return salvo
  } catch {
    /* sem storage: abre na primeira */
  }
  return 'preferencias'
}

export function rememberSettingsTab(aba: SettingsTab): void {
  try {
    localStorage.setItem(KEY, aba)
  } catch {
    /* só conveniência */
  }
}

/** Integração pedida por `openSettings('integracoes', id)`. */
export function pendingIntegration(): string | null {
  return integracaoPendente
}

/**
 * Descarta o pedido de `openSettings` depois de montar a tela. Fica num efeito, não no
 * inicializador do useState: no StrictMode o inicializador roda duas vezes.
 */
export function clearSettingsRequest(): void {
  pendente = null
  integracaoPendente = null
}

/** Abre Configurações direto numa aba e, opcionalmente, no modal de uma integração (ex.: 'mensagens'). */
export function openSettings(aba: SettingsTab, integracao?: string): void {
  pendente = aba
  integracaoPendente = integracao ?? null
  rememberSettingsTab(aba)
  useUIStore.getState().setPage('settings')
}
