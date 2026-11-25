import React, { useEffect, useMemo, useState } from 'react'
import type { ProjectCycle, GitBranch, GithubIssue, ProjectCommit, ProjectEvent, ProjectNote, ProjectStatus, TaskWithTag, Todo, WorkspaceDuplicate } from '../../../types'
import { useUIStore } from '../../../store/uiStore'
import { reposOf, useProjectStore, workTagsFor } from '../store/projectStore'
import { useTagStore } from '../../timetracker/store/tagStore'
import { StatusChangeModal } from '../components/StatusChangeModal'
import { NextActionModal } from '../components/NextActionModal'
import { ProjectForm } from '../components/ProjectForm'
import { RoadmapView } from '../components/RoadmapView'
import { CycleModal } from '../components/CycleModal'
import { ChangelogModal } from '../components/ChangelogModal'
import { DelegateModal, DelegationsPanel } from '../components/Delegations'
import { ScheduleEditor } from '../components/ScheduleEditor'
import { EVENT_LABEL, PULSE, SIZES, STATUSES, areaLabel, fmtDate, fmtMinutes, isClosed, stageLabel, statusDef } from '../lib/constants'
import { projectContext, runJson, runText } from '../lib/ai'
import { repoFromUrl } from '../store/githubStore'
import { WORKTREES_FILTER_KEY } from '../git'
import { timeAgo, localDateStr } from '../../../utils/dates'
import { renderMarkdown } from '../../estudos/markdown'
import '../projects-hub.css'
import { t as tr, getLocale } from '../../../i18n'

type Tab = 'geral' | 'roadmap' | 'tarefas' | 'codigo' | 'notas' | 'historico'
const TABS: { key: Tab; label: string }[] = [
  { key: 'geral', label: tr('projects.visaoGeral') },
  { key: 'roadmap', label: tr('projects.roadmap') },
  { key: 'tarefas', label: tr('projects.tarefas') },
  { key: 'codigo', label: tr('projects.codigo') },
  { key: 'notas', label: tr('projects.conhecimento') },
  { key: 'historico', label: tr('projects.historico') }
]

/** Campo de texto que salva ao sair (blur) — edição sem botões. */
function InlineText({ value, placeholder, onSave, rows = 2 }: { value: string | null; placeholder: string; onSave: (v: string) => void; rows?: number }): React.ReactElement {
  const [v, setV] = useState(value ?? '')
  useEffect(() => setV(value ?? ''), [value])
  return (
    <textarea
      className="ph-inline"
      rows={rows}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() !== (value ?? '').trim() && onSave(v)}
    />
  )
}

interface AiPlan {
  finishLine?: string
  scope?: string
  futureIdeas?: string
  nextAction?: string
  milestones?: { title: string; targetDate?: string | null }[]
}

const COUNT_LABELS: Record<string, string> = {
  todos: 'tarefa(s)',
  tasks: tr('projects.sessaoOesNoTimer'),
  tags: 'tag(s)',
  project_milestones: 'marco(s)',
  project_cycles: 'ciclo(s)',
  project_events: tr('projects.registroSNoHistorico'),
  project_notes: 'nota(s)',
  project_delegations: tr('projects.delegacaoOes'),
  ai_conversations: tr('projects.conversaSDoPromptRunner'),
  ai_usage: tr('projects.usoSDeIa')
}

/** "3 tarefa(s), 2 uso(s) de IA" — o que vem junto ao incorporar um projeto. */
function countsLabel(counts: Record<string, number>): string {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${COUNT_LABELS[k] ?? k}`)
    .join(', ')
}

/** Filtro por repositório (projeto workspace): Todos + um chip por repo. */
function RepoChips({
  options,
  value,
  onChange,
  total
}: {
  options: { key: string; label: string; count: number }[]
  value: string | null
  onChange: (v: string | null) => void
  total: number
}): React.ReactElement {
  return (
    <div className="ph-repo-chips" role="tablist" aria-label={tr('projects.filtrarPorRepositorio')}>
      <button role="tab" aria-selected={value == null} className={value == null ? 'active' : ''} onClick={() => onChange(null)}>
        {tr('projects.todos')} <span className="kanban-count">{total}</span>
      </button>
      {options.map((o) => (
        <button key={o.key} role="tab" aria-selected={value === o.key} className={value === o.key ? 'active' : ''} onClick={() => onChange(o.key)}>
          {o.label} <span className="kanban-count">{o.count}</span>
        </button>
      ))}
    </div>
  )
}

export function ProjectDetailPage(): React.ReactElement {
  const { selectedProjectId, setPage } = useUIStore()
  const { projects, overview, milestones, cycles, refreshAll, refreshMilestones, refreshCycles, patch, startWorking } = useProjectStore()
  const allRepos = useProjectStore((s) => s.repos)
  const p = projects.find((x) => x.id === selectedProjectId) ?? null
  const allTags = useTagStore((s) => s.tags)
  const ov = p ? overview[p.id] : undefined
  const [tab, setTab] = useState<Tab>('geral')
  const [statusTo, setStatusTo] = useState<ProjectStatus | null>(null)
  const [actionMode, setActionMode] = useState<'complete' | 'set' | null>(null)
  const [editing, setEditing] = useState(false)
  const [events, setEvents] = useState<ProjectEvent[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [issues, setIssues] = useState<GithubIssue[]>([])
  const [commits, setCommits] = useState<ProjectCommit[]>([])
  const [branches, setBranches] = useState<GitBranch[]>([])
  // workspace: repositório escolhido nos filtros (null = todos) e projetos duplicados a incorporar
  const [codeRepo, setCodeRepo] = useState<string | null>(null)
  const [issueRepo, setIssueRepo] = useState<string | null>(null)
  const [dups, setDups] = useState<WorkspaceDuplicate[]>([])
  const [absorbing, setAbsorbing] = useState<number | null>(null)
  const [sessions, setSessions] = useState<TaskWithTag[]>([])
  const [notes, setNotes] = useState<ProjectNote[]>([])
  const [aiPlan, setAiPlan] = useState<AiPlan | null>(null)
  const [aiBusy, setAiBusy] = useState<string | null>(null)
  const [aiError, setAiError] = useState('')
  const [cycleMode, setCycleMode] = useState<'new' | 'extend' | 'close' | null>(null)
  const [changelogCycle, setChangelogCycle] = useState<ProjectCycle | null>(null)
  const [delegating, setDelegating] = useState<string | null>(null) // texto da tarefa a delegar
  const [delegateExtra, setDelegateExtra] = useState<{ instructions?: string; title?: string; onDone?: () => Promise<void> }>({})
  const [msTitle, setMsTitle] = useState('')
  const [msDate, setMsDate] = useState('')
  const [newTodo, setNewTodo] = useState('')
  const [linkSearch, setLinkSearch] = useState('')
  const [noteKind, setNoteKind] = useState<'nota' | 'link' | 'decisao'>('nota')
  const [noteTitle, setNoteTitle] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [noteUrl, setNoteUrl] = useState('')

  async function loadExtras(): Promise<void> {
    if (!p) return
    const [ev, td, is, ss, nt] = await Promise.all([
      window.api.projects.events(p.id, 200),
      window.api.todos.getAll(),
      window.api.github.getIssues().catch(() => [] as GithubIssue[]),
      window.api.projects.tasks(p.id, 200),
      window.api.projectNotes.getAll(p.id)
    ])
    setEvents(ev)
    setTodos(td)
    setIssues(is)
    setSessions(ss)
    setNotes(nt)
  }

  useEffect(() => {
    if (!projects.length) void refreshAll()
    const off = window.api.projects.onChanged(() => {
      void refreshAll()
      void loadExtras()
    })
    return off
  }, [])

  useEffect(() => {
    setAiPlan(null)
    void loadExtras()
  }, [p?.id])

  // código (commits/branches) e duplicados: recarrega também quando a lista de repos muda
  const repoKey = p ? reposOf(p.id, allRepos).map((r) => `${r.path}|${r.githubRepoUrl ?? ''}`).join(',') : ''
  const loadCode = (): void => {
    if (!p) return
    if (p.localPath) {
      window.api.projects.commits(p.id, 40).then(setCommits).catch(() => setCommits([]))
      window.api.git.summary().then((s) => setBranches(s.branches.filter((b) => b.projectId === p.id))).catch(() => setBranches([]))
    } else {
      setCommits([])
      setBranches([])
    }
    if (repoKey) window.api.projects.workspaceDuplicates(p.id).then(setDups).catch(() => setDups([]))
    else setDups([])
  }
  async function absorb(d: WorkspaceDuplicate): Promise<void> {
    if (!p) return
    const what = countsLabel(d.counts)
    const ok = window.confirm(
      tr('projects.absorb.confirm', { name: d.projectName, target: p.name }) + '\n\n' +
        (what ? tr('projects.absorb.comes', { what }) : tr('projects.absorb.noData')) + '\n' +
        tr('projects.absorb.notes')
    )
    if (!ok) return
    setAbsorbing(d.projectId)
    try {
      await window.api.projects.absorb(p.id, d.projectId)
      await refreshAll()
      void loadExtras()
      loadCode()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    } finally {
      setAbsorbing(null)
    }
  }

  useEffect(() => {
    setCodeRepo(null)
    setIssueRepo(null)
    loadCode()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id, repoKey])

  const ms = useMemo(() => (p ? milestones.filter((m) => m.projectId === p.id) : []), [milestones, p?.id])
  const projCycles = useMemo(() => (p ? cycles.filter((c) => c.projectId === p.id) : []), [cycles, p?.id])
  const activeCycle = projCycles.find((c) => c.status === 'ativo') ?? null

  if (!p) {
    return (
      <div className="module-page">
        <button className="btn btn-secondary btn-sm" onClick={() => setPage('projects')}>{tr('projects.projetos4')}</button>
        <div className="empty-hint" style={{ marginTop: 20 }}>{projects.length ? tr('projects.projetoNaoEncontrado') : tr('projects.carregando')}</div>
      </div>
    )
  }
  const project = p
  const def = statusDef(project.status)
  const pulse = ov ? PULSE[ov.pulse] : PULSE.parado
  const save = (fields: Parameters<typeof patch>[1]): void => void patch(project.id, fields).then(loadExtras)

  // ── IA ──
  async function aiSuggestPlan(): Promise<void> {
    setAiBusy('plan')
    setAiError('')
    try {
      const ctx = await projectContext(project, ov)
      const r = await runJson<AiPlan>(
        `Você é meu gerente de projetos pessoal. Para o projeto abaixo, proponha um plano enxuto para TERMINAR a entrega atual:
- finishLine: frase "Pronto quando…" objetiva e verificável
- scope: o escopo mínimo da entrega atual (lista curta, com hífens)
- futureIdeas: o que fica para depois (lista curta, com hífens)
- milestones: 3 a 5 marcos em ordem, cada um {"title": "...", "targetDate": "YYYY-MM-DD" ou null} (hoje é ${localDateStr(new Date())})
- nextAction: a próxima ação concreta (25-90 min)
Formato: {"finishLine": "...", "scope": "...", "futureIdeas": "...", "milestones": [...], "nextAction": "..."}

${ctx}`
      )
      setAiPlan(r)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e))
    } finally {
      setAiBusy(null)
    }
  }

  async function aiWhereLeftOff(): Promise<void> {
    setAiBusy('where')
    setAiError('')
    try {
      const ctx = await projectContext(project, ov)
      const txt = await runText(
        `Com base nas atividades recentes (commits, sessões no timer, tarefas e histórico), escreva um "ONDE PAREI" de 2-4 frases em primeira pessoa para eu retomar este projeto rapidamente: o que foi feito por último, o estado atual e o próximo passo natural. Só o texto.\n\n${ctx}`
      )
      save({ whereLeftOff: txt })
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e))
    } finally {
      setAiBusy(null)
    }
  }

  async function applyMilestones(list: { title: string; targetDate?: string | null }[]): Promise<void> {
    for (const m of list) await window.api.milestones.create(project.id, m.title, m.targetDate || null)
    await refreshMilestones()
  }

  // ── Marcos ──
  async function addMilestone(): Promise<void> {
    if (!msTitle.trim()) return
    const m = await window.api.milestones.create(project.id, msTitle.trim(), msDate || null)
    if (activeCycle) await window.api.milestones.update(m.id, m.title, m.targetDate, activeCycle.id, null)
    setMsTitle('')
    setMsDate('')
    await refreshMilestones()
  }
  async function toggleMilestone(id: number, done: boolean, title: string): Promise<void> {
    await window.api.milestones.toggle(id, done ? 0 : 1)
    if (!done) await window.api.projects.addEvent(project.id, 'marco', `Marco concluído: ${title}`)
    await refreshMilestones()
    void loadExtras()
  }
  const msProgress = (id: number, done: boolean): number => {
    if (done) return 100
    const linked = todos.filter((t) => t.milestoneId === id)
    return linked.length ? Math.round((linked.filter((t) => t.status === 'done').length / linked.length) * 100) : 0
  }

  // ── Ciclos ──
  const cycleChanged = (): void => {
    void Promise.all([refreshCycles(), refreshAll()])
    void loadExtras()
  }

  // ── Tarefas + issues (sem duplicar) ──
  const projTodos = todos.filter((t) => t.projectId === project.id)
  // projeto workspace: issues de todos os repositórios; senão, do único repo
  const wsRepos = reposOf(project.id, allRepos)
  const repoSlugs = new Set(
    (wsRepos.length ? wsRepos.map((r) => r.githubRepoUrl) : [project.githubRepoUrl])
      .map((u) => repoFromUrl(u ?? null)?.toLowerCase())
      .filter((x): x is string => !!x)
  )
  const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const todoKeys = new Set(projTodos.map((t) => norm(t.title)))
  const projIssues = repoSlugs.size
    ? issues.filter((i) => repoSlugs.has(i.repo.toLowerCase()) && !todoKeys.has(norm(i.title)) && !projTodos.some((t) => i.url && t.notes?.includes(i.url)))
    : []
  async function addTodo(): Promise<void> {
    if (!newTodo.trim()) return
    await window.api.todos.create(newTodo.trim(), null, 'todo', 'manual', 0, null, project.id)
    setNewTodo('')
    void loadExtras()
    void refreshAll()
  }
  async function toggleTodo(t: Todo): Promise<void> {
    await window.api.todos.update(t.id, t.title, t.notes, t.status === 'done' ? 'todo' : 'done', t.priority, t.dueDate, t.projectId)
    void loadExtras()
    void refreshAll()
  }
  const linkCandidates = linkSearch.trim()
    ? todos.filter((t) => t.projectId !== project.id && t.status !== 'done' && t.title.toLowerCase().includes(linkSearch.toLowerCase())).slice(0, 8)
    : []

  // ── Notas ──
  async function addNote(): Promise<void> {
    if (!noteTitle.trim()) return
    await window.api.projectNotes.save({ projectId: project.id, kind: noteKind, title: noteTitle.trim(), body: noteBody.trim() || null, url: noteUrl.trim() || null })
    setNoteTitle('')
    setNoteBody('')
    setNoteUrl('')
    void loadExtras()
  }

  const openTodos = projTodos.filter((t) => t.status !== 'done')
  const doneTodos = projTodos.filter((t) => t.status === 'done')
  const dueIn = activeCycle?.dueDate ? Math.ceil((new Date(`${activeCycle.dueDate}T23:59:59`).getTime() - Date.now()) / 86400000) : null

  return (
    <div className="module-page ph-page ph-detail" style={{ ['--pc' as string]: project.color }}>
      {/* ── Cabeçalho ── */}
      <div className="ph-hero">
        <button className="btn btn-secondary btn-sm ph-back" onClick={() => setPage('projects')}>{tr('projects.projetos4')}</button>
        <div className="ph-hero-main">
          <div className="ph-hero-title">
            <span className="ph-pulse big" style={{ background: pulse.color }} title={tr('projects.sinalDeVida2', { label: pulse.label })} />
            <h2>{project.name}</h2>
          </div>
          {project.description && <p className="ph-muted">{project.description}</p>}
          <div className="ph-hero-chips">
            <select className={`ph-status-pill st-${project.status}`} value={project.status} onChange={(e) => setStatusTo(e.target.value as ProjectStatus)} aria-label={tr('projects.situacao')}>
              {STATUSES.map((s) => (
                <option key={s.key} value={s.key}>{s.icon} {s.label}</option>
              ))}
            </select>
            <span className="project-chip">{areaLabel(project.area)}</span>
            {project.stage && <span className="project-chip">{stageLabel(project.stage)}</span>}
            <span className="ph-muted">
              {tr('projects.desde', { label: def.label, p1: fmtDate(project.statusChangedAt) })}
              {ov?.lastActivityAt ? tr('projects.ultimaAtividadeHa', { p0: timeAgo(ov.lastActivityAt), lastActivitySource: ov.lastActivitySource }) : tr('projects.semAtividadeRegistrada')}
            </span>
          </div>
        </div>
        <div className="ph-hero-actions">
          {!isClosed(project) && (
            <button
              className="btn btn-primary"
              onClick={() => startWorking(project)}
              title={(() => {
                const w = workTagsFor(project, allTags)
                const names = [w.primary?.name, w.secondary?.name].filter(Boolean).join(' + ')
                return (names ? tr('projects.timer.withTag', { names }) : tr('projects.timer.noTag')) + (w.auto ? tr('projects.timer.auto') : '')
              })()}
            >
              {tr('projects.trabalharNisso2')}
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>{tr('projects.editar2')}</button>
          {!wsRepos.length && project.githubRepoUrl && (
            <button className="btn btn-secondary btn-sm" onClick={() => window.api.app.openExternal(project.githubRepoUrl!)}>{tr('projects.github3')}</button>
          )}
        </div>
      </div>

      {ov && ov.alerts.length > 0 && (
        <div className="ph-alerts">
          {ov.alerts.map((a) => (
            <span key={a.kind} className={`ph-alert sev-${a.severity}`}>{a.text}</span>
          ))}
        </div>
      )}

      <div className="ph-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === 'tarefas' && openTodos.length + projIssues.filter((i) => i.state === 'open').length > 0 && (
              <span className="kanban-count">{openTodos.length + projIssues.filter((i) => i.state === 'open').length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Visão geral ── */}
      {tab === 'geral' && (
        <div className="ph-overview">
          <div className="ph-col">
            <div className="ph-panel ph-next">
              <div className="ph-panel-title">{tr('projects.proximaAcao2')}</div>
              {project.nextAction ? (
                <div className="ph-next-body">
                  <button className="ph-tick big" title={tr('projects.concluirEDefinirASeguinte')} onClick={() => setActionMode('complete')}>○</button>
                  <div className="ph-next-text" onClick={() => setActionMode('set')}>{project.nextAction}</div>
                </div>
              ) : (
                <button className="btn btn-secondary btn-sm" onClick={() => setActionMode('set')}>{tr('projects.definirAProximaAcao')}</button>
              )}
              <div className="ph-next-foot">
                {project.nextAction && (
                  <div className="ph-seg" role="group" aria-label={tr('projects.tamanhoDaProximaAcao')}>
                    {SIZES.map((sz) => (
                      <button
                        key={sz.key}
                        className={project.nextActionSize === sz.key ? 'active' : ''}
                        onClick={() => save({ nextActionSize: project.nextActionSize === sz.key ? null : sz.key })}
                        title={sz.key === 'rapida' ? tr('projects.cabeNumaBrechaDe15') : tr('projects.pedeUmBlocoDeFoco')}
                      >
                        {sz.icon} {sz.label}
                      </button>
                    ))}
                  </div>
                )}
                {project.nextActionAt && <span className="ph-muted">{tr('projects.definidaHa')} {timeAgo(project.nextActionAt)}</span>}
                <span style={{ flex: 1 }} />
                {project.nextAction && !isClosed(project) && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setDelegating(project.nextAction ?? '')}
                    title={tr('projects.oClaudeAnalisaAProxima')}
                  >
                    {tr('projects.delegar')}
                  </button>
                )}
              </div>
            </div>

            <div className="ph-panel">
              <div className="ph-panel-title">
                {tr('projects.ondeParei2')}
                <button className="ph-linkbtn" onClick={aiWhereLeftOff} disabled={aiBusy === 'where'}>{aiBusy === 'where' ? tr('projects.escrevendo2') : tr('projects.resumirAtividades')}</button>
              </div>
              <InlineText value={project.whereLeftOff} placeholder={tr('projects.oQueEuEstavaFazendo')} onSave={(v) => save({ whereLeftOff: v })} rows={3} />
              {project.whereLeftOffAt && <div className="ph-muted">{tr('projects.atualizadoHa')} {timeAgo(project.whereLeftOffAt)}</div>}
            </div>

            <div className={`ph-panel ${project.blocker ? 'ph-blocked' : ''}`}>
              <div className="ph-panel-title">
                {tr('projects.bloqueio')}
                {project.blocker && <button className="ph-linkbtn" onClick={() => save({ blocker: null, blockerNeed: null })}>{tr('projects.resolvido')}</button>}
              </div>
              <InlineText value={project.blocker} placeholder={tr('projects.nadaTravandoEscrevaSeAlgo')} onSave={(v) => save({ blocker: v })} rows={1} />
              {project.blocker && (
                <>
                  <div className="ph-label">{tr('projects.oQuePrecisaAcontecerPara')}</div>
                  <InlineText value={project.blockerNeed} placeholder={tr('projects.exClienteMandarAcessoDecidir')} onSave={(v) => save({ blockerNeed: v })} rows={1} />
                </>
              )}
            </div>

            <div className="ph-panel ph-finish">
              <div className="ph-panel-title">{tr('projects.linhaDeChegadaProntoQuando')}</div>
              <InlineText value={project.finishLine} placeholder={tr('projects.ex10UsuariosReaisUsando')} onSave={(v) => save({ finishLine: v })} />
            </div>

            <div className="ph-two">
              <div className="ph-panel">
                <div className="ph-panel-title">{tr('projects.escopoDaEntregaAtual')}</div>
                <InlineText value={project.scope} placeholder={tr('projects.oMinimoQuePrecisaEstar')} onSave={(v) => save({ scope: v })} rows={5} />
              </div>
              <div className="ph-panel">
                <div className="ph-panel-title">{tr('projects.melhoriasFuturas')}</div>
                <InlineText value={project.futureIdeas} placeholder={tr('projects.ideiasBoasMasNaoAgora')} onSave={(v) => save({ futureIdeas: v })} rows={5} />
              </div>
            </div>

            <div className="ph-panel">
              <div className="ph-panel-title">
                {tr('projects.planejarComIa')}
                <button className="btn btn-secondary btn-sm" onClick={aiSuggestPlan} disabled={aiBusy === 'plan'}>
                  {aiBusy === 'plan' ? tr('projects.pensando') : aiPlan ? tr('projects.deNovo') : tr('projects.sugerirMarcosEscopoEProxima')}
                </button>
              </div>
              {aiError && <div className="ph-error">{aiError}</div>}
              {aiPlan && (
                <div className="ph-ai-plan">
                  {aiPlan.finishLine && (
                    <div className="ph-ai-row"><span><strong>{tr('projects.prontoQuando2')}</strong> {aiPlan.finishLine}</span><button className="btn btn-secondary btn-sm" onClick={() => save({ finishLine: aiPlan.finishLine! })}>{tr('projects.aplicar')}</button></div>
                  )}
                  {aiPlan.nextAction && (
                    <div className="ph-ai-row"><span><strong>{tr('projects.proximaAcao4')}</strong> {aiPlan.nextAction}</span><button className="btn btn-secondary btn-sm" onClick={() => save({ nextAction: aiPlan.nextAction! })}>{tr('projects.aplicar')}</button></div>
                  )}
                  {aiPlan.scope && (
                    <div className="ph-ai-row"><span><strong>{tr('projects.escopo')}</strong><pre>{aiPlan.scope}</pre></span><button className="btn btn-secondary btn-sm" onClick={() => save({ scope: aiPlan.scope! })}>{tr('projects.aplicar')}</button></div>
                  )}
                  {aiPlan.futureIdeas && (
                    <div className="ph-ai-row"><span><strong>{tr('projects.depois')}</strong><pre>{aiPlan.futureIdeas}</pre></span><button className="btn btn-secondary btn-sm" onClick={() => save({ futureIdeas: aiPlan.futureIdeas! })}>{tr('projects.aplicar')}</button></div>
                  )}
                  {!!aiPlan.milestones?.length && (
                    <div className="ph-ai-row">
                      <span>
                        <strong>{tr('projects.marcos2')}</strong>
                        <ol>{aiPlan.milestones.map((m) => <li key={m.title}>{m.title}{m.targetDate ? ` (${fmtDate(m.targetDate)})` : ''}</li>)}</ol>
                      </span>
                      <button className="btn btn-secondary btn-sm" onClick={() => applyMilestones(aiPlan.milestones!)}>{tr('projects.criarMarcos')}</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="ph-col side">
            <div className="ph-panel ph-stats">
              <div className="ph-ring" style={{ ['--pct' as string]: `${ov?.progress ?? 0}` }}>
                <span>{ov?.progress ?? 0}%</span>
              </div>
              <div className="ph-stat-grid">
                <div><strong>{fmtMinutes(ov?.minutes7d ?? 0)}</strong><span>{tr('projects.7Dias')}</span></div>
                <div><strong>{fmtMinutes(ov?.minutes30d ?? 0)}</strong><span>{tr('projects.30Dias')}</span></div>
                <div><strong>{fmtMinutes(ov?.minutesTotal ?? 0)}</strong><span>{tr('projects.total2')}</span></div>
                <div><strong>{ov?.openTodos ?? 0}</strong><span>{tr('projects.tarefasAbertas')}</span></div>
                <div><strong>{ov?.openIssues ?? 0}</strong><span>{tr('projects.issues2')}</span></div>
                <div><strong>{ov?.commits7d ?? 0}</strong><span>{tr('projects.commits7d')}</span></div>
              </div>
            </div>

            <DelegationsPanel
              project={project}
              onAccepted={(d) => {
                if (d.action === project.nextAction) setActionMode('complete')
              }}
            />

            {project.status === 'pausado' && (
              <div className="ph-panel">
                <div className="ph-panel-title">{tr('projects.pausado2')}</div>
                <div>{project.pauseReason ?? tr('projects.semMotivoRegistrado')}</div>
                <div className="ph-muted">
                  {project.resumeAt ? tr('projects.retomarEm2', { p0: fmtDate(project.resumeAt) }) : project.resumeCondition ? tr('projects.retomarQuando', { resumeCondition: project.resumeCondition }) : tr('projects.semCondicaoDeRetomada')}
                </div>
                <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => setStatusTo('fila')}>{tr('projects.retomar2')}</button>
              </div>
            )}

            <div className="ph-panel">
              <div className="ph-panel-title">
                {tr('projects.cicloVersao')}
                <button className="ph-linkbtn" onClick={() => setCycleMode('new')}>{tr('projects.novoCiclo2')}</button>
              </div>
              {activeCycle ? (
                <>
                  <div className="ph-cycle-name">{activeCycle.name}</div>
                  {activeCycle.goal && <div className="ph-muted">{activeCycle.goal}</div>}
                  <div className={`ph-cycle-due ${dueIn != null && dueIn < 0 ? 'late' : dueIn != null && dueIn <= 3 ? 'soon' : ''}`}>
                    {activeCycle.dueDate ? (dueIn! < 0 ? tr('projects.venceuHaD', { p0: -dueIn!, p1: fmtDate(activeCycle.dueDate) }) : tr('projects.dRestantes', { dueIn, p1: fmtDate(activeCycle.dueDate) })) : tr('projects.semPrazo')}
                    {activeCycle.extensions > 0 && <span> {tr('projects.extensaoOesOriginal', { extensions: activeCycle.extensions, p1: fmtDate(activeCycle.originalDueDate) })}</span>}
                  </div>
                  <div className="ph-btnrow">
                    <button className="btn btn-secondary btn-sm" onClick={() => setCycleMode('extend')}>{tr('projects.estender3')}</button>
                    <button className="btn btn-primary btn-sm" onClick={() => setCycleMode('close')}>{tr('projects.fecharCiclo')}</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setChangelogCycle(activeCycle)} title={tr('projects.previaDoChangelogComOs')}>📜</button>
                  </div>
                </>
              ) : (
                <div className="ph-muted">{tr('projects.paraProjetosContinuosExRickos')}</div>
              )}
              {projCycles.filter((c) => c.status !== 'ativo').length > 0 && (
                <div className="ph-cycle-history">
                  {projCycles.filter((c) => c.status !== 'ativo').slice(0, 4).map((c) => (
                    <div key={c.id} className="ph-muted ph-cycle-row">
                      <span>{c.status === 'concluido' ? '✓' : '✕'} {c.name} · {fmtDate(c.closedAt)}{c.extensions ? ` · +${c.extensions}` : ''}</span>
                      {c.status === 'concluido' && <button className="ph-linkbtn" onClick={() => setChangelogCycle(c)}>{tr('projects.changelog3')}</button>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!isClosed(project) && <ScheduleEditor project={project} />}

            <div className="ph-panel">
              <div className="ph-panel-title">{tr('projects.marcos3')}</div>
              <div className="ph-ms-list">
                {ms.length === 0 && <div className="ph-muted">{tr('projects.quebreAEntregaEm3')}</div>}
                {ms.map((m) => {
                  const pct = msProgress(m.id, !!m.doneAt)
                  const late = !m.doneAt && m.targetDate && m.targetDate < localDateStr(new Date())
                  return (
                    <div key={m.id} className={`ph-ms ${m.doneAt ? 'done' : ''}`}>
                      <input type="checkbox" checked={!!m.doneAt} onChange={() => toggleMilestone(m.id, !!m.doneAt, m.title)} />
                      <div className="ph-ms-body">
                        <div className="ph-ms-title">{m.title}</div>
                        <div className="ph-ms-meta">
                          <span className="ph-progress small"><span style={{ width: `${pct}%` }} /></span>
                          <span>{pct}%</span>
                          {m.targetDate && <span className={late ? 'late' : ''}>{fmtDate(m.targetDate)}</span>}
                          {m.cycleId && <span>🔁 {projCycles.find((c) => c.id === m.cycleId)?.name}</span>}
                        </div>
                      </div>
                      <button className="ph-x" aria-label={tr('projects.removerMarco')} onClick={() => window.api.milestones.delete(m.id).then(refreshMilestones)}>✕</button>
                    </div>
                  )
                })}
              </div>
              <div className="ph-row" style={{ marginTop: 6 }}>
                <input placeholder={tr('projects.novoMarco')} value={msTitle} onChange={(e) => setMsTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMilestone()} style={{ flex: 1, minWidth: 120 }} />
                <input type="date" value={msDate} onChange={(e) => setMsDate(e.target.value)} />
                <button className="btn btn-secondary btn-sm" onClick={addMilestone}>+</button>
              </div>
            </div>

            <div className="ph-panel">
              <div className="ph-panel-title">
                {tr('projects.recente')}
                <button className="ph-linkbtn" onClick={() => setTab('historico')}>{tr('projects.verTudo2')}</button>
              </div>
              {events.slice(0, 6).map((e) => (
                <div key={e.id} className="ph-event mini">
                  <span>{EVENT_LABEL[e.kind] ?? e.kind}</span>
                  <span className="ph-event-text">{e.kind === 'status' ? `${statusDef(e.fromStatus ?? '').label} → ${statusDef(e.toStatus ?? '').label}${e.text ? ` · ${e.text}` : ''}` : e.text}</span>
                  <span className="ph-muted">{timeAgo(e.createdAt)}</span>
                </div>
              ))}
              {events.length === 0 && <div className="ph-muted">{tr('projects.nadaRegistradoAinda')}</div>}
            </div>
          </div>
        </div>
      )}

      {tab === 'roadmap' && (
        <RoadmapView
          project={project}
          onDelegate={(task, instructions, title, onDone) => {
            setDelegateExtra({ instructions, title, onDone })
            setDelegating(task)
          }}
        />
      )}

      {/* ── Tarefas: TODOs + issues do GitHub, sem duplicar ── */}
      {tab === 'tarefas' && (
        <div className="ph-tasks">
          <div className="quick-add-row">
            <input placeholder={tr('projects.novaTarefaEm', { name: project.name })} value={newTodo} onChange={(e) => setNewTodo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTodo()} />
            <button className="btn btn-primary" onClick={addTodo}>{tr('projects.tarefa3')}</button>
          </div>
          <div className="ph-link-search">
            <input placeholder={tr('projects.vincularTodoExistenteBuscar')} value={linkSearch} onChange={(e) => setLinkSearch(e.target.value)} />
            {linkCandidates.map((t) => (
              <button
                key={t.id}
                className="ph-chip"
                onClick={async () => {
                  await window.api.projects.linkTodos([t.id], project.id)
                  setLinkSearch('')
                  void loadExtras()
                  void refreshAll()
                }}
              >
                + {t.title}
              </button>
            ))}
          </div>
          <h3 className="ph-section-title">{tr('projects.abertas')} <span className="kanban-count">{openTodos.length}</span></h3>
          <div className="list-stack">
            {openTodos.length === 0 && <div className="empty-hint">{tr('projects.nenhumaTarefaAberta')}</div>}
            {openTodos.map((t) => (
              <div key={t.id} className="list-row">
                <input type="checkbox" checked={false} onChange={() => toggleTodo(t)} />
                <span className="list-row-title">
                  {t.title}
                  {t.status === 'inbox' && <span className="project-chip" style={{ marginLeft: 6 }}>{tr('projects.inbox')}</span>}
                  {t.dueDate && <span className="ph-muted"> · {fmtDate(t.dueDate)}</span>}
                </span>
                {ms.length > 0 && (
                  <select
                    value={t.milestoneId ?? ''}
                    onChange={async (e) => {
                      await window.api.projects.setTodoMilestone(t.id, e.target.value ? Number(e.target.value) : null)
                      void loadExtras()
                      void refreshAll()
                    }}
                    title={tr('projects.marco2')}
                    aria-label={tr('projects.marco2')}
                  >
                    <option value="">{tr('projects.semMarco')}</option>
                    {ms.map((m) => <option key={m.id} value={m.id}>🎯 {m.title}</option>)}
                  </select>
                )}
                <button className="btn btn-secondary btn-sm" title={tr('projects.trabalharNestaTarefa')} onClick={() => startWorking(project, t.title)}>{tr('projects.start')}</button>
                <button className="btn btn-secondary btn-sm" title={tr('projects.oClaudeAnalisaEstaTarefa')} onClick={() => setDelegating(t.title)}>{tr('projects.delegar2')}</button>
                <button className="btn btn-secondary btn-sm" title={tr('projects.tornarAProximaAcao')} onClick={() => save({ nextAction: t.title, nextActionTodoId: t.id })}>{tr('projects.nextUp')}</button>
              </div>
            ))}
          </div>
          {repoSlugs.size > 0 && (
            <>
              <h3 className="ph-section-title">
                {tr('projects.issuesDoGithub')}{repoSlugs.size > 1 ? tr('projects.repos4', { size: repoSlugs.size }) : [...repoSlugs][0]}) <span className="kanban-count">{projIssues.filter((i) => i.state === 'open').length}</span>
              </h3>
              {repoSlugs.size > 1 && (
                <RepoChips
                  options={[...repoSlugs].map((slug) => ({
                    key: slug,
                    label: slug.split('/').pop() ?? slug,
                    count: projIssues.filter((i) => i.state === 'open' && i.repo.toLowerCase() === slug).length
                  }))}
                  value={issueRepo}
                  onChange={setIssueRepo}
                  total={projIssues.filter((i) => i.state === 'open').length}
                />
              )}
              <div className="list-stack">
                {projIssues.length === 0 && <div className="empty-hint">{tr('projects.nenhumaIssueSincronizeEmIssues')}</div>}
                {projIssues.filter((i) => i.state === 'open' && (!issueRepo || i.repo.toLowerCase() === issueRepo)).map((i) => (
                  <div key={i.id} className="list-row">
                    <span className="list-row-title">
                      {repoSlugs.size > 1 && <span className="ph-repo-badge">{i.repo.split('/').pop()}</span>}#{i.number > 0 ? i.number : '—'} {i.title}
                    </span>
                    {i.url && <button className="btn btn-secondary btn-sm" onClick={() => window.api.app.openExternal(i.url!)}>↗</button>}
                    <button
                      className="btn btn-secondary btn-sm"
                      title={tr('projects.trazerComoTodoDoProjeto')}
                      onClick={async () => {
                        await window.api.todos.create(i.title, i.url, 'todo', 'github', 0, null, project.id)
                        void loadExtras()
                      }}
                    >
                      {tr('projects.todo')}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
          {doneTodos.length > 0 && (
            <details className="ph-details">
              <summary>{tr('projects.concluidas2', { count: doneTodos.length })}</summary>
              <div className="list-stack">
                {doneTodos.map((t) => (
                  <div key={t.id} className="list-row done">
                    <input type="checkbox" checked onChange={() => toggleTodo(t)} />
                    <span className="list-row-title" style={{ textDecoration: 'line-through' }}>{t.title}</span>
                    {t.doneAt && <span className="ph-muted">{fmtDate(t.doneAt)}</span>}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ── Código: commits, branches e worktrees ── */}
      {tab === 'codigo' && (
        <div className="ph-code">
          {!project.localPath && <div className="empty-hint">{tr('projects.definaOCaminhoLocalEditar')}</div>}
          {project.localPath && (
            <>
              <div className="ph-code-head">
                <code className="ph-muted">{project.localPath}</code>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    try {
                      localStorage.setItem(WORKTREES_FILTER_KEY, `p:${project.id}`)
                    } catch {
                      // sem storage: abre sem filtro
                    }
                    setPage('worktrees')
                  }}
                >
                  {tr('projects.gerenciarBranches')}
                </button>
              </div>
              {wsRepos.length > 0 && (
                <>
                  <h3 className="ph-section-title">{tr('projects.repositorios2')} <span className="kanban-count">{wsRepos.length}</span></h3>
                  <div className="list-stack">
                    {wsRepos.map((r) => {
                      const dup = dups.filter((d) => d.repoName === r.name)
                      return (
                        <div key={r.id} className="list-row ph-ws-repo">
                          <span className="list-row-title">
                            📦 {r.name} <code className="ph-muted">./{r.path}</code>
                          </span>
                          {r.githubRepoUrl && (
                            <button className="ph-linkbtn" onClick={() => window.api.app.openExternal(r.githubRepoUrl!)}>
                              {tr('projects.github3')}
                            </button>
                          )}
                          {dup.map((d) => (
                            <div key={d.projectId} className="ph-ws-dup">
                              <span>
                                {tr('projects.tambemCadastradoComoOProjeto')} <strong>{d.projectName}</strong>
                                {countsLabel(d.counts) ? ` (${countsLabel(d.counts)})` : tr('projects.semDadosVinculados')}.
                              </span>
                              <button className="btn btn-secondary btn-sm" disabled={absorbing != null} onClick={() => absorb(d)}>
                                {absorbing === d.projectId ? tr('projects.incorporando') : tr('projects.incorporarAo', { name: project.name })}
                              </button>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                  <RepoChips
                    options={wsRepos.map((r) => ({ key: r.name, label: r.name, count: commits.filter((c) => c.repo === r.name).length }))}
                    value={codeRepo}
                    onChange={setCodeRepo}
                    total={commits.length}
                  />
                </>
              )}
              {(() => {
                // workspace: uma seção por repositório (ou só o escolhido); projeto simples: lista única
                const folder = (r: { path: string }): string => r.path.split('/').pop() ?? r.path
                const groups = wsRepos.length
                  ? wsRepos
                      .filter((r) => !codeRepo || r.name === codeRepo)
                      .map((r) => ({
                        key: r.name,
                        title: r.name,
                        branches: branches.filter((b) => b.repoName === folder(r)),
                        commits: commits.filter((c) => c.repo === r.name).slice(0, codeRepo ? 40 : 15)
                      }))
                  : [{ key: '', title: '', branches, commits }]
                return groups.map((g) => (
                  <div key={g.key} className={g.title ? 'ph-ws-group' : undefined}>
                    {g.title && <h3 className="ph-ws-group-title">📦 {g.title}</h3>}
                    <h3 className="ph-section-title">
                      {tr('projects.branchesEWorktrees')} <span className="kanban-count">{g.branches.length}</span>
                    </h3>
                    <div className="list-stack">
                      {g.branches.length === 0 && <div className="empty-hint">{tr('projects.nenhumaBranchEncontradaNoUltimo')}</div>}
                      {g.branches.map((b) => (
                        <div key={b.id} className="list-row">
                          <span className="list-row-title">
                            {b.isBase ? '🏠 ' : b.worktreePath ? '🌳 ' : '⎇ '}
                            {b.branch ?? tr('projects.detached')}
                            {b.worktreePath && !b.isBase && <span className="ph-muted"> {tr('projects.worktree2')}</span>}
                            {b.ahead > 0 && <span className="ph-muted"> · +{b.ahead}</span>}
                            {(b.dirty ?? 0) > 0 && <span className="ph-muted"> · {b.dirty} {tr('projects.alterados')}</span>}
                          </span>
                          <span className="ph-muted">{b.lastCommitAt ? timeAgo(b.lastCommitAt) : ''}</span>
                        </div>
                      ))}
                    </div>
                    <h3 className="ph-section-title">{tr('projects.commitsRecentes')}</h3>
                    <div className="ph-commits">
                      {g.commits.length === 0 && <div className="empty-hint">{tr('projects.semCommitsOuNaoE')}</div>}
                      {g.commits.map((c) => (
                        <div key={`${c.repo ?? ''}:${c.hash}`} className="ph-commit">
                          <code>{c.hash}</code>
                          <span className="ph-commit-subject">{c.subject}</span>
                          {c.refs && <span className="ph-tag">{c.refs.replace('HEAD -> ', '')}</span>}
                          <span className="ph-muted">{timeAgo(c.date)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              })()}
            </>
          )}
        </div>
      )}

      {/* ── Base de conhecimento ── */}
      {tab === 'notas' && (
        <div className="ph-notes">
          <div className="ph-panel">
            <div className="ph-seg">
              {(['nota', 'link', 'decisao'] as const).map((k) => (
                <button key={k} className={noteKind === k ? 'active' : ''} onClick={() => setNoteKind(k)}>
                  {k === 'nota' ? tr('projects.nota') : k === 'link' ? tr('projects.link') : tr('projects.decisao')}
                </button>
              ))}
            </div>
            <input placeholder={noteKind === 'decisao' ? tr('projects.oQueFoiDecidido') : tr('projects.titulo2')} value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
            {noteKind === 'link' && <input placeholder={tr('projects.https')} value={noteUrl} onChange={(e) => setNoteUrl(e.target.value)} />}
            <textarea rows={3} placeholder={noteKind === 'decisao' ? tr('projects.porQueAlternativasConsideradas') : tr('projects.conteudoMarkdown')} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} />
            <div><button className="btn btn-primary btn-sm" onClick={addNote}>{tr('projects.adicionar2')}</button></div>
          </div>
          <div className="ph-notes-grid">
            {notes.length === 0 && <div className="empty-hint">{tr('projects.nadaAquiAindaAnoteDecisoes')}</div>}
            {notes.map((n) => (
              <div key={n.id} className={`ph-note kind-${n.kind}`}>
                <div className="ph-note-head">
                  <span>{n.kind === 'nota' ? '📝' : n.kind === 'link' ? '🔗' : '⚖️'}</span>
                  <strong>{n.title}</strong>
                  <span style={{ flex: 1 }} />
                  <button className="ph-x" title={n.pinned ? tr('projects.desafixar') : tr('projects.fixar')} onClick={() => window.api.projectNotes.save({ ...n, pinned: n.pinned ? 0 : 1 }).then(loadExtras)}>
                    {n.pinned ? '📌' : '📍'}
                  </button>
                  <button className="ph-x" aria-label={tr('projects.excluir')} onClick={() => window.confirm(tr('projects.excluir2')) && window.api.projectNotes.delete(n.id).then(loadExtras)}>✕</button>
                </div>
                {n.url && (
                  <button className="ph-linkbtn" onClick={() => window.api.app.openExternal(n.url!)}>{n.url}</button>
                )}
                {n.body && <div className="ph-note-body">{renderMarkdown(n.body)}</div>}
                <div className="ph-muted">{fmtDate(n.createdAt)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Histórico: decisões + sessões ── */}
      {tab === 'historico' && (
        <div className="ph-history">
          <div>
            <h3 className="ph-section-title">{tr('projects.decisoesERegistros')}</h3>
            <div className="ph-timeline">
              {events.length === 0 && <div className="empty-hint">{tr('projects.nadaRegistrado')}</div>}
              {events.map((e) => (
                <div key={e.id} className={`ph-event kind-${e.kind}`}>
                  <span className="ph-event-date">{new Date(e.createdAt).toLocaleString(getLocale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="ph-event-kind">{EVENT_LABEL[e.kind] ?? e.kind}</span>
                  <span className="ph-event-text">
                    {e.kind === 'status' ? <strong>{statusDef(e.fromStatus ?? '').label} → {statusDef(e.toStatus ?? '').label}</strong> : null}
                    {e.kind === 'status' && e.text ? ' · ' : ''}
                    {e.text}
                  </span>
                </div>
              ))}
            </div>
            {project.retrospective && (
              <div className="ph-panel" style={{ marginTop: 12 }}>
                <div className="ph-panel-title">{tr('projects.retrospectiva2')}</div>
                <div className="md-preview-pane">{renderMarkdown(project.retrospective)}</div>
              </div>
            )}
          </div>
          <div>
            <h3 className="ph-section-title">{tr('projects.sessoesNoTimer')} <span className="kanban-count">{sessions.length}</span></h3>
            <div className="list-stack">
              {sessions.length === 0 && <div className="empty-hint">{tr('projects.semSessoesUseTrabalharNisso')}</div>}
              {sessions.slice(0, 60).map((s) => {
                const min = Math.round(((s.endTime ? new Date(s.endTime).getTime() : Date.now()) - new Date(s.startTime).getTime()) / 60000)
                return (
                  <div key={s.id} className="list-row">
                    <span className="list-row-title">{s.title}</span>
                    <span className="ph-muted">{fmtDate(s.startTime)} · {fmtMinutes(min)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {statusTo && <StatusChangeModal project={project} to={statusTo} onClose={() => setStatusTo(null)} />}
      {actionMode && (
        <NextActionModal
          project={project}
          mode={actionMode}
          onClose={() => {
            setActionMode(null)
            void loadExtras()
          }}
        />
      )}
      {editing && <ProjectForm project={project} onClose={() => setEditing(false)} />}
      {cycleMode && (
        <CycleModal
          project={project}
          cycle={activeCycle}
          mode={cycleMode}
          onClose={() => setCycleMode(null)}
          onDone={cycleChanged}
          onClosed={async (id) => {
            const all = await window.api.cycles.getAll(project.id)
            const c = all.find((x) => x.id === id)
            if (c) setChangelogCycle(c)
          }}
        />
      )}
      {changelogCycle && <ChangelogModal cycle={changelogCycle} onClose={() => setChangelogCycle(null)} />}
      {delegating != null && (
        <DelegateModal
          project={project}
          task={delegating}
          instructions={delegateExtra.instructions}
          title={delegateExtra.title}
          onDelegated={delegateExtra.onDone}
          onClose={() => {
            setDelegating(null)
            setDelegateExtra({})
          }}
        />
      )}
    </div>
  )
}
