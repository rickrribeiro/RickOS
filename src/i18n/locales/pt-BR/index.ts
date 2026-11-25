import { common } from './common'

/** Dicionário de referência. Cada módulo tem seu arquivo, com chaves prefixadas (`todo.*`, `finance.*`…). */
export const ptBR = {
  ...common
}

export type MessageKey = keyof typeof ptBR
export type Messages = Record<MessageKey, string>
