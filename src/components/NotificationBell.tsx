import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNotificationStore, wireNotifications, isClaudeNotification } from '../store/notificationStore'
import { useUIStore } from '../store/uiStore'
import { AppNotification } from '../types'
import { isNotificationSoundOn, playNotificationSound, setNotificationSoundOn } from '../utils/notificationSound'
import { fmtDate, t, type MessageKey } from '../i18n'

const SOURCE_LABEL: Record<string, MessageKey> = {
  automacao: 'notif.source.automacao',
  agendador: 'notif.source.agendador',
  ia: 'notif.source.ia',
  claude: 'notif.source.claude',
  sistema: 'notif.source.sistema'
}

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime())
  const min = Math.floor(diff / 60000)
  if (min < 1) return t('time.now')
  if (min < 60) return t('time.minutes', { n: min })
  const h = Math.floor(min / 60)
  if (h < 24) return t('time.hours', { n: h })
  const d = Math.floor(h / 24)
  if (d < 7) return t('time.days', { n: d })
  return fmtDate(iso, { day: '2-digit', month: '2-digit' })
}

/** Sino ao lado do logo: badge de não lidas + painel com a central de notificações. */
export function NotificationBell(): React.ReactElement {
  const { items, unread, loaded, load, markRead, markAllRead, remove, clear } = useNotificationStore()
  const setPage = useUIStore((s) => s.setPage)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread' | 'claude'>('all')
  const [soundOn, setSoundOn] = useState(isNotificationSoundOn)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [, tick] = useState(0)

  useEffect(() => {
    wireNotifications()
  }, [])

  // Ao abrir: recarrega e posiciona o painel logo abaixo do sino (fixed → não é cortado pela sidebar).
  useLayoutEffect(() => {
    if (!open) return
    void load().catch(() => undefined)
    const r = btnRef.current?.getBoundingClientRect()
    if (r) {
      const width = 360
      setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.left - 8, window.innerWidth - width - 8)) })
    }
  }, [open, load])

  // Fecha com clique fora / Esc; atualiza os "há X min" enquanto aberto.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node
      if (panelRef.current?.contains(target) || btnRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    const iv = window.setInterval(() => tick((x) => x + 1), 30000)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.clearInterval(iv)
    }
  }, [open])

  // Os avisos do Prompt Runner ficam só na aba "Claude" para não lotar as outras.
  const scope = filter === 'claude' ? 'claude' : 'other'
  const scoped = items.filter((n) => isClaudeNotification(n) === (scope === 'claude'))
  const visible = filter === 'unread' ? scoped.filter((n) => !n.readAt) : scoped
  const hasRead = scoped.some((n) => n.readAt)
  const unreadOther = items.filter((n) => !n.readAt && !isClaudeNotification(n)).length
  const unreadClaude = items.filter((n) => !n.readAt && isClaudeNotification(n)).length
  const scopedUnread = scope === 'claude' ? unreadClaude : unreadOther

  const openItem = (n: AppNotification): void => {
    if (!n.readAt) void markRead(n.id)
    if (n.page) {
      setPage(n.page)
      setOpen(false)
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        className={`notif-bell ${open ? 'open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={unread ? t('notif.unreadTitle', { count: unread }) : t('notif.title')}
        aria-label={t('notif.title')}
        aria-expanded={open}
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && createPortal(
        <div ref={panelRef} className="notif-panel" style={{ top: pos.top, left: pos.left }} role="dialog" aria-label={t('notif.title')}>
          <div className="notif-head">
            <strong>{t('notif.title')}</strong>
            <span className="notif-head-actions">
              <button
                className="notif-link notif-sound"
                title={t(soundOn ? 'notif.soundOnTitle' : 'notif.soundOffTitle')}
                aria-label={t(soundOn ? 'notif.soundOff' : 'notif.soundOn')}
                onClick={() => {
                  const next = !soundOn
                  setNotificationSoundOn(next)
                  setSoundOn(next)
                  if (next) playNotificationSound('default', true)
                }}
              >
                {soundOn ? '🔊' : '🔇'}
              </button>
              <button className="notif-link" onClick={() => void markAllRead(scope)} disabled={!scopedUnread}>
                {t('notif.markAllRead')}
              </button>
            </span>
          </div>
          <div className="notif-tabs">
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
              {t('notif.tab.all')}
            </button>
            <button className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter('unread')}>
              {t('notif.tab.unread')}{unreadOther ? ` (${unreadOther})` : ''}
            </button>
            <button className={filter === 'claude' ? 'active' : ''} onClick={() => setFilter('claude')}>
              Claude{unreadClaude ? ` (${unreadClaude})` : ''}
            </button>
          </div>

          <div className="notif-list">
            {!loaded && <div className="notif-empty">{t('common.loading')}</div>}
            {loaded && visible.length === 0 && (
              <div className="notif-empty">
                <div style={{ fontSize: 28 }}>🔕</div>
                {filter === 'unread'
                  ? t('notif.emptyUnread')
                  : filter === 'claude'
                    ? t('notif.emptyClaude')
                    : t('notif.empty')}
              </div>
            )}
            {visible.map((n) => (
              <div
                key={n.id}
                className={`notif-item ${n.readAt ? 'read' : 'unread'} ${n.page ? 'clickable' : ''}`}
                onClick={() => openItem(n)}
              >
                <span className="notif-dot" aria-hidden />
                <div className="notif-body">
                  <div className="notif-title">{n.title}</div>
                  {n.body && <div className="notif-text">{n.body}</div>}
                  <div className="notif-meta">
                    {isClaudeNotification(n) ? t(SOURCE_LABEL.claude) : SOURCE_LABEL[n.source] ? t(SOURCE_LABEL[n.source]) : n.source} · {timeAgo(n.createdAt)}
                  </div>
                </div>
                <div className="notif-actions">
                  <button
                    title={t(n.readAt ? 'notif.markUnread' : 'notif.markRead')}
                    onClick={(e) => {
                      e.stopPropagation()
                      void markRead(n.id, !n.readAt)
                    }}
                  >
                    {n.readAt ? '●' : '✓'}
                  </button>
                  <button
                    title={t('notif.remove')}
                    onClick={(e) => {
                      e.stopPropagation()
                      void remove(n.id)
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          {scoped.length > 0 && (
            <div className="notif-foot">
              <button className="notif-link" onClick={() => void clear(true, scope)} disabled={!hasRead}>
                {t('notif.clearRead')}
              </button>
              <button
                className="notif-link danger"
                onClick={() => {
                  if (window.confirm(t(scope === 'claude' ? 'notif.confirmDeleteClaude' : 'notif.confirmDeleteOther'))) void clear(false, scope)
                }}
              >
                {t('notif.deleteAll')}
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  )
}

/** Pontinho no botão ☰ do celular quando há notificações não lidas. */
export function UnreadDot(): React.ReactElement | null {
  const unread = useNotificationStore((s) => s.unread)
  return unread > 0 ? <span className="notif-menu-dot" aria-label={t('notif.unreadShort', { count: unread })} /> : null
}
