/**
 * GitHub → criar no GitHub uma issue criada localmente, via `gh issue create`
 * (roda com `--allowedTools Bash(gh:*)` e a conta do comando Claude do projeto).
 * Usado em: server/services/github.ts (`createIssueViaClaude`). O app lê a URL da resposta.
 */
export function promptCriarIssue(p: { repo: string; titulo: string; corpo: string }): string {
  return (
    `Crie uma issue no GitHub no repositório ${p.repo} usando o gh CLI ` +
    `(gh issue create --repo ${p.repo} --title <título> --body <corpo>). ` +
    `Título: "${p.titulo}". Corpo: "${p.corpo}". ` +
    `Ao final, imprima APENAS a URL da issue criada (ex.: https://github.com/${p.repo}/issues/N).`
  )
}
