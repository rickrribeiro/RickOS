import type { Database } from 'sql.js'
import { randomUUID } from 'crypto'
import type { AiBlock, AiConversation, AiConversationPatch, AiTurn, AiTurnStatus, ConvEffort, ConvPermissionMode } from '../../shared/aiConversations'
import { getDb, saveDb } from '../database/db'

/** Banco das conversas do Prompt Runner (`ai_conversations` + `ai_conv_turns`). */
type P = (string | number | null)[]

function all<T>(db: Database, sql: string, params: P = []): T[] {
  const st = db.prepare(sql)
  if (params.length) st.bind(params)
  const out: T[] = []
  while (st.step()) out.push(st.getAsObject() as T)
  st.free()
  return out
}
function one<T>(db: Database, sql: string, params: P = []): T | null {
  return all<T>(db, sql, params)[0] ?? null
}
function exec(db: Database, sql: string, params: P = []): void {
  const st = db.prepare(sql)
  st.run(params)
  st.free()
}

const nowIso = (): string => new Date().toISOString()

interface ConvRow {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  projectId: number | null
  agentId: string | null
  skillIds: string
  model: string
  effort: string
  permissionMode: string
  sessionId: string | null
  cwd: string | null
  configDir: string | null
  claudeCommand: string
  contextTokens: number
  contextWindow: number
  totalCostUsd: number
  totalInputTokens: number
  totalOutputTokens: number
  pinned: number
  archived: number
  origin: string
  useWorktree: number
  worktreeBranch: string | null
  repoPath: string | null
  baseRef: string | null
  forkFrom: string | null
  seenAt: string | null
  turnCount?: number
}

interface TurnRow {
  id: number
  conversationId: string
  createdAt: string
  prompt: string
  blocks: string
  status: string
  error: string | null
  costUsd: number
  inputTokens: number
  outputTokens: number
  contextTokens: number
  durationMs: number | null
  attachments: string | null
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function toConv(r: ConvRow): AiConversation {
  return {
    id: r.id,
    title: r.title,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    projectId: r.projectId ?? null,
    agentId: r.agentId ?? null,
    skillIds: parseJson<string[]>(r.skillIds, []),
    model: r.model ?? '',
    effort: (r.effort ?? '') as ConvEffort,
    permissionMode: (r.permissionMode || 'default') as ConvPermissionMode,
    sessionId: r.sessionId ?? null,
    cwd: r.cwd ?? null,
    configDir: r.configDir ?? null,
    claudeCommand: r.claudeCommand ?? '',
    contextTokens: r.contextTokens ?? 0,
    contextWindow: r.contextWindow ?? 0,
    totalCostUsd: r.totalCostUsd ?? 0,
    totalInputTokens: r.totalInputTokens ?? 0,
    totalOutputTokens: r.totalOutputTokens ?? 0,
    pinned: !!r.pinned,
    archived: !!r.archived,
    origin: r.origin === 'terminal' ? 'terminal' : 'rickos',
    useWorktree: !!r.useWorktree,
    worktreeBranch: r.worktreeBranch ?? null,
    repoPath: r.repoPath ?? null,
    baseRef: r.baseRef ?? null,
    forkFrom: r.forkFrom ?? null,
    seenAt: r.seenAt ?? null,
    turnCount: r.turnCount
  }
}

function toTurn(r: TurnRow): AiTurn {
  return {
    id: r.id,
    conversationId: r.conversationId,
    createdAt: r.createdAt,
    prompt: r.prompt,
    blocks: parseJson<AiBlock[]>(r.blocks, []),
    status: r.status as AiTurnStatus,
    error: r.error ?? null,
    costUsd: r.costUsd ?? 0,
    inputTokens: r.inputTokens ?? 0,
    outputTokens: r.outputTokens ?? 0,
    contextTokens: r.contextTokens ?? 0,
    durationMs: r.durationMs ?? null,
    attachments: parseJson<string[]>(r.attachments, [])
  }
}

const CONV_SELECT = `SELECT c.*, (SELECT COUNT(*) FROM ai_conv_turns t WHERE t.conversationId = c.id) AS turnCount FROM ai_conversations c`

export async function listConversations(opts: { archived?: boolean } = {}): Promise<AiConversation[]> {
  const db = await getDb()
  return all<ConvRow>(db, `${CONV_SELECT} WHERE c.archived = ? ORDER BY c.pinned DESC, c.updatedAt DESC LIMIT 300`, [opts.archived ? 1 : 0]).map(toConv)
}

export async function getConversation(id: string): Promise<AiConversation | null> {
  const db = await getDb()
  const r = one<ConvRow>(db, `${CONV_SELECT} WHERE c.id = ?`, [id])
  return r ? toConv(r) : null
}

export async function findConversationBySession(sessionId: string): Promise<AiConversation | null> {
  const db = await getDb()
  const r = one<ConvRow>(db, `${CONV_SELECT} WHERE c.sessionId = ? ORDER BY c.updatedAt DESC`, [sessionId])
  return r ? toConv(r) : null
}

export async function sessionIdsInUse(): Promise<Map<string, string>> {
  const db = await getDb()
  const rows = all<{ id: string; sessionId: string }>(db, 'SELECT id, sessionId FROM ai_conversations WHERE sessionId IS NOT NULL')
  return new Map(rows.map((r) => [r.sessionId, r.id]))
}

export interface NewConversation {
  title?: string
  projectId?: number | null
  agentId?: string | null
  skillIds?: string[]
  model?: string
  effort?: ConvEffort
  permissionMode?: ConvPermissionMode
  sessionId?: string | null
  cwd?: string | null
  configDir?: string | null
  claudeCommand?: string
  origin?: 'rickos' | 'terminal'
  useWorktree?: boolean
  forkFrom?: string | null
  repoPath?: string | null
  worktreeBranch?: string | null
  baseRef?: string | null
  contextWindow?: number
  contextTokens?: number
  createdAt?: string
  updatedAt?: string
}

export async function createConversation(c: NewConversation): Promise<AiConversation> {
  const db = await getDb()
  const id = randomUUID()
  const now = nowIso()
  exec(
    db,
    `INSERT INTO ai_conversations (id, title, createdAt, updatedAt, projectId, agentId, skillIds, model, effort, permissionMode, sessionId, cwd, configDir, claudeCommand, origin, contextTokens,
       useWorktree, forkFrom, repoPath, worktreeBranch, baseRef, contextWindow, seenAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      c.title ?? '',
      c.createdAt ?? now,
      c.updatedAt ?? now,
      c.projectId ?? null,
      c.agentId ?? null,
      JSON.stringify(c.skillIds ?? []),
      c.model ?? '',
      c.effort ?? '',
      c.permissionMode ?? 'default',
      c.sessionId ?? null,
      c.cwd ?? null,
      c.configDir ?? null,
      c.claudeCommand ?? '',
      c.origin ?? 'rickos',
      c.contextTokens ?? 0,
      c.useWorktree ? 1 : 0,
      c.forkFrom ?? null,
      c.repoPath ?? null,
      c.worktreeBranch ?? null,
      c.baseRef ?? null,
      c.contextWindow ?? 0,
      // quem cria (ou importa) a conversa já viu o estado atual
      c.updatedAt ?? now
    ]
  )
  saveDb()
  return (await getConversation(id))!
}

export async function updateConversation(id: string, patch: AiConversationPatch): Promise<AiConversation | null> {
  const db = await getDb()
  const sets: string[] = []
  const params: P = []
  const put = (col: string, v: string | number | null): void => {
    sets.push(`${col} = ?`)
    params.push(v)
  }
  if (patch.title !== undefined) put('title', patch.title.trim())
  if (patch.projectId !== undefined) put('projectId', patch.projectId)
  if (patch.agentId !== undefined) put('agentId', patch.agentId)
  if (patch.skillIds !== undefined) put('skillIds', JSON.stringify(patch.skillIds))
  if (patch.model !== undefined) put('model', patch.model)
  if (patch.effort !== undefined) put('effort', patch.effort)
  if (patch.permissionMode !== undefined) put('permissionMode', patch.permissionMode)
  if (patch.pinned !== undefined) put('pinned', patch.pinned ? 1 : 0)
  if (patch.archived !== undefined) put('archived', patch.archived ? 1 : 0)
  if (patch.claudeCommand !== undefined) put('claudeCommand', patch.claudeCommand.trim())
  if (patch.useWorktree !== undefined) put('useWorktree', patch.useWorktree ? 1 : 0)
  if (sets.length) {
    params.push(id)
    exec(db, `UPDATE ai_conversations SET ${sets.join(', ')} WHERE id = ?`, params)
    saveDb()
  }
  return getConversation(id)
}

/** Campos que só o executor escreve (sessão, diretório, contadores). */
export async function setConversationRuntime(
  id: string,
  r: Partial<Pick<AiConversation, 'sessionId' | 'cwd' | 'contextTokens' | 'contextWindow' | 'title' | 'worktreeBranch' | 'repoPath' | 'baseRef' | 'forkFrom'>> & {
    addCost?: number
    addInput?: number
    addOutput?: number
  }
): Promise<void> {
  const db = await getDb()
  const sets: string[] = ['updatedAt = ?']
  const params: P = [nowIso()]
  for (const k of ['worktreeBranch', 'repoPath', 'baseRef', 'forkFrom'] as const) {
    if (r[k] !== undefined) {
      sets.push(`${k} = ?`)
      params.push(r[k] ?? null)
    }
  }
  if (r.sessionId !== undefined) {
    sets.push('sessionId = ?')
    params.push(r.sessionId)
  }
  if (r.cwd !== undefined) {
    sets.push('cwd = ?')
    params.push(r.cwd)
  }
  if (r.title !== undefined) {
    sets.push('title = ?')
    params.push(r.title)
  }
  if (r.contextTokens !== undefined) {
    sets.push('contextTokens = ?')
    params.push(r.contextTokens)
  }
  if (r.contextWindow !== undefined) {
    sets.push('contextWindow = ?')
    params.push(r.contextWindow)
  }
  if (r.addCost) {
    sets.push('totalCostUsd = totalCostUsd + ?')
    params.push(r.addCost)
  }
  if (r.addInput) {
    sets.push('totalInputTokens = totalInputTokens + ?')
    params.push(r.addInput)
  }
  if (r.addOutput) {
    sets.push('totalOutputTokens = totalOutputTokens + ?')
    params.push(r.addOutput)
  }
  params.push(id)
  exec(db, `UPDATE ai_conversations SET ${sets.join(', ')} WHERE id = ?`, params)
  saveDb()
}

/** Marca a conversa como vista até a última atualização (não mexe no updatedAt). */
export async function markSeen(id: string): Promise<boolean> {
  const db = await getDb()
  const r = one<{ updatedAt: string; seenAt: string | null }>(db, 'SELECT updatedAt, seenAt FROM ai_conversations WHERE id = ?', [id])
  if (!r || (r.seenAt && r.seenAt >= r.updatedAt)) return false
  exec(db, 'UPDATE ai_conversations SET seenAt = updatedAt WHERE id = ?', [id])
  saveDb()
  return true
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDb()
  exec(db, 'DELETE FROM ai_conv_turns WHERE conversationId = ?', [id])
  exec(db, 'DELETE FROM ai_conversations WHERE id = ?', [id])
  saveDb()
}

export async function listTurns(conversationId: string): Promise<AiTurn[]> {
  const db = await getDb()
  return all<TurnRow>(db, 'SELECT * FROM ai_conv_turns WHERE conversationId = ? ORDER BY id', [conversationId]).map(toTurn)
}

export async function createTurn(conversationId: string, prompt: string, attachments: string[] = []): Promise<AiTurn> {
  const db = await getDb()
  exec(db, 'INSERT INTO ai_conv_turns (conversationId, createdAt, prompt, blocks, status, attachments) VALUES (?, ?, ?, ?, ?, ?)', [
    conversationId,
    nowIso(),
    prompt,
    '[]',
    'running',
    JSON.stringify(attachments)
  ])
  const id = Number(one<{ id: number }>(db, 'SELECT last_insert_rowid() AS id')?.id ?? 0)
  saveDb()
  return toTurn(one<TurnRow>(db, 'SELECT * FROM ai_conv_turns WHERE id = ?', [id])!)
}

export async function saveTurn(t: AiTurn): Promise<void> {
  const db = await getDb()
  exec(
    db,
    `UPDATE ai_conv_turns SET prompt = ?, blocks = ?, status = ?, error = ?, costUsd = ?, inputTokens = ?, outputTokens = ?, contextTokens = ?, durationMs = ? WHERE id = ?`,
    [t.prompt, JSON.stringify(t.blocks), t.status, t.error, t.costUsd, t.inputTokens, t.outputTokens, t.contextTokens, t.durationMs, t.id]
  )
  saveDb()
}

/** Substitui todos os turnos (re-sincronização a partir do transcript do terminal). */
export async function replaceTurns(conversationId: string, turns: Omit<AiTurn, 'id' | 'conversationId'>[]): Promise<void> {
  const db = await getDb()
  db.run('BEGIN')
  try {
    exec(db, 'DELETE FROM ai_conv_turns WHERE conversationId = ?', [conversationId])
    for (const t of turns) {
      exec(
        db,
        `INSERT INTO ai_conv_turns (conversationId, createdAt, prompt, blocks, status, error, costUsd, inputTokens, outputTokens, contextTokens, durationMs, attachments)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          conversationId,
          t.createdAt,
          t.prompt,
          JSON.stringify(t.blocks),
          t.status,
          t.error,
          t.costUsd,
          t.inputTokens,
          t.outputTokens,
          t.contextTokens,
          t.durationMs,
          JSON.stringify(t.attachments ?? [])
        ]
      )
    }
    db.run('COMMIT')
  } catch (e) {
    try {
      db.run('ROLLBACK')
    } catch {
      // nada a desfazer
    }
    throw e
  }
  saveDb()
}

/** Turnos que ficaram "running" quando o servidor caiu/reiniciou. */
export async function markStaleTurnsInterrupted(): Promise<void> {
  const db = await getDb()
  const stale = one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM ai_conv_turns WHERE status = 'running'`)?.n ?? 0
  if (!stale) return
  exec(db, `UPDATE ai_conv_turns SET status = 'interrupted', error = COALESCE(error, 'O servidor foi reiniciado durante a execução.') WHERE status = 'running'`)
  saveDb()
}
