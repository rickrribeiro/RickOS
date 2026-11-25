import React, { useMemo, useState } from 'react'
import type { Project } from '../../../types'
import { useProjectStore } from '../store/projectStore'
import { projectContext, runText } from '../lib/ai'
import { fmtMinutes } from '../lib/constants'
import { t } from '../../../i18n'
import { promptRetrospectiva } from '../../../../shared/prompts/projetos/retrospectiva'

const CHECKLIST = [
  t('projects.closing.finishLine'),
  t('projects.closing.milestones'),
  t('projects.closing.published'),
  t('projects.closing.readme'),
  t('projects.closing.branches'),
  t('projects.closing.ideas')
]

/** Ritual de conclusão: checklist → retrospectiva (com IA) → celebração. */
export function ClosingRitualModal({ project, onClose }: { project: Project; onClose: () => void }): React.ReactElement {
  const { setStatus, overview, milestones } = useProjectStore()
  const ov = overview[project.id]
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [checks, setChecks] = useState<boolean[]>(CHECKLIST.map(() => false))
  const [wentWell, setWentWell] = useState('')
  const [learned, setLearned] = useState('')
  const [differently, setDifferently] = useState('')
  const [aiRetro, setAiRetro] = useState('')
  const [aiRunning, setAiRunning] = useState(false)
  const [error, setError] = useState('')
  const openMs = milestones.filter((m) => m.projectId === project.id && !m.doneAt)
  const days = project.createdAt ? Math.max(1, Math.round((Date.now() - new Date(project.createdAt).getTime()) / 86400000)) : null

  const confetti = useMemo(
    () => Array.from({ length: 36 }, (_, i) => ({ left: (i * 37) % 100, delay: (i % 9) * 0.12, hue: (i * 47) % 360 })),
    []
  )

  async function generate(): Promise<void> {
    setAiRunning(true)
    setError('')
    try {
      const ctx = await projectContext(project, ov)
      const txt = await runText(
        promptRetrospectiva({ foiBem: wentWell, aprendi: learned, fariaDiferente: differently, contexto: ctx })
      )
      setAiRetro(txt)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAiRunning(false)
    }
  }

  async function finish(): Promise<void> {
    const retro =
      aiRetro ||
      [`**Foi bem:** ${wentWell || '—'}`, `**Aprendi:** ${learned || '—'}`, `**Faria diferente:** ${differently || '—'}`].join('\n\n')
    await setStatus(project.id, 'concluido', { reason: 'Linha de chegada atingida', retrospective: retro })
    setStep(2)
  }

  return (
    <div className="modal-overlay" onClick={step === 2 ? onClose : undefined}>
      <div className="modal ph-modal ph-modal-wide" onClick={(e) => e.stopPropagation()}>
        {step === 0 && (
          <>
            <h2>{t('projects.concluir2')} {project.name}</h2>
            {project.finishLine && (
              <div className="ph-finish">
                <span className="ph-label">{t('projects.prontoQuando')}</span>
                <div>{project.finishLine}</div>
              </div>
            )}
            {openMs.length > 0 && <div className="ph-warn">{t('projects.aindaHaMarcoSAberto', { count: openMs.length })} {openMs.map((m) => m.title).join(', ')}</div>}
            <div className="ph-checklist">
              {CHECKLIST.map((c, i) => (
                <label key={c} className="ph-check">
                  <input type="checkbox" checked={checks[i]} onChange={() => setChecks(checks.map((v, j) => (j === i ? !v : v)))} />
                  <span>{c}</span>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={onClose}>{t('projects.aindaNao')}</button>
              <button className="btn btn-primary btn-sm" onClick={() => setStep(1)}>
                {t('projects.retrospectiva')} {checks.every(Boolean) ? '' : `(${checks.filter(Boolean).length}/${CHECKLIST.length})`}
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2>{t('projects.retrospectiva2')}</h2>
            <label className="ph-label">{t('projects.oQueFoiBem')}</label>
            <textarea rows={2} value={wentWell} onChange={(e) => setWentWell(e.target.value)} />
            <label className="ph-label">{t('projects.oQueAprendi')}</label>
            <textarea rows={2} value={learned} onChange={(e) => setLearned(e.target.value)} />
            <label className="ph-label">{t('projects.oQueFariaDiferente')}</label>
            <textarea rows={2} value={differently} onChange={(e) => setDifferently(e.target.value)} />
            <div style={{ marginTop: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={generate} disabled={aiRunning}>
                {aiRunning ? t('projects.escrevendo') : aiRetro ? t('projects.gerarDeNovo') : t('projects.gerarRetrospectivaComIa')}
              </button>
            </div>
            {aiRetro && <textarea className="ph-retro" rows={8} value={aiRetro} onChange={(e) => setAiRetro(e.target.value)} />}
            {error && <div className="ph-error">{error}</div>}
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setStep(0)}>{t('projects.voltar')}</button>
              <button className="btn btn-primary btn-sm" onClick={finish}>{t('projects.concluirProjeto')}</button>
            </div>
          </>
        )}

        {step === 2 && (
          <div className="ph-celebrate">
            <div className="ph-confetti" aria-hidden>
              {confetti.map((c, i) => (
                <span key={i} style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, background: `hsl(${c.hue} 85% 60%)` }} />
              ))}
            </div>
            <div className="ph-celebrate-emoji">🎉</div>
            <h2>{project.name} {t('projects.concluido')}</h2>
            <p className="ph-muted">
              {ov ? t('projects.registradas', { p0: fmtMinutes(ov.minutesTotal) }) : ''}
              {days ? t('projects.diasDoInicioAoFim', { days }) : ''}
              {ov?.milestonesTotal ? t('projects.marcos', { milestonesDone: ov.milestonesDone, milestonesTotal: ov.milestonesTotal }) : ''}
            </p>
            <p>{t('projects.projetosTerminadosSaoRarosEste')}</p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary btn-sm" onClick={onClose}>{t('projects.fechar')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
