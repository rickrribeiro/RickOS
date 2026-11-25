import React, { useEffect, useState } from 'react'
import { GithubIssue } from '../../../types'
import { useGithubStore, columnFor, parseLabels, repoFromUrl, BoardColumn } from '../store/githubStore'
import { reposOf, useProjectStore } from '../store/projectStore'
import { t, getLocale } from '../../../i18n'

const COLUMNS: { key: BoardColumn; label: string }[] = [
  { key: 'backlog', label: t('projects.backlog') },
  { key: 'in-progress', label: t('projects.emAndamento') },
  { key: 'blocked', label: t('projects.bloqueado') },
  { key: 'done', label: t('projects.concluido2') }
]

type DoneFilter = 'today' | 'week' | 'month' | 'thisMonth' | 'lastMonth' | 'all'

const DONE_FILTERS: { key: DoneFilter; label: string }[] = [
  { key: 'today', label: t('projects.hoje3') },
  { key: 'week', label: t('projects.1Semana') },
  { key: 'month', label: t('projects.1Mes') },
  { key: 'thisMonth', label: t('projects.esseMes') },
  { key: 'lastMonth', label: t('projects.mesPassado') },
  { key: 'all', label: t('projects.total') }
]

/** Whether a done issue's updatedAt falls within the selected window (proxy for "when done"). */
function doneWithin(iso: string | null, f: DoneFilter): boolean {
  if (f === 'all') return true
  if (!iso) return false
  const d = new Date(iso)
  const now = new Date()
  switch (f) {
    case 'today': {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      return d >= start
    }
    case 'week':
      return d >= new Date(now.getTime() - 7 * 86400000)
    case 'month':
      return d >= new Date(now.getTime() - 30 * 86400000)
    case 'thisMonth':
      return d >= new Date(now.getFullYear(), now.getMonth(), 1)
    case 'lastMonth':
      return d >= new Date(now.getFullYear(), now.getMonth() - 1, 1) && d < new Date(now.getFullYear(), now.getMonth(), 1)
    default:
      return true
  }
}

interface CardProps {
  issue: GithubIssue
  pushing: boolean
  onPush: (id: number) => void
  onDelete: (id: number) => void
}

function IssueCard({ issue, pushing, onPush, onDelete }: CardProps): React.ReactElement {
  const labels = parseLabels(issue)
  const onGithub = !!issue.url
  return (
    <div className="kanban-card">
      <div className="kanban-card-repo">
        {issue.repo}
        <span className={`issue-origin ${onGithub ? 'gh' : 'local'}`}>{onGithub ? t('projects.github') : t('projects.local')}</span>
      </div>
      <button
        className="kanban-card-title"
        onClick={() => issue.url && window.api.app.openExternal(issue.url)}
        title={onGithub ? t('projects.abrirNoGithub') : t('projects.issueLocalAindaNaoEsta')}
        style={{ cursor: onGithub ? 'pointer' : 'default' }}
      >
        {onGithub ? `#${issue.number} ` : ''}
        {issue.title}
      </button>
      {issue.body && <div className="kanban-card-body">{issue.body}</div>}
      {labels.length > 0 && (
        <div className="kanban-card-labels">
          {labels.map((l) => (
            <span key={l} className="project-chip">
              {l}
            </span>
          ))}
        </div>
      )}
      {!onGithub && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={() => onPush(issue.id)} disabled={pushing}>
            {pushing ? t('projects.criando') : t('projects.criarNoGithub')}
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => onDelete(issue.id)} disabled={pushing}>
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

function fmtSyncTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString(getLocale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function IssuesPage(): React.ReactElement {
  const { issues, refresh, sync, syncing, error, lastCount, lastSyncAt, createLocal, removeIssue, pushToGithub } =
    useGithubStore()
  const { projects, repos: projectRepos, refresh: refreshProjects } = useProjectStore()
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  // projeto workspace selecionado: filtra por um dos seus repositórios (null = todos)
  const [repoFilter, setRepoFilter] = useState<string | null>(null)
  const [doneFilter, setDoneFilter] = useState<DoneFilter>('week')

  // Add-issue form
  const [showForm, setShowForm] = useState(false)
  const [repo, setRepo] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const [pushingId, setPushingId] = useState<number | null>(null)
  const [pushError, setPushError] = useState('')

  useEffect(() => {
    refresh()
    refreshProjects()
  }, [])

  // projeto workspace entra com todos os seus repositórios
  const linkable = projects
    .filter((p) => p.archived !== 1)
    .map((p) => {
      const ws = reposOf(p.id, projectRepos)
      const urls = ws.length ? ws.map((r) => r.githubRepoUrl) : [p.githubRepoUrl]
      return { p, repos: urls.map((u) => repoFromUrl(u ?? null)).filter((r): r is string => !!r) }
    })
    .filter((x) => x.repos.length > 0)

  function toggleProject(id: number): void {
    setRepoFilter(null)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // repos of the selected projects (empty selection = show all)
  const selectedRepos = new Set(
    linkable.filter((x) => selectedIds.has(x.p.id)).flatMap((x) => x.repos.map((r) => r.toLowerCase()))
  )
  // repos dos projetos selecionados com mais de um repo (workspace) → chips de repo
  const repoChoices = linkable.filter((x) => selectedIds.has(x.p.id) && x.repos.length > 1).flatMap((x) => x.repos)
  const visible = (selectedIds.size === 0 ? issues : issues.filter((i) => selectedRepos.has(i.repo.toLowerCase()))).filter(
    (i) => !repoFilter || i.repo.toLowerCase() === repoFilter.toLowerCase()
  )

  const grouped: Record<BoardColumn, GithubIssue[]> = { backlog: [], 'in-progress': [], blocked: [], done: [] }
  for (const i of visible) {
    const col = columnFor(i)
    // the time filter applies only to the Done column (by updatedAt ≈ when it was closed)
    if (col === 'done' && !doneWithin(i.updatedAt, doneFilter)) continue
    grouped[col].push(i)
  }

  async function handleAdd(): Promise<void> {
    if (!repo.trim() || !title.trim()) return
    await createLocal(repo.trim(), title.trim(), body.trim() || null)
    setTitle('')
    setBody('')
    setShowForm(false)
  }

  async function handlePush(id: number): Promise<void> {
    setPushingId(id)
    setPushError('')
    try {
      await pushToGithub(id)
    } catch (e) {
      setPushError(e instanceof Error ? e.message : String(e))
    } finally {
      setPushingId(null)
    }
  }

  const localCount = issues.filter((i) => !i.url).length

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t('projects.issuesKanban')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {t('projects.issuesDoGithubIssuesLocais', { count: localCount })}{t('projects.crieLocalEDepoisEnvie')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={doneFilter} onChange={(e) => setDoneFilter(e.target.value as DoneFilter)} title={t('projects.periodoDasConcluidas')}>
            {DONE_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>{t('projects.concluidas')} {f.label}</option>
            ))}
          </select>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowForm((s) => !s)}>
            {showForm ? t('projects.fechar') : t('projects.novaIssue')}
          </button>
          <button className="btn btn-primary btn-sm" onClick={sync} disabled={syncing}>
            {syncing ? t('projects.sincronizando') : t('projects.sincronizar')}
          </button>
        </div>
      </div>

      {linkable.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 2 }}>{t('projects.projetos2')}</span>
          <button
            className={`btn btn-sm ${selectedIds.size === 0 ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => {
              setSelectedIds(new Set())
              setRepoFilter(null)
            }}
          >
            {t('projects.todos')}
          </button>
          {linkable.map((x) => (
            <button
              key={x.p.id}
              className={`btn btn-sm ${selectedIds.has(x.p.id) ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => toggleProject(x.p.id)}
              title={x.repos.join(', ')}
            >
              {x.p.name}
              {x.repos.length > 1 && <span style={{ opacity: 0.7 }}> {t('projects.repos3', { count: x.repos.length })}</span>}
            </button>
          ))}
        </div>
      )}
      {repoChoices.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 2 }}>{t('projects.repositorio')}</span>
          <button className={`btn btn-sm ${repoFilter == null ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setRepoFilter(null)}>
            {t('projects.todos')}
          </button>
          {repoChoices.map((r) => (
            <button key={r} className={`btn btn-sm ${repoFilter === r ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setRepoFilter(r)} title={r}>
              {r.split('/').pop()}
              <span style={{ opacity: 0.7 }}> {issues.filter((i) => i.repo.toLowerCase() === r.toLowerCase() && i.state === 'open').length}</span>
            </button>
          ))}
        </div>
      )}

      {showForm && (
        <div className="chart-section" style={{ marginBottom: 12, maxWidth: 620 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              list="repos-datalist"
              placeholder={t('projects.repositorioOwnerName')}
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
            />
            <datalist id="repos-datalist">
              {linkable.flatMap((x) =>
                x.repos.map((r) => (
                  <option key={`${x.p.id}:${r}`} value={r}>
                    {x.repos.length > 1 ? x.p.name : undefined}
                  </option>
                ))
              )}
            </datalist>
            <input placeholder={t('projects.titulo')} value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea placeholder={t('projects.descricaoOpcional')} rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>{t('projects.cancelar')}</button>
              <button className="btn btn-primary btn-sm" onClick={handleAdd}>{t('projects.adicionarLocal')}</button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="empty-hint" style={{ color: 'var(--danger)' }}>{error}</div>}
      {pushError && <div className="empty-hint" style={{ color: 'var(--danger)' }}>{pushError}</div>}

      {issues.length === 0 && !error && (
        <div className="empty-hint">
          {t('projects.nenhumaIssueSincronizeComO')} <strong>{t('projects.configuracoes')}</strong>{t('projects.ouCrieUmaIssueLocal')} <strong>{t('projects.novaIssue')}</strong>.
        </div>
      )}

      {issues.length > 0 && visible.length === 0 && (
        <div className="empty-hint">{t('projects.nenhumaIssueParaOProjeto')}</div>
      )}

      {visible.length > 0 && (
        <div className="kanban-board">
          {COLUMNS.map((col) => (
            <div key={col.key} className="kanban-column">
              <div className="kanban-column-header">
                {col.label} <span className="kanban-count">{grouped[col.key].length}</span>
              </div>
              <div className="kanban-column-body">
                {grouped[col.key].map((i) => (
                  <IssueCard
                    key={i.id}
                    issue={i}
                    pushing={pushingId === i.id}
                    onPush={handlePush}
                    onDelete={removeIssue}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {(lastCount !== null || lastSyncAt) && !error && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
          {t('projects.ultimaSincronizacao')}{lastSyncAt ? `: ${fmtSyncTime(lastSyncAt)}` : ''}
          {lastCount !== null ? t('projects.issues', { lastCount }) : ''}
        </p>
      )}
    </div>
  )
}
