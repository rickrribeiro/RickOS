/**
 * Projetos → "Sugerir plano" para terminar a entrega atual (linha de chegada, escopo, marcos, próxima ação).
 * Usado em: src/modules/projects/pages/ProjectDetailPage.tsx (via `runJson`).
 * `contexto`: `promptResumoProjeto` (./resumoProjeto.ts).
 */
export function promptPlanoProjeto(p: { hoje: string; contexto: string }): string {
  return `Você é meu gerente de projetos pessoal. Para o projeto abaixo, proponha um plano enxuto para TERMINAR a entrega atual:
- finishLine: frase "Pronto quando…" objetiva e verificável
- scope: o escopo mínimo da entrega atual (lista curta, com hífens)
- futureIdeas: o que fica para depois (lista curta, com hífens)
- milestones: 3 a 5 marcos em ordem, cada um {"title": "...", "targetDate": "YYYY-MM-DD" ou null} (hoje é ${p.hoje})
- nextAction: a próxima ação concreta (25-90 min)
Formato: {"finishLine": "...", "scope": "...", "futureIdeas": "...", "milestones": [...], "nextAction": "..."}

${p.contexto}`
}
