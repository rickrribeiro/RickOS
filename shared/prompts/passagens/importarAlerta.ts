import { definirChamada, ex } from '../definicao'
import { ALT_CODEX, FLIGHTS_MODEL } from '../padroes'

/**
 * Passagens → importar texto de alerta/e-mail: a IA só estrutura as ofertas; o importador valida.
 * Usado em: server/flights/ai.ts (`structureImportText`).
 */
export const passagensImportarAlerta = definirChamada<{ hoje: string; texto: string }>({
  id: 'passagens.importarAlerta',
  modulo: 'passagens',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: FLIGHTS_MODEL,
  effort: null,
  alternativas: ALT_CODEX,
  arquivo: 'passagens/importarAlerta.ts',
  usadoEm: 'server/flights/ai.ts',
  template: [
    'Extraia as ofertas de passagem do texto abaixo (alerta de preço / e-mail / anotação). NÃO invente dados ausentes: omita o campo.',
    'Responda APENAS um array JSON: [{"origin":"IATA","destination":"IATA","depart":"YYYY-MM-DDTHH:MM","arrive":"...","price":123.45,"currency":"BRL","stops":0,"carrier":"IATA","flight":"123","checked_bags":null,"link":"https://...","source":"nome da fonte","observed_at":"YYYY-MM-DD"}]',
    'Hoje é {{hoje}}.',
    'Texto: """{{texto}}"""'
  ].join('\n'),
  preparar: (p) => ({ hoje: p.hoje, texto: p.texto }),
  exemplo: { hoje: ex('hoje'), texto: ex('texto do alerta') }
})
