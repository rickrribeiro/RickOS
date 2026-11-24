import { getDb, saveDb } from '../database/db'
import { getSetting, setSetting } from '../database/queries'
import { broadcast } from '../events'
import { notify } from '../services/notifications'
import { AiBudgetError } from './ai'
import { analyzeMemories, processEventBatch, pruneEvents } from './agent'
import { pruneTraces } from './context'
import { all, currentOwner, exec, expireDueSync, jparse, nowIso, one } from './repo'

/**
 * Jobs da Memória Pessoal sobre a tabela `memory_jobs`:
 *  • `dedupeKey` único por período → o mesmo job não roda duas vezes (idempotência);
 *  • claim por status dentro do processo + um runner por vez;
 *  • retries com backoff exponencial até `maxAttempts`, erro registrado;
 *  • execuções manuais longas (IA) rodam em background e avisam por `memory:job`.
 * Tudo de IA é DESLIGADO por padrão (agente, consolidação, notificações).
 */

export interface JobView {
  id: number
  kind: string
  status: string
  attempts: number
  error: string | null
  stats: Record<string, unknown>
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

const running = new Set<string>()

/** Executa (ou retoma após falha) o job `kind` do período `periodKey`. */
export async function runJob<T extends object>(kind: string, periodKey: string, fn: () => Promise<T>, params: object = {}): Promise<{ ran: boolean; id: number; result?: T; error?: string }> {
  const owner = currentOwner()
  const db = await getDb()
  const key = `${kind}:${periodKey}`
  if (running.has(key)) return { ran: false, id: 0 }
  exec(db, 'INSERT OR IGNORE INTO memory_jobs (ownerId, kind, dedupeKey, params, runAfter, createdAt) VALUES (?,?,?,?,?,?)', [owner, kind, key, JSON.stringify(params), nowIso(), nowIso()])
  const job = one<{ id: number; status: string; attempts: number; maxAttempts: number; runAfter: string }>(db, 'SELECT id, status, attempts, maxAttempts, runAfter FROM memory_jobs WHERE ownerId = ? AND dedupeKey = ?', [owner, key])!
  const retryable = job.status === 'failed' && job.attempts < job.maxAttempts && job.runAfter <= nowIso()
  if (job.status !== 'queued' && !retryable) return { ran: false, id: job.id }
  running.add(key)
  exec(db, "UPDATE memory_jobs SET status='running', attempts=attempts+1, startedAt=?, error=NULL WHERE id=?", [nowIso(), job.id])
  saveDb()
  broadcast('memory:job', { id: job.id, kind, status: 'running' })
  try {
    const result = await fn()
    exec(db, "UPDATE memory_jobs SET status='done', finishedAt=?, stats=? WHERE id=?", [nowIso(), JSON.stringify(result ?? {}), job.id])
    saveDb()
    broadcast('memory:job', { id: job.id, kind, status: 'done', stats: result })
    broadcast('memory:updated', { kind })
    return { ran: true, id: job.id, result }
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500)
    const attempts = job.attempts + 1
    // limite de orçamento não adianta tentar de novo hoje
    const terminal = e instanceof AiBudgetError || attempts >= job.maxAttempts
    const backoffMin = 5 * 2 ** attempts
    exec(db, 'UPDATE memory_jobs SET status=?, finishedAt=?, error=?, runAfter=?, maxAttempts=? WHERE id=?', [
      'failed',
      nowIso(),
      msg,
      new Date(Date.now() + backoffMin * 60_000).toISOString(),
      terminal ? attempts : job.maxAttempts,
      job.id
    ])
    saveDb()
    broadcast('memory:job', { id: job.id, kind, status: 'failed', error: msg })
    return { ran: true, id: job.id, error: msg }
  } finally {
    running.delete(key)
  }
}

/** Dispara um job manual em background e devolve o id na hora. */
export async function startManualJob<T extends object>(kind: string, fn: () => Promise<T>, params: object = {}): Promise<number> {
  const period = `manual-${Date.now()}`
  const p = runJob(kind, period, fn, params)
  // o id já existe depois do INSERT; espera só até o job aparecer
  const db = await getDb()
  for (let i = 0; i < 20; i++) {
    const row = one<{ id: number }>(db, 'SELECT id FROM memory_jobs WHERE ownerId = ? AND dedupeKey = ?', [currentOwner(), `${kind}:${period}`])
    if (row) {
      void p.catch(() => undefined)
      return Number(row.id)
    }
    await new Promise((r) => setTimeout(r, 5))
  }
  const r = await p
  return r.id
}

export async function listJobs(limit = 30): Promise<JobView[]> {
  const db = await getDb()
  return all<JobView & { stats: string }>(db, 'SELECT id, kind, status, attempts, error, stats, createdAt, startedAt, finishedAt FROM memory_jobs WHERE ownerId = ? ORDER BY id DESC LIMIT ?', [
    currentOwner(),
    Math.min(200, limit)
  ]).map((j) => ({ ...j, id: Number(j.id), attempts: Number(j.attempts), stats: jparse(j.stats, {}) }))
}

export async function getJob(id: number): Promise<JobView | null> {
  return (await listJobs(200)).find((j) => j.id === id) ?? null
}

const dayKey = (d = new Date()): string => d.toISOString().slice(0, 10)
const intervalKey = (minutes: number, d = new Date()): string => String(Math.floor(d.getTime() / (minutes * 60_000)))

/** Notificação agrupada (uma por execução), só se o usuário ligou. */
async function maybeNotify(title: string, body: string): Promise<void> {
  if ((await getSetting('memory_notifications')) !== '1') return
  await notify({ title, body, source: 'memoria', page: 'memory' })
}

let ticking = false
/** Chamado pelo agendador do servidor (a cada 5 min). Falhas aqui nunca afetam outros módulos. */
export async function memoryTick(now = new Date()): Promise<void> {
  if (ticking) return
  ticking = true
  try {
    const db = await getDb()
    if (expireDueSync(db, currentOwner()) > 0) {
      saveDb()
      broadcast('memory:updated', { kind: 'expire' })
    }
    await runJob('housekeeping', dayKey(now), async () => ({ traces: await pruneTraces(), events: await pruneEvents() }))

    if ((await getSetting('memory_agent_enabled')) === '1') {
      const every = Math.max(15, Number((await getSetting('memory_agent_interval_min')) || 60))
      const pending = Number(one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM memory_events WHERE ownerId = ? AND status IN ('pending','retry')", [currentOwner()])?.n ?? 0)
      if (pending > 0) {
        const r = await runJob('agent_batch', intervalKey(every, now), () => processEventBatch())
        if (r.result && r.result.proposed > 0) await maybeNotify('🧠 Memória: novas sugestões', `${r.result.proposed} sugestão(ões) aguardando revisão no Memory Inbox.`)
      }
    }

    if ((await getSetting('memory_consolidation_enabled')) === '1') {
      const days = Math.max(1, Number((await getSetting('memory_consolidation_days')) || 7))
      const last = await getSetting('memory_consolidation_last')
      if (!last || now.getTime() - Date.parse(last) >= days * 86_400_000) {
        const r = await runJob('consolidation', dayKey(now), () => analyzeMemories('memory.consolidation'))
        if (r.ran && !r.error) {
          await setSetting('memory_consolidation_last', now.toISOString())
          if (r.result && r.result.proposed > 0) await maybeNotify('🧠 Consolidação da memória', `${r.result.proposed} sugestão(ões) de consolidação ou conflito para revisar.`)
        }
      }
    }
  } catch {
    // a memória é opcional: nenhum erro sai daqui
  } finally {
    ticking = false
  }
}
