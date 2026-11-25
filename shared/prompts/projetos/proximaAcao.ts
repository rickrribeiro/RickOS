/**
 * Projetos → "Sugerir próxima ação" (3 opções de 25-90 min).
 * Usado em: src/modules/projects/components/NextActionModal.tsx (via `runJson`).
 * `contexto`: `promptResumoProjeto` (./resumoProjeto.ts).
 */
export function promptProximaAcao(p: { acaoConcluida: string | null; contexto: string }): string {
  return `${p.acaoConcluida != null ? `Acabei de concluir a ação: "${p.acaoConcluida}".` : ''} Sugira 3 opções de PRÓXIMA AÇÃO para este projeto: cada uma concreta, física, que caiba em uma sessão de 25-90 minutos e aproxime da linha de chegada. Formato: {"actions": ["...", "...", "..."]}\n\n${p.contexto}`
}
