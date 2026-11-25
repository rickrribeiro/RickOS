import type { Project, ProjectMilestone, ProjectOverview, Todo } from '../../../types'
import { statusLabel, stageLabel, fmtMinutes } from './constants'
import { t } from '../../../i18n'
import { SUFIXO_RESPOSTA_JSON } from '../../../../shared/prompts/comum/respostaJson'
import { promptResumoProjeto } from '../../../../shared/prompts/projetos/resumoProjeto'

/** Roda o Claude local e devolve o primeiro objeto/array JSON da resposta. */
export async function runJson<T>(prompt: string, source = 'projetos'): Promise<T> {
  const out = await window.api.ai.run(
    `${prompt}${SUFIXO_RESPOSTA_JSON}`,
    undefined,
    undefined,
    source
  )
  const text = String(out ?? '')
  const start = text.search(/[[{]/)
  if (start < 0) throw new Error(t('projects.iaNaoDevolveuJson'))
  const open = text[start]
  const close = open === '{' ? '}' : ']'
  const end = text.lastIndexOf(close)
  if (end <= start) throw new Error(t('projects.jsonIncompleto'))
  return JSON.parse(text.slice(start, end + 1)) as T
}

/** Texto livre (markdown) do Claude local. */
export async function runText(prompt: string, source = 'projetos'): Promise<string> {
  const out = await window.api.ai.run(prompt, undefined, undefined, source)
  return String(out ?? '').trim()
}

/** Contexto compacto de um projeto para prompts. */
export async function projectContext(p: Project, ov?: ProjectOverview | null): Promise<string> {
  const [milestones, todos, events, commits, tasks] = await Promise.all([
    window.api.milestones.getAll(),
    window.api.todos.getAll(),
    window.api.projects.events(p.id, 25),
    window.api.projects.commits(p.id, 15).catch(() => []),
    window.api.projects.tasks(p.id, 15).catch(() => [])
  ])
  const ms = milestones.filter((m: ProjectMilestone) => m.projectId === p.id)
  const pt = todos.filter((t: Todo) => t.projectId === p.id)
  return promptResumoProjeto({
    p,
    situacao: statusLabel(p.status),
    estagio: p.stage ? stageLabel(p.stage) : null,
    horas: ov ? { total: fmtMinutes(ov.minutesTotal), ultimos7d: fmtMinutes(ov.minutes7d), ultimaAtividade: ov.lastActivityAt?.slice(0, 10) ?? 'nunca' } : null,
    marcos: ms,
    tarefas: pt.map((t) => ({ title: t.title, done: t.status === 'done' })),
    commits,
    sessoes: tasks,
    eventos: events
  })
}
