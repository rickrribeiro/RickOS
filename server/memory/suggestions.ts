import type { Database } from 'sql.js'
import type {
  FeedbackVerdict,
  MemoryOrigin,
  MemorySuggestion,
  PersonalMemory,
  ProposedMemory,
  Reliability,
  Sensitivity,
  SuggestionFilter,
  SuggestionOp,
  SuggestionStatus
} from '../../shared/memory'
import { FEEDBACK_VERDICTS, MEMORY_LAYERS, MEMORY_TYPES, SENSITIVITIES, STABILITIES, SUGGESTION_OPS, defaultLayer, maxSensitivity, normText } from '../../shared/memory'
import type { ProduceRule } from './policy'
import { categoryAllowed, sensitivityAllowed } from './policy'
import {
  MemoryError,
  addEvidenceSync,
  addRelationSync,
  all,
  categoryBySlug,
  cleanTags,
  createMemorySync,
  deriveTitle,
  exec,
  findByNormSync,
  hardDeleteSync,
  jparse,
  lastId,
  memorySync,
  nowIso,
  one,
  read,
  setStatusSync,
  sha,
  toEvidence,
  tx,
  updateMemorySync
} from './repo'

/**
 * Memory Inbox: sugestões da IA (ou de importações) que só viram memória com aprovação.
 * Aprovação/rejeição rodam numa transação síncrona do sql.js e checam o status dentro dela:
 * aprovar duas vezes (cliques duplos, retries, abas concorrentes) é no-op.
 */

export interface NewSuggestion {
  op: SuggestionOp
  proposed?: Partial<ProposedMemory> | null
  question?: string | null
  targetIds?: number[]
  rationale?: string
  benefit?: string
  extractionConfidence?: number | null
  explicit?: boolean
  sourceKind: string
  sourceRef?: string | null
  evidence?: { excerpt: string; sourceRef?: string | null }[]
  batchId?: string | null
  /** Novas evidências permitem re-sugerir algo rejeitado antes. */
  newEvidence?: boolean
}

export type ProposeOutcome = { ok: true; id: number } | { ok: false; reason: string }

const REJECTED: FeedbackVerdict[] = ['rejected', 'irrelevant', 'incorrect', 'duplicate', 'too_personal']
const OPEN: SuggestionStatus[] = ['pending', 'snoozed', 'needs_info']
const clamp01 = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null
}

/** Valida/normaliza a proposta. Categoria inexistente cai em null (o usuário escolhe). */
export function normalizeProposed(db: Database, owner: string, p: Partial<ProposedMemory>): ProposedMemory {
  const content = String(p.content ?? '').trim().slice(0, 2000)
  if (!content) throw new MemoryError('Proposta sem conteúdo.')
  const type = MEMORY_TYPES.includes(p.type as never) ? (p.type as ProposedMemory['type']) : 'FACT'
  const slug = String(p.category ?? '').trim()
  return {
    title: (String(p.title ?? '').trim() || deriveTitle(content)).slice(0, 140),
    content,
    category: slug && categoryBySlug(db, owner, slug) ? slug : '',
    type,
    layer: MEMORY_LAYERS.includes(p.layer as never) ? p.layer : defaultLayer(type),
    tags: cleanTags(p.tags),
    importance: Math.min(5, Math.max(1, Math.round(Number(p.importance) || 3))),
    stability: STABILITIES.includes(p.stability as never) ? p.stability : 'stable',
    sensitivity: SENSITIVITIES.includes(p.sensitivity as never) ? p.sensitivity : 'NORMAL',
    occurredAt: p.occurredAt ? String(p.occurredAt).slice(0, 25) : null,
    validUntil: p.validUntil ? String(p.validUntil).slice(0, 25) : null,
    scope: p.scope ? String(p.scope).slice(0, 60) : 'geral'
  }
}

function wasRejected(db: Database, owner: string, normKey: string): boolean {
  const rows = all<{ verdict: string }>(db, 'SELECT verdict FROM memory_feedback WHERE ownerId = ? AND normKey = ? ORDER BY id DESC LIMIT 1', [owner, normKey])
  return rows.length > 0 && REJECTED.includes(rows[0].verdict as FeedbackVerdict)
}

/**
 * Cria uma sugestão aplicando a regra de produção (categoria/sensibilidade), deduplicação
 * contra memórias, sugestões existentes e feedback de rejeição.
 */
export function proposeSync(db: Database, owner: string, s: NewSuggestion, rule: ProduceRule): ProposeOutcome {
  if (!SUGGESTION_OPS.includes(s.op)) return { ok: false, reason: 'operação inválida' }
  const targetIds = [...new Set((s.targetIds ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))]
  const targets = targetIds.map((id) => memorySync(db, owner, id))
  if (targets.some((t) => !t)) return { ok: false, reason: 'memória-alvo inexistente' }
  if (['UPDATE', 'ARCHIVE'].includes(s.op) && targets.length < 1) return { ok: false, reason: 'sem memória-alvo' }
  if (['MERGE', 'RESOLVE'].includes(s.op) && targets.length < 2) return { ok: false, reason: 'precisa de duas ou mais memórias' }

  let proposed: ProposedMemory | null = null
  let sensitivity: Sensitivity = 'NORMAL'
  let normKey: string
  if (s.op === 'ASK') {
    const q = String(s.question ?? '').trim().slice(0, 400)
    if (!q) return { ok: false, reason: 'pergunta vazia' }
    normKey = `ask:${normText(q)}`
    const slug = String(s.proposed?.category ?? '')
    if (slug && !categoryAllowed(rule, slug)) return { ok: false, reason: 'categoria fora da política' }
  } else if (s.op === 'ARCHIVE' || (s.op === 'RESOLVE' && !String(s.proposed?.content ?? '').trim())) {
    normKey = `${s.op.toLowerCase()}:${[...targetIds].sort().join(',')}`
  } else {
    try {
      proposed = normalizeProposed(db, owner, s.proposed ?? {})
    } catch (e) {
      return { ok: false, reason: (e as Error).message }
    }
    if (!categoryAllowed(rule, proposed.category || null)) return { ok: false, reason: 'categoria fora da política' }
    const cat = proposed.category ? categoryBySlug(db, owner, proposed.category) : null
    sensitivity = maxSensitivity(proposed.sensitivity ?? 'NORMAL', cat?.defaultSensitivity ?? 'NORMAL')
    normKey = normText(proposed.content)
    if (s.op === 'CREATE' && findByNormSync(db, owner, normKey)) return { ok: false, reason: 'duplicada de memória existente' }
    if (s.op === 'UPDATE' && targets[0] && normText(targets[0].content) === normKey) return { ok: false, reason: 'sem mudança' }
  }
  for (const t of targets) sensitivity = maxSensitivity(sensitivity, t!.effectiveSensitivity)
  if (!sensitivityAllowed(rule, sensitivity)) return { ok: false, reason: 'sensibilidade acima do permitido' }
  if (!s.newEvidence && wasRejected(db, owner, normKey)) return { ok: false, reason: 'rejeitada antes' }

  const dedupeKey = sha(`${s.op}|${normKey}|${targetIds.sort().join(',')}`)
  const exists = one<{ id: number; status: string }>(db, 'SELECT id, status FROM memory_suggestions WHERE ownerId = ? AND dedupeKey = ?', [owner, dedupeKey])
  if (exists) {
    // rejeitada antes + evidência nova → reabre para revisão
    if (s.newEvidence && !OPEN.includes(exists.status as SuggestionStatus) && exists.status !== 'approved') {
      exec(db, "UPDATE memory_suggestions SET status='pending', resolvedAt=NULL, updatedAt=? WHERE id=?", [nowIso(), exists.id])
      for (const ev of s.evidence ?? []) addEvidenceSync(db, owner, { suggestionId: exists.id }, { sourceKind: s.sourceKind, sourceRef: ev.sourceRef ?? s.sourceRef ?? null, excerpt: ev.excerpt })
      return { ok: true, id: Number(exists.id) }
    }
    return { ok: false, reason: 'já sugerida' }
  }
  const explicit = s.explicit ?? false
  const reliability: Reliability = s.sourceKind === 'manual' || s.sourceKind === 'import' ? 'stated' : explicit ? 'stated' : 'inferred'
  if (proposed && reliability === 'inferred' && proposed.type !== 'LEARNING' && proposed.type !== 'INFERENCE') proposed.type = 'INFERENCE'
  if (proposed && reliability === 'inferred') proposed.layer = defaultLayer(proposed.type)
  const now = nowIso()
  exec(
    db,
    `INSERT INTO memory_suggestions (ownerId, op, status, payload, question, targetIds, targetSnapshot, rationale, benefit, extractionConfidence, reliability, sensitivity,
       sourceKind, sourceRef, dedupeKey, batchId, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      owner,
      s.op,
      'pending',
      proposed ? JSON.stringify(proposed) : null,
      s.op === 'ASK' ? String(s.question).trim().slice(0, 400) : null,
      JSON.stringify(targetIds),
      JSON.stringify(targets.map((t) => snapshotOf(t!))),
      String(s.rationale ?? '').slice(0, 800),
      String(s.benefit ?? '').slice(0, 400),
      clamp01(s.extractionConfidence),
      reliability,
      sensitivity,
      String(s.sourceKind).slice(0, 40),
      s.sourceRef ? String(s.sourceRef).slice(0, 200) : null,
      dedupeKey,
      s.batchId ?? null,
      now,
      now
    ]
  )
  const id = lastId(db)
  for (const ev of s.evidence ?? []) addEvidenceSync(db, owner, { suggestionId: id }, { sourceKind: s.sourceKind, sourceRef: ev.sourceRef ?? s.sourceRef ?? null, excerpt: ev.excerpt })
  return { ok: true, id }
}

function snapshotOf(m: PersonalMemory): Partial<PersonalMemory> {
  const { id, title, content, categoryId, type, layer, status, tags, importance, sensitivity, version, confirmedAt, reliability } = m
  return { id, title, content, categoryId, type, layer, status, tags, importance, sensitivity, version, confirmedAt, reliability }
}

interface SugRow {
  id: number
  op: string
  status: string
  payload: string | null
  question: string | null
  targetIds: string
  targetSnapshot: string
  rationale: string
  benefit: string
  extractionConfidence: number | null
  reliability: string
  sensitivity: string
  sourceKind: string
  sourceRef: string | null
  snoozedUntil: string | null
  resultMemoryIds: string
  undo: string | null
  batchId: string | null
  createdAt: string
  resolvedAt: string | null
}

function toSuggestion(db: Database, owner: string, r: SugRow, withTargets = true): MemorySuggestion {
  const targetIds = jparse<number[]>(r.targetIds, [])
  return {
    id: Number(r.id),
    op: r.op as SuggestionOp,
    status: r.status as SuggestionStatus,
    proposed: jparse<ProposedMemory | null>(r.payload, null),
    question: r.question,
    targetIds,
    targetSnapshot: jparse(r.targetSnapshot, []),
    targets: withTargets ? (targetIds.map((id) => memorySync(db, owner, id)).filter(Boolean) as PersonalMemory[]) : undefined,
    rationale: r.rationale,
    benefit: r.benefit,
    extractionConfidence: r.extractionConfidence == null ? null : Number(r.extractionConfidence),
    reliability: r.reliability as Reliability,
    sensitivity: r.sensitivity as Sensitivity,
    sourceKind: r.sourceKind,
    sourceRef: r.sourceRef,
    evidence: all<Parameters<typeof toEvidence>[0]>(db, 'SELECT * FROM memory_evidence WHERE ownerId = ? AND suggestionId = ? ORDER BY id', [owner, r.id]).map(toEvidence),
    snoozedUntil: r.snoozedUntil,
    resultMemoryIds: jparse<number[]>(r.resultMemoryIds, []),
    batchId: r.batchId,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt
  }
}

function getSync(db: Database, owner: string, id: number): SugRow | null {
  return one<SugRow>(db, 'SELECT * FROM memory_suggestions WHERE ownerId = ? AND id = ?', [owner, id])
}

export async function getSuggestion(owner: string, id: number): Promise<MemorySuggestion | null> {
  return read((db) => {
    const r = getSync(db, owner, id)
    return r ? toSuggestion(db, owner, r) : null
  })
}

export async function listSuggestions(owner: string, f: SuggestionFilter = {}): Promise<MemorySuggestion[]> {
  return read((db) => {
    const where = ['ownerId = ?']
    const params: (string | number)[] = [owner]
    const st = f.status ?? 'open'
    if (st === 'open') {
      where.push(`(status IN ('pending','needs_info') OR (status = 'snoozed' AND (snoozedUntil IS NULL OR snoozedUntil <= ?)))`)
      params.push(nowIso())
    } else if (st !== 'all') {
      where.push('status = ?')
      params.push(st)
    }
    if (f.op) {
      where.push('op = ?')
      params.push(f.op)
    }
    if (f.sourceKind) {
      where.push('sourceKind = ?')
      params.push(f.sourceKind)
    }
    const limit = Math.min(500, Math.max(1, Number(f.limit) || 200))
    return all<SugRow>(db, `SELECT * FROM memory_suggestions WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`, [...params, limit]).map((r) => toSuggestion(db, owner, r))
  })
}

function feedbackSync(db: Database, owner: string, sug: SugRow, verdict: FeedbackVerdict, note: string | null): void {
  const p = jparse<ProposedMemory | null>(sug.payload, null)
  const normKey = sug.op === 'ASK' ? `ask:${normText(sug.question ?? '')}` : p ? normText(p.content) : `${sug.op.toLowerCase()}:${jparse<number[]>(sug.targetIds, []).sort().join(',')}`
  exec(db, 'INSERT INTO memory_feedback (ownerId, suggestionId, verdict, note, normKey, op, createdAt) VALUES (?,?,?,?,?,?,?)', [
    owner,
    sug.id,
    verdict,
    note ? String(note).slice(0, 400) : null,
    normKey,
    sug.op,
    nowIso()
  ])
}

const ORIGIN_OF: Record<string, MemoryOrigin> = {
  migration: 'migration',
  import: 'import',
  interview: 'interview',
  consolidation: 'consolidation',
  text: 'text',
  manual: 'manual'
}

interface Undo {
  created: number[]
  updated: { id: number; before: Partial<PersonalMemory>; versionAfter: number }[]
  statuses: { id: number; before: string; versionAfter: number }[]
}

export interface ApproveOptions {
  /** Edição feita pelo usuário antes de aprovar. */
  edited?: Partial<ProposedMemory> | null
  /** RESOLVE: 'proposed' = a resolução proposta substitui as memórias; 'keep' = mantém `keepId` e marca as outras como desatualizadas. */
  resolution?: { mode: 'proposed' | 'keep'; keepId?: number }
}

/** Aplica a sugestão. Idempotente: se já não está aberta, devolve o estado atual sem mudar nada. */
export function approveSync(db: Database, owner: string, id: number, opts: ApproveOptions = {}): MemorySuggestion {
  const sug = getSync(db, owner, id)
  if (!sug) throw new MemoryError('Sugestão não encontrada.', 'not_found')
  if (!OPEN.includes(sug.status as SuggestionStatus)) return toSuggestion(db, owner, sug)
  if (sug.op === 'ASK') throw new MemoryError('Perguntas são respondidas, não aprovadas.')
  const edited = !!opts.edited
  const base = jparse<ProposedMemory | null>(sug.payload, null)
  const proposed = base || opts.edited ? normalizeProposed(db, owner, { ...(base ?? {}), ...(opts.edited ?? {}) }) : null
  const targetIds = jparse<number[]>(sug.targetIds, [])
  const targets = targetIds.map((t) => memorySync(db, owner, t))
  if (targets.some((t) => !t)) throw new MemoryError('Uma das memórias-alvo não existe mais. Rejeite esta sugestão.', 'conflict')
  const meta = {
    actor: 'user' as const,
    suggestionId: id,
    reason: `Sugestão #${id} aprovada`,
    confirmed: true
  }
  const evidence = all<{ sourceKind: string; sourceRef: string | null; excerpt: string }>(db, 'SELECT sourceKind, sourceRef, excerpt FROM memory_evidence WHERE ownerId = ? AND suggestionId = ?', [owner, id])
  const undo: Undo = { created: [], updated: [], statuses: [] }
  const result: number[] = []
  const catId = (slug: string | undefined): number | null => (slug ? categoryBySlug(db, owner, slug)?.id ?? null : null)
  const create = (p: ProposedMemory): number => {
    const dup = findByNormSync(db, owner, normText(p.content))
    if (dup) return dup.id // não duplica: aprovação liga à memória que já existe
    const m = createMemorySync(
      db,
      owner,
      { ...p, categoryId: catId(p.category) },
      {
        ...meta,
        origin: ORIGIN_OF[sug.sourceKind] ?? 'agent',
        originRef: sug.sourceRef,
        reliability: sug.reliability as Reliability,
        extractionConfidence: sug.extractionConfidence,
        evidence
      }
    )
    undo.created.push(m.id)
    return m.id
  }
  const setStatus = (mid: number, status: 'archived' | 'superseded' | 'outdated', supersededById?: number): void => {
    const before = memorySync(db, owner, mid)!
    if (before.status === status) return
    const after = setStatusSync(db, owner, mid, status, { ...meta, supersededById })
    undo.statuses.push({ id: mid, before: before.status, versionAfter: after.version })
  }

  switch (sug.op as SuggestionOp) {
    case 'CREATE':
      result.push(create(proposed!))
      break
    case 'UPDATE': {
      const t = targets[0]!
      const after = updateMemorySync(db, owner, t.id, { ...proposed!, categoryId: proposed!.category ? catId(proposed!.category) : t.categoryId }, { ...meta, evidence })
      undo.updated.push({ id: t.id, before: snapshotFull(t), versionAfter: after.version })
      result.push(t.id)
      break
    }
    case 'MERGE': {
      const nid = create(proposed!)
      for (const t of targets) {
        if (t!.id === nid) continue
        addRelationSync(db, owner, nid, t!.id, 'DERIVED_FROM')
        setStatus(t!.id, 'superseded', nid)
      }
      result.push(nid)
      break
    }
    case 'ARCHIVE':
      for (const t of targets) setStatus(t!.id, 'archived')
      result.push(...targetIds)
      break
    case 'RESOLVE': {
      const mode = opts.resolution?.mode ?? (proposed ? 'proposed' : 'keep')
      if (mode === 'keep') {
        const keep = Number(opts.resolution?.keepId)
        if (!targetIds.includes(keep)) throw new MemoryError('Escolha qual memória manter.')
        for (const t of targets) if (t!.id !== keep) setStatus(t!.id, 'outdated')
        result.push(keep)
      } else {
        if (!proposed) throw new MemoryError('Esta sugestão não tem uma resolução proposta.')
        const nid = create(proposed)
        for (const t of targets) {
          if (t!.id === nid) continue
          addRelationSync(db, owner, nid, t!.id, 'SUPERSEDES')
          setStatus(t!.id, 'superseded', nid)
        }
        result.push(nid)
      }
      break
    }
  }
  exec(db, "UPDATE memory_suggestions SET status='approved', payload=?, resultMemoryIds=?, undo=?, resolvedAt=?, updatedAt=? WHERE id=? AND ownerId=?", [
    proposed ? JSON.stringify(proposed) : sug.payload,
    JSON.stringify(result),
    JSON.stringify(undo),
    nowIso(),
    nowIso(),
    id,
    owner
  ])
  feedbackSync(db, owner, sug, edited ? 'approved_edited' : 'approved', null)
  return toSuggestion(db, owner, getSync(db, owner, id)!)
}

function snapshotFull(m: PersonalMemory): Partial<PersonalMemory> {
  const { title, content, categoryId, tags, type, layer, pinned, importance, stability, scope, sensitivity, occurredAt, validFrom, validUntil, reliability, confirmedAt } = m
  return { title, content, categoryId, tags, type, layer, pinned, importance, stability, scope, sensitivity, occurredAt, validFrom, validUntil, reliability, confirmedAt }
}

export async function approve(owner: string, id: number, opts: ApproveOptions = {}): Promise<MemorySuggestion> {
  return tx((db) => approveSync(db, owner, id, opts))
}

/** Aprovação em lote só do que é seguro: CREATE, sensibilidade NORMAL, declarado (não inferência). */
export async function approveMany(owner: string, ids: number[]): Promise<{ approved: number[]; skipped: { id: number; reason: string }[] }> {
  return tx((db) => {
    const approved: number[] = []
    const skipped: { id: number; reason: string }[] = []
    for (const id of ids.slice(0, 200)) {
      const s = getSync(db, owner, id)
      if (!s) skipped.push({ id, reason: 'não encontrada' })
      else if (!OPEN.includes(s.status as SuggestionStatus)) skipped.push({ id, reason: 'já resolvida' })
      else if (s.op !== 'CREATE') skipped.push({ id, reason: 'operação exige revisão individual' })
      else if (s.sensitivity !== 'NORMAL') skipped.push({ id, reason: 'sensível: aprove individualmente' })
      else if (s.reliability === 'inferred') skipped.push({ id, reason: 'inferência: aprove individualmente' })
      else {
        approveSync(db, owner, id)
        approved.push(id)
      }
    }
    return { approved, skipped }
  })
}

export async function reject(owner: string, id: number, verdict: FeedbackVerdict = 'rejected', note: string | null = null): Promise<MemorySuggestion> {
  return tx((db) => {
    const sug = getSync(db, owner, id)
    if (!sug) throw new MemoryError('Sugestão não encontrada.', 'not_found')
    if (!OPEN.includes(sug.status as SuggestionStatus)) return toSuggestion(db, owner, sug)
    const v = FEEDBACK_VERDICTS.includes(verdict) && !verdict.startsWith('approved') && verdict !== 'snoozed' ? verdict : 'rejected'
    exec(db, "UPDATE memory_suggestions SET status='rejected', resolvedAt=?, updatedAt=? WHERE id=? AND ownerId=?", [nowIso(), nowIso(), id, owner])
    feedbackSync(db, owner, sug, v, note)
    return toSuggestion(db, owner, getSync(db, owner, id)!)
  })
}

export async function snooze(owner: string, id: number, days = 7): Promise<MemorySuggestion> {
  return tx((db) => {
    const sug = getSync(db, owner, id)
    if (!sug) throw new MemoryError('Sugestão não encontrada.', 'not_found')
    if (!OPEN.includes(sug.status as SuggestionStatus)) return toSuggestion(db, owner, sug)
    const until = new Date(Date.now() + Math.min(90, Math.max(1, days)) * 86_400_000).toISOString()
    exec(db, "UPDATE memory_suggestions SET status='snoozed', snoozedUntil=?, updatedAt=? WHERE id=? AND ownerId=?", [until, nowIso(), id, owner])
    feedbackSync(db, owner, sug, 'snoozed', null)
    return toSuggestion(db, owner, getSync(db, owner, id)!)
  })
}

/** "Solicitar mais informações": fica aberta, marcada, com a nota do usuário. */
export async function needsInfo(owner: string, id: number, note: string): Promise<MemorySuggestion> {
  return tx((db) => {
    const sug = getSync(db, owner, id)
    if (!sug) throw new MemoryError('Sugestão não encontrada.', 'not_found')
    if (!OPEN.includes(sug.status as SuggestionStatus)) return toSuggestion(db, owner, sug)
    exec(db, "UPDATE memory_suggestions SET status='needs_info', updatedAt=? WHERE id=? AND ownerId=?", [nowIso(), id, owner])
    feedbackSync(db, owner, sug, 'other', note || 'pediu mais informações')
    return toSuggestion(db, owner, getSync(db, owner, id)!)
  })
}

/** Desfaz uma aprovação se as memórias não mudaram depois dela. */
export async function undo(owner: string, id: number): Promise<MemorySuggestion> {
  return tx((db) => {
    const sug = getSync(db, owner, id)
    if (!sug) throw new MemoryError('Sugestão não encontrada.', 'not_found')
    if (sug.status !== 'approved' || !sug.undo) throw new MemoryError('Nada para desfazer.')
    const u = jparse<Undo>(sug.undo, { created: [], updated: [], statuses: [] })
    for (const x of [...u.updated, ...u.statuses]) {
      const cur = memorySync(db, owner, x.id)
      if (!cur || cur.version !== x.versionAfter) throw new MemoryError('A memória mudou depois da aprovação; desfaça manualmente pelo histórico.', 'conflict')
    }
    for (const mid of u.created) {
      const cur = memorySync(db, owner, mid)
      if (cur && cur.version > 1) throw new MemoryError('A memória criada já foi editada; exclua manualmente se quiser.', 'conflict')
    }
    for (const x of u.statuses) setStatusSync(db, owner, x.id, x.before as never, { actor: 'user', reason: `Desfez sugestão #${id}` })
    for (const x of u.updated) updateMemorySync(db, owner, x.id, { ...(x.before as Record<string, unknown>), content: x.before.content! } as never, { actor: 'user', reason: `Desfez sugestão #${id}`, reliability: x.before.reliability, confirmed: true })
    for (const mid of u.created) hardDeleteSync(db, owner, mid)
    exec(db, "UPDATE memory_suggestions SET status='undone', undo=NULL, updatedAt=? WHERE id=? AND ownerId=?", [nowIso(), id, owner])
    return toSuggestion(db, owner, getSync(db, owner, id)!)
  })
}

/** Contagens para a Visão geral/observabilidade. */
export async function suggestionStats(owner: string): Promise<{ byStatus: Record<string, number>; oldestPendingDays: number | null }> {
  return read((db) => {
    const byStatus: Record<string, number> = {}
    for (const r of all<{ status: string; n: number }>(db, 'SELECT status, COUNT(*) AS n FROM memory_suggestions WHERE ownerId = ? GROUP BY status', [owner])) byStatus[r.status] = Number(r.n)
    const old = one<{ c: string | null }>(db, "SELECT MIN(createdAt) AS c FROM memory_suggestions WHERE ownerId = ? AND status IN ('pending','needs_info')", [owner])?.c
    return { byStatus, oldestPendingDays: old ? Math.floor((Date.now() - Date.parse(old)) / 86_400_000) : null }
  })
}
