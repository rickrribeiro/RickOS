import React, { useEffect, useMemo, useState } from 'react'
import { GitBranch, GitBranchDetails, GitBranchStatus, GitRepo } from '../../../types'
import { useGitStore } from '../store/gitStore'
import {
  STATUS_DEFS,
  STATUS_BY_ID,
  STATUS_RANK,
  WORKTREES_FILTER_KEY,
  timeAgo,
  shortPath,
  copyText,
  buildContinuePrompt,
  openInPromptRunner
} from '../git'
import { openExternal } from '../../../api/createApi'
import '../worktrees.css'
import { t as tr, getLocale } from '../../../i18n'

const ATTENTION: GitBranchStatus[] = ['risk', 'forgotten', 'orphan']

function readPresetProject(): string {
  try {
    return localStorage.getItem(WORKTREES_FILTER_KEY) || 'all'
  } catch {
    return 'all'
  }
}

export function WorktreesPage(): React.ReactElement {
  const { scan, loading, error, refresh } = useGitStore()
  const [statuses, setStatuses] = useState<GitBranchStatus[]>(ATTENTION)
  const [repoFilter, setRepoFilter] = useState<string>(readPresetProject)
  const [agentOnly, setAgentOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    void refresh()
    // preset from the Projects page is read once (consumed after mount: StrictMode runs initializers twice)
    try {
      localStorage.removeItem(WORKTREES_FILTER_KEY)
    } catch {
      // ignore
    }
  }, [refresh])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // repo/project filter: "all" | "p:<projectId>" | "r:<repoPath>"
  const inRepoFilter = (b: { repoPath: string; projectId: number | null }): boolean =>
    repoFilter === 'all' ||
    (repoFilter.startsWith('p:') && String(b.projectId) === repoFilter.slice(2)) ||
    (repoFilter.startsWith('r:') && b.repoPath === repoFilter.slice(2))

  const scoped = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (scan?.branches ?? []).filter(
      (b) =>
        inRepoFilter(b) &&
        (!agentOnly || b.agent) &&
        (!q || `${b.branch ?? ''} ${b.repoName} ${b.worktreePath ?? ''} ${b.lastCommitSubject ?? ''}`.toLowerCase().includes(q))
    )
  }, [scan, repoFilter, agentOnly, query]) // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUS_DEFS.map((d) => [d.id, 0])) as Record<GitBranchStatus, number>
    for (const b of scoped) c[b.status]++
    return c
  }, [scoped])

  const visible = useMemo(
    () =>
      scoped
        .filter((b) => statuses.includes(b.status))
        .sort(
          (a, b) =>
            STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
            new Date(b.lastCommitAt ?? 0).getTime() - new Date(a.lastCommitAt ?? 0).getTime()
        ),
    [scoped, statuses]
  )

  const groups = useMemo(() => {
    const map = new Map<string, GitBranch[]>()
    for (const b of visible) {
      const list = map.get(b.repoPath) ?? []
      list.push(b)
      map.set(b.repoPath, list)
    }
    const repos = scan?.repos ?? []
    return [...map.entries()]
      .map(([path, branches]) => ({ repo: repos.find((r) => r.path === path)!, branches }))
      .filter((g) => g.repo)
      .sort((a, b) => STATUS_RANK[a.branches[0].status] - STATUS_RANK[b.branches[0].status] || a.repo.name.localeCompare(b.repo.name))
  }, [visible, scan])

  const projectsInScan = useMemo(() => {
    const m = new Map<number, string>()
    for (const r of scan?.repos ?? []) if (r.projectId != null && r.projectName) m.set(r.projectId, r.projectName)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [scan])

  const toggleStatus = (s: GitBranchStatus): void =>
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))

  async function act(label: string, fn: () => Promise<unknown>, rescan = true): Promise<void> {
    try {
      const r = await fn()
      setToast(typeof r === 'string' ? r : tr('projects.ok', { label }))
      if (rescan) await refresh({ refreshPrs: true })
    } catch (e) {
      setToast(`${label}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const repoCount = scan?.repos.length ?? 0
  const allSelected = statuses.length === STATUS_DEFS.length

  return (
    <div className="module-page wt-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{tr('projects.worktreesBranches')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {scan
              ? tr('projects.repositorioSBranchesAtualizadoHa', { repoCount, count: scan.branches.length, p2: timeAgo(scan.scannedAt) })
              : tr('projects.estadoDeTodasAsBranches')}
          </p>
        </div>
        <div className="wt-header-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setShowConfig((v) => !v)}>
            {tr('projects.pastas')}
          </button>
          <button className="btn btn-primary btn-sm" disabled={loading} onClick={() => refresh({ refreshPrs: true })}>
            {loading ? tr('projects.escaneando') : tr('projects.atualizar')}
          </button>
        </div>
      </div>

      {showConfig && <ScanConfig onSaved={() => refresh()} />}

      {error && <div className="wt-error">⚠️ {error}</div>}
      {toast && <div className="wt-toast">{toast}</div>}

      <div className="wt-chips">
        {STATUS_DEFS.map((d) => (
          <button
            key={d.id}
            className={`wt-chip ${statuses.includes(d.id) ? 'on' : ''}`}
            style={{ '--chip': d.color } as React.CSSProperties}
            onClick={() => toggleStatus(d.id)}
            title={d.hint}
          >
            {d.emoji} {d.label} <b>{counts[d.id]}</b>
          </button>
        ))}
        <button className="wt-chip wt-chip-plain" onClick={() => setStatuses(allSelected ? ATTENTION : STATUS_DEFS.map((d) => d.id))}>
          {allSelected ? tr('projects.soAtencao') : tr('projects.todas')}
        </button>
      </div>

      <div className="todo-toolbar">
        <input placeholder={tr('projects.buscarBranchRepoCommit')} value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <select value={repoFilter} onChange={(e) => setRepoFilter(e.target.value)}>
          <option value="all">{tr('projects.todosOsRepositorios')}</option>
          {projectsInScan.length > 0 && (
            <optgroup label={tr('projects.projetos')}>
              {projectsInScan.map(([id, name]) => (
                <option key={id} value={`p:${id}`}>
                  {name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label={tr('projects.repositorios2')}>
            {(scan?.repos ?? []).map((r) => (
              <option key={r.path} value={`r:${r.path}`}>
                {r.name}
              </option>
            ))}
          </optgroup>
        </select>
        <label className="wt-toggle">
          <input type="checkbox" checked={agentOnly} onChange={(e) => setAgentOnly(e.target.checked)} /> {tr('projects.soDeAgentes')}
        </label>
      </div>

      {scan && repoCount === 0 && (
        <div className="empty-hint" style={{ padding: 24 }}>
          {tr('projects.nenhumRepositorioEncontradoPreenchaO')} <b>{tr('projects.caminhoLocal')}</b> {tr('projects.dosSeusProjetosOuAdicione')} <b>{tr('projects.pastas')}</b> {tr('projects.ex')} <code>~/Projects</code>).
        </div>
      )}
      {scan && repoCount > 0 && groups.length === 0 && (
        <div className="empty-hint" style={{ padding: 24 }}>
          {tr('projects.nadaNessesFiltros')} {statuses.length === ATTENTION.length && tr('projects.nenhumTrabalhoPerdido')}
        </div>
      )}
      {!scan && loading && <div className="empty-hint" style={{ padding: 24 }}>{tr('projects.escaneandoRepositorios')}</div>}

      {groups.map(({ repo, branches }) => (
        <RepoGroup
          key={repo.path}
          repo={repo}
          branches={branches}
          openId={openId}
          setOpenId={setOpenId}
          act={act}
          orphanCount={(scan?.branches ?? []).filter((b) => b.repoPath === repo.path && b.status === 'orphan').length}
        />
      ))}
    </div>
  )
}

function RepoGroup(props: {
  repo: GitRepo
  branches: GitBranch[]
  orphanCount: number
  openId: string | null
  setOpenId: (id: string | null) => void
  act: (label: string, fn: () => Promise<unknown>, rescan?: boolean) => Promise<void>
}): React.ReactElement {
  const { repo, branches, orphanCount, openId, setOpenId, act } = props
  return (
    <section className="wt-repo">
      <header className="wt-repo-head">
        <div className="wt-repo-title">
          <span className="wt-repo-name">{repo.name}</span>
          {repo.projectName && <span className="project-chip">{repo.projectName}</span>}
          <span className="wt-muted wt-mono">{shortPath(repo.path)}</span>
          <span className="wt-muted">{tr('projects.base2')} {repo.base}</span>
        </div>
        <div className="wt-repo-actions">
          {repo.hasRemote && (
            <button className="btn btn-secondary btn-sm" onClick={() => act(tr('projects.gitFetch'), () => window.api.git.fetch(repo.path))} title={tr('projects.gitFetchAllPruneAtualiza')}>
              {tr('projects.fetch')}
            </button>
          )}
          {orphanCount > 0 && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => window.confirm(tr('projects.removerOsRegistroSDe', { orphanCount })) && act(tr('projects.prune2'), () => window.api.git.prune(repo.path))}
            >
              {tr('projects.prune', { orphanCount })}
            </button>
          )}
          <OpenButtons target={repo.path} act={act} />
        </div>
      </header>
      {repo.error && <div className="wt-error">⚠️ {repo.error}</div>}
      <div className="list-stack">
        {branches.map((b) => (
          <BranchRow key={b.id} b={b} repo={repo} open={openId === b.id} onToggle={() => setOpenId(openId === b.id ? null : b.id)} act={act} />
        ))}
      </div>
    </section>
  )
}

function OpenButtons({ target, act }: { target: string; act: (label: string, fn: () => Promise<unknown>, rescan?: boolean) => Promise<void> }): React.ReactElement {
  if (window.desktop) {
    return (
      <>
        <button className="btn btn-secondary btn-sm" onClick={() => act(tr('projects.vsCode'), () => window.api.git.openPath(target, 'vscode'), false)} title={tr('projects.abrirNoVsCode')}>
          {tr('projects.vsCode')}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => act(tr('projects.finder'), () => window.api.git.openPath(target, 'finder'), false)} title={tr('projects.abrirNoFinder')}>
          {tr('projects.finder')}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => act(tr('projects.terminal'), () => window.api.git.openPath(target, 'terminal'), false)} title={tr('projects.abrirNoTerminal')}>
          {tr('projects.terminal')}
        </button>
      </>
    )
  }
  return (
    <button className="btn btn-secondary btn-sm" onClick={() => copyText(`cd "${target}" && code .`)} title={tr('projects.copiaOComandoParaAbrir')}>
      {tr('projects.comando')}
    </button>
  )
}

function BranchRow(props: {
  b: GitBranch
  repo: GitRepo
  open: boolean
  onToggle: () => void
  act: (label: string, fn: () => Promise<unknown>, rescan?: boolean) => Promise<void>
}): React.ReactElement {
  const { b, repo, open, onToggle, act } = props
  const def = STATUS_BY_ID[b.status]
  const [details, setDetails] = useState<GitBranchDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)

  async function loadDetails(): Promise<GitBranchDetails | null> {
    if (details) return details
    setLoadingDetails(true)
    try {
      const d = await window.api.git.details(b.repoPath, b.branch, b.worktreeMissing ? null : b.worktreePath)
      setDetails(d)
      return d
    } catch {
      return null
    } finally {
      setLoadingDetails(false)
    }
  }

  useEffect(() => {
    if (open) void loadDetails()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function continueInRunner(): Promise<void> {
    const d = await loadDetails()
    openInPromptRunner(buildContinuePrompt(b, d, repo.base), b.projectId, `🌿 ${b.branch ?? b.repoName}`)
  }

  const meta: React.ReactNode[] = []
  if (!b.isBase && (b.ahead || b.behind)) meta.push(<span key="ab" title={tr('projects.aFrenteAtrasDe', { ahead: b.ahead, behind: b.behind, base: repo.base })}>↑{b.ahead} ↓{b.behind}</span>)
  if ((b.localOnly ?? 0) > 0) meta.push(<span key="lo" className="wt-warn" title={tr('projects.commitsQueNaoExistemEm')}>⬆ {b.localOnly} {tr('projects.naoEnviadoS')}</span>)
  if ((b.dirty ?? 0) > 0) meta.push(<span key="d" className="wt-warn">✎ {b.dirty} {tr('projects.modificadoS')}</span>)
  if ((b.untracked ?? 0) > 0) meta.push(<span key="u" className="wt-warn">+ {b.untracked} {tr('projects.novoS')}</span>)
  if (b.upstreamGone) meta.push(<span key="g" title={tr('projects.oBranchRemotoFoiApagado')}>{tr('projects.remotoApagado')}</span>)

  return (
    <div className={`list-row wt-row ${open ? 'open' : ''}`} style={{ '--status': def.color } as React.CSSProperties}>
      <button className="wt-row-main" onClick={onToggle} aria-expanded={open}>
        <span className="wt-status" title={def.hint}>
          {def.emoji} <span className="wt-status-label">{def.label}</span>
        </span>
        <span className="wt-branch wt-mono">{b.branch ?? tr('projects.headDestacado')}</span>
        {b.agent && <span className="wt-badge" title={tr('projects.criadaPorAgentePastaPrefixo')}>🤖</span>}
        {b.worktreePath && !b.isBase && (
          <span className={`wt-badge ${b.worktreeMissing ? 'wt-badge-bad' : ''}`} title={b.worktreePath}>
            {b.worktreeMissing ? tr('projects.worktreeSumiu') : tr('projects.worktree')}
          </span>
        )}
        {b.pr && (
          <span className={`wt-pr wt-pr-${b.pr.state.toLowerCase()}`} title={b.pr.title}>
            {tr('projects.pr2', { number: b.pr.number })} {b.pr.state === 'OPEN' ? tr('projects.aberta') : b.pr.state === 'MERGED' ? tr('projects.mergeada') : tr('projects.fechada')}
          </span>
        )}
        <span className="wt-meta">{meta}</span>
        <span className="wt-when" title={b.lastCommitAt ? new Date(b.lastCommitAt).toLocaleString(getLocale()) : ''}>
          {b.lastCommitAt ? tr('projects.ha2', { p0: timeAgo(b.lastCommitAt) }) : ''}
        </span>
        <span className="wt-subject">{b.lastCommitSubject}</span>
      </button>

      {open && (
        <div className="wt-details">
          <div className="wt-actions">
            {b.branch && (
              <button className="btn btn-secondary btn-sm" onClick={() => copyText(b.branch!)}>
                {tr('projects.branch')}
              </button>
            )}
            {b.worktreePath && (
              <button className="btn btn-secondary btn-sm" onClick={() => copyText(b.worktreePath!)}>
                {tr('projects.caminho')}
              </button>
            )}
            {b.worktreePath && !b.worktreeMissing && <OpenButtons target={b.worktreePath} act={act} />}
            {b.pr && (
              <button className="btn btn-secondary btn-sm" onClick={() => openExternal(b.pr!.url)}>
                {tr('projects.pr3', { number: b.pr.number })}
              </button>
            )}
            {!b.pr && !b.isBase && b.branch && b.ahead > 0 && repo.ghAvailable && b.status !== 'merged' && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  window.confirm(
                    tr('projects.criarPrDePara', { branch: b.branch, base: repo.base, p2: !b.upstream || (b.localOnly ?? 0) > 0 ? '\n\nA branch será enviada (git push -u origin) antes.' : '' })
                  ) &&
                  act(tr('projects.pr4'), async () => {
                    const r = await window.api.git.createPr(b.repoPath, b.branch!)
                    if (r.url) openExternal(r.url)
                    return tr('projects.prCriada', { url: r.url })
                  })
                }
              >
                {tr('projects.criarPr2')}
              </button>
            )}
            {b.status !== 'merged' && b.status !== 'orphan' && !b.isBase && (
              <button className="btn btn-primary btn-sm" onClick={continueInRunner}>
                {tr('projects.continuarNoPromptRunner')}
              </button>
            )}
            {b.status === 'merged' && b.branch && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() =>
                  window.confirm(tr('projects.apagarABranchElaJa', { branch: b.branch, p1: b.worktreePath ? ' e a worktree dela' : '' })) &&
                  act(tr('projects.apagar'), () => window.api.git.deleteBranch(b.repoPath, b.branch!))
                }
              >
                {tr('projects.apagarBranch')}
              </button>
            )}
          </div>

          {b.worktreePath && <div className="wt-muted wt-mono wt-path">{b.worktreePath}</div>}
          {loadingDetails && <div className="wt-muted">{tr('projects.carregando')}</div>}
          {details && (
            <div className="wt-detail-grid">
              <div>
                <div className="chart-title">{tr('projects.commitsAFrenteDe', { base: repo.base, count: details.commits.length })}</div>
                {details.commits.length === 0 && <div className="wt-muted">{tr('projects.nenhum')}</div>}
                <ul className="wt-list">
                  {details.commits.map((c) => (
                    <li key={c.hash}>
                      <span className="wt-mono wt-muted">{c.hash}</span> {c.subject} <span className="wt-muted">· {timeAgo(c.date)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="chart-title">{tr('projects.naoCommitado', { count: details.files.length })}</div>
                {details.files.length === 0 && <div className="wt-muted">{b.worktreePath ? tr('projects.worktreeLimpa') : tr('projects.semWorktree')}</div>}
                <ul className="wt-list">
                  {details.files.map((f) => (
                    <li key={f.path} className="wt-mono">
                      <span className="wt-file-status">{f.status}</span> {f.path}
                    </li>
                  ))}
                </ul>
              </div>
              {details.diffStat && (
                <div className="wt-full">
                  <div className="chart-title">{tr('projects.diffContraABase')}</div>
                  <pre className="wt-diffstat">{details.diffStat}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ScanConfig({ onSaved }: { onSaved: () => void }): React.ReactElement {
  const [roots, setRoots] = useState('')
  const [days, setDays] = useState(3)
  useEffect(() => {
    void window.api.settings.get('git_scan_roots').then((v) => setRoots(v ?? ''))
    void window.api.settings.get('git_stale_days').then((v) => setDays(Number(v) > 0 ? Number(v) : 3))
  }, [])
  async function save(): Promise<void> {
    await window.api.settings.set('git_scan_roots', roots.trim())
    await window.api.settings.set('git_stale_days', String(Math.max(1, days)))
    onSaved()
  }
  return (
    <div className="chart-section wt-config">
      <div className="chart-title">{tr('projects.ondeProcurarRepositorios')}</div>
      <p className="wt-muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
        {tr('projects.projetosCom')} <b>{tr('projects.caminhoLocal')}</b> {tr('projects.jaEntramAutomaticamenteAdicionePastas')}
      </p>
      <textarea rows={3} value={roots} onChange={(e) => setRoots(e.target.value)} placeholder={tr('projects.projects')} style={{ width: '100%' }} />
      <div className="wt-config-row">
        <label>
          {tr('projects.considerarEsquecidaApos')}{' '}
          <input type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 64 }} /> {tr('projects.diasParada')}
        </label>
        <button className="btn btn-primary btn-sm" onClick={save}>
          {tr('projects.salvarEEscanear')}
        </button>
      </div>
    </div>
  )
}
