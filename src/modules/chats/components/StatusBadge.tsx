import React from 'react'
import type { ChatsStatus } from '../../../../shared/chats'
import { t } from '../../../i18n'

const LABEL: Record<ChatsStatus['state'], { text: string; cls: string }> = {
  disabled: { text: t('chats.desativado'), cls: 'muted' },
  unconfigured: { text: t('chats.faltaConfigurar'), cls: 'warn' },
  idle: { text: t('chats.conectado'), cls: 'ok' },
  connected: { text: t('chats.conectadoTempoReal'), cls: 'ok' },
  syncing: { text: t('chats.sincronizando'), cls: 'info' },
  offline: { text: t('chats.desconectado'), cls: 'warn' },
  error: { text: t('chats.erro'), cls: 'err' }
}

export function StatusBadge({ status, compact }: { status: ChatsStatus; compact?: boolean }): React.ReactElement {
  const l = LABEL[status.state] ?? LABEL.idle
  return (
    <span className={`chats-status ${l.cls}`} title={status.message ?? status.lastError ?? undefined}>
      <span className="dot" />
      {compact ? null : l.text}
      {status.demo && <span className="chats-demo-tag">{t('chats.demo')}</span>}
    </span>
  )
}
