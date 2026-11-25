/**
 * Viagens → "Analisar com IA" os resultados do buscador de hospedagem: as 3 melhores opções.
 * Recebe Memória Pessoal (`stays.analysis`) no início do prompt.
 * Usado em: src/modules/travel-stays/pages/StayFinderPage.tsx. Modelo: `claude_model`.
 */
export function promptAnaliseHospedagem(p: {
  /** Bloco de Memória Pessoal (vazio = sem). */
  memoria: string
  /** Perfil/observações do usuário para esta busca. */
  observacoes: string
  cidade: string
  /** Até 8 resultados, um por linha. */
  resultados: string
}): string {
  const notes = p.observacoes.trim() ? `Observações para esta busca:\n${p.observacoes.trim()}\n\n` : ''
  return `${p.memoria ? `${p.memoria}\n\n` : ''}${notes}Resultados de hospedagem em ${p.cidade}:\n${p.resultados}\n\nAnalise e explique em português quais são as 3 MELHORES opções para mim e por quê. Seja direto.`
}
