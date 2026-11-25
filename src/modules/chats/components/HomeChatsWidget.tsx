import React, { useEffect, useState } from 'react'
import type { ChatCounts, RadarItem } from '../../../../shared/chats'
import { openChat, openChatsWith, useChatsStore } from '../store/chatsStore'
import { RADAR_ICON } from './RadarView'
import '../chats.css'
import { t } from '../../../i18n'

/**
 * Widget opcional da Home. Some com o módulo desligado ou com o widget desativado em
 * Configurações → Mensagens. Conversas ≠ mensagens; estimativas aparecem com "~".
 */
export function HomeChatsWidget(): React.ReactElement | null {
  const [show, setShow] = useState(false)
  const [counts, setCounts] = useState<ChatCounts | null>(null)
  const [alerts, setAlerts] = useState<RadarItem[]>([])

  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const { config } = await window.api.chats.config()
        if (!alive) return
        const on = config.enabled && config.homeWidget
        setShow(on)
        if (!on) return
        const [c, r] = await Promise.all([window.api.chats.counts(), window.api.chats.radar()])
        if (!alive) return
        setCounts(c)
        setAlerts(r.items.filter((i) => config.homeAlerts.includes(i.kind)).slice(0, 4))
      } catch {
        setShow(false)
      }
    }
    void load()
    const off = window.api.chats.onUpdated(() => void load())
    return () => {
      alive = false
      off()
    }
  }, [])

  if (!show || !counts) return null

  return (
    <>
      <h3 className="dash-heading">{t('chats.centralDeMensagens')}</h3>
      <div className="chats-widget-grid">
        <button className="stat-card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => openChatsWith({ state: 'unread', sort: 'recent' })}>
          <div className="stat-card-label">{t('chats.naoLidas3')}</div>
          <div className="stat-card-value">{counts.unreadChats}</div>
          <div className="stat-card-sub">{t('chats.conversasMensagens', { unreadMessages: counts.unreadMessages })}</div>
        </button>
        <button className="stat-card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => openChatsWith({ state: 'needs_reply' })}>
          <div className="stat-card-label">{t('chats.possivelmentePendentes')}</div>
          <div className="stat-card-value">{counts.needsReply}</div>
          <div className="stat-card-sub">{t('chats.conversasSemRespostaSua')}</div>
        </button>
        <button className="stat-card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => openChatsWith({ state: 'mentions', type: 'group', sort: 'recent' })}>
          <div className="stat-card-label">{t('chats.mencoesEmGrupos')}</div>
          <div className="stat-card-value">{counts.mentionsEstimated ? '~' : ''}{counts.mentionCount}</div>
          <div className="stat-card-sub">{t('chats.emGrupoS', { mentionChats: counts.mentionChats })}{counts.mentionsEstimated ? t('chats.comEstimativa') : ''}</div>
        </button>
        <button className="stat-card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => openChatsWith({ state: 'high' })}>
          <div className="stat-card-label">{t('chats.prioridadeAlta')}</div>
          <div className="stat-card-value">{counts.high}</div>
          <div className="stat-card-sub">{t('chats.conversas')}</div>
        </button>
      </div>
      {alerts.length > 0 && (
        <div className="chats-widget-alerts">
          {alerts.map((a, i) => (
            <div key={`${a.kind}-${i}`} className="chats-widget-alert" role="button" tabIndex={0} onClick={() => (a.chatId ? openChat(a.chatId) : openChatsWith({ state: 'needs_reply' }, 'radar'))}>
              {RADAR_ICON[a.kind]} {a.text}
            </div>
          ))}
        </div>
      )}
      <div className="chats-row" style={{ marginTop: 10 }}>
        <button className="btn btn-primary btn-sm" onClick={() => (useChatsStore.setState({ triageMode: 'backlog' }), openChatsWith({ state: 'needs_reply' }, 'triage'))}>{t('chats.organizarInbox')}</button>
        <button className="btn btn-secondary btn-sm" onClick={() => openChatsWith({ state: 'high' })}>{t('chats.verPrioritarias')}</button>
      </div>
    </>
  )
}
