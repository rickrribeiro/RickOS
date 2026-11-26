import React, { useState } from 'react'
import { t } from '../../../i18n'

const chave = (topicId: number): string => `estudos.direcaoSubtopicos.${topicId}`

function lembrada(topicId: number): string {
  try {
    return localStorage.getItem(chave(topicId)) ?? ''
  } catch {
    return ''
  }
}

/**
 * "Sugerir subtópicos" com direção opcional (ex.: "foco em exemplos de games"). 1 chamada (prompt E);
 * as sugestões ficam fora do mapa até eu aprovar, como antes. A última direção fica lembrada por
 * tópico neste navegador (só conveniência).
 */
export function SugerirSubtopicosModal({ topicId, nodeId, nodeTitle, onClose, onStarted }: {
  topicId: number
  nodeId: number | null
  nodeTitle: string | null
  onClose: () => void
  onStarted: () => void
}): React.ReactElement {
  const [direcao, setDirecao] = useState(() => lembrada(topicId))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function sugerir(): Promise<void> {
    setBusy(true)
    setError('')
    try {
      try {
        localStorage.setItem(chave(topicId), direcao.trim())
      } catch { /* sem storage */ }
      await window.api.estudos.suggestSubtopics(topicId, nodeId, direcao.trim() || null)
      onStarted()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal study-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('est.sugerirSubtopicosTitulo')}</h2>
        <p className="study-hint">{nodeTitle ? t('est.sugerirEscopoItem', { item: nodeTitle }) : t('est.sugerirEscopoTopico')}</p>
        <div className="editor-field">
          <label>{t('est.direcaoRotulo')}</label>
          <textarea
            rows={3}
            value={direcao}
            autoFocus
            onChange={(e) => setDirecao(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sugerir()
            }}
            placeholder={t('est.direcaoPlaceholder')}
          />
          <span className="study-hint">{t('est.direcaoDica')}</span>
        </div>
        {error && <div className="study-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>{t('estudos.cancelar')}</button>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={sugerir}>{t('est.sugerirUmaChamada')}</button>
        </div>
      </div>
    </div>
  )
}
