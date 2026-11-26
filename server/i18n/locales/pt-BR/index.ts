import { common } from './common'
import { rpc } from './rpc'
import { services } from './services'
import { flights } from './flights'
import { chats } from './chats'
import { aiconv } from './aiconv'
import { db } from './db'
import { estudos } from './estudos'

/** Textos que o servidor manda para a interface (notificações, alertas, erros). Prompts de IA NÃO entram aqui. */
export const ptBR = {
  ...common,
  ...rpc,
  ...services,
  ...flights,
  ...chats,
  ...aiconv,
  ...db,
  ...estudos
}

export type ServerKey = keyof typeof ptBR
export type ServerMessages = Record<ServerKey, string>
