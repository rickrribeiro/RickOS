import React, { useEffect, useState } from 'react'
import type { Project, ProjectStatus } from '../../../types'
import { useProjectStore } from '../store/projectStore'
import { statusDef, FOCUS_LIMIT_KEY } from '../lib/constants'
import { ClosingRitualModal } from './ClosingRitualModal'
import { t } from '../../../i18n'

/**
 * Toda mudança de situação passa por aqui e vira uma decisão registrada:
 * pausar exige motivo + data ou condição de retomada; encerrar exige motivo;
 * entrar em foco exige exatamente uma próxima ação (e avisa sobre o limite de foco).
 */
export function StatusChangeModal({ project, to, onClose }: { project: Project; to: ProjectStatus; onClose: () => void }): React.ReactElement {
  const { projects, setStatus } = useProjectStore()
  const [reason, setReason] = useState('')
  const [resumeAt, setResumeAt] = useState('')
  const [resumeCondition, setResumeCondition] = useState('')
  const [nextAction, setNextAction] = useState(project.nextAction ?? '')
  const [note, setNote] = useState('')
  const [limit, setLimit] = useState(3)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const def = statusDef(to)

  useEffect(() => {
    window.api.settings.get(FOCUS_LIMIT_KEY).then((v) => setLimit(Number(v) || 3))
  }, [])

  if (to === 'concluido') return <ClosingRitualModal project={project} onClose={onClose} />

  const inFocus = projects.filter((p) => p.status === 'foco' && p.id !== project.id).length

  async function save(): Promise<void> {
    setError('')
    if (to === 'pausado' && !reason.trim()) return setError(t('projects.digaPorQueEstaPausando'))
    if (to === 'pausado' && !resumeAt && !resumeCondition.trim()) return setError(t('projects.definaUmaDataOuCondicao'))
    if (to === 'encerrado' && !reason.trim()) return setError(t('projects.registreOMotivoDoEncerramento'))
    if (to === 'foco' && !nextAction.trim()) return setError(t('projects.projetoEmFocoPrecisaDe'))
    setSaving(true)
    try {
      await setStatus(project.id, to, {
        reason: reason.trim() || null,
        resumeAt: resumeAt || null,
        resumeCondition: resumeCondition.trim() || null,
        nextAction: to === 'foco' || to === 'baixa' ? nextAction.trim() || null : null,
        note: note.trim() || null
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ph-modal" onClick={(e) => e.stopPropagation()}>
        <h2>
          {def.icon} {project.name} → {def.label}
        </h2>
        <p className="ph-muted">{def.hint}</p>

        {to === 'foco' && (
          <>
            {inFocus >= limit && (
              <div className="ph-warn">
                {t('projects.voceJaTemProjetoS', { inFocus, limit })}
              </div>
            )}
            <label className="ph-label">{t('projects.proximaAcaoUmaSoConcreta')}</label>
            <input autoFocus value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder={t('projects.exEscreverOEndpointDe')} />
          </>
        )}

        {to === 'pausado' && (
          <>
            <label className="ph-label">{t('projects.porQuePausar')}</label>
            <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('projects.exPrioridadeDoTrabalhoEsperando')} />
            <div className="ph-row">
              <div style={{ flex: '0 0 auto' }}>
                <label className="ph-label">{t('projects.retomarEm')}</label>
                <input type="date" value={resumeAt} onChange={(e) => setResumeAt(e.target.value)} />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label className="ph-label">{t('projects.ouQuando')}</label>
                <input value={resumeCondition} onChange={(e) => setResumeCondition(e.target.value)} placeholder={t('projects.exDepoisDoLancamentoDo')} />
              </div>
            </div>
          </>
        )}

        {to === 'encerrado' && (
          <>
            <label className="ph-label">{t('projects.porQueEncerrar')}</label>
            <textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('projects.exPerdiInteresseMercadoNao')} />
            <p className="ph-muted">{t('projects.encerrarNaoEFracassoE')}</p>
          </>
        )}

        {to === 'baixa' && (
          <>
            <label className="ph-label">{t('projects.proximaAcaoOpcionalParaQuando')}</label>
            <input autoFocus value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder={t('projects.exAdicionarGraficoSemanal')} />
          </>
        )}

        {(to === 'fila' || to === 'incubadora') && (
          <>
            <label className="ph-label">{t('projects.notaDaDecisaoOpcional')}</label>
            <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('projects.exEntraEmFocoDepois')} />
          </>
        )}

        {error && <div className="ph-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>{t('projects.cancelar')}</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            {saving ? t('projects.salvando') : t('projects.moverPara', { label: def.label })}
          </button>
        </div>
      </div>
    </div>
  )
}
