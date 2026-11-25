import type { Messages } from '../pt-BR'
import { common } from './common'
import { nav } from './nav'
import { settings } from './settings'
import { shell } from './shell'

export const en: Messages = {
  ...common,
  ...nav,
  ...settings,
  ...shell
}
