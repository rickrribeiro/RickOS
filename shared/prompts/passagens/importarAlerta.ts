/**
 * Passagens → importar texto de alerta/e-mail: a IA só estrutura as ofertas; o importador valida.
 * Usado em: server/flights/ai.ts (`structureImportText`). Modelo: `flights_ai_model`.
 */
export function promptImportarAlerta(p: { hoje: string; texto: string }): string {
  return [
    'Extraia as ofertas de passagem do texto abaixo (alerta de preço / e-mail / anotação). NÃO invente dados ausentes: omita o campo.',
    'Responda APENAS um array JSON: [{"origin":"IATA","destination":"IATA","depart":"YYYY-MM-DDTHH:MM","arrive":"...","price":123.45,"currency":"BRL","stops":0,"carrier":"IATA","flight":"123","checked_bags":null,"link":"https://...","source":"nome da fonte","observed_at":"YYYY-MM-DD"}]',
    `Hoje é ${p.hoje}.`,
    `Texto: """${p.texto}"""`
  ].join('\n')
}
