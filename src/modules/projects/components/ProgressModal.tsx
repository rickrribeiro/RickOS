import React, { useEffect, useRef, useState } from 'react'
import { Project } from '../../../types'
import { renderMarkdown } from '../../estudos/markdown'
import { repoFromUrl } from '../store/githubStore'
import { t } from '../../../i18n'

type Period = 'week' | 'month' | 'lastMonth'
const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: t('projects.estaSemana') },
  { key: 'month', label: t('projects.esteMes') },
  { key: 'lastMonth', label: t('projects.mesPassado') }
]

/** Uses the local Claude + gh to summarize commit/issue progress over a period. */
export function ProgressModal({ projects, onClose }: { projects: Project[]; onClose: () => void }): React.ReactElement {
  const [period, setPeriod] = useState<Period>('week')
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const runId = useRef<string | null>(null)

  useEffect(() => {
    const offChunk = window.api.ai.onChunk((rid, text) => {
      if (rid && rid === runId.current) setOutput((o) => o + text)
    })
    const offDone = window.api.ai.onDone(({ runId: rid, ok, output: out, error: err }) => {
      if (rid !== runId.current) return
      runId.current = null
      setRunning(false)
      if (!ok) return setError(err || t('projects.falhaAoGerarOResumo'))
      setOutput(out)
    })
    return () => {
      offChunk()
      offDone()
    }
  }, [])

  const repos = projects.map((p) => repoFromUrl(p.githubRepoUrl)).filter((r): r is string => !!r)

  async function run(): Promise<void> {
    setError('')
    setOutput('')
    if (repos.length === 0) {
      setError(t('projects.nenhumProjetoComRepositorioGithub'))
      return
    }
    setRunning(true)
    try {
      runId.current = await window.api.ai.start({ chamada: 'projetos.progresso', params: { periodo: period, repos }, save: false, source: 'projetos', projectId: projects.length === 1 ? projects[0].id : null })
    } catch (e) {
      setRunning(false)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 520, maxWidth: 720 }}>
        <h2>{t('projects.resumoDeProgressoGithub')}</h2>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          {PERIODS.map((p) => (
            <button key={p.key} className={`btn btn-sm ${period === p.key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPeriod(p.key)} disabled={running}>
              {p.label}
            </button>
          ))}
          <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={run} disabled={running}>
            {running ? t('projects.analisando') : t('projects.gerar')}
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
          {t('projects.repos2')} {repos.join(', ') || '—'}{t('projects.usaOGhCliDa')}
        </p>
        {error && <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>{error}</div>}
        {(running || output) && (
          <div className="md-preview-pane" style={{ minHeight: 0, maxHeight: 420 }}>
            {output ? renderMarkdown(output) : <div className="empty-hint">{t('projects.coletandoDadosDoGithub')}</div>}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>{t('projects.fechar')}</button>
        </div>
      </div>
    </div>
  )
}
