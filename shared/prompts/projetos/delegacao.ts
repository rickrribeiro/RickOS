/**
 * Projetos → "Delegar ao Claude": o Claude trabalha SOZINHO num git worktree isolado
 * (agentic, `acceptEdits`), faz commits na branch e no fim resume o que fez.
 * Usado em: server/services/delegation.ts (`delegateNextAction`). Modelo: `claude_model`.
 */
export interface ProjetoDelegacao {
  name: string
  description: string | null
  finishLine: string | null
  scope: string | null
  whereLeftOff: string | null
}

export function promptDelegacao(a: {
  projeto: ProjetoDelegacao
  tarefa: string
  instrucoes: string | null
  branch: string
  /** Ref de onde a branch saiu (repo simples). */
  base: string
  /** Workspace: um worktree por repositório; null = repo simples. */
  reposWorkspace: { name: string; rel: string; baseRef: string | null }[] | null
}): string {
  const { projeto: p, tarefa: task, instrucoes: instructions, branch, base } = a
  const workspace = !!a.reposWorkspace
  const wsRepos = a.reposWorkspace ?? []
  return `[rickos:delegacao] Você é um engenheiro trabalhando sozinho no projeto "${p.name}".
${
    workspace
      ? `Você está numa cópia ISOLADA do workspace do projeto. A pasta raiz NÃO é um repositório; cada subpasta abaixo é um git worktree na branch "${branch}":
${wsRepos.map((r) => `- ${r.name}: ./${r.rel} (criada a partir de "${r.baseRef}")`).join('\n')}
Pode editar à vontade nesses repositórios. Para git, entre no repo certo (cd <pasta> && git …).`
      : `Você está num git worktree ISOLADO, na branch "${branch}" (criada a partir de "${base}"). Pode editar à vontade aqui.`
  }

TAREFA (a próxima ação do projeto):
${task}
${instructions?.trim() ? `\nInstruções adicionais:\n${instructions.trim()}\n` : ''}
Contexto do projeto:
${p.description ? `- Descrição: ${p.description}\n` : ''}${p.finishLine ? `- Linha de chegada: ${p.finishLine}\n` : ''}${p.scope ? `- Escopo atual: ${p.scope}\n` : ''}${p.whereLeftOff ? `- Onde parei: ${p.whereLeftOff}\n` : ''}
Regras:
- Leia o CLAUDE.md / README ${workspace ? 'da raiz e dos repositórios' : 'do repositório'} antes de mudar algo e siga as convenções.
- Faça a menor mudança que conclua a tarefa. Rode o typecheck/testes se existirem.
- Faça commits pequenos com mensagens claras NESTA branch${workspace ? ' (em cada repositório que mudar)' : ''}. NÃO faça push, NÃO abra PR, NÃO mexa fora deste diretório.
- Se a tarefa for ambígua ou grande demais, faça a parte segura e explique o resto.

No final, escreva um resumo em Markdown com: **O que fiz**, **Como testar**, **O que falta / dúvidas**.`
}
