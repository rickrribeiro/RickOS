import crypto from 'crypto'
import type { Database } from 'sql.js'
import type {
  MemoryCategory,
  MemoryDetail,
  MemoryEvidence,
  MemoryFilter,
  MemoryInput,
  MemoryOrigin,
  MemoryPage,
  MemoryRelation,
  MemoryRevision,
  MemoryStatus,
  PersonalMemory,
  RelationKind,
  Reliability,
  Sensitivity
} from '../../shared/memory'
import { MEMORY_LAYERS, MEMORY_STATUSES, MEMORY_TYPES, RELATION_KINDS, SENSITIVITIES, STABILITIES, defaultLayer, maxSensitivity, normText } from '../../shared/memory'
import { getDb, saveDb } from '../database/db'

/**
 * Banco da Memória Pessoal. Toda função recebe o `owner` resolvido pelo SERVIDOR
 * (`currentOwner()`), nunca vindo do cliente, e filtra por ele.
 *
 * Atenção: o `db.export()` do sql.js reabre a conexão e o `PRAGMA foreign_keys` se perde,
 * então ON DELETE CASCADE não é confiável — exclusões apagam os derivados explicitamente.
 */
type P = (string | number | null | Uint8Array)[]

export function all<T>(db: Database, sql: string, params: P = []): T[] {
  const st = db.prepare(sql)
  if (params.length) st.bind(params as never)
  const out: T[] = []
  while (st.step()) out.push(st.getAsObject() as T)
  st.free()
  return out
}
export function one<T>(db: Database, sql: string, params: P = []): T | null {
  return all<T>(db, sql, params)[0] ?? null
}
export function exec(db: Database, sql: string, params: P = []): number {
  const st = db.prepare(sql)
  st.run(params as never)
  st.free()
  return db.getRowsModified()
}
export function lastId(db: Database): number {
  return Number(one<{ id: number }>(db, 'SELECT last_insert_rowid() AS id')?.id ?? 0)
}

/** Transação síncrona (sql.js é single-thread: nada intercala dentro de `fn`) + save. */
export async function tx<T>(fn: (db: Database) => T): Promise<T> {
  const db = await getDb()
  db.run('BEGIN')
  try {
    const r = fn(db)
    db.run('COMMIT')
    saveDb()
    return r
  } catch (e) {
    try {
      db.run('ROLLBACK')
    } catch {
      // nada a desfazer
    }
    throw e
  }
}
export async function read<T>(fn: (db: Database) => T): Promise<T> {
  return fn(await getDb())
}

export const nowIso = (): string => new Date().toISOString()
export const sha = (s: string): string => crypto.createHash('sha256').update(s).digest('hex')
export const jparse = <T>(s: unknown, fb: T): T => {
  if (typeof s !== 'string' || !s) return fb
  try {
    return JSON.parse(s) as T
  } catch {
    return fb
  }
}

/** Dono dos dados. App de um usuário só; centralizado aqui para isolamento e testes. */
export function currentOwner(): string {
  return 'me'
}

export class MemoryError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'invalid' | 'conflict' | 'forbidden' = 'invalid'
  ) {
    super(message)
  }
}

// ── Validação ────────────────────────────────────────────────────────────────

const oneOf = <T extends string>(list: readonly T[], v: unknown, fb: T): T => (list.includes(v as T) ? (v as T) : fb)
const clampInt = (v: unknown, lo: number, hi: number, fb: number): number => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fb
}
const isoOrNull = (v: unknown): string | null => {
  if (v == null || v === '') return null
  const s = String(v).trim()
  return /^\d{4}-\d{2}(-\d{2})?(T[\d:.]+Z?)?$/.test(s) ? s : null
}
export function cleanTags(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out = new Set<string>()
  for (const t of v) {
    const s = String(t ?? '').trim().toLowerCase().replace(/\s+/g, '-').slice(0, 40)
    if (s) out.add(s)
    if (out.size >= 12) break
  }
  return [...out]
}
const MAX_CONTENT = 2000
const MAX_TITLE = 140

/** Título curto a partir do conteúdo, quando o usuário não dá um. */
export function deriveTitle(content: string): string {
  const first = content.split(/[\n.!?]/)[0]?.trim() || content.trim()
  return first.length > 80 ? `${first.slice(0, 77)}…` : first
}

// ── Categorias ───────────────────────────────────────────────────────────────

export const SEED_CATEGORIES: { slug: string; name: string; icon: string; sens: Sensitivity; description: string }[] = [
  { slug: 'identidade', name: 'Identidade', icon: '🪪', sens: 'NORMAL', description: 'Quem sou: nome, idiomas, onde moro, papéis.' },
  { slug: 'historia', name: 'História pessoal', icon: '📜', sens: 'PRIVATE', description: 'Marcos e trajetória de vida.' },
  { slug: 'valores', name: 'Valores', icon: '🧭', sens: 'NORMAL', description: 'O que considero importante.' },
  { slug: 'perfil-cognitivo', name: 'Perfil cognitivo', icon: '🧠', sens: 'NORMAL', description: 'Como penso, aprendo e decido.' },
  { slug: 'personalidade', name: 'Personalidade', icon: '🎭', sens: 'NORMAL', description: 'Traços e jeito de ser.' },
  { slug: 'preferencias', name: 'Preferências', icon: '⭐', sens: 'NORMAL', description: 'Gostos e escolhas gerais.' },
  { slug: 'interesses', name: 'Interesses', icon: '🎯', sens: 'NORMAL', description: 'Assuntos e hobbies.' },
  { slug: 'profissional', name: 'Profissional', icon: '💼', sens: 'NORMAL', description: 'Carreira, função, experiência.' },
  { slug: 'educacao', name: 'Educação', icon: '🎓', sens: 'NORMAL', description: 'Formação e estudos.' },
  { slug: 'objetivos', name: 'Objetivos', icon: '🚀', sens: 'NORMAL', description: 'Metas de curto e longo prazo.' },
  { slug: 'rotina', name: 'Hábitos e rotina', icon: '🔁', sens: 'NORMAL', description: 'Como é meu dia a dia.' },
  { slug: 'produtividade', name: 'Produtividade', icon: '⚡', sens: 'NORMAL', description: 'Como trabalho melhor.' },
  { slug: 'viagens', name: 'Viagens', icon: '✈️', sens: 'NORMAL', description: 'Preferências e experiências de viagem.' },
  { slug: 'financas', name: 'Finanças', icon: '💰', sens: 'PRIVATE', description: 'Relação com dinheiro, orçamento.' },
  { slug: 'relacionamentos', name: 'Relacionamentos', icon: '🤝', sens: 'PRIVATE', description: 'Pessoas e vínculos.' },
  { slug: 'saude', name: 'Saúde e bem-estar', icon: '🩺', sens: 'PRIVATE', description: 'Saúde física e mental.' },
  { slug: 'aprendizados', name: 'Aprendizados', icon: '💡', sens: 'NORMAL', description: 'Lições e padrões percebidos.' },
  { slug: 'instrucoes-ia', name: 'Instruções para IA', icon: '🤖', sens: 'NORMAL', description: 'Como quero que a IA trabalhe comigo.' }
]

const seeded = new Set<string>()
/** Semeia as categorias iniciais uma vez por dono (idempotente: UNIQUE(ownerId, slug)). */
export async function ensureSeeded(owner: string): Promise<void> {
  if (seeded.has(owner)) return
  const db = await getDb()
  const has = one<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM memory_categories WHERE ownerId = ?', [owner])?.n ?? 0
  if (!has) {
    await tx((d) => {
      const now = nowIso()
      SEED_CATEGORIES.forEach((c, i) =>
        exec(
          d,
          `INSERT OR IGNORE INTO memory_categories (ownerId, slug, name, icon, description, defaultSensitivity, sortOrder, createdAt, updatedAt)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [owner, c.slug, c.name, c.icon, c.description, c.sens, i, now, now]
        )
      )
    })
  }
  seeded.add(owner)
}
/** Testes: força nova semeadura depois de limpar tabelas. */
export function resetSeedCache(): void {
  seeded.clear()
}

interface CatRow {
  id: number
  slug: string
  name: string
  icon: string
  description: string
  defaultSensitivity: string
  sortOrder: number
  archivedAt: string | null
  memoryCount?: number
}
const toCategory = (r: CatRow): MemoryCategory => ({
  id: Number(r.id),
  slug: r.slug,
  name: r.name,
  icon: r.icon,
  description: r.description,
  defaultSensitivity: oneOf(SENSITIVITIES, r.defaultSensitivity, 'NORMAL'),
  sortOrder: Number(r.sortOrder),
  archivedAt: r.archivedAt,
  memoryCount: r.memoryCount != null ? Number(r.memoryCount) : undefined
})

export function categoriesSync(db: Database, owner: string, includeArchived = true): MemoryCategory[] {
  return all<CatRow>(
    db,
    `SELECT c.*, (SELECT COUNT(*) FROM memories m WHERE m.categoryId = c.id AND m.ownerId = c.ownerId AND m.status NOT IN ('archived','superseded')) AS memoryCount
     FROM memory_categories c WHERE c.ownerId = ? ${includeArchived ? '' : 'AND c.archivedAt IS NULL'} ORDER BY c.sortOrder, c.name`,
    [owner]
  ).map(toCategory)
}

export async function listCategories(owner: string, includeArchived = true): Promise<MemoryCategory[]> {
  await ensureSeeded(owner)
  return read((db) => categoriesSync(db, owner, includeArchived))
}

export function categoryBySlug(db: Database, owner: string, slug: string): MemoryCategory | null {
  const r = one<CatRow>(db, 'SELECT * FROM memory_categories WHERE ownerId = ? AND slug = ?', [owner, slug])
  return r ? toCategory(r) : null
}
function categoryById(db: Database, owner: string, id: number | null): MemoryCategory | null {
  if (id == null) return null
  const r = one<CatRow>(db, 'SELECT * FROM memory_categories WHERE ownerId = ? AND id = ?', [owner, id])
  return r ? toCategory(r) : null
}

export function slugify(s: string): string {
  return normText(s).replace(/\s+/g, '-').slice(0, 40) || 'categoria'
}

export interface CategoryInput {
  name: string
  icon?: string
  description?: string
  defaultSensitivity?: Sensitivity
}

export async function createCategory(owner: string, input: CategoryInput): Promise<MemoryCategory> {
  await ensureSeeded(owner)
  const name = String(input.name ?? '').trim().slice(0, 60)
  if (!name) throw new MemoryError('Nome da categoria é obrigatório.')
  return tx((db) => {
    let slug = slugify(name)
    for (let i = 2; categoryBySlug(db, owner, slug); i++) slug = `${slugify(name)}-${i}`
    const order = (one<{ m: number }>(db, 'SELECT MAX(sortOrder) AS m FROM memory_categories WHERE ownerId = ?', [owner])?.m ?? 0) + 1
    const now = nowIso()
    exec(
      db,
      `INSERT INTO memory_categories (ownerId, slug, name, icon, description, defaultSensitivity, sortOrder, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?)`,
      [owner, slug, name, String(input.icon ?? '•').slice(0, 8) || '•', String(input.description ?? '').slice(0, 300), oneOf(SENSITIVITIES, input.defaultSensitivity, 'NORMAL'), order, now, now]
    )
    return categoryById(db, owner, lastId(db))!
  })
}

export async function updateCategory(owner: string, id: number, input: Partial<CategoryInput> & { archived?: boolean }): Promise<MemoryCategory> {
  return tx((db) => {
    const cur = categoryById(db, owner, id)
    if (!cur) throw new MemoryError('Categoria não encontrada.', 'not_found')
    const name = input.name != null ? String(input.name).trim().slice(0, 60) || cur.name : cur.name
    const archivedAt = input.archived == null ? cur.archivedAt : input.archived ? cur.archivedAt ?? nowIso() : null
    exec(
      db,
      `UPDATE memory_categories SET name = ?, icon = ?, description = ?, defaultSensitivity = ?, archivedAt = ?, updatedAt = ? WHERE id = ? AND ownerId = ?`,
      [
        name,
        input.icon != null ? String(input.icon).slice(0, 8) || '•' : cur.icon,
        input.description != null ? String(input.description).slice(0, 300) : cur.description,
        input.defaultSensitivity ? oneOf(SENSITIVITIES, input.defaultSensitivity, cur.defaultSensitivity) : cur.defaultSensitivity,
        archivedAt,
        nowIso(),
        id,
        owner
      ]
    )
    return categoryById(db, owner, id)!
  })
}

export async function reorderCategories(owner: string, ids: number[]): Promise<void> {
  await tx((db) => {
    // os ids informados vêm primeiro, na ordem dada; as demais mantêm a ordem relativa depois
    const rest = all<{ id: number }>(db, 'SELECT id FROM memory_categories WHERE ownerId = ? ORDER BY sortOrder, name', [owner])
      .map((r) => Number(r.id))
      .filter((id) => !ids.includes(id))
    ;[...ids.map(Number), ...rest].forEach((id, i) => exec(db, 'UPDATE memory_categories SET sortOrder = ? WHERE id = ? AND ownerId = ?', [i, id, owner]))
  })
}

// ── Memórias ─────────────────────────────────────────────────────────────────

interface MemRow {
  id: number
  title: string
  content: string
  categoryId: number | null
  tags: string
  type: string
  layer: string
  status: string
  pinned: number
  importance: number
  extractionConfidence: number | null
  reliability: string
  stability: string
  origin: string
  originRef: string | null
  scope: string
  sensitivity: string
  catSensitivity?: string | null
  occurredAt: string | null
  validFrom: string | null
  validUntil: string | null
  confirmedAt: string | null
  lastUsedAt: string | null
  useCount: number
  version: number
  supersededById: number | null
  createdAt: string
  updatedAt: string
  embeddingModel: string | null
}

export const MEM_SELECT = `SELECT m.id, m.title, m.content, m.categoryId, m.tags, m.type, m.layer, m.status, m.pinned, m.importance,
  m.extractionConfidence, m.reliability, m.stability, m.origin, m.originRef, m.scope, m.sensitivity, c.defaultSensitivity AS catSensitivity,
  m.occurredAt, m.validFrom, m.validUntil, m.confirmedAt, m.lastUsedAt, m.useCount, m.version, m.supersededById, m.createdAt, m.updatedAt, m.embeddingModel
  FROM memories m LEFT JOIN memory_categories c ON c.id = m.categoryId AND c.ownerId = m.ownerId`

export function toMemory(r: MemRow): PersonalMemory {
  const sensitivity = oneOf(SENSITIVITIES, r.sensitivity, 'NORMAL')
  const cat = r.catSensitivity ? oneOf(SENSITIVITIES, r.catSensitivity, 'NORMAL') : 'NORMAL'
  const type = oneOf(MEMORY_TYPES, r.type, 'FACT')
  return {
    id: Number(r.id),
    title: r.title,
    content: r.content,
    categoryId: r.categoryId == null ? null : Number(r.categoryId),
    tags: jparse<string[]>(r.tags, []),
    type,
    layer: oneOf(MEMORY_LAYERS, r.layer, defaultLayer(type)),
    status: oneOf(MEMORY_STATUSES, r.status, 'active'),
    pinned: !!r.pinned,
    importance: Number(r.importance),
    extractionConfidence: r.extractionConfidence == null ? null : Number(r.extractionConfidence),
    reliability: (['stated', 'observed', 'inferred'] as const).includes(r.reliability as Reliability) ? (r.reliability as Reliability) : 'stated',
    stability: oneOf(STABILITIES, r.stability, 'stable'),
    origin: r.origin as MemoryOrigin,
    originRef: r.originRef,
    scope: r.scope,
    sensitivity,
    effectiveSensitivity: maxSensitivity(sensitivity, cat),
    occurredAt: r.occurredAt,
    validFrom: r.validFrom,
    validUntil: r.validUntil,
    confirmedAt: r.confirmedAt,
    lastUsedAt: r.lastUsedAt,
    useCount: Number(r.useCount),
    version: Number(r.version),
    supersededById: r.supersededById == null ? null : Number(r.supersededById),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    embeddingModel: r.embeddingModel
  }
}

export function memorySync(db: Database, owner: string, id: number): PersonalMemory | null {
  const r = one<MemRow>(db, `${MEM_SELECT} WHERE m.ownerId = ? AND m.id = ?`, [owner, id])
  return r ? toMemory(r) : null
}

/** Marca como expiradas as memórias ativas cuja validade passou (com revisão). */
export function expireDueSync(db: Database, owner: string, now = nowIso()): number {
  const due = all<{ id: number }>(db, `SELECT id FROM memories WHERE ownerId = ? AND status IN ('active','unconfirmed') AND validUntil IS NOT NULL AND validUntil < ?`, [owner, now])
  for (const { id } of due) setStatusSync(db, owner, Number(id), 'expired', { actor: 'system', reason: 'Validade expirou' })
  return due.length
}

function searchTextOf(title: string, content: string, tags: string[]): string {
  return normText(`${title} ${content} ${tags.join(' ')}`)
}

export async function listMemories(owner: string, f: MemoryFilter = {}): Promise<MemoryPage> {
  await ensureSeeded(owner)
  const db = await getDb()
  if (expireDueSync(db, owner) > 0) saveDb()
  const where: string[] = ['m.ownerId = ?']
  const params: P = [owner]
  const status = f.status ?? 'live'
  if (status === 'all') {
    // tudo
  } else if ((status as string) === 'live' || status == null) {
    where.push(`m.status IN ('active','unconfirmed','outdated')`)
  } else {
    where.push('m.status = ?')
    params.push(oneOf(MEMORY_STATUSES, status, 'active'))
  }
  if (f.categoryId != null) {
    where.push('m.categoryId = ?')
    params.push(Number(f.categoryId))
  }
  if (f.type) {
    where.push('m.type = ?')
    params.push(oneOf(MEMORY_TYPES, f.type, 'FACT'))
  }
  if (f.sensitivity) {
    where.push('m.sensitivity = ?')
    params.push(oneOf(SENSITIVITIES, f.sensitivity, 'NORMAL'))
  }
  if (f.pinned) where.push('m.pinned = 1')
  if (f.tag) {
    where.push('m.tags LIKE ?')
    params.push(`%${JSON.stringify(String(f.tag).toLowerCase()).slice(0, 42)}%`)
  }
  if (f.q?.trim()) {
    for (const term of normText(f.q).split(' ').filter(Boolean).slice(0, 8)) {
      where.push('m.searchText LIKE ?')
      params.push(`%${term}%`)
    }
  }
  const order =
    f.sort === 'importance'
      ? 'm.pinned DESC, m.importance DESC, m.updatedAt DESC'
      : f.sort === 'used'
        ? 'm.useCount DESC, m.lastUsedAt DESC'
        : f.sort === 'title'
          ? 'm.title COLLATE NOCASE'
          : 'm.pinned DESC, m.updatedAt DESC'
  const limit = clampInt(f.limit, 1, 500, 100)
  const offset = clampInt(f.offset, 0, 1e9, 0)
  const w = where.join(' AND ')
  const total = one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM memories m WHERE ${w}`, params)?.n ?? 0
  const items = all<MemRow>(db, `${MEM_SELECT} WHERE ${w} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]).map(toMemory)
  return { items, total: Number(total) }
}

export async function getMemory(owner: string, id: number): Promise<PersonalMemory | null> {
  return read((db) => memorySync(db, owner, id))
}

interface RevRow {
  id: number
  memoryId: number
  version: number
  changeKind: string
  actor: string
  reason: string | null
  suggestionId: number | null
  snapshot: string | null
  createdAt: string
}
interface EvRow {
  id: number
  memoryId: number | null
  suggestionId: number | null
  sourceKind: string
  sourceRef: string | null
  excerpt: string
  contentHash: string
  createdAt: string
}
export const toEvidence = (r: EvRow): MemoryEvidence => ({
  id: Number(r.id),
  memoryId: r.memoryId == null ? null : Number(r.memoryId),
  suggestionId: r.suggestionId == null ? null : Number(r.suggestionId),
  sourceKind: r.sourceKind,
  sourceRef: r.sourceRef,
  excerpt: r.excerpt,
  contentHash: r.contentHash,
  createdAt: r.createdAt
})

export function revisionsSync(db: Database, owner: string, memoryId: number): MemoryRevision[] {
  return all<RevRow>(db, 'SELECT * FROM memory_revisions WHERE ownerId = ? AND memoryId = ? ORDER BY id DESC', [owner, memoryId]).map((r) => ({
    id: Number(r.id),
    memoryId: Number(r.memoryId),
    version: Number(r.version),
    changeKind: r.changeKind,
    actor: (r.actor as MemoryRevision['actor']) ?? 'user',
    reason: r.reason,
    suggestionId: r.suggestionId == null ? null : Number(r.suggestionId),
    snapshot: jparse(r.snapshot, null),
    createdAt: r.createdAt
  }))
}

export function relationsSync(db: Database, owner: string, memoryId: number): MemoryRelation[] {
  const rows = all<{ id: number; fromId: number; toId: number; kind: string; note: string | null; createdAt: string; otherTitle: string; otherId: number; direction: string }>(
    db,
    `SELECT r.id, r.fromId, r.toId, r.kind, r.note, r.createdAt, m.title AS otherTitle, m.id AS otherId, 'out' AS direction
       FROM memory_relations r JOIN memories m ON m.id = r.toId AND m.ownerId = r.ownerId WHERE r.ownerId = ? AND r.fromId = ?
     UNION ALL
     SELECT r.id, r.fromId, r.toId, r.kind, r.note, r.createdAt, m.title, m.id, 'in'
       FROM memory_relations r JOIN memories m ON m.id = r.fromId AND m.ownerId = r.ownerId WHERE r.ownerId = ? AND r.toId = ?`,
    [owner, memoryId, owner, memoryId]
  )
  return rows.map((r) => ({
    id: Number(r.id),
    fromId: Number(r.fromId),
    toId: Number(r.toId),
    kind: oneOf(RELATION_KINDS, r.kind, 'RELATED_TO'),
    note: r.note,
    createdAt: r.createdAt,
    otherTitle: r.otherTitle,
    otherId: Number(r.otherId),
    direction: r.direction as 'out' | 'in'
  }))
}

export async function getMemoryDetail(owner: string, id: number): Promise<MemoryDetail | null> {
  return read((db) => {
    const memory = memorySync(db, owner, id)
    if (!memory) return null
    return {
      memory,
      category: categoryById(db, owner, memory.categoryId),
      revisions: revisionsSync(db, owner, id),
      evidence: all<EvRow>(db, 'SELECT * FROM memory_evidence WHERE ownerId = ? AND memoryId = ? ORDER BY id DESC', [owner, id]).map(toEvidence),
      relations: relationsSync(db, owner, id)
    }
  })
}

export interface WriteMeta {
  origin?: MemoryOrigin
  originRef?: string | null
  reliability?: Reliability
  extractionConfidence?: number | null
  /** Confirmada pelo usuário agora (criação manual / aprovação). */
  confirmed?: boolean
  status?: MemoryStatus
  actor?: 'user' | 'agent' | 'system'
  reason?: string | null
  suggestionId?: number | null
  evidence?: { sourceKind: string; sourceRef?: string | null; excerpt: string }[]
}

function revision(db: Database, owner: string, memoryId: number, version: number, kind: string, snapshot: PersonalMemory | null, meta: WriteMeta): void {
  exec(db, `INSERT INTO memory_revisions (ownerId, memoryId, version, changeKind, actor, reason, suggestionId, snapshot, createdAt) VALUES (?,?,?,?,?,?,?,?,?)`, [
    owner,
    memoryId,
    version,
    kind,
    meta.actor ?? 'user',
    meta.reason ?? null,
    meta.suggestionId ?? null,
    snapshot ? JSON.stringify(snapshot) : null,
    nowIso()
  ])
}

export function addEvidenceSync(db: Database, owner: string, target: { memoryId?: number | null; suggestionId?: number | null }, ev: { sourceKind: string; sourceRef?: string | null; excerpt: string }): void {
  const excerpt = String(ev.excerpt ?? '').trim().slice(0, 2000)
  if (!excerpt) return
  exec(db, `INSERT INTO memory_evidence (ownerId, memoryId, suggestionId, sourceKind, sourceRef, excerpt, contentHash, createdAt) VALUES (?,?,?,?,?,?,?,?)`, [
    owner,
    target.memoryId ?? null,
    target.suggestionId ?? null,
    String(ev.sourceKind).slice(0, 40),
    ev.sourceRef ? String(ev.sourceRef).slice(0, 200) : null,
    excerpt,
    sha(excerpt),
    nowIso()
  ])
}

/** Valida e normaliza a entrada de uma memória. */
export function normalizeInput(db: Database, owner: string, input: MemoryInput, base?: PersonalMemory): Omit<MemoryInput, 'categoryId'> & { categoryId: number | null; title: string; content: string; tags: string[] } {
  const content = String(input.content ?? base?.content ?? '').trim().slice(0, MAX_CONTENT)
  if (!content) throw new MemoryError('O conteúdo da memória é obrigatório.')
  const title = (String(input.title ?? '').trim() || (base && input.title === undefined ? base.title : deriveTitle(content))).slice(0, MAX_TITLE)
  let categoryId = input.categoryId === undefined ? base?.categoryId ?? null : input.categoryId
  if (categoryId != null && !categoryById(db, owner, Number(categoryId))) throw new MemoryError('Categoria inválida.')
  categoryId = categoryId == null ? null : Number(categoryId)
  const type = oneOf(MEMORY_TYPES, input.type ?? base?.type, 'FACT')
  return {
    title,
    content,
    categoryId,
    tags: input.tags === undefined ? base?.tags ?? [] : cleanTags(input.tags),
    type,
    layer: oneOf(MEMORY_LAYERS, input.layer ?? (input.type && input.type !== base?.type ? undefined : base?.layer), defaultLayer(type)),
    pinned: input.pinned ?? base?.pinned ?? false,
    importance: clampInt(input.importance ?? base?.importance, 1, 5, 3),
    stability: oneOf(STABILITIES, input.stability ?? base?.stability, 'stable'),
    scope: String(input.scope ?? base?.scope ?? 'geral').trim().slice(0, 60) || 'geral',
    sensitivity: oneOf(SENSITIVITIES, input.sensitivity ?? base?.sensitivity, 'NORMAL'),
    occurredAt: input.occurredAt === undefined ? base?.occurredAt ?? null : isoOrNull(input.occurredAt),
    validFrom: input.validFrom === undefined ? base?.validFrom ?? null : isoOrNull(input.validFrom),
    validUntil: input.validUntil === undefined ? base?.validUntil ?? null : isoOrNull(input.validUntil)
  }
}

export function createMemorySync(db: Database, owner: string, input: MemoryInput, meta: WriteMeta = {}): PersonalMemory {
  const v = normalizeInput(db, owner, input)
  const now = nowIso()
  const status = meta.status ?? 'active'
  exec(
    db,
    `INSERT INTO memories (ownerId, title, content, categoryId, tags, type, layer, status, pinned, importance, extractionConfidence, reliability, stability,
      origin, originRef, scope, sensitivity, occurredAt, validFrom, validUntil, confirmedAt, normKey, searchText, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      owner,
      v.title,
      v.content,
      v.categoryId,
      JSON.stringify(v.tags),
      v.type!,
      v.layer!,
      status,
      v.pinned ? 1 : 0,
      v.importance!,
      meta.extractionConfidence ?? null,
      meta.reliability ?? 'stated',
      v.stability!,
      meta.origin ?? 'manual',
      meta.originRef ?? null,
      v.scope!,
      v.sensitivity!,
      v.occurredAt ?? null,
      v.validFrom ?? null,
      v.validUntil ?? null,
      meta.confirmed === false ? null : now,
      normText(v.content),
      searchTextOf(v.title, v.content, v.tags),
      now,
      now
    ]
  )
  const id = lastId(db)
  revision(db, owner, id, 1, 'create', null, meta)
  for (const ev of meta.evidence ?? []) addEvidenceSync(db, owner, { memoryId: id }, ev)
  return memorySync(db, owner, id)!
}

export async function createMemory(owner: string, input: MemoryInput, meta: WriteMeta = {}): Promise<PersonalMemory> {
  await ensureSeeded(owner)
  return tx((db) =>
    createMemorySync(db, owner, input, {
      origin: 'manual',
      reliability: 'stated',
      confirmed: true,
      ...meta,
      evidence: meta.evidence ?? [{ sourceKind: 'manual', excerpt: input.content }]
    })
  )
}

/**
 * Atualiza com concorrência otimista (`expectedVersion`). O estado anterior vai para o
 * histórico. Mudança de conteúdo feita pelo usuário reconfirma a memória.
 */
export function updateMemorySync(db: Database, owner: string, id: number, patch: MemoryInput, meta: WriteMeta & { expectedVersion?: number } = {}): PersonalMemory {
  const cur = memorySync(db, owner, id)
  if (!cur) throw new MemoryError('Memória não encontrada.', 'not_found')
  if (meta.expectedVersion != null && meta.expectedVersion !== cur.version) throw new MemoryError('A memória foi alterada em outro lugar. Recarregue e tente de novo.', 'conflict')
  const v = normalizeInput(db, owner, { ...patch, content: patch.content ?? cur.content }, cur)
  const now = nowIso()
  const userEdit = (meta.actor ?? 'user') === 'user'
  const n = exec(
    db,
    `UPDATE memories SET title=?, content=?, categoryId=?, tags=?, type=?, layer=?, pinned=?, importance=?, stability=?, scope=?, sensitivity=?,
       occurredAt=?, validFrom=?, validUntil=?, normKey=?, searchText=?, reliability=?, confirmedAt=?, status=?, version=version+1, updatedAt=?,
       embedding=NULL, embeddingModel=NULL, embeddingVersion=NULL, embeddedAt=NULL
     WHERE id=? AND ownerId=? AND version=?`,
    [
      v.title,
      v.content,
      v.categoryId,
      JSON.stringify(v.tags),
      v.type!,
      v.layer!,
      v.pinned ? 1 : 0,
      v.importance!,
      v.stability!,
      v.scope!,
      v.sensitivity!,
      v.occurredAt ?? null,
      v.validFrom ?? null,
      v.validUntil ?? null,
      normText(v.content),
      searchTextOf(v.title, v.content, v.tags),
      meta.reliability ?? (userEdit ? 'stated' : cur.reliability),
      userEdit || meta.confirmed ? now : cur.confirmedAt,
      meta.status ?? (cur.status === 'expired' && (!v.validUntil || v.validUntil > now) ? 'active' : cur.status),
      now,
      id,
      owner,
      cur.version
    ]
  )
  if (!n) throw new MemoryError('Conflito de versão.', 'conflict')
  revision(db, owner, id, cur.version + 1, 'update', cur, meta)
  for (const ev of meta.evidence ?? []) addEvidenceSync(db, owner, { memoryId: id }, ev)
  return memorySync(db, owner, id)!
}

export async function updateMemory(owner: string, id: number, patch: MemoryInput, meta: WriteMeta & { expectedVersion?: number } = {}): Promise<PersonalMemory> {
  return tx((db) => updateMemorySync(db, owner, id, patch, meta))
}

export function setStatusSync(db: Database, owner: string, id: number, status: MemoryStatus, meta: WriteMeta & { supersededById?: number | null } = {}): PersonalMemory {
  const cur = memorySync(db, owner, id)
  if (!cur) throw new MemoryError('Memória não encontrada.', 'not_found')
  if (cur.status === status) return cur
  exec(db, 'UPDATE memories SET status=?, supersededById=?, version=version+1, updatedAt=? WHERE id=? AND ownerId=?', [
    status,
    status === 'superseded' ? meta.supersededById ?? cur.supersededById : null,
    nowIso(),
    id,
    owner
  ])
  revision(db, owner, id, cur.version + 1, `status:${status}`, cur, meta)
  return memorySync(db, owner, id)!
}

export async function setStatus(owner: string, id: number, status: MemoryStatus, meta: WriteMeta = {}): Promise<PersonalMemory> {
  return tx((db) => setStatusSync(db, owner, id, oneOf(MEMORY_STATUSES, status, 'active'), meta))
}

/** Usuário confirma que a memória continua verdadeira. */
export async function confirmMemory(owner: string, id: number): Promise<PersonalMemory> {
  return tx((db) => {
    const cur = memorySync(db, owner, id)
    if (!cur) throw new MemoryError('Memória não encontrada.', 'not_found')
    const now = nowIso()
    const status = cur.status === 'unconfirmed' || cur.status === 'outdated' ? 'active' : cur.status
    exec(db, 'UPDATE memories SET confirmedAt=?, status=?, version=version+1, updatedAt=? WHERE id=? AND ownerId=?', [now, status, now, id, owner])
    revision(db, owner, id, cur.version + 1, 'confirm', cur, { actor: 'user' })
    return memorySync(db, owner, id)!
  })
}

export async function setPinned(owner: string, id: number, pinned: boolean): Promise<PersonalMemory> {
  return tx((db) => {
    const cur = memorySync(db, owner, id)
    if (!cur) throw new MemoryError('Memória não encontrada.', 'not_found')
    if (cur.pinned === pinned) return cur
    exec(db, 'UPDATE memories SET pinned=?, version=version+1, updatedAt=? WHERE id=? AND ownerId=?', [pinned ? 1 : 0, nowIso(), id, owner])
    revision(db, owner, id, cur.version + 1, pinned ? 'pin' : 'unpin', cur, { actor: 'user' })
    return memorySync(db, owner, id)!
  })
}

/**
 * Exclusão DEFINITIVA: apaga a memória e todos os derivados (revisões, evidências,
 * relações, embedding) e remove o id de sugestões/usos. Fica só um tombstone sem conteúdo.
 */
export function hardDeleteSync(db: Database, owner: string, id: number): boolean {
  const cur = one<{ id: number }>(db, 'SELECT id FROM memories WHERE id = ? AND ownerId = ?', [id, owner])
  if (!cur) return false
  exec(db, 'DELETE FROM memory_revisions WHERE memoryId = ? AND ownerId = ?', [id, owner])
  exec(db, 'DELETE FROM memory_evidence WHERE memoryId = ? AND ownerId = ?', [id, owner])
  exec(db, 'DELETE FROM memory_relations WHERE (fromId = ? OR toId = ?) AND ownerId = ?', [id, id, owner])
  exec(db, 'UPDATE memories SET supersededById = NULL WHERE supersededById = ? AND ownerId = ?', [id, owner])
  // sugestões que apontavam para ela: o snapshot guardava o conteúdo → limpa
  const sugs = all<{ id: number; targetIds: string; resultMemoryIds: string; status: string }>(
    db,
    `SELECT id, targetIds, resultMemoryIds, status FROM memory_suggestions WHERE ownerId = ? AND (targetIds LIKE ? OR resultMemoryIds LIKE ?)`,
    [owner, `%${id}%`, `%${id}%`]
  )
  for (const s of sugs) {
    const t = jparse<number[]>(s.targetIds, [])
    const r = jparse<number[]>(s.resultMemoryIds, [])
    if (!t.includes(id) && !r.includes(id)) continue
    const open = s.status === 'pending' || s.status === 'snoozed' || s.status === 'needs_info'
    exec(db, `UPDATE memory_suggestions SET targetIds=?, resultMemoryIds=?, targetSnapshot='[]', undo=NULL, status=?, updatedAt=? WHERE id=? AND ownerId=?`, [
      JSON.stringify(t.filter((x) => x !== id)),
      JSON.stringify(r.filter((x) => x !== id)),
      open && t.includes(id) ? 'superseded' : s.status,
      nowIso(),
      s.id,
      owner
    ])
  }
  // traces do Inspector: tira o id (não guardam conteúdo, mas não devem apontar para o excluído)
  const uses = all<{ id: number; selected: string; discarded: string }>(db, 'SELECT id, selected, discarded FROM memory_usage WHERE ownerId = ? AND (selected LIKE ? OR discarded LIKE ?)', [
    owner,
    `%"id":${id}%`,
    `%"id":${id}%`
  ])
  for (const u of uses) {
    const strip = (s: string): string => JSON.stringify(jparse<{ id: number }[]>(s, []).filter((x) => x.id !== id))
    const disc = jparse<{ items?: { id: number }[]; policy?: unknown }>(u.discarded, {})
    const discarded = JSON.stringify({ ...disc, items: (Array.isArray(disc.items) ? disc.items : []).filter((x) => x.id !== id) })
    exec(db, 'UPDATE memory_usage SET selected=?, discarded=? WHERE id=?', [strip(u.selected), discarded, u.id])
  }
  exec(db, 'DELETE FROM memories WHERE id = ? AND ownerId = ?', [id, owner])
  exec(db, 'INSERT INTO memory_tombstones (ownerId, memoryId, deletedAt) VALUES (?,?,?)', [owner, id, nowIso()])
  return true
}

export async function hardDelete(owner: string, id: number): Promise<boolean> {
  return tx((db) => hardDeleteSync(db, owner, id))
}

// ── Relações ─────────────────────────────────────────────────────────────────

export function addRelationSync(db: Database, owner: string, fromId: number, toId: number, kind: RelationKind, note: string | null = null): void {
  if (fromId === toId) throw new MemoryError('Uma memória não se relaciona com ela mesma.')
  if (!memorySync(db, owner, fromId) || !memorySync(db, owner, toId)) throw new MemoryError('Memória não encontrada.', 'not_found')
  exec(db, 'INSERT OR IGNORE INTO memory_relations (ownerId, fromId, toId, kind, note, createdAt) VALUES (?,?,?,?,?,?)', [
    owner,
    fromId,
    toId,
    oneOf(RELATION_KINDS, kind, 'RELATED_TO'),
    note ? String(note).slice(0, 300) : null,
    nowIso()
  ])
}
export async function addRelation(owner: string, fromId: number, toId: number, kind: RelationKind, note?: string | null): Promise<void> {
  await tx((db) => addRelationSync(db, owner, fromId, toId, kind, note ?? null))
}
export async function removeRelation(owner: string, relationId: number): Promise<void> {
  await tx((db) => exec(db, 'DELETE FROM memory_relations WHERE id = ? AND ownerId = ?', [relationId, owner]))
}

/** Todas as relações (para a visão de Conexões). */
export async function allRelations(owner: string): Promise<{ id: number; fromId: number; toId: number; kind: RelationKind }[]> {
  return read((db) =>
    all<{ id: number; fromId: number; toId: number; kind: string }>(db, 'SELECT id, fromId, toId, kind FROM memory_relations WHERE ownerId = ?', [owner]).map((r) => ({
      id: Number(r.id),
      fromId: Number(r.fromId),
      toId: Number(r.toId),
      kind: oneOf(RELATION_KINDS, r.kind, 'RELATED_TO')
    }))
  )
}

/** Memórias com o mesmo conteúdo normalizado (dedupe exato). */
export function findByNormSync(db: Database, owner: string, normKey: string): PersonalMemory | null {
  const r = one<MemRow>(db, `${MEM_SELECT} WHERE m.ownerId = ? AND m.normKey = ? AND m.status NOT IN ('superseded') LIMIT 1`, [owner, normKey])
  return r ? toMemory(r) : null
}

/** Registra uso pelos consumers (contador + última utilização). */
export function touchUsageSync(db: Database, owner: string, ids: number[]): void {
  const now = nowIso()
  for (const id of ids) exec(db, 'UPDATE memories SET useCount = useCount + 1, lastUsedAt = ? WHERE id = ? AND ownerId = ?', [now, id, owner])
}
