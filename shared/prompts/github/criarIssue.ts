import { definirChamada, ex } from '../definicao'

/**
 * GitHub → criar no GitHub uma issue criada localmente, via `gh issue create`
 * (roda com `--allowedTools Bash(gh:*)` e a conta do comando Claude do projeto).
 * Usado em: server/services/github.ts (`createIssueViaClaude`). O app lê a URL da resposta.
 */
export const githubCriarIssue = definirChamada<{ repo: string; titulo: string; corpo: string }>({
  id: 'github.criarIssue',
  modulo: 'github',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: { padrao: '' },
  effort: null,
  arquivo: 'github/criarIssue.ts',
  usadoEm: 'server/services/github.ts',
  template:
    'Crie uma issue no GitHub no repositório {{repo}} usando o gh CLI ' +
    '(gh issue create --repo {{repo}} --title <título> --body <corpo>). ' +
    'Título: "{{titulo}}". Corpo: "{{corpo}}". ' +
    'Ao final, imprima APENAS a URL da issue criada (ex.: https://github.com/{{repo}}/issues/N).',
  preparar: (p) => ({ repo: p.repo, titulo: p.titulo, corpo: p.corpo }),
  exemplo: { repo: ex('owner/repo'), titulo: ex('título'), corpo: ex('corpo') }
})
