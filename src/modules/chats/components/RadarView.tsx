import React, { useEffect, useState } from 'react'
import type { ChatFilter, RadarItem, RadarView as Radar } from '../../../../shared/chats'
import { useUIStore } from '../../../store/uiStore'
import { openChat, useChatsStore } from '../store/chatsStore'
import { t } from '../../../i18n'

export const RADAR_ICON: Record<RadarItem['kind'], string> = {
  reminder_due: '⏰',
  vip_waiting: '⭐',
  mentions: '@',
  professional: '💼',
  forgotten: '🕰',
  old_unread: '📭',
  no_contact: '👋',
  reopened: '🔁'
}

/** "Conversas precisando de atenção": ajuda a agir, sem virar cobrança. */
export function RadarView(): React.ReactElement {
  const { counts, setFilter, setTab } = useChatsStore()
  const [radar, setRadar] = useState<Radar | null>(null)

  useEffect(() => {
    const load = (): void => void window.api.chats.radar().then(setRadar).catch(() => setRadar({ items: [], summary: [] }))
    load()
    return window.api.chats.onUpdated(() => load())
  }, [])

  const go = (f: Partial<ChatFilter>): void => {
    setFilter(f, true)
    setTab('inbox')
  }

  function onItem(i: RadarItem): void {
    if (i.chatId) {
      openChat(i.chatId)
      return
    }
    if (i.kind === 'no_contact') {
      useUIStore.getState().setPage('crm')
      return
    }
    if (i.kind === 'mentions') go({ state: 'mentions', type: 'group', sort: 'recent' })
    else if (i.kind === 'old_unread') go({ state: 'unread', sort: 'recent', withinHours: null })
    else if (i.kind === 'professional') go({ state: 'needs_reply', sort: 'priority' })
    else go({ state: 'needs_reply' })
  }

  const stat = (label: string, value: number | string, sub: string | null, f: Partial<ChatFilter>): React.ReactElement => (
    <button className="stat-card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => go(f)}>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </button>
  )

  return (
    <div className="chats-radar">
      {counts && (
        <div className="chats-radar-grid">
          {stat(t('chats.radar.precisoResponder'), counts.needsReply, t('chats.radar.conversas'), { state: 'needs_reply' })}
          {stat(t('chats.radar.mencoes'), `${counts.mentionsEstimated ? '~' : ''}${counts.mentionCount}`, `${t('chats.radar.grupos', { n: counts.mentionChats })}${counts.mentionsEstimated ? t('chats.radar.estimativa') : ''}`, { state: 'mentions', type: 'group' })}
          {stat(t('chats.radar.prioridadeAlta'), counts.high, t('chats.radar.pendentes'), { state: 'high' })}
          {stat(t('chats.radar.aguardando'), counts.waiting, t('chats.radar.outrasPessoas'), { state: 'waiting', sort: 'recent' })}
          {stat(t('chats.radar.lembretes'), counts.remindersDue, t('chats.radar.adiadas', { n: counts.snoozed }), { state: 'reminders' })}
          {stat(t('chats.radar.naoLidas'), counts.unreadChats, t('chats.radar.mensagens', { n: counts.unreadMessages }), { state: 'unread', sort: 'recent' })}
        </div>
      )}

      <div className="chats-row" style={{ marginBottom: 12, justifyContent: 'space-between' }}>
        <h3 className="dash-heading" style={{ margin: 0 }}>{t('chats.conversasPrecisandoDeAtencao')}</h3>
        <div className="chats-row">
          <button className="btn btn-secondary btn-sm" onClick={() => useChatsStore.setState({ tab: 'triage', triageMode: 'daily' })}>{t('chats.revisaoDiaria')}</button>
          <button className="btn btn-primary btn-sm" onClick={() => useChatsStore.setState({ tab: 'triage', triageMode: 'backlog' })}>{t('chats.organizarInbox')}</button>
        </div>
      </div>

      {radar && radar.items.length === 0 && (
        <div className="empty-hint">{t('chats.nadaPedindoAtencaoAgoraUse')}</div>
      )}
      {radar?.items.map((i, idx) => (
        <div key={`${i.kind}-${i.chatId ?? i.contactId ?? idx}`} className="chats-radar-item" onClick={() => onItem(i)} role="button" tabIndex={0}>
          <span className="ic">{RADAR_ICON[i.kind]}</span>
          <span className="tx">{i.text}</span>
          <span className="chats-mini">{t('chats.abrir')}</span>
        </div>
      ))}
      {radar && radar.summary.length > 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>{radar.summary.join(' · ')}</p>}
    </div>
  )
}
