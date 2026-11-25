/**
 * Projetos → ciclos: CHANGELOG da versão a partir dos commits do período (opção "com IA").
 * Sem IA (ou se falhar) o app usa a versão agrupada por prefixo convencional.
 * Usado em: server/services/projectHub.ts (`generateCycleChangelog`). Modelo: `claude_model`.
 */
export function promptChangelog(p: {
  ciclo: string
  projeto: string
  objetivo: string | null
  /** Um commit por linha: `- AAAA-MM-DD [repo] assunto`. */
  commits: string
  totalCommits: number
}): string {
  return `[rickos:changelog] Escreva o CHANGELOG da versão/ciclo "${p.ciclo}" do projeto "${p.projeto}"${p.objetivo ? ` (objetivo: ${p.objetivo})` : ''} a partir dos commits abaixo.
Markdown, em português, voltado a quem USA o produto: comece com "## ${p.ciclo}" e 1 frase de destaque; depois seções curtas (✨ Novidades, ⚡ Melhorias, 🐛 Correções) com bullets claros. Junte commits repetidos, ignore ruído (merges, builds, "wip", atualizações de dist). Não invente nada. Responda só o Markdown.

Commits (${p.totalCommits}):
${p.commits}`
}
