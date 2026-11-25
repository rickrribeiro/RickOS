/**
 * Projetos → Git: "Continuar no Prompt Runner" — entrega uma branch (ou worktree) para um
 * agente terminar o trabalho.
 * Usado em: src/modules/projects/git.ts (`buildContinuePrompt`).
 */
export interface BranchContinuar {
  repoName: string
  repoPath: string
  branch: string | null
  worktreePath?: string | null
  ahead: number
  behind: number
  localOnly?: number | null
  pr?: { number: number; state: string; title: string; url: string } | null
}

export function promptContinuarBranch(
  b: BranchContinuar,
  d: { commits: { hash: string; subject: string }[]; files: { status: string; path: string }[] } | null,
  base: string,
  /** "há quanto tempo" já formatado (ex.: "3 dias"). */
  ultimaAtividade: string
): string {
  const lines = [
    '### CONTINUAR TRABALHO EM UMA BRANCH',
    `Repositório: ${b.repoName} (${b.repoPath})`,
    `Branch: ${b.branch ?? '(HEAD destacado)'} — base de comparação: ${base}`
  ]
  if (b.worktreePath) lines.push(`Worktree: ${b.worktreePath}  ← trabalhe DENTRO desta pasta (cd nela antes de qualquer comando).`)
  lines.push(`Estado: ${b.ahead} commit(s) à frente, ${b.behind} atrás da base; última atividade há ${ultimaAtividade}.`)
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
