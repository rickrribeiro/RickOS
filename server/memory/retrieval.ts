import type { Database } from 'sql.js'
import type { MemoryLayer, MemoryType, PersonalMemory, Sensitivity } from '../../shared/memory'
import { TYPE_LABEL, estimateTokens, normText } from '../../shared/memory'
import type { ConsumeRule } from './policy'
import { categoryAllowed, sensitivityAllowed, typeAllowed } from './policy'
import { MEM_SELECT, all, toMemory } from './repo'

/**
 * Recuperação híbrida SEM LLM: filtros estruturados (política) → relevância lexical (BM25 com
 * normalização de acentos e stem leve) → score composto (importância, confirmação, fixação,
 * especificidade, recência) → camadas → deduplicação → orçamento de tokens.
 *
 * Não há provedor de embeddings no projeto (ver docs/memoria/arquitetura.md): `vector` é
 * sempre false até um `EmbeddingProvider` ser configurado.
 */

export type RetrievalLayer = 'core' | 'domain' | 'semantic' | 'recent' | 'restricted'

export interface Scored {
  memory: PersonalMemory
  categorySlug: string | null
  categoryName: string | null
  score: number
  relevance: number
  coverage: number
  layer: RetrievalLayer
  reason: string
  tokens: number
  line: string
}

export interface Discard {
  id: number
  reason: string
  score?: number
}

export interface RetrievalResult {
  selected: Scored[]
  discarded: Discard[]
  /** Descartes por política: só contagem (não revela ids/conteúdo de memórias proibidas). */
  policyFiltered: Record<string, number>
  candidates: number
  tokens: number
  vector: boolean
}

const STOP = new Set(
  'a o as os um uma uns umas de do da dos das em no na nos nas por para pra com sem que e ou se eu me meu minha meus minhas voce sobre como mais muito ja nao sim the and for with of to in on my is are be i'.split(
    ' '
  )
)

export function tokens(s: string): string[] {
  return normText(s)
    .split(' ')
    .filter((t) => t.length >= 2 && !STOP.has(t))
    .map(stem)
}

/** Stem leve pt/en: plurais e alguns sufixos comuns. Suficiente para "viagens"→"viag", "preferências"→"preferenc". */
function stem(t: string): string {
  if (t.length <= 4) return t
  return t
    .replace(/(oes|aes|ais|eis|ns)$/, '')
    .replace(/(ens|es|s)$/, '')
    .replace(/(mente|cao|coes|ando|endo|indo|ado|ido|ing|ed)$/, '')
    .replace(/[aeo]$/, '')
}

interface Doc {
  memory: PersonalMemory
  slug: string | null
  catName: string | null
  terms: string[]
}

function bm25(docs: Doc[], q: string[]): number[] {
  if (!q.length || !docs.length) return docs.map(() => 0)
  const N = docs.length
  const avg = docs.reduce((s, d) => s + d.terms.length, 0) / N || 1
  const df = new Map<string, number>()
  for (const d of docs) for (const t of new Set(d.terms)) df.set(t, (df.get(t) ?? 0) + 1)
  const k1 = 1.2
  const b = 0.75
  return docs.map((d) => {
    const tf = new Map<string, number>()
    for (const t of d.terms) tf.set(t, (tf.get(t) ?? 0) + 1)
    let s = 0
    for (const t of new Set(q)) {
      const f = tf.get(t) ?? 0
      if (!f) continue
      const n = df.get(t) ?? 0
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.terms.length) / avg)))
    }
    return s
  })
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a)
  const B = new Set(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter)
}

/** Neutraliza a memória para dentro do prompt: sem tags, sem quebras de linha, tamanho limitado. */
export function sanitizeForPrompt(s: string, max = 400): string {
  const clean = s
    .replace(/[<>]/g, (c) => (c === '<' ? '‹' : '›'))
    .replace(/```/g, "'''")
    .replace(/\s+/g, ' ')
    .trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

export function renderLine(m: PersonalMemory, catName: string | null): string {
  const tag = [catName, TYPE_LABEL[m.type as MemoryType]].filter(Boolean).join(' · ')
  const inferred = m.reliability === 'inferred' ? ' (inferência confirmada pelo usuário)' : ''
  const when = m.occurredAt ? ` [${m.occurredAt.slice(0, 10)}]` : ''
  return `- [${tag}] ${sanitizeForPrompt(m.content)}${when}${inferred}`
}

/** Contador para testes de não interferência: quantas vezes memórias foram lidas para IA. */
export const retrievalStats = { candidateLoads: 0, vectorQueries: 0 }

export interface RetrieveOptions {
  rule: ConsumeRule
  query: string
  /** Categorias de domínio do caso de uso (para a camada Domain). */
  now?: Date
  /** Limiar mínimo de relevância (0–1, relativo ao melhor) quando há consulta. */
  minRelevance?: number
  includeUnconfirmed?: boolean
}

export function retrieve(db: Database, owner: string, opts: RetrieveOptions): RetrievalResult {
  retrievalStats.candidateLoads++
  const { rule } = opts
  const now = (opts.now ?? new Date()).toISOString()
  const rows = all<Parameters<typeof toMemory>[0] & { catSlug: string | null; catName: string | null }>(
    db,
    `${MEM_SELECT.replace('FROM memories m', ', c.slug AS catSlug, c.name AS catName FROM memories m')}
     WHERE m.ownerId = ? AND m.status = 'active' AND (m.validUntil IS NULL OR m.validUntil >= ?) AND (m.validFrom IS NULL OR m.validFrom <= ?)`,
    [owner, now, now]
  )
  const policyFiltered: Record<string, number> = {}
  const bump = (k: string): void => {
    policyFiltered[k] = (policyFiltered[k] ?? 0) + 1
  }
  const docs: Doc[] = []
  for (const r of rows) {
    const m = toMemory(r)
    // `instructions: true` autoriza instruções pessoais confirmadas de qualquer categoria
    // (elas costumam morar em "Instruções para IA"); sensibilidade continua valendo.
    const instructionOk = m.type === 'INSTRUCTION' && rule.instructions
    if (!instructionOk && !categoryAllowed(rule, r.catSlug)) {
      bump('categoria fora da política')
      continue
    }
    if (!sensitivityAllowed(rule, m.effectiveSensitivity as Sensitivity)) {
      bump('sensibilidade acima do permitido')
      continue
    }
    if (!typeAllowed(rule, m.type)) {
      bump('tipo fora da política')
      continue
    }
    if (m.type === 'INSTRUCTION' && !rule.instructions) {
      bump('instruções não permitidas')
      continue
    }
    if (m.reliability === 'inferred' && !m.confirmedAt) {
      bump('inferência não confirmada')
      continue
    }
    docs.push({
      memory: m,
      slug: r.catSlug,
      catName: r.catName,
      terms: [...tokens(m.title), ...tokens(m.title), ...tokens(m.content), ...m.tags.flatMap(tokens), ...tokens(r.catName ?? '')]
    })
  }

  const q = tokens(opts.query)
  const raw = bm25(docs, q)
  const maxRaw = Math.max(0, ...raw)
  const minRel = opts.minRelevance ?? 0.2
  const nowMs = Date.parse(now)
  const scored: Scored[] = []
  const discarded: Discard[] = []

  docs.forEach((d, i) => {
    const m = d.memory
    const relevance = maxRaw > 0 ? raw[i] / maxRaw : 0
    const coverage = q.length ? new Set(q.filter((t) => d.terms.includes(t))).size / new Set(q).size : 0
    const ageDays = Math.max(0, (nowMs - Date.parse(m.updatedAt)) / 86_400_000)
    const recency = Math.exp(-ageDays / 180)
    const importance = (m.importance - 1) / 4
    const confirmed = m.confirmedAt ? 1 : 0
    const restricted = m.effectiveSensitivity === 'RESTRICTED'
    let layer: RetrievalLayer
    let reason: string
    if (restricted) {
      layer = 'restricted'
      reason = 'restrita, permitida pela política'
    } else if (m.pinned || m.type === 'INSTRUCTION') {
      layer = 'core'
      reason = m.pinned ? 'fixada (essencial)' : 'instrução pessoal confirmada'
    } else if (q.length && relevance > 0) {
      layer = 'semantic'
      reason = `relevante à consulta (${Math.round(coverage * 100)}% dos termos)`
    } else if (ageDays <= 30) {
      layer = 'recent'
      reason = 'recente no domínio autorizado'
    } else {
      layer = 'domain'
      reason = 'domínio autorizado'
    }
    const score = q.length
      ? 0.55 * relevance + 0.1 * coverage + 0.15 * importance + 0.1 * confirmed + 0.05 * recency + (m.pinned ? 0.05 : 0)
      : 0.45 * importance + 0.2 * confirmed + 0.15 * recency + (m.pinned ? 0.2 : 0)
    // Sem consulta: só o que é importante ou fixado. Com consulta: só o relevante — fixar aumenta o
    // score mas NÃO fura a relevância; instruções pessoais (já filtradas pela política) valem sempre.
    const keep = q.length ? relevance >= minRel || m.type === 'INSTRUCTION' : m.pinned || m.importance >= 4 || layer === 'core'
    if (!keep) {
      discarded.push({ id: m.id, reason: q.length ? 'pouco relevante para a consulta' : 'sem consulta e pouco importante', score: round(score) })
      return
    }
    const line = renderLine(m, d.catName)
    scored.push({ memory: m, categorySlug: d.slug, categoryName: d.catName, score, relevance, coverage, layer, reason, tokens: estimateTokens(line) + 1, line })
  })

  scored.sort((a, b) => b.score - a.score)
  const selected: Scored[] = []
  const termsOf = new Map(docs.map((d) => [d.memory.id, d.terms]))
  let used = 0
  for (const s of scored) {
    if (selected.length >= rule.maxItems) {
      discarded.push({ id: s.memory.id, reason: 'limite de itens', score: round(s.score) })
      continue
    }
    if (selected.some((x) => jaccard(termsOf.get(x.memory.id)!, termsOf.get(s.memory.id)!) >= 0.8)) {
      discarded.push({ id: s.memory.id, reason: 'redundante com outra selecionada', score: round(s.score) })
      continue
    }
    if (used + s.tokens > rule.maxTokens) {
      discarded.push({ id: s.memory.id, reason: 'orçamento de tokens', score: round(s.score) })
      continue
    }
    used += s.tokens
    selected.push(s)
  }
  return { selected, discarded, policyFiltered, candidates: rows.length, tokens: used, vector: false }
}

const round = (n: number): number => Math.round(n * 1000) / 1000

export const LAYER_TITLE: Record<RetrievalLayer, string> = {
  core: 'Core',
  domain: 'Domínio',
  semantic: 'Semântica',
  recent: 'Recente',
  restricted: 'Restrita'
}

export type { MemoryLayer }
