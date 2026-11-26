import type { Database } from 'sql.js'
import {
  groupOf,
  localDate,
  nodeMinutes,
  schedule,
  type CardDirection,
  type CardStatus,
  type CheckpointTarget,
  type ContinueAction,
  type LibraryGroup,
  type Rating,
  type StudyCardInput,
  type TimeOption,
  type TopicStatus
} from '../../shared/estudos'
import { all, exec, nowIso, one, read, StudyError, tx, type P } from './sql'
import type {
  AttemptRow,
  CardDbShape,
  CardFilters,
  CardOut,
  CategoryRow,
  CheckpointInput,
  CheckpointRow,
  ImportFileIn,
  ImportPreviewItem,
  LibraryTopic,
  NodeRow,
  PinnedAction,
  QuestionInput,
  QuestionOut,
  QuestionRow,
  QueueFilters,
  ReviewItem,
  SourceInput,
  SourceRow,
  StateRow,
  TimeFilters,
  TopicInput,
  TopicRow
} from '../../shared/estudos'
import { tt } from '../i18n'

export type {
  AttemptRow,
  CardDbShape,
  CardFilters,
  CardOut,
  CategoryRow,
  CheckpointInput,
  CheckpointRow,
  ImportFileIn,
  ImportPreviewItem,
  LibraryTopic,
  NodeRow,
  PinnedAction,
  QuestionInput,
  QuestionOut,
  QuestionRow,
  QueueFilters,
  ReviewItem,
  SourceInput,
  SourceRow,
  StateRow,
  TimeFilters,
  TopicInput,
  TopicRow
}

type CardDb = CardDbShape


/**
 * Regras do módulo de Estudos que NÃO usam IA: biblioteca, retomada, fila de revisão,
 * cartões por direção, fontes, checkpoints, perguntas e tentativas. Abrir, filtrar,
 * revisar, aprovar e exportar passam só por aqui — zero chamadas de modelo.
 */

// ── Configurações do módulo ───────────────────────────────────────────────────

function setting(db: Database, key: string): string | null {
  return one<{ value: string }>(db, 'SELECT value FROM settings WHERE key = ?', [key])?.value ?? null
}
function setSetting(db: Database, key: string, value: string | null): void {
  if (value == null) exec(db, 'DELETE FROM settings WHERE key = ?', [key])
  else exec(db, 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value])
}

export const NEW_PER_DAY_KEY = 'study_new_per_day'
export const PINNED_KEY = 'study_pinned'
export const DEFAULT_NEW_PER_DAY = 20

export async function getPrefs(): Promise<{ newPerDay: number; pinned: PinnedAction | null }> {
  return read((db) => ({ newPerDay: newPerDay(db), pinned: pinned(db) }))
}

function newPerDay(db: Database): number {
  const n = Number(setting(db, NEW_PER_DAY_KEY))
  return Number.isFinite(n) && n >= 0 && setting(db, NEW_PER_DAY_KEY) != null ? Math.floor(n) : DEFAULT_NEW_PER_DAY
}

export async function setNewPerDay(n: number): Promise<void> {
  if (!Number.isFinite(n) || n < 0 || n > 1000) throw new StudyError(tt('estudos.limiteNovosInvalido'))
  await tx((db) => setSetting(db, NEW_PER_DAY_KEY, String(Math.floor(n))))
}


function pinned(db: Database): PinnedAction | null {
  try {
    const v = JSON.parse(setting(db, PINNED_KEY) || 'null')
    return v && typeof v.topicId === 'number' ? v : null
  } catch {
    return null
  }
}

export async function setPinned(p: PinnedAction | null): Promise<void> {
  await tx((db) => setSetting(db, PINNED_KEY, p ? JSON.stringify({ topicId: p.topicId, nodeId: p.nodeId ?? null, target: p.target ?? 'note', refId: p.refId ?? null }) : null))
}

// ── Tópicos / biblioteca ─────────────────────────────────────────────────────

const TOPIC_STATUSES: TopicStatus[] = ['studying', 'planned', 'paused', 'completed']

function checkStatus(s: string): TopicStatus {
  if (!TOPIC_STATUSES.includes(s as TopicStatus)) throw new StudyError(tt('estudos.statusInvalidoValor', { status: s }))
  return s as TopicStatus
}

export async function getTopic(id: number): Promise<TopicRow | null> {
  return read((db) => one<TopicRow>(db, 'SELECT * FROM study_topics WHERE id = ?', [id]))
}


const clean = (s: string | null | undefined): string | null => (s == null ? null : s.trim() || null)

export async function createTopic(input: TopicInput): Promise<TopicRow> {
  const name = (input.name ?? '').trim()
  if (!name) throw new StudyError(tt('estudos.topicoSemTitulo'))
  const status = checkStatus(input.status ?? 'studying')
  return tx((db) => {
    const id = exec(
      db,
      `INSERT INTO study_topics (name, category, status, targetDate, priority, color, createdAt, kind, targetLanguage, explanationLanguage, goal, reviewWhenArchived, readingMode, uid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, lower(hex(randomblob(8))))`,
      [
        name,
        clean(input.category),
        status,
        clean(input.targetDate),
        input.priority ?? 0,
        input.color || '#6366f1',
        nowIso(),
        input.kind === 'language' ? 'language' : 'general',
        clean(input.targetLanguage),
        clean(input.explanationLanguage),
        clean(input.goal),
        input.reviewWhenArchived ? 1 : 0,
        input.readingMode === 'visible' ? 'visible' : 'hidden'
      ]
    )
    return one<TopicRow>(db, 'SELECT * FROM study_topics WHERE id = ?', [id])!
  })
}

/** Futuro aceita só o título. */
export async function createFutureTopic(name: string): Promise<TopicRow> {
  return createTopic({ name, status: 'planned' })
}

export async function updateTopic(id: number, patch: Partial<TopicInput>): Promise<TopicRow> {
  return tx((db) => {
    const cur = one<TopicRow>(db, 'SELECT * FROM study_topics WHERE id = ?', [id])
    if (!cur) throw new StudyError(tt('estudos.topicoNaoEncontrado'))
    const has = (k: keyof TopicInput): boolean => Object.prototype.hasOwnProperty.call(patch, k)
    const name = has('name') ? (patch.name ?? '').trim() : cur.name
    if (!name) throw new StudyError(tt('estudos.topicoSemTitulo'))
    exec(
      db,
      `UPDATE study_topics SET name = ?, category = ?, status = ?, targetDate = ?, priority = ?, color = ?, kind = ?, targetLanguage = ?,
       explanationLanguage = ?, goal = ?, reviewWhenArchived = ?, readingMode = ? WHERE id = ?`,
      [
        name,
        has('category') ? clean(patch.category) : cur.category,
        has('status') ? checkStatus(patch.status!) : cur.status,
        has('targetDate') ? clean(patch.targetDate) : cur.targetDate,
        has('priority') ? patch.priority ?? 0 : cur.priority,
        has('color') ? patch.color || cur.color : cur.color,
        has('kind') ? (patch.kind === 'language' ? 'language' : 'general') : cur.kind,
        has('targetLanguage') ? clean(patch.targetLanguage) : cur.targetLanguage,
        has('explanationLanguage') ? clean(patch.explanationLanguage) : cur.explanationLanguage,
        has('goal') ? clean(patch.goal) : cur.goal,
        has('reviewWhenArchived') ? (patch.reviewWhenArchived ? 1 : 0) : cur.reviewWhenArchived,
        has('readingMode') ? (patch.readingMode === 'visible' ? 'visible' : 'hidden') : cur.readingMode,
        id
      ]
    )
    return one<TopicRow>(db, 'SELECT * FROM study_topics WHERE id = ?', [id])!
  })
}

/** Ativar, pausar, concluir, reativar: só muda o status (pausado ≠ concluído). */
export async function setTopicStatus(id: number, status: TopicStatus): Promise<TopicRow> {
  return updateTopic(id, { status: checkStatus(status) })
}

export async function getLibrary(): Promise<LibraryTopic[]> {
  const today = localDate()
  return read((db) => {
    const topics = all<TopicRow>(db, 'SELECT * FROM study_topics ORDER BY priority DESC, name COLLATE NOCASE ASC, id ASC')
    const nodes = new Map(
      all<{ topicId: number; done: number; total: number }>(
        db,
        "SELECT topicId, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done, COUNT(*) AS total FROM study_nodes GROUP BY topicId"
      ).map((r) => [r.topicId, r])
    )
    const cards = new Map(
      all<{ topicId: number; n: number }>(db, "SELECT topicId, COUNT(*) AS n FROM study_flashcards WHERE status <> 'suggested' GROUP BY topicId").map((r) => [r.topicId, r.n])
    )
    const due = new Map(
      all<{ topicId: number; n: number }>(
        db,
        `SELECT c.topicId, COUNT(*) AS n FROM study_card_states s JOIN study_flashcards c ON c.id = s.cardId
         WHERE s.suspended = 0 AND c.status = 'active' AND s.lastReviewedAt IS NOT NULL AND (s.nextReviewAt IS NULL OR s.nextReviewAt <= ?)
         GROUP BY c.topicId`,
        [today]
      ).map((r) => [r.topicId, r.n])
    )
    const cps = new Map<number, CheckpointRow>()
    for (const c of all<CheckpointRow>(db, 'SELECT * FROM study_checkpoints ORDER BY updatedAt DESC, id DESC')) if (!cps.has(c.topicId)) cps.set(c.topicId, c)
    return topics.map((t) => ({
      ...t,
      group: groupOf(t.status),
      nodesDone: nodes.get(t.id)?.done ?? 0,
      nodesTotal: nodes.get(t.id)?.total ?? 0,
      cards: cards.get(t.id) ?? 0,
      due: due.get(t.id) ?? 0,
      lastActivityAt: cps.get(t.id)?.updatedAt ?? null,
      whereStopped: cps.get(t.id)?.whereStopped ?? null
    }))
  })
}

// ── Árvore (ordem manual) ─────────────────────────────────────────────────────

/** Nós do tópico em ordem de leitura (DFS pela ordem manual; desempate pelo id). */
export function treeOrder(nodes: NodeRow[]): NodeRow[] {
  const by = new Map<number | null, NodeRow[]>()
  const ids = new Set(nodes.map((n) => n.id))
  for (const n of nodes) {
    const k = n.parentId != null && ids.has(n.parentId) ? n.parentId : null
    if (!by.has(k)) by.set(k, [])
    by.get(k)!.push(n)
  }
  for (const arr of by.values()) arr.sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id)
  const out: NodeRow[] = []
  const seen = new Set<number>()
  const walk = (pid: number | null): void => {
    for (const n of by.get(pid) ?? []) {
      if (seen.has(n.id)) continue
      seen.add(n.id)
      out.push(n)
      walk(n.id)
    }
  }
  walk(null)
  return out
}

/** Primeiro nó pendente "folha" (sem filhos pendentes) na ordem de leitura. */
function firstPending(nodes: NodeRow[], filter: (n: NodeRow) => boolean = () => true): NodeRow | null {
  const ordered = treeOrder(nodes)
  const pendingChildren = new Set<number>()
  for (const n of nodes) if (n.status !== 'done' && n.parentId != null) pendingChildren.add(n.parentId)
  return ordered.find((n) => n.status !== 'done' && !pendingChildren.has(n.id) && filter(n)) ?? null
}

// ── Continuar ─────────────────────────────────────────────────────────────────

function activeTopics(db: Database): TopicRow[] {
  return all<TopicRow>(db, "SELECT * FROM study_topics WHERE status = 'studying' ORDER BY priority DESC, name COLLATE NOCASE ASC, id ASC")
}

function nodeTitle(db: Database, id: number | null): string | null {
  return id == null ? null : one<{ title: string }>(db, 'SELECT title FROM study_nodes WHERE id = ?', [id])?.title ?? null
}

/**
 * Ordem determinística: ação fixada → checkpoint mais recente em tópico ativo → próximo nó
 * elegível de roteiro aprovado → primeiro pendente pela ordem manual → tópico vazio → nada.
 */
export async function getContinue(): Promise<ContinueAction> {
  return read((db) => {
    const base = (t: TopicRow | null): Omit<ContinueAction, 'reason'> => ({
      topicId: t?.id ?? null,
      topicName: t?.name ?? null,
      nodeId: null,
      nodeTitle: null,
      target: 'note',
      refId: null,
      whereStopped: null,
      position: null
    })
    const p = pinned(db)
    if (p) {
      const t = one<TopicRow>(db, 'SELECT * FROM study_topics WHERE id = ?', [p.topicId])
      if (t) return { ...base(t), reason: 'pinned', nodeId: p.nodeId, nodeTitle: nodeTitle(db, p.nodeId), target: p.target, refId: p.refId }
    }
    const topics = activeTopics(db)
    if (!topics.length) return { ...base(null), reason: 'nothing' }
    const ids = topics.map((t) => t.id)
    const ph = ids.map(() => '?').join(',')
    const cp = one<CheckpointRow>(db, `SELECT * FROM study_checkpoints WHERE topicId IN (${ph}) ORDER BY updatedAt DESC, id DESC LIMIT 1`, ids)
    if (cp) {
      const t = topics.find((x) => x.id === cp.topicId)!
      return {
        ...base(t),
        reason: 'checkpoint',
        nodeId: cp.nodeId,
        nodeTitle: nodeTitle(db, cp.nodeId),
        target: cp.target,
        refId: cp.refId,
        whereStopped: cp.whereStopped,
        position: cp.position
      }
    }
    for (const t of topics) {
      const nodes = all<NodeRow>(db, 'SELECT * FROM study_nodes WHERE topicId = ?', [t.id])
      const n = firstPending(nodes, (x) => x.origin === 'plan')
      if (n) return { ...base(t), reason: 'plan', nodeId: n.id, nodeTitle: n.title }
    }
    for (const t of topics) {
      const n = firstPending(all<NodeRow>(db, 'SELECT * FROM study_nodes WHERE topicId = ?', [t.id]))
      if (n) return { ...base(t), reason: 'manual', nodeId: n.id, nodeTitle: n.title }
    }
    const first = topics[0]
    const hasContent =
      !!one(db, "SELECT 1 FROM study_notes WHERE topicId = ? AND TRIM(content) <> '' LIMIT 1", [first.id]) ||
      !!one(db, 'SELECT 1 FROM study_sources WHERE topicId = ? LIMIT 1', [first.id]) ||
      !!one(db, 'SELECT 1 FROM study_nodes WHERE topicId = ? LIMIT 1', [first.id])
    return { ...base(first), reason: hasContent ? 'manual' : 'empty-topic' }
  })
}


function topicMatches(t: TopicRow, f: TimeFilters): boolean {
  if (f.topicId != null && t.id !== f.topicId) return false
  if (f.category && (t.category ?? '') !== f.category) return false
  if (f.language && (t.targetLanguage ?? '') !== f.language) return false
  return true
}

/** "Tenho 10 / 25 / 50 minutos": só estimativas já salvas; sem IA. */
export async function getTimeOptions(minutes: number, filters: TimeFilters = {}): Promise<{ fits: TimeOption[]; fallback: TimeOption[] }> {
  const queue = await getReviewQueue({})
  const cont = await getContinue()
  return read((db) => {
    const topics = activeTopics(db).filter((t) => topicMatches(t, filters))
    const fits: TimeOption[] = []
    for (const t of topics) {
      const nodes = all<NodeRow>(db, 'SELECT * FROM study_nodes WHERE topicId = ?', [t.id])
      const pendingChildren = new Set<number>()
      for (const n of nodes) if (n.status !== 'done' && n.parentId != null) pendingChildren.add(n.parentId)
      for (const n of treeOrder(nodes)) {
        const m = nodeMinutes(n.estimatedHours)
        if (n.status === 'done' || pendingChildren.has(n.id) || m == null || m > minutes) continue
        fits.push({ kind: 'node', topicId: t.id, topicName: t.name, nodeId: n.id, title: n.title, minutes: m })
      }
    }
    // a etapa que melhor aproveita o tempo primeiro; desempate estável pela ordem de leitura
    fits.sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0))
    const topicIds = new Set(topics.map((t) => t.id))
    const fallback: TimeOption[] = []
    if (cont.topicId != null && topicIds.has(cont.topicId)) {
      fallback.push({ kind: 'resume-note', topicId: cont.topicId, topicName: cont.topicName, nodeId: cont.nodeId, title: cont.nodeTitle ?? cont.topicName ?? '', minutes: null })
    }
    const cards = queue.items.filter((i) => topicIds.has(i.card.topicId)).length
    if (cards) fallback.push({ kind: 'cards', topicId: filters.topicId ?? null, topicName: null, nodeId: null, title: '', minutes: null, count: cards })
    const qs = all<{ n: number }>(
      db,
      `SELECT COUNT(*) AS n FROM study_questions WHERE status = 'active' AND topicId IN (${[...topicIds].map(() => '?').join(',') || 'NULL'})`,
      [...topicIds]
    )[0]?.n ?? 0
    if (qs) fallback.push({ kind: 'questions', topicId: filters.topicId ?? null, topicName: null, nodeId: null, title: '', minutes: null, count: qs })
    return { fits: fits.slice(0, 6), fallback }
  })
}

// ── Categorias de cartão ─────────────────────────────────────────────────────

export async function listCategories(): Promise<CategoryRow[]> {
  return read((db) =>
    all<CategoryRow>(
      db,
      `SELECT k.id, k.name, k.sortOrder, (SELECT COUNT(*) FROM study_flashcards c WHERE c.categoryId = k.id) AS cards
       FROM study_card_categories k ORDER BY k.sortOrder ASC, k.name COLLATE NOCASE ASC`
    )
  )
}

export async function createCategory(name: string): Promise<CategoryRow> {
  const n = (name ?? '').trim()
  if (!n) throw new StudyError(tt('estudos.categoriaVazia'))
  return tx((db) => {
    if (one(db, 'SELECT 1 FROM study_card_categories WHERE name = ?', [n])) throw new StudyError(tt('estudos.categoriaExiste', { nome: n }))
    const max = one<{ m: number }>(db, 'SELECT COALESCE(MAX(sortOrder), 0) AS m FROM study_card_categories')?.m ?? 0
    const id = exec(db, 'INSERT INTO study_card_categories (name, sortOrder, createdAt) VALUES (?, ?, ?)', [n, max + 10, nowIso()])
    return { id, name: n, sortOrder: max + 10, cards: 0 }
  })
}

export async function renameCategory(id: number, name: string): Promise<void> {
  const n = (name ?? '').trim()
  if (!n) throw new StudyError(tt('estudos.categoriaVazia'))
  await tx((db) => {
    if (one(db, 'SELECT 1 FROM study_card_categories WHERE name = ? AND id <> ?', [n, id])) throw new StudyError(tt('estudos.categoriaExiste', { nome: n }))
    exec(db, 'UPDATE study_card_categories SET name = ? WHERE id = ?', [n, id])
  })
}

/** Apaga a categoria; os cartões ficam "sem categoria". */
export async function deleteCategory(id: number): Promise<void> {
  await tx((db) => {
    exec(db, 'UPDATE study_flashcards SET categoryId = NULL WHERE categoryId = ?', [id])
    exec(db, 'DELETE FROM study_card_categories WHERE id = ?', [id])
  })
}

// ── Cartões ───────────────────────────────────────────────────────────────────

function parseVariants(v: string | null): string[] {
  try {
    const a = JSON.parse(v || '[]')
    return Array.isArray(a) ? a.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

function cardOut(db: Database, c: CardDb & { categoryName?: string | null }, states?: StateRow[]): CardOut {
  return {
    ...c,
    variants: parseVariants(c.variants),
    categoryName: c.categoryName ?? null,
    states: states ?? all<StateRow>(db, "SELECT * FROM study_card_states WHERE cardId = ? ORDER BY CASE direction WHEN 'forward' THEN 0 ELSE 1 END", [c.id])
  }
}

const CARD_SELECT = 'SELECT c.*, k.name AS categoryName FROM study_flashcards c LEFT JOIN study_card_categories k ON k.id = c.categoryId'


export async function listCards(f: CardFilters = {}): Promise<CardOut[]> {
  return read((db) => {
    const where: string[] = []
    const params: P[] = []
    if (f.topicId != null) {
      where.push('c.topicId = ?')
      params.push(f.topicId)
    }
    if (f.nodeId != null) {
      where.push('c.nodeId = ?')
      params.push(f.nodeId)
    }
    if (f.categoryId === 'none') where.push('c.categoryId IS NULL')
    else if (f.categoryId != null) {
      where.push('c.categoryId = ?')
      params.push(f.categoryId)
    }
    if (f.language) {
      where.push('COALESCE(c.language, (SELECT targetLanguage FROM study_topics t WHERE t.id = c.topicId)) = ?')
      params.push(f.language)
    }
    if (f.status && f.status !== 'all') {
      where.push('c.status = ?')
      params.push(f.status)
    } else if (!f.status) where.push("c.status <> 'suggested'")
    if (f.text?.trim()) {
      where.push('(ulower(c.front) LIKE ? OR ulower(c.back) LIKE ? OR ulower(COALESCE(c.example, \'\')) LIKE ?)')
      const q = `%${f.text.trim().toLowerCase()}%`
      params.push(q, q, q)
    }
    const rows = all<CardDb & { categoryName: string | null }>(db, `${CARD_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.id DESC`, params)
    const states = new Map<number, StateRow[]>()
    if (rows.length) {
      for (const s of all<StateRow>(db, `SELECT * FROM study_card_states WHERE cardId IN (${rows.map(() => '?').join(',')})`, rows.map((r) => r.id))) {
        if (!states.has(s.cardId)) states.set(s.cardId, [])
        states.get(s.cardId)!.push(s)
      }
    }
    return rows.map((r) => cardOut(db, r, (states.get(r.id) ?? []).sort((a, b) => (a.direction === 'forward' ? -1 : 1) - (b.direction === 'forward' ? -1 : 1))))
  })
}

export async function getCard(id: number): Promise<CardOut | null> {
  return read((db) => {
    const c = one<CardDb & { categoryName: string | null }>(db, `${CARD_SELECT} WHERE c.id = ?`, [id])
    return c ? cardOut(db, c) : null
  })
}

function ensureState(db: Database, cardId: number, direction: CardDirection): void {
  const s = one<StateRow>(db, 'SELECT * FROM study_card_states WHERE cardId = ? AND direction = ?', [cardId, direction])
  if (!s) exec(db, 'INSERT INTO study_card_states (cardId, direction) VALUES (?, ?)', [cardId, direction])
  else if (s.suspended) exec(db, 'UPDATE study_card_states SET suspended = 0 WHERE id = ?', [s.id])
}

function validCard(input: StudyCardInput): void {
  if (!(input.front ?? '').trim()) throw new StudyError(tt('estudos.frenteVazia'))
  if (input.cardType !== 'cloze' && !(input.back ?? '').trim()) throw new StudyError(tt('estudos.versoVazio'))
  if (input.cardType === 'cloze' && !/\{\{[^}]+\}\}/.test(input.front)) throw new StudyError(tt('estudos.marqueLacuna'))
}

/** Insere um cartão dentro de uma transação já aberta (usado também por importações). */
export function insertCard(db: Database, input: StudyCardInput): number {
  validCard(input)
  const now = nowIso()
  const id = exec(
    db,
    `INSERT INTO study_flashcards (topicId, nodeId, front, back, createdAt, cardType, categoryId, language, example, reading, variants, drill, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.topicId,
      input.nodeId ?? null,
      input.front.trim(),
      (input.back ?? '').trim(),
      now,
      input.cardType === 'cloze' ? 'cloze' : 'basic',
      input.categoryId ?? null,
      clean(input.language),
      clean(input.example),
      clean(input.reading),
      input.variants?.length ? JSON.stringify(input.variants.map((v) => v.trim()).filter(Boolean)) : null,
      clean(input.drill),
      input.status ?? 'active'
    ]
  )
  ensureState(db, id, 'forward')
  if (input.reverse && input.cardType !== 'cloze') ensureState(db, id, 'reverse')
  return id
}

export async function createCard(input: StudyCardInput): Promise<CardOut> {
  const id = await tx((db) => insertCard(db, input))
  return (await getCard(id))!
}

export async function updateCard(id: number, input: Omit<StudyCardInput, 'topicId'> & { topicId?: number }): Promise<CardOut> {
  await tx((db) => {
    const cur = one<CardDb>(db, 'SELECT * FROM study_flashcards WHERE id = ?', [id])
    if (!cur) throw new StudyError(tt('estudos.cartaoNaoEncontrado'))
    validCard({ ...input, topicId: cur.topicId })
    exec(
      db,
      `UPDATE study_flashcards SET nodeId = ?, front = ?, back = ?, cardType = ?, categoryId = ?, language = ?, example = ?, reading = ?, variants = ?, drill = ? WHERE id = ?`,
      [
        input.nodeId ?? null,
        input.front.trim(),
        (input.back ?? '').trim(),
        input.cardType === 'cloze' ? 'cloze' : 'basic',
        input.categoryId ?? null,
        clean(input.language),
        clean(input.example),
        clean(input.reading),
        input.variants?.length ? JSON.stringify(input.variants.map((v) => v.trim()).filter(Boolean)) : null,
        clean(input.drill),
        id
      ]
    )
    if (input.reverse && input.cardType !== 'cloze') ensureState(db, id, 'reverse')
    else exec(db, "UPDATE study_card_states SET suspended = 1 WHERE cardId = ? AND direction = 'reverse'", [id]) // preserva o histórico
  })
  return (await getCard(id))!
}

/** Ativa / suspende o cartão inteiro, ou aprova um sugerido ('suggested' → 'active'). */
export async function setCardStatus(id: number, status: CardStatus): Promise<void> {
  if (!['active', 'suspended', 'suggested'].includes(status)) throw new StudyError(tt('estudos.statusInvalido'))
  await tx((db) => exec(db, 'UPDATE study_flashcards SET status = ? WHERE id = ?', [status, id]))
}

/** Suspende / retoma só uma direção. */
export async function setStateSuspended(stateId: number, suspended: boolean): Promise<void> {
  await tx((db) => exec(db, 'UPDATE study_card_states SET suspended = ? WHERE id = ?', [suspended ? 1 : 0, stateId]))
}

export async function deleteCard(id: number): Promise<void> {
  await tx((db) => exec(db, 'DELETE FROM study_flashcards WHERE id = ?', [id]))
}

// ── Fila de revisão ──────────────────────────────────────────────────────────


function introducedToday(db: Database, now: Date): number {
  const since = new Date(now.getTime() - 36 * 3600_000).toISOString()
  const today = localDate(now)
  return all<{ introducedAt: string }>(db, 'SELECT introducedAt FROM study_card_states WHERE introducedAt >= ?', [since]).filter(
    (r) => localDate(new Date(r.introducedAt)) === today
  ).length
}

/**
 * Fila do dia: revisões vencidas (ordem nextReviewAt, id — a mesma de antes) + novos até o
 * limite diário. Por padrão só tópicos Ativos e arquivados marcados "revisar quando arquivado".
 */
export async function getReviewQueue(f: QueueFilters = {}, now: Date = new Date()): Promise<{ items: ReviewItem[]; newLeft: number; newPerDay: number; dueTotal: number }> {
  return read((db) => {
    const today = localDate(now)
    const where: string[] = ["s.suspended = 0", "c.status = 'active'"]
    const params: P[] = []
    if (f.topicIds?.length) {
      where.push(`c.topicId IN (${f.topicIds.map(() => '?').join(',')})`)
      params.push(...f.topicIds)
    } else if (f.topicId != null) {
      where.push('c.topicId = ?')
      params.push(f.topicId)
    } else {
      where.push("(t.status = 'studying' OR (t.status IN ('paused', 'completed') AND t.reviewWhenArchived = 1))")
    }
    if (f.nodeId != null) {
      where.push('c.nodeId = ?')
      params.push(f.nodeId)
    }
    if (f.categoryId === 'none') where.push('c.categoryId IS NULL')
    else if (f.categoryId != null) {
      where.push('c.categoryId = ?')
      params.push(f.categoryId)
    }
    if (f.language) {
      where.push('COALESCE(c.language, t.targetLanguage) = ?')
      params.push(f.language)
    }
    const rows = all<
      CardDb & { categoryName: string | null; topicName: string; topicKind: 'general' | 'language'; targetLanguage: string | null; readingMode: 'hidden' | 'visible' } & {
        s_id: number
        s_direction: CardDirection
        s_ease: number
        s_interval: number
        s_reps: number
        s_next: string | null
        s_last: string | null
        s_intro: string | null
        s_susp: number
      }
    >(
      db,
      `SELECT c.*, k.name AS categoryName, t.name AS topicName, t.kind AS topicKind, t.targetLanguage, t.readingMode,
              s.id AS s_id, s.direction AS s_direction, s.easeFactor AS s_ease, s.intervalDays AS s_interval, s.repetitions AS s_reps,
              s.nextReviewAt AS s_next, s.lastReviewedAt AS s_last, s.introducedAt AS s_intro, s.suspended AS s_susp
       FROM study_card_states s
       JOIN study_flashcards c ON c.id = s.cardId
       JOIN study_topics t ON t.id = c.topicId
       LEFT JOIN study_card_categories k ON k.id = c.categoryId
       WHERE ${where.join(' AND ')}
         AND (s.nextReviewAt IS NULL OR s.nextReviewAt <= ?)
       ORDER BY s.nextReviewAt ASC, c.id ASC, CASE s.direction WHEN 'forward' THEN 0 ELSE 1 END`,
      [...params, today]
    )
    const perDay = newPerDay(db)
    const newLeft = Math.max(0, perDay - introducedToday(db, now))
    const reviews: ReviewItem[] = []
    const fresh: ReviewItem[] = []
    for (const r of rows) {
      const state: StateRow = {
        id: r.s_id,
        cardId: r.id,
        direction: r.s_direction,
        easeFactor: r.s_ease,
        intervalDays: r.s_interval,
        repetitions: r.s_reps,
        nextReviewAt: r.s_next,
        lastReviewedAt: r.s_last,
        introducedAt: r.s_intro,
        suspended: r.s_susp
      }
      const isNew = r.s_last == null
      const item: ReviewItem = {
        card: cardOut(db, r, []),
        state,
        topicName: r.topicName,
        topicKind: r.topicKind,
        targetLanguage: r.targetLanguage,
        readingMode: r.readingMode,
        isNew
      }
      ;(isNew ? fresh : reviews).push(item)
    }
    fresh.sort((a, b) => a.card.id - b.card.id || (a.state.direction === 'forward' ? -1 : 1))
    return { items: [...reviews, ...fresh.slice(0, newLeft)], newLeft, newPerDay: perDay, dueTotal: reviews.length }
  })
}

/** Revisa UMA direção. O SM-2 é o mesmo de antes; o cartão legado acompanha a direção forward. */
export async function reviewState(stateId: number, rating: Rating, now: Date = new Date()): Promise<StateRow> {
  return tx((db) => {
    const s = one<StateRow>(db, 'SELECT * FROM study_card_states WHERE id = ?', [stateId])
    if (!s) throw new StudyError(tt('estudos.cartaoNaoEncontrado'))
    const card = one<{ topicId: number }>(db, 'SELECT topicId FROM study_flashcards WHERE id = ?', [s.cardId])!
    const u = schedule(s, rating, now)
    exec(
      db,
      'UPDATE study_card_states SET easeFactor = ?, intervalDays = ?, repetitions = ?, nextReviewAt = ?, lastReviewedAt = ?, introducedAt = COALESCE(introducedAt, ?) WHERE id = ?',
      [u.easeFactor, u.intervalDays, u.repetitions, u.nextReviewAt, u.lastReviewedAt, u.lastReviewedAt, stateId]
    )
    if (s.direction === 'forward') {
      exec(db, 'UPDATE study_flashcards SET easeFactor = ?, intervalDays = ?, repetitions = ?, nextReviewAt = ?, lastReviewedAt = ? WHERE id = ?', [
        u.easeFactor,
        u.intervalDays,
        u.repetitions,
        u.nextReviewAt,
        u.lastReviewedAt,
        s.cardId
      ])
    }
    exec(db, 'INSERT INTO study_review_log (flashcardId, topicId, rating, reviewedAt, direction, stateId) VALUES (?, ?, ?, ?, ?, ?)', [
      s.cardId,
      card.topicId,
      rating,
      u.lastReviewedAt,
      s.direction,
      stateId
    ])
    return one<StateRow>(db, 'SELECT * FROM study_card_states WHERE id = ?', [stateId])!
  })
}

// ── Fontes externas ──────────────────────────────────────────────────────────


export async function listSources(topicId: number, nodeId?: number | null): Promise<SourceRow[]> {
  return read((db) =>
    nodeId === undefined
      ? all<SourceRow>(db, 'SELECT * FROM study_sources WHERE topicId = ? ORDER BY updatedAt DESC, id DESC', [topicId])
      : all<SourceRow>(db, 'SELECT * FROM study_sources WHERE topicId = ? AND IFNULL(nodeId, -1) = IFNULL(?, -1) ORDER BY updatedAt DESC, id DESC', [topicId, nodeId])
  )
}

export function insertSource(db: Database, s: SourceInput): number {
  const title = (s.title ?? '').trim()
  if (!title) throw new StudyError(tt('estudos.fonteSemTitulo'))
  if (s.kind === 'link' && !(s.url ?? '').trim()) throw new StudyError(tt('estudos.informeLink'))
  const now = nowIso()
  return exec(
    db,
    'INSERT INTO study_sources (topicId, nodeId, kind, title, content, url, locator, originPath, originHash, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [s.topicId, s.nodeId ?? null, s.kind ?? 'text', title, s.content ?? '', clean(s.url), clean(s.locator), clean(s.originPath), clean(s.originHash), now, now]
  )
}

export async function createSource(s: SourceInput): Promise<SourceRow> {
  const id = await tx((db) => insertSource(db, s))
  return read((db) => one<SourceRow>(db, 'SELECT * FROM study_sources WHERE id = ?', [id])!)
}

export async function updateSource(id: number, patch: Partial<SourceInput>): Promise<SourceRow> {
  return tx((db) => {
    const cur = one<SourceRow>(db, 'SELECT * FROM study_sources WHERE id = ?', [id])
    if (!cur) throw new StudyError(tt('estudos.fonteNaoEncontrada'))
    const has = (k: keyof SourceInput): boolean => Object.prototype.hasOwnProperty.call(patch, k)
    exec(db, 'UPDATE study_sources SET nodeId = ?, title = ?, content = ?, url = ?, locator = ?, originHash = ?, updatedAt = ? WHERE id = ?', [
      has('nodeId') ? patch.nodeId ?? null : cur.nodeId,
      has('title') ? (patch.title ?? '').trim() || cur.title : cur.title,
      has('content') ? patch.content ?? '' : cur.content,
      has('url') ? clean(patch.url) : cur.url,
      has('locator') ? clean(patch.locator) : cur.locator,
      has('originHash') ? clean(patch.originHash) : cur.originHash,
      nowIso(),
      id
    ])
    return one<SourceRow>(db, 'SELECT * FROM study_sources WHERE id = ?', [id])!
  })
}

export async function deleteSource(id: number): Promise<void> {
  await tx((db) => exec(db, 'DELETE FROM study_sources WHERE id = ?', [id]))
}


const titleFromPath = (p: string): string =>
  (p.split('/').pop() || p).replace(/\.(md|markdown|txt)$/i, '').replace(/[-_]+/g, ' ').trim() || p

/** Prévia de importação de TXT/Markdown: reconhece origens já importadas (não duplica). */
export async function previewImport(topicId: number, files: ImportFileIn[]): Promise<ImportPreviewItem[]> {
  return read((db) =>
    files.map((f) => {
      const ex = one<SourceRow>(db, 'SELECT * FROM study_sources WHERE topicId = ? AND originPath = ? ORDER BY id DESC LIMIT 1', [topicId, f.path])
      return {
        path: f.path,
        title: titleFromPath(f.path),
        chars: f.content.length,
        status: !ex ? 'new' : ex.originHash === f.hash ? 'unchanged' : 'changed',
        existingId: ex?.id ?? null
      }
    })
  )
}

/** Aplica a importação: decisão por arquivo (criar, atualizar a existente ou ignorar). */
export async function applyImport(
  topicId: number,
  nodeId: number | null,
  files: (ImportFileIn & { decision: 'create' | 'update' | 'skip'; title?: string })[]
): Promise<{ created: number; updated: number; skipped: number }> {
  return tx((db) => {
    let created = 0
    let updated = 0
    let skipped = 0
    for (const f of files) {
      if (f.decision === 'skip') {
        skipped++
        continue
      }
      const ex = one<SourceRow>(db, 'SELECT * FROM study_sources WHERE topicId = ? AND originPath = ? ORDER BY id DESC LIMIT 1', [topicId, f.path])
      if (ex && f.decision === 'update') {
        exec(db, 'UPDATE study_sources SET content = ?, originHash = ?, updatedAt = ? WHERE id = ?', [f.content, f.hash, nowIso(), ex.id])
        updated++
      } else if (ex && ex.originHash === f.hash) {
        skipped++ // repetir uma importação conhecida não duplica
      } else {
        insertSource(db, { topicId, nodeId, kind: 'file', title: f.title || titleFromPath(f.path), content: f.content, originPath: f.path, originHash: f.hash })
        created++
      }
    }
    return { created, updated, skipped }
  })
}

// ── Checkpoints ──────────────────────────────────────────────────────────────


export async function saveCheckpoint(c: CheckpointInput): Promise<CheckpointRow> {
  return tx((db) => {
    const cur = one<CheckpointRow>(
      db,
      'SELECT * FROM study_checkpoints WHERE topicId = ? AND IFNULL(nodeId, -1) = IFNULL(?, -1) AND target = ? AND IFNULL(refId, -1) = IFNULL(?, -1)',
      [c.topicId, c.nodeId ?? null, c.target, c.refId ?? null]
    )
    const where = c.whereStopped === undefined ? cur?.whereStopped ?? null : clean(c.whereStopped)
    const now = nowIso()
    if (cur) {
      exec(db, 'UPDATE study_checkpoints SET position = ?, whereStopped = ?, updatedAt = ? WHERE id = ?', [c.position ?? cur.position, where, now, cur.id])
      return one<CheckpointRow>(db, 'SELECT * FROM study_checkpoints WHERE id = ?', [cur.id])!
    }
    const id = exec(db, 'INSERT INTO study_checkpoints (topicId, nodeId, target, refId, position, whereStopped, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      c.topicId,
      c.nodeId ?? null,
      c.target,
      c.refId ?? null,
      c.position ?? null,
      where,
      now
    ])
    return one<CheckpointRow>(db, 'SELECT * FROM study_checkpoints WHERE id = ?', [id])!
  })
}

export async function getCheckpoint(topicId: number, nodeId: number | null, target: CheckpointTarget, refId: number | null = null): Promise<CheckpointRow | null> {
  return read((db) =>
    one<CheckpointRow>(
      db,
      'SELECT * FROM study_checkpoints WHERE topicId = ? AND IFNULL(nodeId, -1) = IFNULL(?, -1) AND target = ? AND IFNULL(refId, -1) = IFNULL(?, -1)',
      [topicId, nodeId, target, refId]
    )
  )
}

// ── Perguntas e tentativas ───────────────────────────────────────────────────


export function insertQuestion(db: Database, q: QuestionInput): number {
  const prompt = (q.prompt ?? '').trim()
  if (!prompt) throw new StudyError(tt('estudos.perguntaVazia'))
  const now = nowIso()
  return exec(
    db,
    'INSERT INTO study_questions (topicId, nodeId, kind, prompt, reference, hint, origin, status, revisit, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
    [q.topicId, q.nodeId ?? null, q.kind ?? 'recall', prompt, clean(q.reference), clean(q.hint), q.origin ?? 'manual', 'active', now, now]
  )
}

export async function createQuestion(q: QuestionInput): Promise<QuestionRow> {
  const id = await tx((db) => insertQuestion(db, q))
  return read((db) => one<QuestionRow>(db, 'SELECT * FROM study_questions WHERE id = ?', [id])!)
}

export async function updateQuestion(id: number, patch: Partial<QuestionInput> & { status?: 'active' | 'archived'; revisit?: boolean }): Promise<void> {
  await tx((db) => {
    const cur = one<QuestionRow>(db, 'SELECT * FROM study_questions WHERE id = ?', [id])
    if (!cur) throw new StudyError(tt('estudos.perguntaNaoEncontrada'))
    const has = (k: string): boolean => Object.prototype.hasOwnProperty.call(patch, k)
    exec(db, 'UPDATE study_questions SET prompt = ?, reference = ?, hint = ?, kind = ?, nodeId = ?, status = ?, revisit = ?, updatedAt = ? WHERE id = ?', [
      has('prompt') ? (patch.prompt ?? '').trim() || cur.prompt : cur.prompt,
      has('reference') ? clean(patch.reference) : cur.reference,
      has('hint') ? clean(patch.hint) : cur.hint,
      has('kind') ? patch.kind ?? cur.kind : cur.kind,
      has('nodeId') ? patch.nodeId ?? null : cur.nodeId,
      has('status') ? patch.status ?? cur.status : cur.status,
      has('revisit') ? (patch.revisit ? 1 : 0) : cur.revisit,
      nowIso(),
      id
    ])
  })
}

export async function deleteQuestion(id: number): Promise<void> {
  await tx((db) => exec(db, 'DELETE FROM study_questions WHERE id = ?', [id]))
}

/** Perguntas para "Testar o que ficou": erros para revisitar primeiro, depois nunca tentadas, depois as mais antigas. */
export async function listQuestions(f: { topicId?: number | null; nodeId?: number | null; includeArchived?: boolean; allGroups?: boolean } = {}): Promise<QuestionOut[]> {
  return read((db) => {
    const where: string[] = []
    const params: P[] = []
    if (!f.includeArchived) where.push("q.status = 'active'")
    if (f.topicId != null) {
      where.push('q.topicId = ?')
      params.push(f.topicId)
    } else if (!f.allGroups) where.push("t.status = 'studying'")
    if (f.nodeId != null) {
      where.push('q.nodeId = ?')
      params.push(f.nodeId)
    }
    return all<QuestionOut>(
      db,
      `SELECT q.*, t.name AS topicName,
         (SELECT COUNT(*) FROM study_attempts a WHERE a.questionId = q.id) AS attempts,
         (SELECT a.outcome FROM study_attempts a WHERE a.questionId = q.id ORDER BY a.createdAt DESC, a.id DESC LIMIT 1) AS lastOutcome,
         (SELECT a.createdAt FROM study_attempts a WHERE a.questionId = q.id ORDER BY a.createdAt DESC, a.id DESC LIMIT 1) AS lastAttemptAt
       FROM study_questions q JOIN study_topics t ON t.id = q.topicId
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY q.revisit DESC,
         CASE WHEN lastOutcome IN ('miss', 'partial') THEN 0 WHEN lastOutcome IS NULL THEN 1 ELSE 2 END,
         COALESCE(lastAttemptAt, '') ASC, q.id ASC`,
      params
    )
  })
}

export async function recordAttempt(questionId: number, a: { answer?: string | null; helpUsed?: string | null; outcome: AttemptRow['outcome'] }): Promise<AttemptRow> {
  if (!['ok', 'partial', 'miss', 'skipped'].includes(a.outcome)) throw new StudyError(tt('estudos.resultadoInvalido'))
  return tx((db) => {
    const q = one<QuestionRow>(db, 'SELECT * FROM study_questions WHERE id = ?', [questionId])
    if (!q) throw new StudyError(tt('estudos.perguntaNaoEncontrada'))
    const id = exec(db, 'INSERT INTO study_attempts (questionId, topicId, answer, helpUsed, outcome, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [
      questionId,
      q.topicId,
      clean(a.answer),
      clean(a.helpUsed),
      a.outcome,
      nowIso()
    ])
    // errou → vira "erro para revisitar"; acertou → sai da lista de revisitar
    if (a.outcome === 'miss' || a.outcome === 'partial') exec(db, 'UPDATE study_questions SET revisit = 1 WHERE id = ?', [questionId])
    else if (a.outcome === 'ok') exec(db, 'UPDATE study_questions SET revisit = 0 WHERE id = ?', [questionId])
    return one<AttemptRow>(db, 'SELECT * FROM study_attempts WHERE id = ?', [id])!
  })
}

export async function listAttempts(questionId: number): Promise<AttemptRow[]> {
  return read((db) => all<AttemptRow>(db, 'SELECT * FROM study_attempts WHERE questionId = ? ORDER BY createdAt DESC, id DESC', [questionId]))
}
