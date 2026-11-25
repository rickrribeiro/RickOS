import { definirChamada, ex } from '../definicao'
import { CLAUDE_MODEL } from '../padroes'

export interface ProjetoDelegacao {
  name: string
  description: string | null
  finishLine: string | null
  scope: string | null
  whereLeftOff: string | null
}

/**
 * Projetos → "Delegar ao Claude": o Claude trabalha SOZINHO num git worktree isolado
 * (agentic, `acceptEdits`), faz commits na branch e no fim resume o que fez.
 * Usado em: server/services/delegation.ts (`delegateNextAction`).
 */
export const projetosDelegacao = definirChamada<{ projeto: ProjetoDelegacao; tarefa: string; instrucoes: string | null; branch: string; base: string; reposWorkspace: { name: string; rel: string; baseRef: string | null }[] | null }>({
  id: 'projetos.delegacao',
  modulo: 'projetos',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: CLAUDE_MODEL,
  effort: null,
  arquivo: 'projetos/delegacao.ts',
  usadoEm: 'server/services/delegation.ts',
  template: `[rickos:delegacao] Você é um engenheiro trabalhando sozinho no projeto "{{projeto}}".
{{ambiente}}

TAREFA (a próxima ação do projeto):
{{tarefa}}
{{instrucoes}}
Contexto do projeto:
{{descricao}}{{linhaDeChegada}}{{escopo}}{{ondeParei}}
Regras:
- Leia o CLAUDE.md / README {{leiaReadme}} antes de mudar algo e siga as convenções.
- Faça a menor mudança que conclua a tarefa. Rode o typecheck/testes se existirem.
- Faça commits pequenos com mensagens claras NESTA branch{{commitsEmCada}}. NÃO faça push, NÃO abra PR, NÃO mexa fora deste diretório.
- Se a tarefa for ambígua ou grande demais, faça a parte segura e explique o resto.

No final, escreva um resumo em Markdown com: **O que fiz**, **Como testar**, **O que falta / dúvidas**.`,
  preparar: (a) => {
    const { projeto: p, tarefa: task, instrucoes: instructions, branch, base } = a
    const workspace = !!a.reposWorkspace
    const wsRepos = a.reposWorkspace ?? []
    return {
      projeto: String(p.name),
      ambiente: String(
    workspace
      ? `Você está numa cópia ISOLADA do workspace do projeto. A pasta raiz NÃO é um repositório; cada subpasta abaixo é um git worktree na branch "${branch}":
${wsRepos.map((r) => `- ${r.name}: ./${r.rel} (criada a partir de "${r.baseRef}")`).join('\n')}
Pode editar à vontade nesses repositórios. Para git, entre no repo certo (cd <pasta> && git …).`
      : `Você está num git worktree ISOLADO, na branch "${branch}" (criada a partir de "${base}"). Pode editar à vontade aqui.`
  ),
      tarefa: String(task),
      instrucoes: String(instructions?.trim() ? `\nInstruções adicionais:\n${instructions.trim()}\n` : ''),
      descricao: String(p.description ? `- Descrição: ${p.description}\n` : ''),
      linhaDeChegada: String(p.finishLine ? `- Linha de chegada: ${p.finishLine}\n` : ''),
      escopo: String(p.scope ? `- Escopo atual: ${p.scope}\n` : ''),
      ondeParei: String(p.whereLeftOff ? `- Onde parei: ${p.whereLeftOff}\n` : ''),
      leiaReadme: String(workspace ? 'da raiz e dos repositórios' : 'do repositório'),
      commitsEmCada: String(workspace ? ' (em cada repositório que mudar)' : '')
    }
  },
  exemplo: { projeto: { name: ex('projeto'), description: ex('descrição'), finishLine: ex('linha de chegada'), scope: null, whereLeftOff: ex('onde parei') }, tarefa: ex('tarefa'), instrucoes: ex('instruções'), branch: ex('branch'), base: ex('base'), reposWorkspace: null }
})
