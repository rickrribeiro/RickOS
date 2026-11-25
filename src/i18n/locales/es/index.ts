import type { Messages } from '../pt-BR'
import { common } from './common'
import { nav } from './nav'
import { settings } from './settings'
import { shell } from './shell'
import { skin } from './skin'
import { timetracker } from './timetracker'
import { home } from './home'
import { inbox } from './inbox'
import { habits } from './habits'
import { memory } from './memory'
import { todo } from './todo'
import { braindump } from './braindump'
import { goals } from './goals'
import { automations } from './automations'
import { chats } from './chats'
import { crm } from './crm'
import { estudos } from './estudos'
import { finance } from './finance'
import { projects } from './projects'
import { flights } from './flights'
import { travel } from './travel'
import { ai } from './ai'
import { misc } from './misc'
import { api } from './api'

export const es: Messages = {
  ...common,
  ...nav,
  ...settings,
  ...shell,
  ...skin,
  ...timetracker,
  ...home,
  ...inbox,
  ...habits,
  ...memory,
  ...todo,
  ...braindump,
  ...goals,
  ...automations,
  ...chats,
  ...crm,
  ...estudos,
  ...finance,
  ...projects,
  ...flights,
  ...travel,
  ...ai,
  ...misc,
  ...api
}
