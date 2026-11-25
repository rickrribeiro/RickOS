import type { ServerMessages } from '../pt-BR'
import { common } from './common'
import { services } from './services'
import { flights } from './flights'
import { chats } from './chats'
import { aiconv } from './aiconv'
import { db } from './db'
import { rpc } from './rpc'

export const en: ServerMessages = {
  ...common,
  ...services,
  ...flights,
  ...chats,
  ...aiconv,
  ...db,
  ...rpc
}
