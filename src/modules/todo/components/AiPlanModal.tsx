import React, { useEffect } from 'react'
import { t } from '../../../i18n'

/** "Planejar com IA": ainda não implementado — o modal só descreve o que a feature vai fazer. */
export function AiPlanModal({ onClose }: { onClose: () => void }): React.ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('todo.planejarComIa')}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          {t('todo.emBreveAindaVouImplementar')}
        </p>
        <ul style={{ fontSize: 14, lineHeight: 1.6, paddingLeft: 18, marginBottom: 12 }}>
          <li>{t('todo.aIaVeTudoQue')}</li>
          <li>{t('todo.tentaOtimizarSugereOrdemAgrupa')}</li>
          <li>{t('todo.adiantaOTrabalhoBuscaInformacoes')}</li>
          <li>{t('todo.identificaOQueElaMesma')}</li>
        </ul>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {t('todo.tudoComoSugestaoNadaE')}
        </p>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>{t('todo.fechar')}</button>
        </div>
      </div>
    </div>
  )
}
