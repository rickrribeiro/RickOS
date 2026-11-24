import type { FeedbackVerdict, MemoryFilter, MemoryInput, MemoryStatus, ProposedMemory, RelationKind, SuggestionFilter } from '../../shared/memory'
import { RELATION_KINDS } from '../../shared/memory'
import { getDb } from '../database/db'
import { getSetting, setSetting } from '../database/queries'
import { broadcast } from '../events'
import { callsToday } from './ai'
import { analyzeMemories, extractFromText } from './agent'
import * as cog from './cognitive'
import { getMemoryContext } from './context'
import { listJobs, getJob, startManualJob } from './jobs'
import { MEMORY_POLICIES, OVERRIDES_KEY, loadOverrides, publicPolicies, type PolicyOverride } from './policy'
import * as repo from './repo'
import * as sug from './suggestions'
import * as transfer from './transfer'

/**
 * Canais `memory:*`. O dono é sempre resolvido aqui (`currentOwner()`), nunca vem do cliente.
 * Nenhum canal permite ao front escolher categorias/permissões de consumo: só o caso de uso.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handle = (channel: string, fn: (event: unknown, ...args: any[]) => unknown) => void

const owner = (): string => repo.currentOwner()
const changed = (kind: string): void => broadcast('memory:updated', { kind })
const num = (v: unknown): number => {
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) throw new repo.MemoryError('Identificador inválido.')
  return n
}

/** Configurações editáveis do módulo (validadas; nada fora desta lista). */
export const MEMORY_SETTINGS = {
  memory_agent_enabled: { kind: 'bool', def: '0' },
  memory_agent_interval_min: { kind: 'int', def: '60', min: 15, max: 1440 },
  memory_batch_size: { kind: 'int', def: '10', min: 1, max: 50 },
  memory_consolidation_enabled: { kind: 'bool', def: '0' },
  memory_consolidation_days: { kind: 'int', def: '7', min: 1, max: 90 },
  memory_notifications: { kind: 'bool', def: '0' },
  memory_max_llm_calls_day: { kind: 'int', def: '40', min: 0, max: 500 },
  memory_ai_model: { kind: 'str', def: '' },
  memory_ai_model_fast: { kind: 'str', def: '' },
  memory_trace_retention_days: { kind: 'int', def: '30', min: 1, max: 365 },
  memory_event_retention_days: { kind: 'int', def: '14', min: 1, max: 365 },
  memory_consumers_enabled: { kind: 'bool', def: '1' },
  memory_extraction_categories: { kind: 'json', def: '' }
} as const
type SettingKey = keyof typeof MEMORY_SETTINGS

async function readSettings(): Promise<{ values: Record<string, string>; overrides: Record<string, PolicyOverride> }> {
  const out: Record<string, string> = {}
  for (const [k, spec] of Object.entries(MEMORY_SETTINGS)) out[k] = (await getSetting(k)) ?? spec.def
  return { values: out, overrides: await loadOverrides() }
}

async function saveSettings(patch: Record<string, unknown>): Promise<void> {
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (k === 'overrides') {
      const clean: Record<string, PolicyOverride> = {}
      for (const [uc, o] of Object.entries((v ?? {}) as Record<string, PolicyOverride>)) {
        if (!MEMORY_POLICIES.some((p) => p.useCase === uc) || !o || typeof o !== 'object') continue
        const x: PolicyOverride = {}
        if (o.disabled) x.disabled = true
        if (o.produceDisabled) x.produceDisabled = true
        if (o.maxTokens != null && Number(o.maxTokens) >= 0) x.maxTokens = Math.floor(Number(o.maxTokens))
        if (o.maxItems != null && Number(o.maxItems) >= 0) x.maxItems = Math.floor(Number(o.maxItems))
        if (Array.isArray(o.categories)) x.categories = o.categories.map(String).slice(0, 50)
        if (['NORMAL', 'PRIVATE', 'RESTRICTED'].includes(String(o.maxSensitivity))) x.maxSensitivity = o.maxSensitivity
        if (Object.keys(x).length) clean[uc] = x
      }
      await setSetting(OVERRIDES_KEY, JSON.stringify(clean))
      continue
    }
    const spec = MEMORY_SETTINGS[k as SettingKey]
    if (!spec) continue
    let val: string
    if (spec.kind === 'bool') val = v ? '1' : '0'
    else if (spec.kind === 'int') {
      const s = spec as { min: number; max: number }
      val = String(Math.min(s.max, Math.max(s.min, Math.round(Number(v)) || s.min)))
    } else if (spec.kind === 'json') val = Array.isArray(v) ? JSON.stringify(v.map(String)) : ''
    else val = String(v ?? '').trim().slice(0, 60)
    await setSetting(k, val)
  }
  changed('settings')
}

async function overview(): Promise<unknown> {
  const o = owner()
  await repo.ensureSeeded(o)
  const db = await getDb()
  const n = (sql: string, p: (string | number)[] = [o]): number => Number(repo.one<{ n: number }>(db, sql, p)?.n ?? 0)
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const recent = (await repo.listMemories(o, { sort: 'recent', limit: 6 })).items
  const used = (await repo.listMemories(o, { sort: 'used', limit: 6 })).items.filter((m) => m.useCount > 0)
  const growth = repo.all<{ month: string; n: number }>(
    db,
    "SELECT substr(createdAt,1,7) AS month, COUNT(*) AS n FROM memories WHERE ownerId = ? AND createdAt >= ? GROUP BY month ORDER BY month",
    [o, new Date(Date.now() - 365 * 86_400_000).toISOString()]
  )
  const retrieval = repo.all<{ useCase: string; calls: number; blocked: number; empty: number; avgMs: number; avgTokens: number }>(
    db,
    `SELECT useCase, COUNT(*) AS calls, SUM(CASE WHEN blocked IS NOT NULL THEN 1 ELSE 0 END) AS blocked,
       SUM(CASE WHEN blocked IS NULL AND selected = '[]' THEN 1 ELSE 0 END) AS empty, AVG(durationMs) AS avgMs, AVG(tokens) AS avgTokens
     FROM memory_usage WHERE ownerId = ? AND createdAt >= ? AND simulated = 0 GROUP BY useCase ORDER BY calls DESC`,
    [o, since30]
  )
  const cost = repo.all<{ source: string; calls: number; inputTokens: number; outputTokens: number; costUsd: number }>(
    db,
    "SELECT source, COUNT(*) AS calls, SUM(inputTokens) AS inputTokens, SUM(outputTokens) AS outputTokens, SUM(costUsd) AS costUsd FROM ai_usage WHERE source LIKE 'memoria-%' AND createdAt >= ? GROUP BY source ORDER BY costUsd DESC",
    [since30]
  )
  const fresh = await cog.freshness()
  const gaps = (await cog.listGaps('open')).slice(0, 5)
  return {
    counts: {
      active: n("SELECT COUNT(*) AS n FROM memories WHERE ownerId = ? AND status = 'active'"),
      unconfirmed: n("SELECT COUNT(*) AS n FROM memories WHERE ownerId = ? AND status = 'unconfirmed'"),
      archived: n("SELECT COUNT(*) AS n FROM memories WHERE ownerId = ? AND status IN ('archived','superseded','expired','outdated')"),
      pinned: n("SELECT COUNT(*) AS n FROM memories WHERE ownerId = ? AND pinned = 1 AND status = 'active'"),
      pending: n("SELECT COUNT(*) AS n FROM memory_suggestions WHERE ownerId = ? AND status IN ('pending','needs_info')"),
      conflicts: n("SELECT COUNT(*) AS n FROM memory_suggestions WHERE ownerId = ? AND op = 'RESOLVE' AND status IN ('pending','needs_info','snoozed')"),
      categories: n('SELECT COUNT(*) AS n FROM memory_categories WHERE ownerId = ? AND archivedAt IS NULL'),
      needsReview: fresh.length,
      openGaps: n("SELECT COUNT(*) AS n FROM memory_gaps WHERE ownerId = ? AND status = 'open'"),
      pendingEvents: n("SELECT COUNT(*) AS n FROM memory_events WHERE ownerId = ? AND status IN ('pending','retry')"),
      failedEvents: n("SELECT COUNT(*) AS n FROM memory_events WHERE ownerId = ? AND status = 'failed'")
    },
    suggestions: await sug.suggestionStats(o),
    recent,
    used,
    review: fresh.slice(0, 5),
    gaps,
    growth: growth.map((g) => ({ month: g.month, n: Number(g.n) })),
    jobs: (await listJobs(8)).filter((j) => j.kind !== 'housekeeping'),
    lastConsolidation: await getSetting('memory_consolidation_last'),
    agentEnabled: (await getSetting('memory_agent_enabled')) === '1',
    retrieval: retrieval.map((r) => ({ ...r, calls: Number(r.calls), blocked: Number(r.blocked), empty: Number(r.empty), avgMs: Math.round(Number(r.avgMs)), avgTokens: Math.round(Number(r.avgTokens)) })),
    cost,
    llm: await callsToday()
  }
}

/** Traces do Inspector com títulos resolvidos AGORA (memória excluída some; restrita é mascarada). */
async function traces(limit = 50): Promise<unknown[]> {
  const o = owner()
  const db = await getDb()
  const rows = repo.all<{
    id: number
    createdAt: string
    useCase: string
    purpose: string
    queryHash: string | null
    queryPreview: string | null
    simulated: number
    blocked: string | null
    selected: string
    discarded: string
    tokens: number
    budget: number
    durationMs: number
    vector: number
    policyVersion: number
  }>(db, 'SELECT * FROM memory_usage WHERE ownerId = ? ORDER BY id DESC LIMIT ?', [o, Math.min(200, limit)])
  const label = (id: number): { title: string; restricted: boolean; exists: boolean } => {
    const m = repo.memorySync(db, o, id)
    if (!m) return { title: `#${id} (excluída)`, restricted: false, exists: false }
    if (m.effectiveSensitivity === 'RESTRICTED') return { title: `🔒 Memória restrita #${id}`, restricted: true, exists: true }
    return { title: m.title, restricted: false, exists: true }
  }
  return rows.map((r) => {
    const disc = repo.jparse<{ items: { id: number; reason: string; score?: number }[]; policy: Record<string, number> }>(r.discarded, { items: [], policy: {} })
    return {
      ...r,
      id: Number(r.id),
      simulated: !!r.simulated,
      vector: !!r.vector,
      policy: MEMORY_POLICIES.find((p) => p.useCase === r.useCase)?.label ?? r.useCase,
      selected: repo.jparse<{ id: number; layer: string; score: number; reason: string; tokens: number }[]>(r.selected, []).map((s) => ({ ...s, ...label(s.id) })),
      discarded: (disc.items ?? []).slice(0, 50).map((d) => ({ ...d, ...label(d.id) })),
      policyFiltered: disc.policy ?? {}
    }
  })
}

export function registerMemoryRpc(handle: Handle): void {
  // ── Categorias ──
  handle('memory:categories', (_e, includeArchived?: boolean) => repo.listCategories(owner(), includeArchived !== false))
  handle('memory:createCategory', async (_e, input: repo.CategoryInput) => {
    const c = await repo.createCategory(owner(), input)
    changed('categories')
    return c
  })
  handle('memory:updateCategory', async (_e, id: number, input: Partial<repo.CategoryInput> & { archived?: boolean }) => {
    const c = await repo.updateCategory(owner(), num(id), input ?? {})
    changed('categories')
    return c
  })
  handle('memory:reorderCategories', async (_e, ids: number[]) => {
    await repo.reorderCategories(owner(), (Array.isArray(ids) ? ids : []).map(num))
    changed('categories')
  })

  // ── Memórias ──
  handle('memory:list', (_e, filter: MemoryFilter) => repo.listMemories(owner(), filter ?? {}))
  handle('memory:get', (_e, id: number) => repo.getMemoryDetail(owner(), num(id)))
  handle('memory:create', async (_e, input: MemoryInput) => {
    const m = await repo.createMemory(owner(), input)
    changed('memories')
    return m
  })
  handle('memory:update', async (_e, id: number, patch: MemoryInput, expectedVersion?: number) => {
    const m = await repo.updateMemory(owner(), num(id), patch, { actor: 'user', expectedVersion: expectedVersion ?? undefined })
    changed('memories')
    return m
  })
  handle('memory:setStatus', async (_e, id: number, status: MemoryStatus, reason?: string) => {
    const allowed: MemoryStatus[] = ['active', 'archived', 'outdated', 'unconfirmed']
    if (!allowed.includes(status)) throw new repo.MemoryError('Status inválido.')
    const m = await repo.setStatus(owner(), num(id), status, { actor: 'user', reason: reason ?? null })
    changed('memories')
    return m
  })
  handle('memory:confirm', async (_e, id: number) => {
    const m = await repo.confirmMemory(owner(), num(id))
    changed('memories')
    return m
  })
  handle('memory:pin', async (_e, id: number, pinned: boolean) => {
    const m = await repo.setPinned(owner(), num(id), !!pinned)
    changed('memories')
    return m
  })
  handle('memory:delete', async (_e, id: number) => {
    const ok = await repo.hardDelete(owner(), num(id))
    changed('memories')
    return ok
  })
  handle('memory:addRelation', async (_e, fromId: number, toId: number, kind: RelationKind, note?: string) => {
    if (!RELATION_KINDS.includes(kind)) throw new repo.MemoryError('Tipo de relação inválido.')
    await repo.addRelation(owner(), num(fromId), num(toId), kind, note ?? null)
    changed('relations')
  })
  handle('memory:removeRelation', async (_e, id: number) => {
    await repo.removeRelation(owner(), num(id))
    changed('relations')
  })
  handle('memory:graph', async () => {
    const o = owner()
    const memories = (await repo.listMemories(o, { status: 'all', limit: 500, sort: 'importance' })).items.filter((m) => m.status !== 'archived')
    return { memories, relations: await repo.allRelations(o) }
  })

  // ── Inbox ──
  handle('memory:suggestions', (_e, f: SuggestionFilter) => sug.listSuggestions(owner(), f ?? {}))
  handle('memory:approve', async (_e, id: number, opts?: { edited?: Partial<ProposedMemory> | null; resolution?: { mode: 'proposed' | 'keep'; keepId?: number } }) => {
    const r = await sug.approve(owner(), num(id), opts ?? {})
    changed('suggestions')
    return r
  })
  handle('memory:approveMany', async (_e, ids: number[]) => {
    const r = await sug.approveMany(owner(), (Array.isArray(ids) ? ids : []).map(num))
    changed('suggestions')
    return r
  })
  handle('memory:reject', async (_e, id: number, verdict?: FeedbackVerdict, note?: string) => {
    const r = await sug.reject(owner(), num(id), verdict ?? 'rejected', note ?? null)
    changed('suggestions')
    return r
  })
  handle('memory:snooze', async (_e, id: number, days?: number) => {
    const r = await sug.snooze(owner(), num(id), Number(days) || 7)
    changed('suggestions')
    return r
  })
  handle('memory:needsInfo', async (_e, id: number, note: string) => {
    const r = await sug.needsInfo(owner(), num(id), String(note ?? ''))
    changed('suggestions')
    return r
  })
  handle('memory:undo', async (_e, id: number) => {
    const r = await sug.undo(owner(), num(id))
    changed('suggestions')
    return r
  })

  // ── Entrada inteligente / análise (jobs em background) ──
  handle('memory:extractText', (_e, text: string) => {
    const t = String(text ?? '').trim()
    if (t.length < 10) throw new repo.MemoryError('Escreva um pouco mais sobre você.')
    if (t.length > 30000) throw new repo.MemoryError('Texto longo demais (máx. 30 mil caracteres).')
    return startManualJob('text', () => extractFromText({ useCase: 'memory.text', text: t, sourceKind: 'text', sourceRef: 'texto-livre', op: 'texto' }))
  })
  handle('memory:analyze', () => startManualJob('analyze', () => analyzeMemories('memory.analyze')))
  handle('memory:consolidateNow', () => startManualJob('consolidation', () => analyzeMemories('memory.consolidation')))
  handle('memory:jobs', (_e, limit?: number) => listJobs(Number(limit) || 30))
  handle('memory:job', (_e, id: number) => getJob(num(id)))

  // ── Migração / importação / exportação ──
  handle('memory:legacyStatus', () => transfer.legacyStatus())
  handle('memory:migrate', async (_e, opts: { ai?: boolean; force?: boolean }) => {
    if (opts?.ai) return { jobId: await startManualJob('migration', () => transfer.migrateLegacy({ ai: true, force: !!opts.force })) }
    const r = await transfer.migrateLegacy({ ai: false, force: !!opts?.force })
    changed('suggestions')
    return { result: r }
  })
  handle('memory:exportJson', (_e, o?: transfer.ExportOptions) => transfer.exportJson(o ?? {}))
  handle('memory:exportMarkdown', (_e, o?: transfer.ExportOptions) => transfer.exportMarkdown(o ?? {}))
  handle('memory:importJson', async (_e, data: unknown, mode?: 'direct' | 'review') => {
    const r = await transfer.importJson(data, mode === 'direct' ? 'direct' : 'review')
    changed('memories')
    return r
  })
  handle('memory:importMarkdown', async (_e, md: string, ai?: boolean) => {
    const text = String(md ?? '')
    if (text.length > 200_000) throw new repo.MemoryError('Arquivo grande demais.')
    if (ai) return { jobId: await startManualJob('import-md', () => extractFromText({ useCase: 'memory.text', text, sourceKind: 'import', sourceRef: 'markdown', op: 'texto' })) }
    const r = await transfer.importMarkdownItems(text, 'import', 'markdown', 'memory.text')
    changed('suggestions')
    return { result: r }
  })

  // ── Context Inspector ──
  handle('memory:policies', () => publicPolicies())
  handle('memory:simulate', (_e, useCase: string, query: string) => getMemoryContext({ useCase: String(useCase ?? ''), query: String(query ?? '').slice(0, 2000), simulate: true }))
  handle('memory:traces', (_e, limit?: number) => traces(Number(limit) || 50))

  // ── Cognitive ──
  handle('memory:freshness', () => cog.freshness())
  handle('memory:coverage', () => cog.coverage())
  handle('memory:gaps', (_e, status?: 'open' | 'answered' | 'dismissed' | 'irrelevant' | 'all') => cog.listGaps(status ?? 'open'))
  handle('memory:detectGaps', () => startManualJob('gaps', () => cog.detectGaps()))
  handle('memory:gapStatus', async (_e, id: number, status: 'dismissed' | 'irrelevant' | 'open') => {
    if (!['dismissed', 'irrelevant', 'open'].includes(status)) throw new repo.MemoryError('Status inválido.')
    await cog.setGapStatus(num(id), status)
    changed('gaps')
  })
  handle('memory:answerGap', (_e, id: number, answer: string) => {
    const a = String(answer ?? '').trim()
    if (!a) throw new repo.MemoryError('Resposta vazia.')
    return startManualJob('gap-answer', () => cog.answerGap(num(id), a))
  })
  handle('memory:interviews', () => cog.listInterviews())
  handle('memory:startInterview', (_e, topic: string, categoryId?: number | null) => cog.startInterview(String(topic ?? ''), categoryId ? num(categoryId) : null))
  handle('memory:answerInterview', async (_e, id: number, answer: string) => {
    const r = await cog.answerInterview(num(id), String(answer ?? ''))
    changed('suggestions')
    return r
  })
  handle('memory:skipInterview', (_e, id: number) => cog.skipInterview(num(id)))
  handle('memory:endInterview', (_e, id: number) => cog.endInterview(num(id)))
  handle('memory:timeline', (_e, opts?: { categoryId?: number | null; limit?: number }) => cog.timeline(opts ?? {}))

  // ── Visão geral / configurações ──
  handle('memory:overview', () => overview())
  handle('memory:settings', () => readSettings())
  handle('memory:saveSettings', (_e, patch: Record<string, unknown>) => saveSettings(patch))
}
