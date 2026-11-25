/**
 * Projetos → botão "Onde parei (IA)" na página do projeto.
 * Usado em: src/modules/projects/pages/ProjectDetailPage.tsx (via `runText`).
 * `contexto`: `promptResumoProjeto` (./resumoProjeto.ts).
 */
export function promptOndePareiProjeto(p: { contexto: string }): string {
  return `Com base nas atividades recentes (commits, sessões no timer, tarefas e histórico), escreva um "ONDE PAREI" de 2-4 frases em primeira pessoa para eu retomar este projeto rapidamente: o que foi feito por último, o estado atual e o próximo passo natural. Só o texto.\n\n${p.contexto}`
}
