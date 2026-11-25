import { definirChamada, ex } from '../definicao'
import { ALT_CODEX, CLAUDE_MODEL } from '../padroes'

/**
 * Projetos → ciclos: CHANGELOG da versão a partir dos commits do período (opção "com IA").
 * Sem IA (ou se falhar) o app usa a versão agrupada por prefixo convencional.
 * Usado em: server/services/projectHub.ts (`generateCycleChangelog`).
 */
export const projetosChangelog = definirChamada<{ ciclo: string; projeto: string; objetivo: string | null; commits: string; totalCommits: number }>({
  id: 'projetos.changelog',
  modulo: 'projetos',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: CLAUDE_MODEL,
  effort: null,
  alternativas: ALT_CODEX,
  arquivo: 'projetos/changelog.ts',
  usadoEm: 'server/services/projectHub.ts',
  template: `[rickos:changelog] Escreva o CHANGELOG da versão/ciclo "{{ciclo}}" do projeto "{{projeto}}"{{objetivo}} a partir dos commits abaixo.
Markdown, em português, voltado a quem USA o produto: comece com "## {{ciclo}}" e 1 frase de destaque; depois seções curtas (✨ Novidades, ⚡ Melhorias, 🐛 Correções) com bullets claros. Junte commits repetidos, ignore ruído (merges, builds, "wip", atualizações de dist). Não invente nada. Responda só o Markdown.

Commits ({{totalCommits}}):
{{commits}}`,
  preparar: (p) => ({ ciclo: p.ciclo, projeto: p.projeto, objetivo: p.objetivo ? ` (objetivo: ${p.objetivo})` : '', commits: p.commits, totalCommits: String(p.totalCommits) }),
  exemplo: { ciclo: ex('ciclo'), projeto: ex('projeto'), objetivo: ex('objetivo'), commits: `- ${ex('data')} ${ex('commit')}`, totalCommits: 1 }
})
