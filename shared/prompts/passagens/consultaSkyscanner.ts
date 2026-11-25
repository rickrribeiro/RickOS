import { definirChamada, ex } from '../definicao'

/**
 * Passagens → busca assistida: o Claude abre o Skyscanner no Chrome do usuário (Claude in Chrome)
 * e lê os resultados de cada combinação.
 * Usado em: server/flights/assisted.ts (`buildPrompt`).
 */
export interface CombinacaoSkyscanner {
  origin: string
  destination: string
  depart: string
  ret?: string | null
  url: string
}

export const passagensSkyscanner = definirChamada<{ adultos: number; moeda: string; bagagemDespachada: boolean; combinacoes: CombinacaoSkyscanner[] }>({
  id: 'passagens.skyscanner',
  modulo: 'passagens',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: { setting: 'flights_chrome_model', padrao: 'sonnet' },
  effort: null,
  arquivo: 'passagens/consultaSkyscanner.ts',
  usadoEm: 'server/flights/assisted.ts',
  template: [
    'Você vai consultar o Skyscanner no Chrome do usuário (ele está presente acompanhando). Seja econômico em tokens.',
    'REGRAS:',
    '1. Primeiro chame mcp__claude-in-chrome__list_connected_browsers. Se não houver navegador conectado, responda só {"status":"no_browser"}.',
    '2. Abra UMA aba nova (tabs_create_mcp) e use navigate nela para cada URL, uma de cada vez. Não mexa nas outras abas do usuário.',
    '3. Espere os resultados TERMINAREM de carregar: o Skyscanner mostra o progresso (ex.: "2 de 13 fornecedores"/barra de carregamento) e os preços mais baratos costumam chegar por último. Verifique com find (~6 s entre tentativas, no máximo 8) até não haver mais carregamento; só então leia com get_page_text/find. Se no limite ainda estiver incompleto, leia assim mesmo e cite a combinação em "message". NÃO tire screenshots repetidos nem leia HTML/acessibilidade inteira.',
    '4. Se aparecer verificação de robô / CAPTCHA / "pressione e segure" / login: NÃO tente resolver nem contornar. Pare tudo e responda com status "blocked" (inclua o que já coletou).',
    '5. Para cada combinação, colete até 6 opções: as mais baratas e, se diferentes, a "Melhor" e a "Mais rápida". Não invente: campo que não estiver visível = null.',
    '6. No fim, feche a aba que você abriu.',
    'Contexto: {{adultos}} adulto(s), moeda {{moeda}}.{{bagagem}}',
    'Horários: hora local mostrada na página. Chegada "+1"/"+2" = somar dias à data de partida. Se mostrar "Transferência por conta própria"/"self-transfer", self_transfer=true. Conexões: códigos IATA dos aeroportos de escala, se visíveis (senão só stops).',
    'Combinações:{{combinacoes}}',
    'Logo depois de ler CADA combinação, escreva numa linha só (texto curto, sem markdown): RESULT {"combo":N,"status":"ok|empty|blocked|error","offers":[...]} — mesmo formato de "results" abaixo. O app grava na hora, enquanto você segue para a próxima.',
    'No fim, responda com o JSON completo (pode repetir os results), sem texto fora dele:',
    '{"status":"ok|blocked|no_browser|error","message":"curto","results":[{"combo":0,"status":"ok|empty|blocked|error","offers":[{"depart":"YYYY-MM-DDTHH:MM","arrive":"YYYY-MM-DDTHH:MM","price":1234.56,"currency":"BRL","stops":1,"via":["DOH"],"carrier":"nome ou IATA","self_transfer":false,"checked_bags":null,"label":"mais barato|melhor|mais rápido|null"}]}]}'
  ].join('\n'),
  preparar: (p) => ({
    adultos: String(p.adultos),
    moeda: p.moeda,
    bagagem: p.bagagemDespachada ? ' Se a página indicar bagagem incluída/não incluída, informe checked_bags (0 ou nº).' : '',
    combinacoes: p.combinacoes.map((c, i) => `\n${i}: ${c.origin}→${c.destination} ida ${c.depart}${c.ret ? ` volta ${c.ret}` : ''} — ${c.url}`).join('')
  }),
  exemplo: { adultos: 1, moeda: 'BRL', bagagemDespachada: true, combinacoes: [{ origin: 'GRU', destination: 'LIS', depart: ex('ida'), ret: ex('volta'), url: ex('URL do Skyscanner') }] }
})
