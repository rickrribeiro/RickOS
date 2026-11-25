import React, { useState } from 'react'
import type { ChatLabel } from '../../../../shared/chats'
import { t } from '../../../i18n'

export const TAG_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#06b6d4', '#6366f1', '#a855f7', '#ec4899', '#64748b']

/** Chip de uma tag (cor da tag misturada ao fundo, funciona nas duas skins/temas). */
export function TagChip({ tag, active = true, onClick }: { tag: ChatLabel; active?: boolean; onClick?: () => void }): React.ReactElement {
  const style: React.CSSProperties = {
    borderColor: tag.color,
    background: active ? `color-mix(in srgb, ${tag.color} 22%, transparent)` : 'transparent',
    opacity: active ? 1 : 0.55
  }
  return onClick ? (
    <button type="button" className="crm-tag clickable" style={style} onClick={onClick} aria-pressed={active}>
      {tag.name}
    </button>
  ) : (
    <span className="crm-tag" style={style}>{tag.name}</span>
  )
}

/** Cria e remove as tags de pessoas (mesmo catálogo de tags da Central de Mensagens). */
export function TagsModal({ labels, onChanged, onClose }: { labels: ChatLabel[]; onChanged: () => Promise<void> | void; onClose: () => void }): React.ReactElement {
  const [name, setName] = useState('')
  const [color, setColor] = useState(TAG_COLORS[4])
  const [error, setError] = useState('')

  async function add(): Promise<void> {
    const n = name.trim()
    if (!n) return
    if (labels.some((l) => l.name.toLocaleLowerCase() === n.toLocaleLowerCase())) {
      setError(t('crm.jaExisteUmaTagCom'))
      return
    }
    try {
      await window.api.chats.saveLabel(null, n, color)
      setName('')
      setError('')
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function remove(l: ChatLabel): Promise<void> {
    const uses = [
      l.contactCount ? `${l.contactCount} pessoa(s)` : '',
      l.chatCount ? `${l.chatCount} conversa(s)` : ''
    ].filter(Boolean)
    const msg = uses.length ? t('crm.removerTagUsos', { name: l.name, uses: uses.join(t('crm.listaE')) }) : t('crm.removerTag', { name: l.name })
    if (!window.confirm(msg)) return
    await window.api.chats.deleteLabel(l.id)
    await onChanged()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 360, maxWidth: 480 }}>
        <h3 style={{ marginBottom: 4 }}>{t('crm.tags2')}</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          {t('crm.asMesmasTagsValemPara')}
        </p>

        <div className="crm-tags-list">
          {labels.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('crm.nenhumaTagAinda')}</div>}
          {labels.map((l) => (
            <div key={l.id} className="crm-tags-row">
              <TagChip tag={l} />
              <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)' }}>
                {l.contactCount ? t('crm.pessoa', { count: l.contactCount }) : t('crm.semPessoas')}
              </span>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => void remove(l)} title={t('crm.remover', { name: l.name })}>✕</button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
          <input
            placeholder={t('crm.novaTag')}
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
            style={{ flex: 1, minWidth: 0 }}
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void add()}>{t('crm.adicionar')}</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {TAG_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={t('crm.cor', { c })}
              style={{ width: 22, height: 22, borderRadius: 4, background: c, cursor: 'pointer', border: color === c ? '2px solid var(--text-primary)' : '1px solid var(--border)' }}
            />
          ))}
        </div>
        {error && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>{t('crm.fechar')}</button>
        </div>
      </div>
    </div>
  )
}
