import React from 'react'
import type { PersonNetwork } from '../../../../shared/chats'
import { networkInfo, peerLink } from '../../../../shared/chats'
import { openExternal } from '../../../api/createApi'
import { openChat } from '../store/chatsStore'
import '../chats.css'
import { t } from '../../../i18n'

/**
 * Redes de uma pessoa: "📸 @usuario", "🟢 Nome salvo · +55…". Clicar abre a conversa na Central
 * de Mensagens; o ↗ abre a conversa direto no app/site da rede (quando dá para montar o link).
 *   chips → linha compacta (lista de Pessoas) · rows → uma rede por linha (editor da pessoa)
 */
export function PersonNetworks({ items, variant = 'chips', onNavigate }: { items: PersonNetwork[]; variant?: 'chips' | 'rows'; onNavigate?: () => void }): React.ReactElement | null {
  if (!items.length) return null
  const go = (id: number): void => {
    onNavigate?.()
    openChat(id)
  }
  return (
    <div className={variant === 'rows' ? 'person-nets rows' : 'person-nets'}>
      {items.map((n) => {
        const info = networkInfo(n.network)
        const p = peerLink(n.network, n.handle, n.title)
        return (
          <span key={n.chatId} className={`person-net${n.pending ? ' pending' : ''}`}>
            <button type="button" className="person-net-main" onClick={() => go(n.chatId)} title={t('chats.abrirAConversaNoRickos', { p0: n.pending ? ' (esperando sua resposta)' : '' })}>
              <span aria-hidden>{info.icon}</span>
              {variant === 'rows' && <b>{info.label}</b>}
              <span className="person-net-label">{p.label || info.label}</span>
              {n.pending && <span title={t('chats.esperandoSuaResposta')}>✍️</span>}
            </button>
            {p.url && (
              <button type="button" className="person-net-ext" onClick={() => openExternal(p.url!)} title={p.urlLabel ?? t('chats.abrirNoApp')} aria-label={p.urlLabel ?? t('chats.abrirNoApp')}>
                ↗
              </button>
            )}
          </span>
        )
      })}
    </div>
  )
}
