import { common } from './common'
import { settings } from './settings'

/** Dicionário de referência. Cada módulo tem seu arquivo, com chaves prefixadas (`todo.*`, `finance.*`…). */
export const ptBR = {
  ...common,
  ...settings
}

export type MessageKey = keyof typeof ptBR
export type Messages = Record<MessageKey, string>
