import React from 'react'
import { useIconPackStore } from '../store/iconPackStore'
import { IconKey, resolveIcon } from './packs'

/** Ícone do pacote escolhido em Aparência, com fallback para o padrão (emoji). */
export function Icon({ name }: { name: IconKey }): React.ReactElement {
  const pack = useIconPackStore((s) => s.pack)
  const icon = resolveIcon(pack, name)
  if (typeof icon === 'string') return <>{icon}</>
  return <img className="app-icon-img" src={icon.src} alt="" aria-hidden="true" draggable={false} />
}
