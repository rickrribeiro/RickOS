import { definirChamada, ex } from '../definicao'
import { RUNNER_EFFORT, RUNNER_MODEL } from '../padroes'

/**
 * Projetos → Git: "Continuar no Prompt Runner" — entrega uma branch (ou worktree) para um
 * agente terminar o trabalho. Só monta o texto; quem executa é a conversa do Prompt Runner.
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

export interface ParamsContinuarBranch {
  b: BranchContinuar
  d: { commits: { hash: string; subject: string }[]; files: { status: string; path: string }[] } | null
  base: string
  /** "há quanto tempo" já formatado (ex.: "3 dias"). */
  ultimaAtividade: string
}

export const projetosContinuarBranch = definirChamada<ParamsContinuarBranch>({
  id: 'projetos.continuarBranch',
  modulo: 'projetos',
  tipo: 'texto',
  motor: 'claude-code',
  modelo: RUNNER_MODEL,
  effort: RUNNER_EFFORT,
  arquivo: 'projetos/continuarBranch.ts',
  usadoEm: 'src/modules/projects/git.ts → Prompt Runner',
  template: `### CONTINUAR TRABALHO EM UMA BRANCH
Repositório: {{repo}} ({{pasta}})
Branch: {{branch}} — base de comparação: {{base}}{{worktree}}
Estado: {{ahead}} commit(s) à frente, {{behind}} atrás da base; última atividade há {{ultimaAtividade}}.{{naoEnviados}}{{pr}}{{commits}}{{arquivos}}

Tarefa: entenda o que estava sendo feito (leia os commits e o diff contra a base), termine o trabalho, rode os testes/typecheck do projeto, faça commit e me diga o que falta para abrir/atualizar a PR.`,
  preparar: ({ b, d, base, ultimaAtividade }) => ({
    repo: b.repoName,
    pasta: b.repoPath,
    branch: b.branch ?? '(HEAD destacado)',
    base,
    worktree: b.worktreePath ? `\nWorktree: ${b.worktreePath}  ← trabalhe DENTRO desta pasta (cd nela antes de qualquer comando).` : '',
    ahead: String(b.ahead),
    behind: String(b.behind),
    ultimaAtividade,
    naoEnviados: (b.localOnly ?? 0) > 0 ? `\n${b.localOnly} commit(s) ainda não foram enviados a nenhum remoto.` : '',
    pr: b.pr ? `\nPR #${b.pr.number} (${b.pr.state}): ${b.pr.title} — ${b.pr.url}` : '',
    commits: d?.commits.length ? `\n\nCommits já feitos nesta branch:\n${d.commits.slice(0, 30).map((c) => `- ${c.hash} ${c.subject}`).join('\n')}` : '',
    arquivos: d?.files.length ? `\n\nMudanças ainda não commitadas na worktree:\n${d.files.slice(0, 40).map((f) => `- [${f.status}] ${f.path}`).join('\n')}` : ''
  }),
  exemplo: {
    b: { repoName: ex('repo'), repoPath: ex('pasta'), branch: ex('branch'), ahead: 2, behind: 0 },
    d: { commits: [{ hash: 'abc123', subject: ex('commit') }], files: [{ status: 'M', path: ex('arquivo') }] },
    base: ex('base'),
    ultimaAtividade: ex('tempo')
  }
})
