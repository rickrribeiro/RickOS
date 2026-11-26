import {
  createFinanceRule,
  deleteRuleSuggestion,
  getCategories,
  getFinanceRules,
  getRuleSuggestion,
  getRuleSuggestions,
  getSetting,
  getTransactions,
  insertRuleSuggestion,
  setRuleSuggestionStatus,
  updateFinanceRule,
  updateRuleSuggestion,
  type DbRuleSuggestionRow,
  type DbTransaction
} from '../database/queries'
import { countsInTotals, matchFinanceRule, normalizeText, parseKeywords, ruleToExtend, type FinanceRule, type FinanceRuleSuggestion } from '../../shared/finance'
import { executarChamada } from '../ia/gateway'
import { tt } from '../i18n'
import { FALLBACK_CATEGORY_ID } from './financeRules'

/**
 * Sugestões de regras pela IA (Finanças → Regras). A IA só PROPÕE: tudo que ela devolve é
 * revalidado aqui (categoria existe e é do tipo certo, palavra aparece nas descrições, nada
 * repetido nem já recusado) e vira uma sugestão pendente que o usuário aprova ou recusa.
 * Recusadas ficam guardadas para não voltarem.
 */

const MAX_GRUPOS = 300
const MAX_REGRAS = 25
const MIN_PALAVRA = 3

const uncategorized = (categoryId: number | null): boolean => categoryId == null || categoryId === FALLBACK_CATEGORY_ID

/** Chave de agrupamento: descrição sem números/pontuação (parcelas, datas, códigos). */
function groupKey(description: string): string {
  return normalizeText(description)
    .replace(/[0-9]+/g, ' ')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function firstJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error(tt('services.financas.iaSemJson'))
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new Error(tt('services.financas.iaSemJson'))
  }
}

function toSuggestion(r: DbRuleSuggestionRow): FinanceRuleSuggestion {
  let examples: string[] = []
  try {
    const v = JSON.parse(r.examples)
    if (Array.isArray(v)) examples = v.filter((x) => typeof x === 'string')
  } catch {
    // exemplos corrompidos: mostra sem
  }
  return { id: r.id, categoryId: r.categoryId, keywords: r.keywords, reason: r.reason, matches: r.matches, uncategorized: r.uncategorized, examples, createdAt: r.createdAt, targetRuleId: null, targetKeywords: null }
}

/**
 * A palavra já existe numa regra: igual a uma palavra de qualquer regra (ativa ou não, de qualquer
 * categoria), ou contém uma palavra de regra da mesma categoria ("uber trip" quando já há "uber").
 */
function existsInRules(rules: FinanceRule[], categoryId: number, k: string): boolean {
  return rules.some((r) => parseKeywords(r.keywords).some((rk) => rk === k || (r.categoryId === categoryId && k.includes(rk))))
}

/**
 * Pendentes, cada uma com a regra que ela incrementa. Palavras que passaram a existir numa regra
 * (o usuário criou/editou depois da análise) saem da sugestão; se não sobra nada, ela some.
 */
export async function listRuleSuggestions(): Promise<FinanceRuleSuggestion[]> {
  const [rows, rules] = await Promise.all([getRuleSuggestions('pending'), getFinanceRules()])
  const out: FinanceRuleSuggestion[] = []
  for (const r of rows) {
    const all = parseKeywords(r.keywords)
    const keep = all.filter((k) => !existsInRules(rules, r.categoryId, k))
    if (!keep.length) {
      await deleteRuleSuggestion(r.id)
      continue
    }
    const s = toSuggestion(keep.length === all.length ? r : { ...r, keywords: keep.join(', ') })
    if (keep.length !== all.length) await updateRuleSuggestion(r.id, { ...r, keywords: s.keywords })
    const target = ruleToExtend(rules, r.categoryId)
    out.push({ ...s, targetRuleId: target?.id ?? null, targetKeywords: target?.keywords ?? null })
  }
  return out
}

let running: Promise<FinanceRuleSuggestion[]> | null = null

/** true enquanto uma análise está rodando (a tela volta a mostrar "Analisando…" ao reabrir). */
export function isAnalyzingRules(): boolean {
  return running != null
}

/**
 * Analisa as transações de `month` (ou de todos os meses) e grava as sugestões novas. Devolve as
 * pendentes. Uma análise por vez: um segundo pedido enquanto a primeira roda espera por ela, em vez
 * de rodar em paralelo sem enxergar o que a outra está sugerindo (era a origem das duplicadas).
 */
export function suggestFinanceRules(month?: string): Promise<FinanceRuleSuggestion[]> {
  if (!running) running = analyze(month).finally(() => (running = null))
  return running
}

async function analyze(month?: string): Promise<FinanceRuleSuggestion[]> {
  const [categories, rules, all, previous] = await Promise.all([getCategories(), getFinanceRules(), getTransactions(month), getRuleSuggestions()])
  const txs = all.filter((t) => countsInTotals(t) && (t.description ?? '').trim())
  if (!txs.length) throw new Error(tt('services.financas.semTransacoes'))

  const catById = new Map(categories.map((c) => [c.id, c]))
  const tipo = (type: string): string => (type === 'income' ? 'receita' : 'gasto')
  const pendingRows = previous.filter((p) => p.status === 'pending')
  // sugestões pendentes contam como regras: o que elas já pegam não é sugerido de novo
  const asRule = (p: DbRuleSuggestionRow, i: number): FinanceRule => ({ id: -p.id, categoryId: p.categoryId, keywords: p.keywords, active: 1, position: 1_000_000 + i })
  const cobertura: FinanceRule[] = [...rules, ...pendingRows.map(asRule)]

  // descrições que uma regra ativa ou sugestão pendente já pega ficam de fora (não há o que sugerir)
  const groups = new Map<string, { type: string; sample: string; count: number; cats: Map<string, number>; pending: boolean }>()
  for (const t of txs) {
    if (matchFinanceRule(cobertura, categories, t.description, t.type)) continue
    const key = `${t.type}|${groupKey(t.description!)}`
    const g = groups.get(key) ?? { type: t.type, sample: t.description!.trim(), count: 0, cats: new Map(), pending: false }
    g.count++
    const cat = uncategorized(t.categoryId) ? 'sem categoria' : (catById.get(t.categoryId!)?.name ?? 'sem categoria')
    if (cat === 'sem categoria') g.pending = true
    g.cats.set(cat, (g.cats.get(cat) ?? 0) + 1)
    groups.set(key, g)
  }
  // as sem categoria primeiro (são o alvo), depois as categorizadas como pista
  const lista = [...groups.values()].sort((a, b) => Number(b.pending) - Number(a.pending) || b.count - a.count).slice(0, MAX_GRUPOS)
  if (!lista.some((g) => g.pending)) return listRuleSuggestions()

  const transacoes = lista
    .map((g) => {
      const cats = [...g.cats.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n).join(' / ')
      return `${tipo(g.type)} · ${g.count}× · "${g.sample.slice(0, 80)}" → ${cats}`
    })
    .join('\n')
  const porTipo = (type: string): string =>
    categories.filter((c) => c.type === type && c.id !== FALLBACK_CATEGORY_ID).map((c) => c.name).join(', ') || '(nenhuma)'
  const categoriasTxt = `gasto: ${porTipo('expense')}\nreceita: ${porTipo('income')}`
  const regraTxt = (keywords: string, categoryId: number): string => `${keywords} → ${catById.get(categoryId)?.name ?? '?'}`
  const regrasExistentes = [
    ...rules.filter((r) => r.active).map((r) => regraTxt(r.keywords, r.categoryId)),
    ...pendingRows.map((p) => `${regraTxt(p.keywords, p.categoryId)} (sugestão pendente)`)
  ].join('\n')
  const rejected = previous.filter((p) => p.status === 'rejected')
  const recusadas = rejected.map((p) => regraTxt(p.keywords, p.categoryId)).join('\n')

  const command = (await getSetting('claude_command')) || 'claude'
  const resposta = await executarChamada(
    'financas.sugerirRegras',
    { periodo: month ?? 'todos os meses', categorias: categoriasTxt, transacoes, regrasExistentes, recusadas },
    { claudeCommand: command, timeoutMs: 240_000, usage: { source: 'financas' } }
  )
  const json = firstJson(resposta) as { regras?: unknown }
  const propostas = Array.isArray(json.regras) ? json.regras.slice(0, MAX_REGRAS) : []

  // recusada vale para a palavra e para variações que a contêm ("uber" recusado → "uber trip" também)
  const recusadasPorCat = new Map<number, string[]>()
  for (const p of rejected) recusadasPorCat.set(p.categoryId, [...(recusadasPorCat.get(p.categoryId) ?? []), ...parseKeywords(p.keywords)])

  const catByName = new Map(categories.map((c) => [`${c.type}|${normalizeText(c.name)}`, c]))
  const descs = txs.map((t) => ({ t, d: normalizeText(t.description!) }))
  // transação sem categoria que nada (regra, pendente ou sugestão aceita nesta rodada) pega ainda
  const livre = ({ t }: { t: DbTransaction }): boolean => uncategorized(t.categoryId) && !matchFinanceRule(cobertura, categories, t.description, t.type)

  // uma sugestão por categoria: o que vier para uma categoria que já tem pendente é mesclado nela
  const porCategoria = new Map<number, { id: number; keywords: string[]; reason: string | null }>()
  for (const p of pendingRows) if (!porCategoria.has(p.categoryId)) porCategoria.set(p.categoryId, { id: p.id, keywords: parseKeywords(p.keywords), reason: p.reason })

  for (const raw of propostas) {
    if (!raw || typeof raw !== 'object') continue
    const p = raw as { palavras?: unknown; categoria?: unknown; tipo?: unknown; motivo?: unknown }
    const type = p.tipo === 'receita' ? 'income' : 'expense'
    const cat = typeof p.categoria === 'string' ? catByName.get(`${type}|${normalizeText(p.categoria)}`) : undefined
    if (!cat || cat.id === FALLBACK_CATEGORY_ID) continue
    const recusadasCat = recusadasPorCat.get(cat.id) ?? []
    const candidatas = (Array.isArray(p.palavras) ? p.palavras : typeof p.palavras === 'string' ? p.palavras.split(',') : [])
      .filter((k): k is string => typeof k === 'string')
      .map((k) => normalizeText(k))
      .filter((k) => k.length >= MIN_PALAVRA && !k.includes(',') && !recusadasCat.some((r) => k.includes(r)) && !existsInRules(rules, cat.id, k))
    // só fica a palavra que pega alguma transação sem categoria que nada pega ainda; cada palavra
    // aceita entra na cobertura, então a seguinte (ou a próxima regra) não repete o mesmo alvo
    const novas: string[] = []
    for (const k of [...new Set(candidatas)]) {
      const alvo = descs.filter((x) => x.t.type === type && x.d.includes(k) && livre(x))
      if (!alvo.length) continue
      novas.push(k)
      cobertura.push({ id: -1, categoryId: cat.id, keywords: k, active: 1, position: 2_000_000 + cobertura.length })
    }
    if (!novas.length) continue

    const atual = porCategoria.get(cat.id)
    const keywords = [...(atual?.keywords ?? []), ...novas]
    const hits = descs.filter(({ t, d }) => t.type === type && keywords.some((k) => d.includes(k)))
    // "sem categoria" que a sugestão resolveria e que nenhuma regra de verdade já pega
    const pendentes = hits.filter(({ t }) => uncategorized(t.categoryId) && !matchFinanceRule(rules, categories, t.description, t.type))
    const row = {
      keywords: keywords.join(', '),
      reason: atual?.reason ?? (typeof p.motivo === 'string' ? p.motivo.trim().slice(0, 200) || null : null),
      matches: hits.length,
      uncategorized: pendentes.length,
      examples: JSON.stringify([...new Set(pendentes.map(({ t }) => t.description!.trim()))].slice(0, 3))
    }
    if (atual) {
      await updateRuleSuggestion(atual.id, row)
      atual.keywords = keywords
    } else {
      const id = await insertRuleSuggestion({ categoryId: cat.id, ...row })
      porCategoria.set(cat.id, { id, keywords, reason: row.reason })
    }
  }
  return listRuleSuggestions()
}

/**
 * Aprova (com as edições do usuário). Aditiva: se a categoria escolhida já tem regra ativa, as
 * palavras novas entram NELA (sem repetir as que ela já tem); senão vira regra nova no fim da lista.
 */
export async function approveRuleSuggestion(id: number, categoryId: number, keywords: string): Promise<void> {
  const s = await getRuleSuggestion(id)
  if (!s) throw new Error(tt('services.financas.sugestaoNaoEncontrada'))
  const novas = parseKeywords(keywords)
  if (!novas.length || !categoryId) throw new Error(tt('services.financas.regraInvalida'))
  const target = ruleToExtend(await getFinanceRules(), categoryId)
  if (target) {
    const existentes = parseKeywords(target.keywords)
    const add = novas.filter((k) => !existentes.includes(k))
    if (add.length) await updateFinanceRule(target.id, target.categoryId, [target.keywords.trim(), ...add].join(', '), true)
  } else {
    await createFinanceRule(categoryId, novas.join(', '))
  }
  await deleteRuleSuggestion(id)
}

/** Recusa: fica guardada para a IA não sugerir de novo. */
export async function rejectRuleSuggestion(id: number): Promise<void> {
  await setRuleSuggestionStatus(id, 'rejected')
}
