import { DEFAULT_ICONS, IconKey } from './packs/default'
import { t } from '../i18n'

export type { IconKey }

/**
 * Um ícone é um emoji/texto ou uma imagem. Para imagem, importe o arquivo para
 * o Vite gerar a URL (funciona no desktop e na web):
 *   import folder from './xp/folder.png'
 *   icons: { folder: { src: folder } }
 */
export type IconSource = string | { src: string }

export interface IconPack {
  id: string
  label: string
  /** Só o que o pacote muda; o resto vem do DEFAULT_ICONS. */
  icons: Partial<Record<IconKey, IconSource>>
}

/**
 * Pacotes disponíveis em Configurações → Aparência → Ícones.
 *
 * Novo pacote (ex.: Windows XP, iOS):
 *   1. src/icons/packs/<id>.ts exportando um IconPack (imagens em src/icons/packs/<id>/)
 *   2. adicionar aqui na lista
 * Não precisa cobrir todas as chaves: o que faltar cai no padrão.
 */
export const ICON_PACKS: IconPack[] = [{ id: 'default', label: t('skin.iconPack.default'), icons: DEFAULT_ICONS }]

export const DEFAULT_ICON_PACK = 'default'

export function resolveIcon(packId: string, key: IconKey): IconSource {
  const pack = ICON_PACKS.find((p) => p.id === packId)
  return pack?.icons[key] ?? DEFAULT_ICONS[key]
}
