import { REGIONS } from '../../flights'
import { definirChamada, ex } from '../definicao'
import { FLIGHTS_MODEL } from '../padroes'

/**
 * Passagens → "Criar monitoramento com IA": pedido em linguagem natural → JSON da configuração.
 * Usado em: server/flights/ai.ts (`draftFromText`).
 * A resposta é revalidada na base de aeroportos (`normalizeConfig`); nada é salvo sem revisão.
 */
export const SCHEMA_RASCUNHO_MONITOR = `{
 "name": "nome curto",
 "origins": [{"kind":"region|country|state|city|airport","code":"..."}],
 "destinations": [{"kind":"...","code":"..."}],
 "originExclude": ["IATA"], "destinationExclude": ["IATA"],
 "tripType": "oneway|roundtrip",
 "windows": [{"mode":"range","from":"YYYY-MM-DD","to":"YYYY-MM-DD"} | {"mode":"exact","date":"YYYY-MM-DD"} | {"mode":"flex","date":"YYYY-MM-DD","flexDays":3} | {"mode":"month","month":"YYYY-MM"}],
 "returnWindows": [], "minStayDays": null, "maxStayDays": null,
 "adults": 1, "children": 0, "infants": 0, "cabin": "economy|premium_economy|business|first",
 "checkedBag": "required|preferred|any", "checkedCount": 1, "carryOn": "required|preferred|any",
 "maxStops": null, "maxDurationHours": null,
 "forbiddenConnectionCountries": ["ISO2"], "forbidSelfTransfer": false, "forbidAirportChange": false,
 "maxPrice": null | {"amount": 4000, "currency": "BRL"},
 "strategy": "value|price|total_cost|duration|door_to_door|stops",
 "currency": "BRL",
 "groundAlternatives": [{"airport":"IATA alternativo","toCity":"cidade final"}],
 "explanations": ["≤ 6 frases curtas: por que cada origem/destino/alternativa"],
 "questions": ["o que ficou indefinido e vale perguntar"]
}`

export const passagensCriarMonitor = definirChamada<{ hoje: string; moeda: string; pedido: string }>({
  id: 'passagens.criarMonitor',
  modulo: 'passagens',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: FLIGHTS_MODEL,
  effort: null,
  arquivo: 'passagens/criarMonitor.ts',
  usadoEm: 'server/flights/ai.ts',
  template: [
    'Você converte um pedido de monitoramento de passagens aéreas em JSON estruturado.',
    'Hoje é {{hoje}}. Datas sem ano = próxima ocorrência futura. Moeda padrão: {{moeda}}.',
    'Regiões disponíveis (use kind "region" e este code): {{regioes}}.',
    'Países: ISO 3166-1 alpha-2 (kind "country"). Estados: ISO 3166-2, ex. BR-BA (kind "state"). Aeroportos: só códigos IATA REAIS de aeroportos com voos comerciais.',
    'Se o usuário não definiu países, recomende os de maior oferta de voos (hubs) e explique. Para destino com aeroportos alternativos razoáveis por terra, liste em groundAlternatives.',
    'Não invente distâncias, preços nem regras de visto. Responda APENAS o JSON, sem cercas de código, neste formato:',
    SCHEMA_RASCUNHO_MONITOR,
    'Pedido: """{{pedido}}"""'
  ].join('\n'),
  preparar: (p) => ({ hoje: p.hoje, moeda: p.moeda, pedido: p.pedido, regioes: REGIONS.map((r) => `${r.id}=${r.label}`).join('; ') }),
  exemplo: { hoje: ex('hoje'), moeda: 'BRL', pedido: ex('seu pedido') }
})
