import { randomUUID } from 'crypto'
import type { Database } from 'sql.js'
import type { ProposedMemory, SuggestionOp } from '../../shared/memory'
import { SENS_RANK, normText } from '../../shared/memory'
import { getDb, saveDb } from '../database/db'
import { getSetting } from '../database/queries'
import type { MemoryAiOp } from './ai'
import { callAi, chamadaDeExtracao, parseJsonObject } from './ai'
import type { ConsumeRule, ProduceRule } from './policy'
import { categoryAllowed, resolveConsume, resolveProduce, sensitivityAllowed } from './policy'
import { all, categoriesSync, currentOwner, ensureSeeded, exec, nowIso, one, sha, toMemory, MEM_SELECT, MemoryError } from './repo'
import { retrieve, sanitizeForPrompt, tokens } from './retrieval'
import type { NewSuggestion } from './suggestions'
import { proposeSync } from './suggestions'

/**
 * Memory Agent: transforma evidências AUTORIZADAS em sugestões revisáveis.
 * Nunca monitora o app: só recebe o que um produtor da política entrega explicitamente
 * (`submitEvidence`) ou o que o usuário pede dentro do módulo (texto, migração, análise).
 * Uma chamada de LLM por lote; saídas do próprio agente nunca voltam como evidência.
 */

export interface RunStats {
  calls: number
  proposed: number
  dropped: Record<string, number>
  batchId: string
}

interface AiItem {
  op?: string
  title?: string
  content?: string
  category?: string
  type?: string
  tags?: string[]
  importance?: number
  stability?: string
  sensitivity?: string
  explicit?: boolean
  confidence?: number
  rationale?: string
  benefit?: string
  evidence?: string
  targetIds?: number[]
  occurredAt?: string | null
  validUntil?: string | null
  question?: string
}

const MAX_CHUNK = 6000

/** Divide texto longo em blocos por seção/parágrafo, sem cortar no meio de uma linha. */
export function chunkText(text: string, max = MAX_CHUNK): { ref: string; text: string }[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const chunks: { ref: string; text: string }[] = []
  let cur: string[] = []
  let heading = 'início'
  let curHeading = heading
  const flush = (): void => {
    const t = cur.join('\n').trim()
    if (t) chunks.push({ ref: curHeading, text: t })
    cur = []
  }
  for (const line of lines) {
    const h = /^#{1,6}\s+(.+)/.exec(line)
    if (h) heading = h[1].trim().slice(0, 60)
    if (cur.join('\n').length + line.length > max || (h && cur.join('\n').length > max / 2)) flush()
    if (!cur.length) curHeading = heading
    cur.push(line.slice(0, max))
  }
  flush()
  return chunks
}

function categoriesBlock(db: Database, owner: string, rule: ProduceRule): string {
  return categoriesSync(db, owner, false)
    .filter((c) => categoryAllowed(rule, c.slug) && SENS_RANK[c.defaultSensitivity] <= SENS_RANK[rule.maxSensitivity])
    .map((c) => `- ${c.slug}: ${c.name}${c.defaultSensitivity !== 'NORMAL' ? ' (sensível)' : ''}`)
    .join('\n')
}

function rejectedHints(db: Database, owner: string): string {
  const rows = all<{ normKey: string; verdict: string }>(
    db,
    `SELECT normKey, verdict FROM memory_feedback WHERE ownerId = ? AND verdict IN ('rejected','irrelevant','incorrect','too_personal') AND normKey IS NOT NULL ORDER BY id DESC LIMIT 15`,
    [owner]
  )
  return rows.length ? rows.map((r) => `- (${r.verdict}) ${r.normKey.slice(0, 140)}`).join('\n') : '(nenhuma)'
}

/** Evidência íntegra: a citação precisa existir no texto de origem; senão usa um recorte real. */
export function verifiedExcerpt(source: string, quote: string | undefined): { excerpt: string; verified: boolean } {
  const q = String(quote ?? '').trim()
  if (q && normText(source).includes(normText(q))) return { excerpt: q.slice(0, 600), verified: true }
  return { excerpt: source.slice(0, 400), verified: false }
}

function toSuggestion(item: AiItem, base: { sourceKind: string; sourceRef: string; batchId: string; source: string; allowedIds: Set<number> }): NewSuggestion | null {
  const op = String(item.op ?? 'CREATE').toUpperCase() as SuggestionOp
  if (!['CREATE', 'UPDATE', 'MERGE', 'ARCHIVE', 'RESOLVE', 'ASK'].includes(op)) return null
  // a IA só pode apontar memórias que ela recebeu (e que a política deixou ver)
  const targetIds = (Array.isArray(item.targetIds) ? item.targetIds : []).map(Number).filter((id) => base.allowedIds.has(id))
  const ev = base.source ? verifiedExcerpt(base.source, item.evidence) : { excerpt: '', verified: false }
  const confidence = Number(item.confidence)
  return {
    op,
    proposed:
      op === 'ASK' || op === 'ARCHIVE'
        ? op === 'ASK'
          ? { category: item.category } as Partial<ProposedMemory>
          : null
        : {
            title: item.title,
            content: item.content,
            category: item.category,
            type: item.type as ProposedMemory['type'],
            tags: item.tags,
            importance: item.importance,
            stability: item.stability as ProposedMemory['stability'],
            sensitivity: item.sensitivity as ProposedMemory['sensitivity'],
            occurredAt: item.occurredAt ?? null,
            validUntil: item.validUntil ?? null
          },
    question: op === 'ASK' ? item.question ?? item.content ?? '' : null,
    targetIds,
    rationale: item.rationale,
    benefit: item.benefit,
    extractionConfidence: Number.isFinite(confidence) ? (ev.verified ? confidence : Math.min(confidence, 0.4)) : null,
    explicit: !!item.explicit && ev.verified,
    sourceKind: base.sourceKind,
    sourceRef: base.sourceRef,
    evidence: ev.excerpt ? [{ excerpt: ev.excerpt }] : [],
    batchId: base.batchId
  }
}

export interface ExtractRequest {
  useCase: string
  text: string
  sourceKind: string
  sourceRef?: string
  op: MemoryAiOp
  /** Contexto extra (ex.: a pergunta respondida numa entrevista). */
  hint?: string
}

/** Extrai sugestões de um texto (texto livre, migração, resposta de entrevista, eventos). */
export async function extractFromText(req: ExtractRequest): Promise<RunStats> {
  const owner = currentOwner()
  await ensureSeeded(owner)
  const produce = await resolveProduce(req.useCase)
  if (!produce.ok) throw new MemoryError(`Produção de memória bloqueada: ${produce.reason}`, 'forbidden')
  const consume = await resolveConsume(req.useCase)
  const text = String(req.text ?? '').trim()
  const stats: RunStats = { calls: 0, proposed: 0, dropped: {}, batchId: randomUUID() }
  if (!text) return stats
  const db = await getDb()
  for (const chunk of chunkText(text)) {
    if (stats.proposed >= produce.rule.maxSuggestionsPerRun) break
    // memórias parecidas (dedupe/atualização) — só o que a política de consumo do caso permite
    const existing = consume.ok ? retrieve(db, owner, { rule: consume.rule, query: chunk.text, minRelevance: 0.15 }).selected : []
    const allowedIds = new Set(existing.map((s) => s.memory.id))
    const params = {
      contexto: req.hint ? sanitizeForPrompt(req.hint, 300) : null,
      categorias: categoriesBlock(db, owner, produce.rule),
      memorias: existing.map((s) => `#${s.memory.id} ${s.line}`).join('\n'),
      rejeitadas: rejectedHints(db, owner),
      origem: req.sourceKind,
      texto: chunk.text.replace(/<\/?texto[^>]*>/gi, ''),
      max: produce.rule.maxSuggestionsPerRun - stats.proposed
    }
    stats.calls++
    const raw = await callAi(req.op, chamadaDeExtracao(req.op), params)
    const parsed = parseJsonObject<{ suggestions?: AiItem[] }>(raw)
    applyItems(db, owner, parsed.suggestions ?? [], produce.rule, stats, {
      sourceKind: req.sourceKind,
      sourceRef: `${req.sourceRef ?? req.sourceKind}${chunk.ref !== 'início' ? `#${chunk.ref}` : ''}`,
      batchId: stats.batchId,
      source: chunk.text,
      allowedIds
    })
  }
  saveDb()
  return stats
}

function applyItems(
  db: Database,
  owner: string,
  items: AiItem[],
  rule: ProduceRule,
  stats: RunStats,
  base: { sourceKind: string; sourceRef: string; batchId: string; source: string; allowedIds: Set<number> }
): void {
  for (const item of Array.isArray(items) ? items : []) {
    if (stats.proposed >= rule.maxSuggestionsPerRun) {
      stats.dropped['limite por execução'] = (stats.dropped['limite por execução'] ?? 0) + 1
      continue
    }
    const s = toSuggestion(item ?? {}, base)
    if (!s) {
      stats.dropped['inválida'] = (stats.dropped['inválida'] ?? 0) + 1
      continue
    }
    const r = proposeSync(db, owner, s, rule)
    if (r.ok) stats.proposed++
    else stats.dropped[r.reason] = (stats.dropped[r.reason] ?? 0) + 1
  }
}

/** Aplica itens devolvidos pela IA (entrevista etc.) e devolve quantas sugestões entraram. */
export function proposeFromItems(
  db: Database,
  owner: string,
  items: unknown[],
  rule: ProduceRule,
  base: { sourceKind: string; sourceRef: string; source: string; allowedIds: Set<number> }
): number {
  const stats: RunStats = { calls: 0, proposed: 0, dropped: {}, batchId: randomUUID() }
  applyItems(db, owner, items as AiItem[], rule, stats, { ...base, batchId: stats.batchId })
  return stats.proposed
}

/** Memórias permitidas por uma regra, sem consulta (para análise/consolidação), no orçamento. */
export function allowedMemories(db: Database, owner: string, rule: ConsumeRule): ReturnType<typeof toMemory>[] {
  const rows = all<Parameters<typeof toMemory>[0] & { catSlug: string | null }>(
    db,
    `${MEM_SELECT.replace('FROM memories m', ', c.slug AS catSlug FROM memories m')} WHERE m.ownerId = ? AND m.status IN ('active','unconfirmed','outdated') ORDER BY m.importance DESC, m.updatedAt DESC`,
    [owner]
  )
  const out: ReturnType<typeof toMemory>[] = []
  let used = 0
  for (const r of rows) {
    const m = toMemory(r)
    if (!categoryAllowed(rule, r.catSlug) || !sensitivityAllowed(rule, m.effectiveSensitivity)) continue
    const cost = Math.ceil((m.content.length + 40) / 4)
    if (out.length >= rule.maxItems || used + cost > rule.maxTokens) break
    used += cost
    out.push(m)
  }
  return out
}

/** Grupos de memórias lexicalmente parecidas na mesma categoria (pré-filtro barato da consolidação). */
export function similarClusters(mems: ReturnType<typeof toMemory>[], threshold = 0.3): number[][] {
  const terms = new Map(mems.map((m) => [m.id, new Set(tokens(`${m.title} ${m.content} ${m.tags.join(' ')}`))]))
  const parent = new Map(mems.map((m) => [m.id, m.id]))
  const find = (x: number): number => (parent.get(x) === x ? x : find(parent.get(x)!))
  for (let i = 0; i < mems.length; i++)
    for (let j = i + 1; j < mems.length; j++) {
      const a = mems[i]
      const b = mems[j]
      if (a.categoryId !== b.categoryId) continue
      const A = terms.get(a.id)!
      const B = terms.get(b.id)!
      let inter = 0
      for (const t of A) if (B.has(t)) inter++
      const jac = inter / (A.size + B.size - inter || 1)
      if (jac >= threshold) parent.set(find(a.id), find(b.id))
    }
  const groups = new Map<number, number[]>()
  for (const m of mems) groups.set(find(m.id), [...(groups.get(find(m.id)) ?? []), m.id])
  return [...groups.values()].filter((g) => g.length > 1)
}

/** "Analisar minhas memórias" (manual) e consolidação periódica. */
export async function analyzeMemories(useCase: 'memory.analyze' | 'memory.consolidation'): Promise<RunStats & { skipped?: string }> {
  const owner = currentOwner()
  await ensureSeeded(owner)
  const consume = await resolveConsume(useCase)
  const produce = await resolveProduce(useCase)
  const stats: RunStats & { skipped?: string } = { calls: 0, proposed: 0, dropped: {}, batchId: randomUUID() }
  if (!consume.ok || !produce.ok) throw new MemoryError(`Bloqueado pela política: ${!consume.ok ? consume.reason : !produce.ok ? produce.reason : ''}`, 'forbidden')
  const db = await getDb()
  let mems = allowedMemories(db, owner, consume.rule)
  if (useCase === 'memory.consolidation') {
    // consolidação econômica: só manda grupos parecidos; sem grupos → zero chamadas
    const ids = new Set(similarClusters(mems).flat())
    const old = mems.filter((m) => m.type === 'GOAL' && Date.now() - Date.parse(m.confirmedAt ?? m.updatedAt) > 180 * 86_400_000)
    for (const m of old) ids.add(m.id)
    mems = mems.filter((m) => ids.has(m.id))
    if (mems.length < 2) {
      stats.skipped = 'nada parecido o bastante para consolidar'
      return stats
    }
  }
  if (mems.length < 2) {
    stats.skipped = 'memórias insuficientes'
    return stats
  }
  const cats = new Map(categoriesSync(db, owner).map((c) => [c.id, c.slug]))
  const list = mems
    .map((m) => `#${m.id} [${cats.get(m.categoryId ?? -1) ?? 'sem-categoria'} · ${m.type}${m.confirmedAt ? ' · confirmada' : ''} · atualizada ${m.updatedAt.slice(0, 10)}] ${sanitizeForPrompt(m.content, 300)}`)
    .join('\n')
  const params = { categorias: categoriesBlock(db, owner, produce.rule), memorias: list, rejeitadas: rejectedHints(db, owner), max: produce.rule.maxSuggestionsPerRun }
  stats.calls++
  const raw = await callAi(useCase === 'memory.analyze' ? 'analise' : 'consolidacao', 'memoria.analise', params)
  const parsed = parseJsonObject<{ suggestions?: AiItem[] }>(raw)
  const allowedIds = new Set(mems.map((m) => m.id))
  const byId = new Map(mems.map((m) => [m.id, m]))
  for (const item of parsed.suggestions ?? []) {
    // evidência = conteúdo real das memórias-alvo (nunca texto inventado)
    const ids = (item.targetIds ?? []).map(Number).filter((id) => allowedIds.has(id))
    item.evidence = undefined
    const s = toSuggestion(item, { sourceKind: useCase === 'memory.analyze' ? 'analysis' : 'consolidation', sourceRef: `memoria:${useCase}`, batchId: stats.batchId, source: '', allowedIds })
    if (!s) continue
    s.explicit = false
    s.evidence = ids.map((id) => ({ excerpt: `#${id}: ${byId.get(id)!.content}`, sourceRef: `memoria#${id}` }))
    if (stats.proposed >= produce.rule.maxSuggestionsPerRun) break
    const r = proposeSync(db, owner, s, produce.rule)
    if (r.ok) stats.proposed++
    else stats.dropped[r.reason] = (stats.dropped[r.reason] ?? 0) + 1
  }
  saveDb()
  return stats
}

// ── Eventos de produtores ────────────────────────────────────────────────────

/**
 * Porta de entrada para produtores AUTORIZADOS. Sem política de produção → recusado, sem
 * gravar nada. Conteúdo vindo do próprio módulo de memória é recusado (anti-loop).
 */
export async function submitEvidence(useCase: string, payload: string, sourceRef?: string | null): Promise<{ ok: boolean; reason?: string; eventId?: number }> {
  const access = await resolveProduce(useCase)
  if (!access.ok) return { ok: false, reason: access.reason }
  if (useCase.startsWith('memory.') || String(sourceRef ?? '').startsWith('memoria:')) return { ok: false, reason: 'saídas do próprio módulo não viram evidência' }
  const text = String(payload ?? '').trim().slice(0, 8000)
  if (text.length < 20) return { ok: false, reason: 'evidência curta demais' }
  const owner = currentOwner()
  const db = await getDb()
  const key = sha(`${useCase}|${normText(text)}`)
  const n = exec(db, 'INSERT OR IGNORE INTO memory_events (ownerId, producer, payload, sourceRef, dedupeKey, createdAt) VALUES (?,?,?,?,?,?)', [
    owner,
    useCase,
    text,
    sourceRef ? String(sourceRef).slice(0, 200) : null,
    key,
    nowIso()
  ])
  saveDb()
  if (!n) return { ok: false, reason: 'evento duplicado' }
  return { ok: true, eventId: Number(one<{ id: number }>(db, 'SELECT id FROM memory_events WHERE ownerId = ? AND dedupeKey = ?', [owner, key])?.id) }
}

/** Processa um lote de eventos pendentes: uma chamada de LLM por produtor por lote. */
export async function processEventBatch(): Promise<{ events: number; calls: number; proposed: number; failed: number }> {
  const out = { events: 0, calls: 0, proposed: 0, failed: 0 }
  if ((await getSetting('memory_agent_enabled')) !== '1') return out
  const owner = currentOwner()
  const size = Math.min(50, Math.max(1, Number((await getSetting('memory_batch_size')) || 10)))
  const db = await getDb()
  const events = all<{ id: number; producer: string; payload: string; sourceRef: string | null; attempts: number }>(
    db,
    "SELECT id, producer, payload, sourceRef, attempts FROM memory_events WHERE ownerId = ? AND status IN ('pending','retry') AND attempts < 3 ORDER BY id LIMIT ?",
    [owner, size]
  )
  if (!events.length) return out
  const ids = events.map((e) => e.id)
  // claim: marca como processando antes de chamar a IA (outro tick não pega o mesmo lote)
  exec(db, `UPDATE memory_events SET status='processing', attempts=attempts+1 WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
  saveDb()
  const byProducer = new Map<string, typeof events>()
  for (const e of events) byProducer.set(e.producer, [...(byProducer.get(e.producer) ?? []), e])
  for (const [producer, evs] of byProducer) {
    const evIds = evs.map((e) => e.id)
    try {
      const st = await extractFromText({
        useCase: producer,
        text: evs.map((e) => `--- evento ${e.id}${e.sourceRef ? ` (${e.sourceRef})` : ''}\n${e.payload}`).join('\n\n'),
        sourceKind: 'producer',
        sourceRef: producer,
        op: 'agente'
      })
      out.calls += st.calls
      out.proposed += st.proposed
      exec(db, `UPDATE memory_events SET status='done', error=NULL, processedAt=? WHERE id IN (${evIds.map(() => '?').join(',')})`, [nowIso(), ...evIds])
    } catch (e) {
      out.failed += evs.length
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300)
      exec(db, `UPDATE memory_events SET status=CASE WHEN attempts >= 3 THEN 'failed' ELSE 'retry' END, error=? WHERE id IN (${evIds.map(() => '?').join(',')})`, [msg, ...evIds])
    }
    out.events += evs.length
  }
  saveDb()
  return out
}

/** Retenção do conteúdo bruto dos eventos já processados. */
export async function pruneEvents(): Promise<number> {
  const days = Math.max(1, Number((await getSetting('memory_event_retention_days')) || 14))
  const db = await getDb()
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()
  const n = exec(db, "DELETE FROM memory_events WHERE status IN ('done','failed') AND createdAt < ?", [cutoff])
  if (n) saveDb()
  return n
}

