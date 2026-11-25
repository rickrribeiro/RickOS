import React, { useEffect } from 'react'
import { useUIStore } from '../../../store/uiStore'
import { ChatDetails } from '../components/ChatDetails'
import { ChatFilters } from '../components/ChatFilters'
import { ChatList } from '../components/ChatList'
import { ChatView } from '../components/ChatView'
import { RadarView } from '../components/RadarView'
import { TriageView } from '../components/TriageView'
import { StatusBadge } from '../components/StatusBadge'
import { useChatsStore } from '../store/chatsStore'
import '../chats.css'
import { t, getLocale } from '../../../i18n'

/** Central de Mensagens: inbox unificada (WhatsApp, Instagram, LinkedIn… via provedor). */
export function ChatsPage(): React.ReactElement {
  const s = useChatsStore()
  const { status, counts, active, pane, detailOpen, tab } = s

  useEffect(() => {
    let off: (() => void) | undefined
    void s.init().then((fn) => (off = fn))
    return () => off?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Esc fecha a conversa aberta. Antes disso, Esc fecha o que estiver por cima (menu, modal, IA,
  // seleção) e, num campo de texto, só tira o foco dele.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
      const st = useChatsStore.getState()
      if (st.tab !== 'inbox' || !st.activeId) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.isContentEditable)) {
        el.blur()
        return
      }
      if (document.querySelector('.modal-overlay, .chats-pop-menu, .notif-panel, .chats-ai, .chats-selbar')) return
      void st.open(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  if (s.ready && status && !status.enabled) {
    return (
      <div className="module-page">
        <div className="module-header">
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t('chats.chats')}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('chats.centralDeMensagens')}</p>
          </div>
        </div>
        <div className="chart-section" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 42 }}>💬</div>
          <div style={{ marginTop: 10, fontSize: 16, fontWeight: 600 }}>{t('chats.centralDeMensagensDesativada')}</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 460, margin: '8px auto 16px' }}>
            {t('chats.junteWhatsappInstagramLinkedinE')}
          </p>
          <button className="btn btn-primary" onClick={() => useUIStore.getState().setPage('settings')}>{t('chats.configurarEmConfiguracoesMensagens')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="chats-page" data-pane={tab === 'inbox' ? pane : 'list'}>
      <div className="chats-topbar">
        <h2>{t('chats.chats')}</h2>
        <div className="chats-tabs" role="tablist">
          <button className={`chats-tab ${tab === 'radar' ? 'active' : ''}`} role="tab" aria-selected={tab === 'radar'} onClick={() => s.setTab('radar')}>
            {t('chats.atencao')} {counts?.remindersDue ? <span className="chats-count hot">{counts.remindersDue}</span> : null}
          </button>
          <button className={`chats-tab ${tab === 'inbox' ? 'active' : ''}`} role="tab" aria-selected={tab === 'inbox'} onClick={() => s.setTab('inbox')}>
            {t('chats.inbox')} {counts?.unreadChats ? <span className="chats-count">{counts.unreadChats}</span> : null}
            {counts?.mentionChats ? <span className="chats-count mention" title={t('chats.conversasComMencoesAVoce')}>{counts.mentionsEstimated ? '~' : ''}@{counts.mentionCount}</span> : null}
          </button>
          <button className={`chats-tab ${tab === 'triage' ? 'active' : ''}`} role="tab" aria-selected={tab === 'triage'} onClick={() => s.setTab('triage')}>
            {t('chats.triagem')} {counts?.needsReply ? <span className="chats-count">{counts.needsReply}</span> : null}
          </button>
        </div>
        <div className="chats-topbar-right">
          {status && <StatusBadge status={status} />}
          {status?.lastSyncAt && <span className="chats-mini">{t('chats.sincronizado')} {new Date(status.lastSyncAt).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' })}</span>}
          <button className="btn btn-secondary btn-sm" disabled={status?.state === 'syncing'} onClick={() => void window.api.chats.syncNow().catch(() => undefined)} title={t('chats.sincronizarAgora')}>↻</button>
        </div>
      </div>
      {status?.demo && <div className="chats-demo-banner" style={{ margin: '8px 16px 0' }}>{t('chats.modoDemonstracaoConversasEPessoas')} <b>{t('chats.ficticias')}</b>{t('chats.ativeOBeeperEmConfiguracoes')}</div>}
      {status && (status.state === 'offline' || status.state === 'error' || status.state === 'unconfigured') && (
        <div className="chats-notice warn" style={{ margin: '8px 16px 0' }}>
          {status.state === 'unconfigured' ? t('chats.faltaConfigurarOProvedor') : status.state === 'offline' ? t('chats.provedorDesconectadoMostrandoDadosLocais') : t('chats.erroNoProvedor')}
          {status.message ?? status.lastError ?? ''}
        </div>
      )}

      {tab === 'radar' && <RadarView />}
      {tab === 'triage' && <TriageView />}
      {tab === 'inbox' && (
      <div className={`chats-body ${active ? '' : 'no-detail'} ${detailOpen ? 'detail-open' : ''}`} data-pane={pane}>
        <div className="chats-col chats-left">
          <ChatFilters />
          <ChatList />
        </div>
        <div className="chats-col chats-center">
          {active ? (
            <ChatView chat={active} />
          ) : (
            <div className="chats-empty" style={{ margin: 'auto' }}>
              {t('chats.escolhaUmaConversaAEsquerda')}
              <br />
              <span style={{ fontSize: 12 }}>{t('chats.abrirUmaConversaNaoA')}</span>
            </div>
          )}
        </div>
        {active && (
          <div className="chats-col chats-right">
            <ChatDetails chat={active} />
          </div>
        )}
      </div>
      )}
    </div>
  )
}
