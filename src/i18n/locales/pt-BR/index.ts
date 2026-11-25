import { common } from './common'
import { nav } from './nav'
import { settings } from './settings'
import { shell } from './shell'

/** Dicionário de referência. Cada módulo tem seu arquivo, com chaves prefixadas (`todo.*`, `finance.*`…). */
export const ptBR = {
  ...common,
  ...nav,
  ...settings,
  ...shell
}

export type MessageKey = keyof typeof ptBR
export type Messages = Record<MessageKey, string>
