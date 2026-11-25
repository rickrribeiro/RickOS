import { getSetting } from '../database/queries'
import { formatMessage, type TParams } from '../../shared/i18n'
import { ptBR, type ServerKey, type ServerMessages } from './locales/pt-BR'
import { en } from './locales/en'
import { es } from './locales/es'

/**
 * i18n do servidor: textos que vão para a interface (notificações, alertas, mensagens de erro).
 * O idioma é o mesmo da interface (`settings.language`). Prompts e contexto de IA ficam em pt.
 * Sem banco (testes, scripts), fica tudo em pt.
 */
type Locale = 'pt-BR' | 'en' | 'es'
const DICTS: Record<Locale, ServerMessages> = { 'pt-BR': ptBR, en, es }
let current: Locale = 'pt-BR'

function isLocale(v: unknown): v is Locale {
  return v === 'pt-BR' || v === 'en' || v === 'es'
}

/** Lê o idioma salvo (no boot). */
export async function loadServerLocale(): Promise<void> {
  try {
    const v = await getSetting('language')
    if (isLocale(v)) current = v
  } catch {
    /* sem banco: fica pt */
  }
}

/** Chamado quando o usuário troca o idioma em Configurações. */
export function setServerLocale(v: string): void {
  if (isLocale(v)) current = v
}

export function serverLocale(): Locale {
  return current
}

export function tt(key: ServerKey, params?: TParams): string {
  return formatMessage(DICTS[current][key] ?? ptBR[key] ?? key, params, current)
}
