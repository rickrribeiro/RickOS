import { definirChamada, ex } from '../definicao'
import { CLAUDE_MODEL } from '../padroes'
import { EX_PROJETO } from '../exemplos'

/**
 * Projetos → "Sugerir plano" para terminar a entrega atual (linha de chegada, escopo, marcos, próxima ação).
 * Usado em: src/modules/projects/pages/ProjectDetailPage.tsx (via `runJson`).
 * `contexto`: `promptResumoProjeto` (./resumoProjeto.ts).
 */
export const projetosPlano = definirChamada<{ hoje: string; contexto: string }>({
  id: 'projetos.plano',
  modulo: 'projetos',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: CLAUDE_MODEL,
  effort: null,
  arquivo: 'projetos/plano.ts',
  usadoEm: 'src/modules/projects/pages/ProjectDetailPage.tsx',
  template: `Você é meu gerente de projetos pessoal. Para o projeto abaixo, proponha um plano enxuto para TERMINAR a entrega atual:
- finishLine: frase "Pronto quando…" objetiva e verificável
- scope: o escopo mínimo da entrega atual (lista curta, com hífens)
- futureIdeas: o que fica para depois (lista curta, com hífens)
- milestones: 3 a 5 marcos em ordem, cada um {"title": "...", "targetDate": "YYYY-MM-DD" ou null} (hoje é {{hoje}})
- nextAction: a próxima ação concreta (25-90 min)
Formato: {"finishLine": "...", "scope": "...", "futureIdeas": "...", "milestones": [...], "nextAction": "..."}

{{contexto}}\n\nResponda APENAS com JSON válido, sem texto antes ou depois, sem cercas de código.`,
  preparar: (p) => ({ hoje: p.hoje, contexto: p.contexto }),
  exemplo: { hoje: ex('hoje'), contexto: EX_PROJETO }
})
