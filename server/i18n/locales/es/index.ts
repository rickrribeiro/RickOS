import type { ServerMessages } from '../pt-BR'
import { common } from './common'
import { services } from './services'
import { flights } from './flights'
import { chats } from './chats'
import { aiconv } from './aiconv'
import { db } from './db'
import { estudos } from './estudos'
import { rpc } from './rpc'

export const es: ServerMessages = {
  ...common,
  ...services,
  ...flights,
  ...chats,
  ...aiconv,
  ...db,
  ...rpc,
  ...estudos
}
