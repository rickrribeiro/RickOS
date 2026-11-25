import { definirChamada, ex } from '../definicao'
import { ALT_CODEX, FLIGHTS_MODEL } from '../padroes'

/**
 * Passagens → "Análise da IA" das melhores ofertas de um monitor (trade-offs e riscos).
 * Usado em: server/flights/ai.ts (`insights`).
 * `linhas`: até 12 ofertas já filtradas/ordenadas pelo sistema, uma por linha.
 */
export const passagensAnaliseOfertas = definirChamada<{ monitor: string; linhas: string }>({
  id: 'passagens.analiseOfertas',
  modulo: 'passagens',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: FLIGHTS_MODEL,
  effort: null,
  alternativas: ALT_CODEX,
  arquivo: 'passagens/analiseOfertas.ts',
  usadoEm: 'server/flights/ai.ts',
  template: [
    'Monitoramento "{{monitor}}". Abaixo, as melhores opções JÁ filtradas e ordenadas pelo sistema (não reordene nem recalcule números).',
    'Em até 6 bullets curtos em pt-BR: trade-offs relevantes (preço × duração × conexões × aeroporto de chegada), riscos (self-transfer, conexões curtas, dados não verificados) e o que vale revalidar. Não afirme regras de visto/trânsito; diga "verifique" quando relevante.',
    'Formato das linhas: id | rota | partida | preço | custo total (status) | duração | conexões | bagagem | fonte',
    '{{linhas}}'
  ].join('\n'),
  preparar: (p) => ({ monitor: p.monitor, linhas: p.linhas }),
  exemplo: { monitor: ex('monitor'), linhas: ex('ofertas, uma por linha') }
})
