/**
 * Projetos → bloco de contexto de UM projeto anexado aos prompts de projeto do front
 * (plano, próxima ação, onde parei, retrospectiva). Os dados são buscados em
 * src/modules/projects/lib/ai.ts (`projectContext`); aqui fica só o texto.
 */
export interface DadosResumoProjeto {
  p: {
    name: string
    area: string
    description: string | null
    finishLine: string | null
    scope: string | null
    futureIdeas: string | null
    nextAction: string | null
    whereLeftOff: string | null
    whereLeftOffAt: string | null
    blocker: string | null
    blockerNeed: string | null
  }
  situacao: string
  /** Rótulo do estágio (vazio = sem estágio). */
  estagio: string | null
  /** Linha de horas já formatada (null = sem visão geral). */
  horas: { total: string; ultimos7d: string; ultimaAtividade: string } | null
  marcos: { title: string; doneAt: string | null; targetDate: string | null }[]
  tarefas: { title: string; done: boolean }[]
  commits: { date: string; subject: string }[]
  sessoes: { startTime: string; title: string }[]
  eventos: { createdAt: string; kind: string; text: string | null; fromStatus: string | null; toStatus: string | null }[]
}

export function promptResumoProjeto(d: DadosResumoProjeto): string {
  const { p } = d
  const lines = [
    `Projeto: ${p.name} (${d.situacao}, ${p.area}${d.estagio ? `, estágio ${d.estagio}` : ''})`,
    p.description ? `Descrição: ${p.description}` : '',
    p.finishLine ? `Linha de chegada (pronto quando…): ${p.finishLine}` : 'Linha de chegada: (não definida)',
    p.scope ? `Escopo da entrega atual: ${p.scope}` : '',
    p.futureIdeas ? `Melhorias futuras: ${p.futureIdeas}` : '',
    p.nextAction ? `Próxima ação: ${p.nextAction}` : 'Próxima ação: (nenhuma)',
    p.whereLeftOff ? `Onde parei (${p.whereLeftOffAt?.slice(0, 10) ?? ''}): ${p.whereLeftOff}` : '',
    p.blocker ? `Bloqueio: ${p.blocker}${p.blockerNeed ? ` — precisa: ${p.blockerNeed}` : ''}` : '',
    d.horas ? `Horas: ${d.horas.total} no total, ${d.horas.ultimos7d} nos últimos 7 dias. Última atividade: ${d.horas.ultimaAtividade}.` : '',
    d.marcos.length ? `Marcos:\n${d.marcos.map((m) => `- [${m.doneAt ? 'x' : ' '}] ${m.title}${m.targetDate ? ` (alvo ${m.targetDate})` : ''}`).join('\n')}` : 'Marcos: (nenhum)',
    d.tarefas.length ? `Tarefas:\n${d.tarefas.slice(0, 25).map((t) => `- [${t.done ? 'x' : ' '}] ${t.title}`).join('\n')}` : '',
    d.commits.length ? `Commits recentes:\n${d.commits.map((c) => `- ${c.date.slice(0, 10)} ${c.subject}`).join('\n')}` : '',
    d.sessoes.length ? `Sessões no timer:\n${d.sessoes.map((t) => `- ${t.startTime.slice(0, 10)} ${t.title}`).join('\n')}` : '',
    d.eventos.length ? `Histórico recente:\n${d.eventos.map((e) => `- ${e.createdAt.slice(0, 10)} ${e.kind}: ${e.text ?? `${e.fromStatus ?? ''} → ${e.toStatus ?? ''}`}`).join('\n')}` : ''
  ]
  return lines.filter(Boolean).join('\n')
}
