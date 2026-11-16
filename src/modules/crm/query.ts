import { norm } from './geo'

/**
 * Busca por expressões na lista de Pessoas.
 *
 *   joão                  texto livre (em qualquer campo)
 *   cidade=goiania        campo contém o valor (sem acento/maiúscula)
 *   cidade!=goiania       campo não contém o valor
 *   cidade=null           campo vazio      (cidade!=null → preenchido)
 *   cidade="são paulo"    valor com espaço entre aspas
 *
 * Termos separados por espaço precisam valer todos (E).
 */

export type FieldKey =
  | 'nome' | 'cidade' | 'pais' | 'estado' | 'aniversario' | 'interesses' | 'contexto'
  | 'tag' | 'followup' | 'prioridade' | 'vip' | 'rede' | 'conversa'

/** Nome canônico (pt) → apelidos aceitos. */
const ALIASES: Record<FieldKey, string[]> = {
  nome: ['nome', 'name'],
  cidade: ['cidade', 'city', 'local', 'location'],
  pais: ['pais', 'country'],
  estado: ['estado', 'uf', 'state'],
  aniversario: ['aniversario', 'niver', 'birthday', 'bday'],
  interesses: ['interesses', 'interesse', 'interests'],
  contexto: ['contexto', 'context'],
  tag: ['tag', 'tags'],
  followup: ['followup', 'follow'],
  prioridade: ['prioridade', 'priority', 'prio'],
  vip: ['vip'],
  rede: ['rede', 'redes', 'network'],
  conversa: ['conversa', 'ultimaconversa', 'lastcontact']
}
const FIELD_BY_ALIAS = new Map<string, FieldKey>()
for (const [k, list] of Object.entries(ALIASES)) for (const a of list) FIELD_BY_ALIAS.set(a, k as FieldKey)

type Term =
  | { kind: 'text'; value: string }
  | { kind: 'field'; field: FieldKey; neg: boolean; value: string | null }

export interface ParsedQuery {
  terms: Term[]
  /** Campos não reconhecidos (para avisar na UI). */
  unknown: string[]
}

/** Separa por espaço respeitando aspas: cidade="são paulo" vira um token só. */
function tokenize(q: string): string[] {
  const out: string[] = []
  const re = /(?:[^\s"]+|"[^"]*")+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(q))) out.push(m[0])
  return out
}

export function parseQuery(q: string): ParsedQuery {
  const terms: Term[] = []
  const unknown: string[] = []
  for (const tok of tokenize(q.trim())) {
    const m = /^([^=!]+)(!?=)(.*)$/.exec(tok)
    if (!m) {
      terms.push({ kind: 'text', value: norm(tok.replace(/"/g, '')) })
      continue
    }
    const key = norm(m[1]).replace(/[^a-z]/g, '')
    const field = FIELD_BY_ALIAS.get(key)
    if (!field) {
      unknown.push(m[1])
      continue
    }
    const raw = m[3].replace(/^"|"$/g, '').trim()
    const isNull = raw === '' || /^(null|vazio|nada|-)$/i.test(raw)
    terms.push({ kind: 'field', field, neg: m[2] === '!=', value: isNull ? null : norm(raw) })
  }
  return { terms, unknown }
}

/** Valores de cada campo para uma pessoa (strings vazias = não preenchido). */
export type FieldValues = Record<FieldKey, string[]>

/** Campos em que o texto livre procura (igual à busca antiga). */
const TEXT_FIELDS: FieldKey[] = ['nome', 'cidade', 'pais', 'estado', 'interesses', 'contexto', 'tag']

export function matches(parsed: ParsedQuery, values: FieldValues): boolean {
  return parsed.terms.every((t) => {
    if (t.kind === 'text') {
      return TEXT_FIELDS.some((f) => values[f].some((v) => norm(v).includes(t.value)))
    }
    const vs = values[t.field].filter((v) => v.trim() !== '')
    const hit = t.value === null ? vs.length === 0 : vs.some((v) => norm(v).includes(t.value as string))
    return t.neg ? !hit : hit
  })
}

/** Exemplos do tooltip (clicar aplica na busca). */
export const QUERY_HELP: { expr: string; desc: string }[] = [
  { expr: 'cidade=null', desc: 'sem cidade preenchida' },
  { expr: 'pais=null', desc: 'sem país' },
  { expr: 'aniversario=null', desc: 'sem aniversário' },
  { expr: 'tag=null', desc: 'sem nenhuma tag' },
  { expr: 'cidade!=null', desc: 'com cidade preenchida' },
  { expr: 'cidade=goiania', desc: 'cidade contém "goiania" (ignora acento)' },
  { expr: 'cidade="sao paulo"', desc: 'valor com espaço vai entre aspas' },
  { expr: 'pais!=brasil', desc: 'fora do Brasil' },
  { expr: 'estado=GO', desc: 'UF ou nome do estado' },
  { expr: 'tag=jogos', desc: 'com a tag Jogos' },
  { expr: 'aniversario=11-', desc: 'aniversário em novembro (MM-DD)' },
  { expr: 'conversa=null', desc: 'nunca registrei conversa' },
  { expr: 'prioridade=alta vip=sim', desc: 'vários termos: todos precisam valer' },
  { expr: 'rede=null', desc: 'sem conversa vinculada na Central de Mensagens' }
]

export const QUERY_FIELDS =
  'nome, cidade, pais, estado (uf), aniversario, interesses, contexto, tag, followup, prioridade, vip, rede, conversa'
