import { common } from './common'
import { nav } from './nav'
import { settings } from './settings'
import { shell } from './shell'
import { skin } from './skin'
import { timetracker } from './timetracker'
import { home } from './home'
import { inbox } from './inbox'
import { todo } from './todo'
import { braindump } from './braindump'
import { goals } from './goals'
import { habits } from './habits'
import { automations } from './automations'
import { memory } from './memory'
import { crm } from './crm'
import { chats } from './chats'
import { estudos } from './estudos'
import { finance } from './finance'
import { projects } from './projects'
import { travel } from './travel'
import { flights } from './flights'
import { ai } from './ai'
import { misc } from './misc'
import { api } from './api'

/** Dicionário de referência. Cada módulo tem seu arquivo, com chaves prefixadas (`todo.*`, `finance.*`…). */
export const ptBR = {
  ...common,
  ...nav,
  ...settings,
  ...shell,
  ...skin,
  ...timetracker,
  ...home,
  ...inbox,
  ...todo,
  ...braindump,
  ...goals,
  ...habits,
  ...automations,
  ...memory,
  ...crm,
  ...chats,
  ...estudos,
  ...finance,
  ...projects,
  ...travel,
  ...flights,
  ...ai,
  ...misc,
  ...api
}

export type MessageKey = keyof typeof ptBR
export type Messages = Record<MessageKey, string>
