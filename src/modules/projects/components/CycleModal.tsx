import React, { useState } from 'react'
import type { Project, ProjectCycle } from '../../../types'
import { localDateStr } from '../../../utils/dates'
import { fmtDate } from '../lib/constants'
import { t } from '../../../i18n'

type Mode = 'new' | 'extend' | 'close'

/** Ciclos/versões: iniciar (com prazo), estender (conta extensões + motivo) e entregar/cancelar. */
export function CycleModal({ project, cycle, mode, onClose, onDone, onClosed }: { project: Project; cycle: ProjectCycle | null; mode: Mode; onClose: () => void; onDone: () => void; onClosed?: (cycleId: number) => void }): React.ReactElement {
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [due, setDue] = useState(mode === 'extend' ? cycle?.dueDate ?? '' : localDateStr(new Date(Date.now() + 14 * 86400000)))
  const [reason, setReason] = useState('')
  const [closeCurrent, setCloseCurrent] = useState(true)
  const [retro, setRetro] = useState('')
  const [error, setError] = useState('')

  async function save(status?: 'concluido' | 'cancelado'): Promise<void> {
    setError('')
    if (mode === 'new') {
      if (!name.trim()) return setError(t('projects.deUmNomeAoCiclo'))
      if (cycle && closeCurrent) await window.api.cycles.close(cycle.id, 'concluido', null)
      await window.api.cycles.create(project.id, name.trim(), goal.trim() || null, localDateStr(new Date()), due || null)
    } else if (mode === 'extend' && cycle) {
      if (!due) return setError(t('projects.escolhaONovoPrazo'))
      if (!reason.trim()) return setError(t('projects.registreOMotivoDaExtensao'))
      await window.api.cycles.extend(cycle.id, due, reason.trim())
    } else if (mode === 'close' && cycle && status) {
      await window.api.cycles.close(cycle.id, status, retro.trim() || null)
    }
    onDone()
    onClose()
    if (mode === 'close' && cycle && status === 'concluido') onClosed?.(cycle.id)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ph-modal" onClick={(e) => e.stopPropagation()}>
        {mode === 'new' && (
          <>
            <h2>{t('projects.novoCiclo')} {project.name}</h2>
            <p className="ph-muted">{t('projects.projetosContinuosAvancamEmCiclos')}</p>
            <label className="ph-label">{t('projects.nomeVersao')}</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('projects.exV13Novembro')} />
            <label className="ph-label">{t('projects.oQueEsteCicloEntrega')}</label>
            <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={t('projects.exCentralDeProjetosUtilizavel')} />
            <label className="ph-label">{t('projects.prazo')}</label>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            {cycle && (
              <label className="ph-check" style={{ marginTop: 10 }}>
                <input type="checkbox" checked={closeCurrent} onChange={() => setCloseCurrent((v) => !v)} />
                <span>{t('projects.marcarOCicloAtualComo', { name: cycle.name })}</span>
              </label>
            )}
          </>
        )}
        {mode === 'extend' && cycle && (
          <>
            <h2>{t('projects.estender', { name: cycle.name })}</h2>
            <p className="ph-muted">
              {t('projects.prazoAtual', { p0: fmtDate(cycle.dueDate) })}
              {cycle.extensions > 0 ? t('projects.jaEstendidoXOriginal', { extensions: cycle.extensions, p1: fmtDate(cycle.originalDueDate) }) : ''}
            </p>
            {cycle.extensions >= 2 && <div className="ph-warn">{t('projects.terceiraExtensaoTalvezSejaHora')}</div>}
            <label className="ph-label">{t('projects.novoPrazo')}</label>
            <input type="date" autoFocus value={due} onChange={(e) => setDue(e.target.value)} />
            <label className="ph-label">{t('projects.motivo')}</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('projects.exEscopoCresceuSemanaDe')} />
          </>
        )}
        {mode === 'close' && cycle && (
          <>
            <h2>{t('projects.fechar3', { name: cycle.name })}</h2>
            <label className="ph-label">{t('projects.retrospectivaRapidaOpcional')}</label>
            <textarea autoFocus rows={3} value={retro} onChange={(e) => setRetro(e.target.value)} placeholder={t('projects.oQueFoiEntregueO')} />
            <p className="ph-muted">{t('projects.aoEntregarORickosMonta')}</p>
          </>
        )}
        {error && <div className="ph-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>{t('projects.cancelar')}</button>
          {mode === 'close' ? (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => save('cancelado')}>{t('projects.cancelarCiclo')}</button>
              <button className="btn btn-primary btn-sm" onClick={() => save('concluido')}>{t('projects.entregue')}</button>
            </>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => save()}>{mode === 'new' ? t('projects.iniciarCiclo') : t('projects.estender2')}</button>
          )}
        </div>
      </div>
    </div>
  )
}
