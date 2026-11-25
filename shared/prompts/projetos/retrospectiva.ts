/**
 * Projetos → ritual de encerramento: RETROSPECTIVA do projeto concluído.
 * Usado em: src/modules/projects/components/ClosingRitualModal.tsx (via `runText`).
 * `contexto`: `promptResumoProjeto` (./resumoProjeto.ts).
 */
export function promptRetrospectiva(p: { foiBem: string; aprendi: string; fariaDiferente: string; contexto: string }): string {
  return `Estou concluindo este projeto. Escreva uma RETROSPECTIVA curta em Markdown com: "O que foi entregue", "O que funcionou", "O que aprendi", "O que faria diferente" e "Números" (horas, duração). Seja específico usando o contexto, sem inventar fatos.\n\nMinhas notas:\n- Foi bem: ${p.foiBem || '(sem notas)'}\n- Aprendi: ${p.aprendi || '(sem notas)'}\n- Faria diferente: ${p.fariaDiferente || '(sem notas)'}\n\nContexto:\n${p.contexto}`
}
