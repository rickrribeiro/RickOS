import { fmtMinutes, isClosed, statusLabel } from '../lib/constants'

/** Resumo textual dos projetos para prompts (revisão semanal / standup). */
export async function projectsDigest(): Promise<string> {
  const [projects, overview] = await Promise.all([window.api.projects.getAll(), window.api.projects.overview()])
  const ov = new Map(overview.map((o) => [o.projectId, o]))
  return projects
    .filter((p) => !isClosed(p))
    .map((p) => {
      const o = ov.get(p.id)
      const alerts = o?.alerts.filter((a) => a.severity !== 'baixa').map((a) => a.text).join('; ')
      return `- ${p.name} [${statusLabel(p.status)}${p.area === 'profissional' ? ', profissional' : ''}] ${fmtMinutes(o?.minutes7d ?? 0)}/7d, ${o?.idleDays == null ? 'sem atividade' : `última atividade há ${o.idleDays}d`}${p.nextAction ? `; próxima ação: ${p.nextAction}` : ''}${p.pauseReason ? `; pausado: ${p.pauseReason}${p.resumeAt ? ` até ${p.resumeAt}` : ''}` : ''}${alerts ? `; ALERTAS: ${alerts}` : ''}`
    })
    .join('\n')
}
