import { create } from 'zustand'
import { ptBR, type Messages, type MessageKey } from './locales/pt-BR'
import { en } from './locales/en'
import { es } from './locales/es'

/**
 * i18n do rickOS, feito à mão (sem lib):
 * - dicionários planos por idioma; pt-BR é a referência e `en`/`es` têm o mesmo tipo, então
 *   chave faltando ou sobrando quebra o `tsc`;
 * - interpolação `{nome}`; plural com `|` ("{count} conta|{count} contas"), escolhido por
 *   `Intl.PluralRules` quando `count` é passado;
 * - `t()` é uma função comum (serve fora de componentes e em constantes de módulo). Trocar o
 *   idioma recarrega a página, então nada precisa assinar o store para re-renderizar.
 */

export type Locale = 'pt-BR' | 'en' | 'es'
export type { MessageKey }

export const LOCALES: { id: Locale; label: string }[] = [
  { id: 'pt-BR', label: 'Português' },
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' }
]

const DICTS: Record<Locale, Messages> = { 'pt-BR': ptBR, en, es }

/** Chave na tabela `settings` (vale para todos os dispositivos) e cache local para não piscar em pt. */
export const LOCALE_SETTING = 'language'
const CACHE_KEY = 'rickos-locale'

function isLocale(v: unknown): v is Locale {
  return v === 'pt-BR' || v === 'en' || v === 'es'
}

function readCache(): Locale {
  try {
    const v = localStorage.getItem(CACHE_KEY)
    return isLocale(v) ? v : 'pt-BR'
  } catch {
    return 'pt-BR'
  }
}

function applyLocale(locale: Locale): void {
  try {
    localStorage.setItem(CACHE_KEY, locale)
  } catch {
    /* sem storage: vale só nesta sessão */
  }
  document.documentElement.lang = locale
}

interface LocaleState {
  locale: Locale
  /** Troca o idioma e salva no servidor. */
  setLocale: (l: Locale) => Promise<void>
  /** Lê o idioma salvo no servidor (no boot e quando outro cliente muda). */
  syncFromServer: () => Promise<void>
}

export const useLocaleStore = create<LocaleState>((_set, get) => ({
  locale: readCache(),
  setLocale: async (locale) => {
    if (locale === get().locale) return
    await window.api.settings.set(LOCALE_SETTING, locale)
    applyLocale(locale)
    window.location.reload()
  },
  syncFromServer: async () => {
    try {
      const v = await window.api.settings.get(LOCALE_SETTING)
      if (isLocale(v) && v !== get().locale) {
        applyLocale(v)
        window.location.reload()
      }
    } catch {
      /* servidor fora: fica o cache */
    }
  }
}))

document.documentElement.lang = useLocaleStore.getState().locale

export function getLocale(): Locale {
  return useLocaleStore.getState().locale
}

export type TParams = Record<string, string | number | null | undefined>

/** Traduz `key` no idioma atual. Cai no pt-BR e, em último caso, na própria chave. */
export function t(key: MessageKey, params?: TParams): string {
  const locale = getLocale()
  let msg: string = DICTS[locale][key] ?? ptBR[key] ?? key
  if (params && typeof params.count === 'number' && msg.includes('|')) {
    const [one, other] = msg.split('|')
    msg = new Intl.PluralRules(locale).select(params.count) === 'one' ? one : (other ?? one)
  }
  if (params) msg = msg.replace(/\{(\w+)\}/g, (m, name: string) => (params[name] == null ? m : String(params[name])))
  return msg
}

/** Hook para componentes que precisam do idioma em si (o `t` já basta para textos). */
export function useLocale(): Locale {
  return useLocaleStore((s) => s.locale)
}

// ---------- formatação (datas, números) no idioma atual ----------

export function fmtNumber(n: number, opts?: Intl.NumberFormatOptions): string {
  return n.toLocaleString(getLocale(), opts)
}

/** Moeda continua sendo a da conta (padrão BRL); só o formato acompanha o idioma. */
export function fmtCurrency(n: number, currency = 'BRL', opts?: Intl.NumberFormatOptions): string {
  return n.toLocaleString(getLocale(), { style: 'currency', currency, ...opts })
}

export function fmtDate(d: Date | string | number, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(d).toLocaleDateString(getLocale(), opts)
}

export function fmtTime(d: Date | string | number, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(d).toLocaleTimeString(getLocale(), opts ?? { hour: '2-digit', minute: '2-digit' })
}

export function fmtDateTime(d: Date | string | number, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(d).toLocaleString(getLocale(), opts)
}

/** Dom..Sáb no idioma atual (7/1/2024 foi um domingo). */
export function weekdayNames(width: 'short' | 'long' | 'narrow' = 'short'): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 7 + i).toLocaleDateString(getLocale(), { weekday: width }).replace(/\.$/, '')
  )
}

/** Janeiro..Dezembro no idioma atual, com a inicial maiúscula. */
export function monthNames(width: 'short' | 'long' = 'long'): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const s = new Date(2024, i, 1).toLocaleDateString(getLocale(), { month: width }).replace(/\.$/, '')
    return s.charAt(0).toUpperCase() + s.slice(1)
  })
}
