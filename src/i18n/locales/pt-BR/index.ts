import { common } from './common'
import { nav } from './nav'
import { settings } from './settings'
import { shell } from './shell'
import { skin } from './skin'

/** Dicionário de referência. Cada módulo tem seu arquivo, com chaves prefixadas (`todo.*`, `finance.*`…). */
export const ptBR = {
  ...common,
  ...nav,
  ...settings,
  ...shell,
  ...skin
}

export type MessageKey = keyof typeof ptBR
export type Messages = Record<MessageKey, string>
