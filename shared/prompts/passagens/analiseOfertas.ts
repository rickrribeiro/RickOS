/**
 * Passagens → "Análise da IA" das melhores ofertas de um monitor (trade-offs e riscos).
 * Usado em: server/flights/ai.ts (`insights`). Modelo: `flights_ai_model`.
 * `linhas`: até 12 ofertas já filtradas/ordenadas pelo sistema, uma por linha.
 */
export function promptAnaliseOfertas(p: { monitor: string; linhas: string }): string {
  return [
    `Monitoramento "${p.monitor}". Abaixo, as melhores opções JÁ filtradas e ordenadas pelo sistema (não reordene nem recalcule números).`,
    'Em até 6 bullets curtos em pt-BR: trade-offs relevantes (preço × duração × conexões × aeroporto de chegada), riscos (self-transfer, conexões curtas, dados não verificados) e o que vale revalidar. Não afirme regras de visto/trânsito; diga "verifique" quando relevante.',
    'Formato das linhas: id | rota | partida | preço | custo total (status) | duração | conexões | bagagem | fonte',
    p.linhas
  ].join('\n')
}
