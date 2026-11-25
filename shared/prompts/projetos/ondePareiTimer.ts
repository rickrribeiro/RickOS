/**
 * Projetos → "Onde parei" ao parar o timer numa tarefa do projeto (rascunho com IA).
 * Usado em: src/modules/projects/components/SaveContextModal.tsx (via `runText`).
 * `contexto`: `promptResumoProjeto` (./resumoProjeto.ts).
 */
export function promptOndePareiTimer(p: { minutos: number; tarefa: string; contexto: string }): string {
  return `Acabei uma sessão de ${p.minutos} min em "${p.tarefa}". Escreva um "ONDE PAREI" de 2-3 frases, em primeira pessoa, para eu retomar rápido amanhã (o que estava fazendo, estado atual, detalhe que eu esqueceria). Use os commits e o histórico recentes. Só o texto.\n\n${p.contexto}`
}
