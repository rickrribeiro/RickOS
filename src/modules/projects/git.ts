import { GitBranch, GitBranchDetails, GitBranchStatus } from '../../types'
import { useUIStore } from '../../store/uiStore'
import { DRAFT_KEY } from '../ai/pages/PromptRunnerPage'
import { t } from '../../i18n'

export interface StatusDef {
  id: GitBranchStatus
  emoji: string
  label: string
  color: string
  hint: string
}

/** Order = priority in the list (what needs attention first). */
export const STATUS_DEFS: StatusDef[] = [
  { id: 'risk', emoji: '🔴', label: t('projects.emRisco'), color: '#f87171', hint: t('projects.mudancasNaoCommitadasOuCommits') },
  { id: 'forgotten', emoji: '🟠', label: t('projects.esquecida'), color: '#fb923c', hint: t('projects.commitsAFrenteDaBase') },
  { id: 'orphan', emoji: '👻', label: t('projects.orfa'), color: '#a78bfa', hint: t('projects.aPastaDaWorktreeSumiu') },
  { id: 'active', emoji: '🟡', label: t('projects.emAndamento'), color: '#facc15', hint: t('projects.prAbertaOuMexidaRecentemente') },
  { id: 'merged', emoji: '🟢', label: t('projects.podeLimpar'), color: '#22c55e', hint: t('projects.jaEstaNaBaseMerge') },
  { id: 'base', emoji: '⚪', label: t('projects.base'), color: '#a1a1aa', hint: t('projects.branchPrincipalDoRepositorio') }
]
export const STATUS_BY_ID = Object.fromEntries(STATUS_DEFS.map((d) => [d.id, d])) as Record<GitBranchStatus, StatusDef>
export const STATUS_RANK = Object.fromEntries(STATUS_DEFS.map((d, i) => [d.id, i])) as Record<GitBranchStatus, number>

/** Pre-select a project when navigating here from the Projects page. */
export const WORKTREES_FILTER_KEY = 'rickos:worktreesProject'

export function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 60) return `${Math.max(1, min)}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  const m = Math.floor(d / 30)
  if (m < 12) return t('projects.age.months', { count: m })
  const y = Math.floor(m / 12)
  return t('projects.age.years', { count: y })
}

export function shortPath(p: string | null): string {
  if (!p) return ''
  return p.replace(/^\/Users\/[^/]+/, '~')
}

/** Copy to clipboard (falls back to a prompt when the API isn't available, e.g. http on the phone). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    window.prompt(t('projects.copie'), text)
    return false
  }
}

/** Prompt that hands the branch over to an agent to finish the work. */
export function buildContinuePrompt(b: GitBranch, d: GitBranchDetails | null, base: string): string {
  const lines = [
    '### CONTINUAR TRABALHO EM UMA BRANCH',
    `Repositório: ${b.repoName} (${b.repoPath})`,
    `Branch: ${b.branch ?? '(HEAD destacado)'} — base de comparação: ${base}`
  ]
  if (b.worktreePath) lines.push(`Worktree: ${b.worktreePath}  ← trabalhe DENTRO desta pasta (cd nela antes de qualquer comando).`)
  lines.push(`Estado: ${b.ahead} commit(s) à frente, ${b.behind} atrás da base; última atividade há ${timeAgo(b.lastCommitAt)}.`)
  if ((b.localOnly ?? 0) > 0) lines.push(`${b.localOnly} commit(s) ainda não foram enviados a nenhum remoto.`)
  if (b.pr) lines.push(`PR #${b.pr.number} (${b.pr.state}): ${b.pr.title} — ${b.pr.url}`)
  if (d?.commits.length) {
    lines.push('', 'Commits já feitos nesta branch:')
    for (const c of d.commits.slice(0, 30)) lines.push(`- ${c.hash} ${c.subject}`)
  }
  if (d?.files.length) {
    lines.push('', 'Mudanças ainda não commitadas na worktree:')
    for (const f of d.files.slice(0, 40)) lines.push(`- [${f.status}] ${f.path}`)
  }
  lines.push(
    '',
    'Tarefa: entenda o que estava sendo feito (leia os commits e o diff contra a base), termine o trabalho, rode os testes/typecheck do projeto, faça commit e me diga o que falta para abrir/atualizar a PR.'
  )
  return lines.join('\n')
}

/** Open a new Prompt Runner tab with the given prompt (uses the runner's draft hand-off). */
export function openInPromptRunner(prompt: string, projectId: number | null, title: string): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ agentId: null, skillIds: [], userPrompt: prompt, projectId, title }))
  } catch {
    // storage unavailable — nothing to hand off
  }
  useUIStore.getState().setPage('ai-runner')
}
