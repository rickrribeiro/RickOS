import React, { useEffect } from 'react'

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
        <h2>✨ Planejar com IA</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          🚧 Em breve — ainda vou implementar. A ideia:
        </p>
        <ul style={{ fontSize: 14, lineHeight: 1.6, paddingLeft: 18, marginBottom: 12 }}>
          <li>A IA vê tudo que você tem para fazer (tarefas, prazos, prioridades, projetos).</li>
          <li>Tenta otimizar: sugere ordem, agrupa o que dá para fazer junto e aponta o que está atrasado.</li>
          <li>Adianta o trabalho: busca informações e coloca links úteis em cada tarefa.</li>
          <li>Identifica o que ela mesma consegue fazer por você e se oferece para fazer.</li>
        </ul>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Tudo como sugestão — nada é alterado sem a sua aprovação.
        </p>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
