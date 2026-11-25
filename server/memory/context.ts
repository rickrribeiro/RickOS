import crypto from 'crypto'
import type { Database } from 'sql.js'
import { getDb, saveDb } from '../database/db'
import { getSetting } from '../database/queries'
import type { ConsumeRule, MemoryPolicy } from './policy'
import { POLICY_VERSION, getPolicy, loadOverrides, narrowConsume, resolveConsume } from './policy'
import { currentOwner, exec, nowIso, one, touchUsageSync } from './repo'
import type { RetrievalLayer, RetrievalResult, Scored } from './retrieval'
import { LAYER_TITLE, retrieve } from './retrieval'
import { blocoFatosMemoria, blocoPreferenciasMemoria, CABECALHO_MEMORIA } from '../../shared/prompts/memoria/blocoContexto'

/**
 * MemoryContextService — ÚNICA porta de saída de memória pessoal para IA.
 *
 * 1. a política decide (useCase → regra efetiva); bloqueado = nenhuma leitura de memória;
 * 2. recuperação híbrida local (sem LLM, sem embeddings);
 * 3. render em blocos delimitados ("dados, não instruções"); instruções do usuário num bloco
 *    separado, de precedência inferior às regras do sistema;
 * 4. trace em `memory_usage` (ids, scores, motivos — nunca o conteúdo).
 *
 * Falhas viram contexto vazio (`degraded`), salvo `required: true`.
 */

export interface ContextRequest {
  useCase: string
  query?: string
  purpose?: string
  /** Inspector: não conta uso nem toca `lastUsedAt`. */
  simulate?: boolean
  /** Consumers que dependem da memória: propagam o erro em vez de degradar. */
  required?: boolean
}

export interface ContextItem {
  id: number
  title: string
  layer: RetrievalLayer
  score: number
  reason: string
  category: string | null
  tokens: number
}

export interface MemoryContext {
  allowed: boolean
  blockedReason: string | null
  degraded: boolean
  /** Bloco de fatos/preferências (vazio quando nada agrega). */
  text: string
  /** Bloco de instruções pessoais (só se a política permitir). */
  instructions: string
  items: ContextItem[]
  tokens: number
  budget: number
  durationMs: number
  vector: boolean
  traceId: number | null
}

const empty = (patch: Partial<MemoryContext>): MemoryContext => ({
  allowed: false,
  blockedReason: null,
  degraded: false,
  text: '',
  instructions: '',
  items: [],
  tokens: 0,
  budget: 0,
  durationMs: 0,
  vector: false,
  traceId: null,
  ...patch
})

export const CONTEXT_HEADER = CABECALHO_MEMORIA

export function renderContext(selected: Scored[], purpose: string): { text: string; instructions: string } {
  const facts = selected.filter((s) => s.memory.type !== 'INSTRUCTION')
  const instr = selected.filter((s) => s.memory.type === 'INSTRUCTION')
  const text = blocoFatosMemoria({ finalidade: purpose, linhas: facts.map((s) => s.line) })
  const instructions = blocoPreferenciasMemoria({ linhas: instr.map((s) => s.line) })
  return { text, instructions }
}

/** Cache curto de recuperação; a chave inclui a "versão" dos dados (qualquer escrita invalida). */
const cache = new Map<string, { at: number; result: RetrievalResult }>()
const CACHE_TTL = 60_000

function dataVersion(db: Database, owner: string): string {
  const r = one<{ n: number; u: string | null; t: number }>(
    db,
    `SELECT (SELECT COUNT(*) FROM memories WHERE ownerId = ?) AS n, (SELECT MAX(updatedAt) FROM memories WHERE ownerId = ?) AS u,
            (SELECT COUNT(*) FROM memory_tombstones WHERE ownerId = ?) AS t`,
    [owner, owner, owner]
  )
  return `${r?.n}|${r?.u}|${r?.t}`
}
export function clearContextCache(): void {
  cache.clear()
}

const hash = (s: string): string => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16)

function trace(db: Database, owner: string, req: ContextRequest, out: Partial<MemoryContext> & { discarded?: unknown[]; policyFiltered?: Record<string, number> }): number {
  const q = (req.query ?? '').trim()
  exec(
    db,
    `INSERT INTO memory_usage (ownerId, createdAt, useCase, purpose, queryHash, queryPreview, simulated, blocked, selected, discarded, tokens, budget, durationMs, vector, policyVersion)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      owner,
      nowIso(),
      String(req.useCase).slice(0, 80),
      String(req.purpose ?? '').slice(0, 120),
      q ? hash(q) : null,
      // só a consulta digitada no simulador fica legível; a dos consumers fica só como hash
      req.simulate && q ? q.slice(0, 80) : null,
      req.simulate ? 1 : 0,
      out.blockedReason ?? null,
      JSON.stringify((out.items ?? []).map((i) => ({ id: i.id, layer: i.layer, score: i.score, reason: i.reason, tokens: i.tokens }))),
      JSON.stringify({ items: out.discarded ?? [], policy: out.policyFiltered ?? {} }),
      out.tokens ?? 0,
      out.budget ?? 0,
      out.durationMs ?? 0,
      out.vector ? 1 : 0,
      POLICY_VERSION
    ]
  )
  return Number(one<{ id: number }>(db, 'SELECT last_insert_rowid() AS id')?.id ?? 0)
}

export async function getMemoryContext(req: ContextRequest): Promise<MemoryContext> {
  const started = Date.now()
  const owner = currentOwner()
  try {
    let access: { ok: true; policy: MemoryPolicy; rule: ConsumeRule } | { ok: false; reason: string } = await resolveConsume(String(req.useCase ?? ''))
    const db = await getDb()
    // Simulação de integração CANDIDATA (aguardando aprovação): calcula localmente o que seria
    // recuperado, sem LLM e sem marcar uso — serve para decidir a aprovação.
    const candidate = getPolicy(String(req.useCase ?? ''))
    if (!access.ok && req.simulate && candidate && !candidate.approved && candidate.consume) {
      access = { ok: true, policy: candidate, rule: narrowConsume(candidate.consume, (await loadOverrides())[candidate.useCase]) }
    }
    if (!access.ok) {
      const durationMs = Date.now() - started
      const traceId = trace(db, owner, req, { blockedReason: access.reason, durationMs })
      saveDb()
      return empty({ blockedReason: access.reason, durationMs, traceId })
    }
    const rule = access.rule
    const purpose = req.purpose || access.policy.purpose
    const key = `${req.useCase}|${hash(req.query ?? '')}|${JSON.stringify(rule)}|${dataVersion(db, owner)}`
    const hit = cache.get(key)
    const result = hit && Date.now() - hit.at < CACHE_TTL ? hit.result : retrieve(db, owner, { rule, query: req.query ?? '' })
    if (!hit) cache.set(key, { at: Date.now(), result })
    if (cache.size > 200) cache.delete(cache.keys().next().value as string)

    const { text, instructions } = renderContext(result.selected, purpose)
    const items: ContextItem[] = result.selected.map((s) => ({
      id: s.memory.id,
      title: s.memory.title,
      layer: s.layer,
      score: Math.round(s.score * 1000) / 1000,
      reason: `${LAYER_TITLE[s.layer]}: ${s.reason}`,
      category: s.categoryName,
      tokens: s.tokens
    }))
    const durationMs = Date.now() - started
    if (!req.simulate && items.length) touchUsageSync(db, owner, items.map((i) => i.id))
    const traceId = trace(db, owner, req, {
      items,
      tokens: result.tokens,
      budget: rule.maxTokens,
      durationMs,
      vector: result.vector,
      discarded: result.discarded,
      policyFiltered: result.policyFiltered
    })
    saveDb()
    return { allowed: true, blockedReason: null, degraded: false, text, instructions, items, tokens: result.tokens, budget: rule.maxTokens, durationMs, vector: result.vector, traceId }
  } catch (e) {
    if (req.required) throw e
    // memória opcional: o consumer segue sem personalização
    return empty({ degraded: true, blockedReason: 'memória indisponível', durationMs: Date.now() - started })
  }
}

/** Retenção dos traces do Inspector. */
export async function pruneTraces(): Promise<number> {
  const days = Math.max(1, Number((await getSetting('memory_trace_retention_days')) || 30))
  const db = await getDb()
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()
  const n = exec(db, 'DELETE FROM memory_usage WHERE createdAt < ?', [cutoff])
  if (n) saveDb()
  return n
}
