import React, { useEffect, useState } from 'react'
import type { DelegationReview, Project, ProjectDelegation } from '../../../types'
import { useProjectStore } from '../store/projectStore'
import { renderMarkdown } from '../../estudos/markdown'
import { timeAgo } from '../../../utils/dates'
import { copyText, shortPath } from '../git'
import { useUIStore } from '../../../store/uiStore'
import { DRAFT_KEY } from '../../ai/pages/PromptRunnerPage'
import { t as tr } from '../../../i18n'

export const DELEGATION_STATUS: Record<ProjectDelegation['status'], { label: string; cls: string }> = {
  rodando: { label: tr('projects.rodando'), cls: 'run' },
  pronta: { label: tr('projects.prontaPRevisao'), cls: 'ready' },
  erro: { label: tr('projects.erro'), cls: 'err' },
  cancelada: { label: tr('projects.cancelada'), cls: 'off' },
  aceita: { label: tr('projects.aceita'), cls: 'ok' },
  descartada: { label: tr('projects.descartada'), cls: 'off' }
}

/**
 * Delegar ao Claude a próxima ação (ou a tarefa passada em `task`). Padrão: o Claude analisa a tarefa e o repositório e
 * monta um prompt, que abre no Prompt Runner (projeto + worktree isolado) para você
 * revisar, editar e enviar. "Executar direto" mantém o fluxo antigo (roda sozinho).
 */
export function DelegateModal({
  project,
  task,
  instructions: initialInstructions,
  title,
  onDelegated,
  onClose
}: {
  project: Project
  task?: string
  /** Instruções extras pré-preenchidas (ex.: delegação de vários itens do roadmap). */
  instructions?: string
  /** Título da conversa no Prompt Runner; padrão = a tarefa. */
  title?: string
  /** Chamado quando a delegação é feita (prompt montado ou execução iniciada), antes de fechar. */
  onDelegated?: () => Promise<void>
  onClose: () => void
}): React.ReactElement {
  const { refreshDelegations } = useProjectStore()
  const { setPage } = useUIStore()
  const [action, setAction] = useState(task ?? project.nextAction ?? '')
  const [instructions, setInstructions] = useState(initialInstructions ?? '')
  const multi = action.includes('\n')
  const [busy, setBusy] = useState<'draft' | 'run' | null>(null)
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const alive = React.useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    if (busy !== 'draft') return
    setElapsed(0)
    const t = setInterval(() => setElapsed((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [busy])

  async function draft(): Promise<void> {
    setBusy('draft')
    setError('')
    try {
      const prompt = await window.api.delegations.draftPrompt(project.id, action.trim() || null, instructions.trim() || null)
      if (!alive.current) return
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            agentId: null,
            skillIds: [],
            userPrompt: prompt,
            projectId: project.id,
            title: title ?? action.trim().split('\n')[0],
            useWorktree: !!project.localPath,
            note: '📝 Prompt montado pelo Claude a partir da tarefa. Revise, ajuste o que quiser e envie.'
          })
        )
      } catch {
        // armazenamento indisponível
      }
      await onDelegated?.()
      onClose()
      setPage('ai-runner')
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (alive.current) setBusy(null)
    }
  }

  async function go(): Promise<void> {
    if (!window.confirm(tr('projects.executarDiretoSemRevisarO'))) return
    setBusy('run')
    setError('')
    try {
      await window.api.delegations.start(project.id, action.trim() || null, instructions.trim() || null)
      await refreshDelegations()
      await onDelegated?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ph-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{tr('projects.delegarAoClaude')} {project.name}</h2>
        <p className="ph-muted">
          {tr('projects.oClaudeAnalisaATarefa')}{project.localPath ? <> {tr('projects.eORepositorioSoLendo', { p0: shortPath(project.localPath) })}</> : ''} {tr('projects.eMontaUmPromptDetalhado')} <strong>{tr('projects.promptRunner')}</strong>{project.localPath ? <>{tr('projects.jaCom')} <strong>{tr('projects.worktreeIsolado')}</strong>,</> : ''} {tr('projects.paraVoceRevisarEditarE')}
        </p>
        <label className="ph-label">{tr('projects.tarefa')}</label>
        <textarea rows={multi ? 8 : 2} value={action} onChange={(e) => setAction(e.target.value)} />
        <label className="ph-label">{tr('projects.instrucoesExtrasOpcional')}</label>
        <textarea rows={initialInstructions ? 6 : 3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder={tr('projects.exUseOComponenteX')} />
        {error && <div className="ph-error">{error}</div>}
        {busy === 'draft' && (
          <div className="ph-muted" style={{ marginTop: 8 }}>
            {tr('projects.claudeAnalisandoATarefa')}{project.localPath ? tr('projects.eORepositorio') : ''}{tr('projects.s', { elapsed })}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>{tr('projects.cancelar')}</button>
          {project.localPath && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={go}
              disabled={!!busy || !action.trim()}
              title={tr('projects.fluxoAntigoOClaudeExecuta')}
            >
              {busy === 'run' ? tr('projects.criandoWorktree') : tr('projects.executarDireto')}
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={draft} disabled={!!busy || !action.trim()}>
            {busy === 'draft' ? tr('projects.montandoPrompt') : tr('projects.montarPrompt')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Lista de delegações do projeto, com revisão (resumo, commits, diff) e ações. */
export function DelegationsPanel({ project, onAccepted }: { project: Project; onAccepted: (d: ProjectDelegation) => void }): React.ReactElement | null {
  const { delegations, refreshDelegations } = useProjectStore()
  const list = delegations.filter((d) => d.projectId === project.id && d.status !== 'descartada')
  const [open, setOpen] = useState<number | null>(null)
  const [review, setReview] = useState<DelegationReview | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open == null) return
    setReview(null)
    window.api.delegations.review(open).then(setReview).catch(() => setReview(null))
  }, [open, delegations])

  if (!list.length) return null

  async function act(d: ProjectDelegation, kind: 'cancel' | 'discard' | 'accept' | 'pr'): Promise<void> {
    if (kind === 'discard' && !window.confirm(tr('projects.removerOWorktreeEApagar'))) return
    setBusy(`${kind}${d.id}`)
    setError('')
    try {
      if (kind === 'cancel') await window.api.delegations.cancel(d.id)
      if (kind === 'discard') await window.api.delegations.discard(d.id)
      if (kind === 'accept') {
        await window.api.delegations.accept(d.id)
        onAccepted(d)
      }
      if (kind === 'pr') {
        const r = await window.api.delegations.pr(d.id)
        if (r.url) window.api.app.openExternal(r.url)
      }
      await refreshDelegations()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="ph-panel">
      <div className="ph-panel-title">{tr('projects.delegacoes')}</div>
      {error && <div className="ph-error">{error}</div>}
      {list.map((d) => {
        const st = DELEGATION_STATUS[d.status]
        const isOpen = open === d.id
        return (
          <div key={d.id} className="ph-deleg">
            <button className="ph-deleg-head" onClick={() => setOpen(isOpen ? null : d.id)}>
              <span className={`ph-deleg-status ${st.cls}`}>{st.label}</span>
              <span className="ph-deleg-action">{d.action}</span>
              <span className="ph-muted">{timeAgo(d.finishedAt ?? d.createdAt)}</span>
            </button>
            {isOpen && (
              <div className="ph-deleg-body">
                <div className="ph-muted">
                  <code>{d.branch}</code> · {shortPath(d.worktreePath)}
                  {d.prUrl && (
                    <>
                      {' · '}
                      <button className="ph-linkbtn" onClick={() => window.api.app.openExternal(d.prUrl!)}>{tr('projects.pr')}</button>
                    </>
                  )}
                </div>
                {d.error && <div className="ph-error">{d.error}</div>}
                {review && (
                  <>
                    {review.commits.length > 0 && (
                      <div className="ph-commits">
                        {review.commits.map((c) => (
                          <div key={c.hash} className="ph-commit"><code>{c.hash}</code><span className="ph-commit-subject">{c.subject}</span></div>
                        ))}
                      </div>
                    )}
                    {review.diffStat && <pre className="ph-diffstat">{review.diffStat}</pre>}
                    {review.uncommitted.length > 0 && <div className="ph-warn">{review.uncommitted.length} {tr('projects.arquivoSSemCommitNo')}</div>}
                    {!review.commits.length && !review.uncommitted.length && d.status !== 'rodando' && <div className="ph-muted">{tr('projects.nenhumaMudancaNoCodigo')}</div>}
                  </>
                )}
                {d.status === 'rodando' && <div className="ph-muted">{tr('projects.oClaudeEstaTrabalhandoVoce')}</div>}
                {d.output && <div className="md-preview-pane ph-deleg-out">{renderMarkdown(d.output)}</div>}
                <div className="ph-btnrow">
                  {d.status === 'rodando' ? (
                    <button className="btn btn-secondary btn-sm" onClick={() => act(d, 'cancel')} disabled={!!busy}>{tr('projects.cancelar2')}</button>
                  ) : (
                    <>
                      {review?.worktreeExists && (
                        <>
                          <button className="btn btn-secondary btn-sm" onClick={() => window.api.git.openPath(d.worktreePath, 'vscode')}>{tr('projects.vsCode')}</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => copyText(`cd ${JSON.stringify(d.worktreePath)} && claude`)} title={tr('projects.copiaOComandoParaContinuar')}>{tr('projects.continuar')}</button>
                        </>
                      )}
                      {!d.prUrl && !!review?.commits.length && (
                        <button className="btn btn-secondary btn-sm" onClick={() => act(d, 'pr')} disabled={!!busy}>{busy === `pr${d.id}` ? tr('projects.abrindo') : tr('projects.criarPr')}</button>
                      )}
                      {d.status !== 'aceita' && <button className="btn btn-primary btn-sm" onClick={() => act(d, 'accept')} disabled={!!busy}>{tr('projects.aceitar')}</button>}
                      <button className="btn btn-danger btn-sm" onClick={() => act(d, 'discard')} disabled={!!busy}>{tr('projects.descartar')}</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
