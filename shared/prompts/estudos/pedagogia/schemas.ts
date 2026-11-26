/**
 * Contratos de saída (JSON Schema "estrito": todos os campos obrigatórios, sem campos extras;
 * opcional = tipo que aceita null). Um único schema por operação; as seções do pacote C usam
 * os mesmos sub-schemas na regeneração individual. Passados ao Codex via `--output-schema`.
 */
type Schema = Record<string, unknown>

const str = (description?: string): Schema => ({ type: 'string', ...(description ? { description } : {}) })
const strOrNull = (description?: string): Schema => ({ type: ['string', 'null'], ...(description ? { description } : {}) })
const num = (): Schema => ({ type: ['number', 'null'] })
const bool = (): Schema => ({ type: 'boolean' })
const arr = (items: Schema, description?: string): Schema => ({ type: 'array', items, ...(description ? { description } : {}) })
export function obj(props: Record<string, Schema>, description?: string): Schema {
  return { type: 'object', properties: props, required: Object.keys(props), additionalProperties: false, ...(description ? { description } : {}) }
}

// ── A. Masterclass ──
const MODULO = obj({
  titulo: str(),
  perguntaCentral: str('pergunta central específica do módulo'),
  conceitos: arr(str()),
  relacoes: str('como os conceitos se relacionam'),
  exemplo: str('exemplo ligado à minha situação'),
  atividade: str(),
  perguntaDiagnostica: str(),
  criterioAvanco: str('critério observável para avançar'),
  opcional: bool(),
  minutos: num(),
  prerequisitos: arr(str())
})
export const SCHEMA_MASTERCLASS = obj({
  perguntas: arr(str(), 'até duas perguntas curtas, só se a resposta mudar profundamente a trilha; senão []'),
  suposicoes: arr(str()),
  situacao: str('situação em que vou usar o que aprender'),
  jaSei: str(),
  fundamentos: arr(str()),
  demonstracaoFinal: str(),
  partes: arr(obj({ titulo: str(), porque: str(), modulos: arr(MODULO) })),
  ordemJustificativa: str(),
  aprofundamentosOpcionais: arr(str()),
  workshops: arr(obj({ titulo: str(), entrega: str(), experimento: str() })),
  coberturaReversa: str('teste de trás para frente a partir da entrega final'),
  aberturaPrimeiraAula: obj({ titulo: str(), situacao: str(), primeiroPasso: str('o que posso fazer hoje'), pergunta: str() }),
  aConferir: arr(str(), 'fatos que dependem de versão/preço/disponibilidade sem fonte acessível')
})

// ── B. Aula conversacional ──
export const SCHEMA_AULA = obj({
  resposta: str('o turno do tutor em Markdown'),
  tipo: { type: 'string', enum: ['explicacao', 'pergunta', 'feedback', 'lateral', 'encerramento'] },
  minhaResposta: {
    anyOf: [obj({ entendi: str(), corrigir: str(), proximaTentativa: str() }), { type: 'null' }]
  },
  hipoteses: arr(str(), 'o que ainda é hipótese'),
  perguntaAberta: strOrNull('pergunta que deixei para responder'),
  pontoDeRetorno: strOrNull('onde retomar depois de uma pergunta lateral'),
  fraseDeRetomada: strOrNull()
})

// ── C. Seções do material do nó (mesmos blocos no pacote e na regeneração) ──
export const SECOES = ['explicacao', 'resumo', 'exercicios', 'socraticas', 'revisaoAtiva', 'revisaoEditorial', 'subtopicos', 'cartoes'] as const
export type Secao = (typeof SECOES)[number]

const VAZIO = strOrNull('se a seção ficou vazia, justificativa curta; senão null')
export const SCHEMA_EDITORIAL_ITEM = obj({
  trecho: str('menor trecho EXATO da minha nota que ancora a proposta'),
  motivo: str('uma frase'),
  tipo: { type: 'string', enum: ['acrescimo', 'ajuste', 'pergunta', 'ressalva', 'erro-factual'] },
  sugestao: str('o menor acréscimo/ajuste; para pergunta, a pergunta'),
  substituicao: strOrNull('texto que substitui o trecho (null = só acrescentar depois do trecho)')
})
export const SCHEMA_SUBTOPICO_ITEM = obj({
  parentId: { type: ['integer', 'null'], description: 'ID do pai existente (null = raiz)' },
  posicao: { type: ['integer', 'null'] },
  titulo: str(),
  motivo: str('capacidade comprometida sem ele'),
  conexaoObjetivo: str(),
  tipo: { type: 'string', enum: ['pre-requisito', 'aprofundamento'] },
  prerequisito: strOrNull()
})
export const SCHEMAS_SECAO: Record<Secao, Schema> = {
  explicacao: obj({ conteudo: str(), vazio: VAZIO }),
  resumo: obj({ conteudo: str(), vazio: VAZIO }),
  exercicios: obj({ itens: arr(obj({ enunciado: str(), pista: strOrNull(), solucao: str(), criterios: strOrNull() })), vazio: VAZIO }),
  socraticas: obj({ itens: arr(obj({ pergunta: str(), referencia: strOrNull() })), vazio: VAZIO }),
  revisaoAtiva: obj({ itens: arr(obj({ pedido: str(), referencia: str() })), vazio: VAZIO }),
  revisaoEditorial: obj({ itens: arr(SCHEMA_EDITORIAL_ITEM), vazio: VAZIO }),
  subtopicos: obj({ itens: arr(SCHEMA_SUBTOPICO_ITEM), vazio: VAZIO }),
  cartoes: obj({ itens: arr(obj({ front: str(), back: str(), exemplo: strOrNull(), leitura: strOrNull() })), vazio: VAZIO })
}
export const SCHEMA_PACOTE = obj(Object.fromEntries(SECOES.map((s) => [s, SCHEMAS_SECAO[s]])) as Record<string, Schema>)
export const SCHEMA_SECAO = (s: Secao): Schema => obj({ [s]: SCHEMAS_SECAO[s] })
export const SCHEMA_EDITORIAL = obj({ revisaoEditorial: SCHEMAS_SECAO.revisaoEditorial })
export const SCHEMA_SUBTOPICOS = obj({ subtopicos: SCHEMAS_SECAO.subtopicos })
