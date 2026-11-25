import { definirChamada, ex } from '../definicao'
import { ALT_CODEX, CLAUDE_MODEL } from '../padroes'
import { EX_PROJETO } from '../exemplos'

/**
 * Projetos → botão "Onde parei (IA)" na página do projeto.
 * Usado em: src/modules/projects/pages/ProjectDetailPage.tsx (via `runText`).
 * `contexto`: `promptResumoProjeto` (./resumoProjeto.ts).
 */
export const projetosOndePareiProjeto = definirChamada<{ contexto: string }>({
  id: 'projetos.ondePareiProjeto',
  modulo: 'projetos',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: CLAUDE_MODEL,
  effort: null,
  alternativas: ALT_CODEX,
  arquivo: 'projetos/ondePareiProjeto.ts',
  usadoEm: 'src/modules/projects/pages/ProjectDetailPage.tsx',
  template: `Com base nas atividades recentes (commits, sessões no timer, tarefas e histórico), escreva um "ONDE PAREI" de 2-4 frases em primeira pessoa para eu retomar este projeto rapidamente: o que foi feito por último, o estado atual e o próximo passo natural. Só o texto.\n\n{{contexto}}`,
  preparar: (p) => ({ contexto: p.contexto }),
  exemplo: { contexto: EX_PROJETO }
})
