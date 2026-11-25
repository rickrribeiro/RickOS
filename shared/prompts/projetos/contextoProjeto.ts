/**
 * Cabeçalho "### CONTEXTO DO PROJETO" prefixado aos prompts do Assistente/Prompt Runner
 * (`ai:start`, `ai:runStream`) quando há um projeto selecionado, para o Claude mirar o
 * repositório certo (e usar `--repo` no gh quando roda fora da pasta do projeto).
 * Usado em: server/rpc.ts (`buildProjectContext`). Retorna '' sem projeto.
 */
export interface ContextoProjeto {
  nome: string
  descricao: string | null
  githubUrl: string | null
  /** owner/name do GitHub, se reconhecido. */
  slug: string | null
  /** Pasta local existente (já com trim) ou null. */
  pastaLocal: string | null
  /** Projeto com vários repositórios (pasta raiz não é um repo). */
  workspace: { name: string; rel: string; slug: string | null }[] | null
}

export function promptContextoProjeto(p: ContextoProjeto): string {
  const lines = ['### CONTEXTO DO PROJETO', `Projeto: ${p.nome}`]
  if (p.descricao) lines.push(`Descrição: ${p.descricao}`)
  if (p.workspace) {
    // workspace: a pasta raiz NÃO é um repositório; cada subpasta abaixo é um repo próprio
    lines.push(
      p.pastaLocal
        ? `Diretório de trabalho: ${p.pastaLocal} (pasta raiz do workspace; você já está rodando DENTRO dela).`
        : 'Projeto com vários repositórios (sem pasta local configurada).',
      'Esta pasta raiz não é um repositório git. Repositórios do projeto:',
      ...p.workspace.map((t) => `- ${t.name}: ./${t.rel}${t.slug ? ` (GitHub ${t.slug})` : ''}`),
      'Rode git dentro da subpasta do repositório certo (git -C <pasta> …) e, no gh, sempre use --repo <owner/name> do repositório afetado.'
    )
    return lines.join('\n') + '\n\n'
  }
  if (p.githubUrl) lines.push(`Repositório GitHub: ${p.githubUrl}`)
  if (p.pastaLocal) {
    lines.push(
      `Diretório de trabalho: ${p.pastaLocal} (você já está rodando DENTRO desta pasta do projeto).`,
      'Use o repositório desta pasta normalmente (git/gh sem --repo, pois o remote já é o do projeto).'
    )
  } else if (p.slug) {
    lines.push(
      `Repositório de destino para git/gh: ${p.slug}`,
      `IMPORTANTE: sempre use --repo ${p.slug} nos comandos gh (ex.: gh issue create --repo ${p.slug} ...).`,
      'NÃO use o remote da pasta atual — o diretório de trabalho é o app RickOS, não este projeto.'
    )
  }
  return lines.join('\n') + '\n\n'
}
