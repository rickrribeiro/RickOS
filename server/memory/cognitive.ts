import type { Database } from 'sql.js'
import type { PersonalMemory, Sensitivity } from '../../shared/memory'
import { SENS_RANK, normText } from '../../shared/memory'
import { getDb, saveDb } from '../database/db'
import { SAFETY, callAi, parseJsonObject } from './ai'
import { extractFromText, proposeFromItems, type RunStats } from './agent'
import { MEMORY_POLICIES, categoryAllowed, resolveConsume, resolveProduce, sensitivityAllowed } from './policy'
import { MEM_SELECT, MemoryError, all, categoriesSync, currentOwner, ensureSeeded, exec, jparse, lastId, nowIso, one, read, toMemory, tx } from './repo'
import { retrieve, sanitizeForPrompt } from './retrieval'

// ── Freshness (determinístico, sem IA) ───────────────────────────────────────

export const FRESHNESS_VERSION = 'atualidade-v1'
/** Dias até pedir reconfirmação, por estabilidade. `null` = não precisa. */
const REVIEW_DAYS: Record<PersonalMemory['stability'], number | null> = { permanent: null, stable: 365, evolving: 120, transient: 30 }

export interface FreshnessItem {
  memory: PersonalMemory
  reason: string
  dueSince: string
  severity: 'baixa' | 'media' | 'alta'
}

export function freshnessOf(m: PersonalMemory, now = Date.now()): FreshnessItem | null {
  if (m.status !== 'active' && m.status !== 'unconfirmed') return null
  if (m.validUntil) {
    const left = (Date.parse(m.validUntil) - now) / 86_400_000
    if (left >= 0 && left <= 14) return { memory: m, reason: `expira em ${Math.ceil(left)} dia(s)`, dueSince: m.validUntil, severity: 'media' }
  }
  if (m.status === 'unconfirmed') return { memory: m, reason: 'ainda não confirmada por você', dueSince: m.createdAt, severity: 'media' }
  // fatos/experiências datados no passado não mudam
  if ((m.type === 'EXPERIENCE' || m.type === 'FACT') && m.occurredAt) return null
  let days = REVIEW_DAYS[m.stability]
  if (m.type === 'GOAL') days = Math.min(days ?? 90, 90)
  if (days == null) return null
  if (m.importance >= 4) days = Math.round(days * 0.75)
  const ref = Date.parse(m.confirmedAt ?? m.createdAt)
  const age = (now - ref) / 86_400_000
  if (age < days) return null
  const due = new Date(ref + days * 86_400_000).toISOString()
  return {
    memory: m,
    reason: `${m.type === 'GOAL' ? 'objetivo' : 'informação que muda com o tempo'} sem confirmação há ${Math.floor(age)} dias (revisar a cada ${days})`,
    dueSince: due,
    severity: age > days * 2 ? 'alta' : m.importance >= 4 ? 'media' : 'baixa'
  }
}

function liveMemories(db: Database, owner: string): (PersonalMemory & { catSlug: string | null })[] {
  return all<Parameters<typeof toMemory>[0] & { catSlug: string | null }>(
    db,
    `${MEM_SELECT.replace('FROM memories m', ', c.slug AS catSlug FROM memories m')} WHERE m.ownerId = ? AND m.status IN ('active','unconfirmed','outdated')`,
    [owner]
  ).map((r) => ({ ...toMemory(r), catSlug: r.catSlug }))
}

export async function freshness(): Promise<FreshnessItem[]> {
  const owner = currentOwner()
  await ensureSeeded(owner)
  return read((db) => {
    const now = Date.now()
    const sev = { alta: 0, media: 1, baixa: 2 }
    return liveMemories(db, owner)
      .map((m) => freshnessOf(m, now))
      .filter((x): x is FreshnessItem => !!x)
      .sort((a, b) => sev[a.severity] - sev[b.severity] || b.memory.importance - a.memory.importance)
  })
}

// ── Cobertura (critérios explícitos e versionados; sem percentuais inventados) ──

export const COVERAGE_VERSION = 'cobertura-v1'
export const COVERAGE_CRITERIA = [
  'Pouco explorado: menos de 2 memórias ativas na categoria.',
  'Necessita revisão: 30% ou mais das memórias pedem reconfirmação, ou há conflito pendente na categoria.',
  'Bem documentado: 6+ memórias ativas, 70%+ confirmadas e nenhuma lacuna de prioridade alta aberta.',
  'Parcialmente conhecido: os demais casos.'
]

export type CoverageState = 'pouco_explorado' | 'parcial' | 'bem_documentado' | 'revisar'

export interface CoverageRow {
  categoryId: number
  slug: string
  name: string
  icon: string
  active: number
  confirmed: number
  stale: number
  openGaps: number
  highGaps: number
  conflicts: number
  lastUpdate: string | null
  usedBy: string[]
  state: CoverageState
  why: string
}

export async function coverage(): Promise<{ version: string; criteria: string[]; rows: CoverageRow[] }> {
  const owner = currentOwner()
  await ensureSeeded(owner)
  return read((db) => {
    const mems = liveMemories(db, owner)
    const now = Date.now()
    const gaps = all<{ categoryId: number | null; priority: number }>(db, "SELECT categoryId, priority FROM memory_gaps WHERE ownerId = ? AND status = 'open'", [owner])
    const conflicts = all<{ targetIds: string }>(db, "SELECT targetIds FROM memory_suggestions WHERE ownerId = ? AND op = 'RESOLVE' AND status IN ('pending','needs_info','snoozed')", [owner])
    const conflictIds = new Set(conflicts.flatMap((c) => jparse<number[]>(c.targetIds, [])))
    const rows = categoriesSync(db, owner, false).map((c): CoverageRow => {
      const ms = mems.filter((m) => m.categoryId === c.id && m.status === 'active')
      const confirmed = ms.filter((m) => m.confirmedAt).length
      const stale = ms.filter((m) => freshnessOf(m, now)).length
      const g = gaps.filter((x) => x.categoryId === c.id)
      const high = g.filter((x) => Number(x.priority) >= 3).length
      const conf = mems.filter((m) => m.categoryId === c.id && conflictIds.has(m.id)).length
      const usedBy = MEMORY_POLICIES.filter((p) => !p.internal && p.consume && categoryAllowed(p.consume, c.slug)).map((p) => p.label)
      let state: CoverageState
      let why: string
      if (ms.length < 2) {
        state = 'pouco_explorado'
        why = `${ms.length} memória(s) ativa(s)`
      } else if ((ms.length && stale / ms.length >= 0.3) || conf > 0) {
        state = 'revisar'
        why = conf > 0 ? `${conf} memória(s) em conflito pendente` : `${stale} de ${ms.length} pedem reconfirmação`
      } else if (ms.length >= 6 && confirmed / ms.length >= 0.7 && high === 0) {
        state = 'bem_documentado'
        why = `${ms.length} ativas, ${confirmed} confirmadas, sem lacunas de prioridade alta`
      } else {
        state = 'parcial'
        why = `${ms.length} ativas, ${confirmed} confirmadas${high ? `, ${high} lacuna(s) de prioridade alta` : ''}`
      }
      return {
        categoryId: c.id,
        slug: c.slug,
        name: c.name,
        icon: c.icon,
        active: ms.length,
        confirmed,
        stale,
        openGaps: g.length,
        highGaps: high,
        conflicts: conf,
        lastUpdate: ms.reduce<string | null>((a, m) => (!a || m.updatedAt > a ? m.updatedAt : a), null),
        usedBy,
        state,
        why
      }
    })
    return { version: COVERAGE_VERSION, criteria: COVERAGE_CRITERIA, rows }
  })
}

// ── Lacunas de conhecimento ──────────────────────────────────────────────────

export interface KnowledgeGap {
  id: number
  topic: string
  categoryId: number | null
  category: string | null
  why: string
  beneficiaries: string[]
  priority: number
  sensitivity: Sensitivity
  question: string
  status: 'open' | 'answered' | 'dismissed' | 'irrelevant'
  createdAt: string
  resolvedAt: string | null
}

export async function listGaps(status: KnowledgeGap['status'] | 'all' = 'open'): Promise<KnowledgeGap[]> {
  const owner = currentOwner()
  return read((db) =>
    all<KnowledgeGap & { beneficiaries: string; category: string | null }>(
      db,
      `SELECT g.*, c.name AS category FROM memory_gaps g LEFT JOIN memory_categories c ON c.id = g.categoryId WHERE g.ownerId = ? ${status === 'all' ? '' : 'AND g.status = ?'} ORDER BY g.priority DESC, g.id DESC`,
      status === 'all' ? [owner] : [owner, status]
    ).map((g) => ({ ...g, id: Number(g.id), priority: Number(g.priority), beneficiaries: jparse<string[]>(g.beneficiaries, []) }))
  )
}

/** IA aponta lacunas úteis (não aleatórias), considerando o que já existe e o que foi dispensado. */
export async function detectGaps(): Promise<{ created: number; calls: number }> {
  const owner = currentOwner()
  await ensureSeeded(owner)
  const consume = await resolveConsume('memory.gaps')
  const produce = await resolveProduce('memory.gaps')
  if (!consume.ok || !produce.ok) throw new MemoryError('Lacunas bloqueadas pela política.', 'forbidden')
  const db = await getDb()
  const cov = await coverage()
  const mems = liveMemories(db, owner).filter((m) => m.status === 'active' && categoryAllowed(consume.rule, m.catSlug) && sensitivityAllowed(consume.rule, m.effectiveSensitivity))
  const dismissed = all<{ topic: string; status: string }>(db, "SELECT topic, status FROM memory_gaps WHERE ownerId = ? AND status != 'open' ORDER BY id DESC LIMIT 40", [owner])
  const open = all<{ topic: string }>(db, "SELECT topic FROM memory_gaps WHERE ownerId = ? AND status = 'open'", [owner])
  const needs = MEMORY_POLICIES.filter((p) => p.consume && !p.useCase.startsWith('memory.'))
    .map((p) => `- ${p.label}${p.approved ? '' : ' (candidata)'}: ${p.purpose} [categorias: ${!p.consume ? '' : p.consume.categories === '*' ? 'todas' : (p.consume.categories as string[]).join(', ')}]`)
    .join('\n')
  const prompt = `Cobertura atual por categoria:\n${cov.rows.map((r) => `- ${r.slug} (${r.name}): ${r.active} ativas, estado ${r.state}`).join('\n')}

Funcionalidades que usariam memória:\n${needs}

<memorias>\n${mems
    .slice(0, consume.rule.maxItems)
    .map((m) => `- [${m.catSlug ?? 'sem-categoria'}] ${sanitizeForPrompt(m.title, 120)}`)
    .join('\n')}\n</memorias>

Lacunas já abertas (não repita):\n${open.map((g) => `- ${g.topic}`).join('\n') || '(nenhuma)'}
Lacunas dispensadas/respondidas (não repita):\n${dismissed.map((g) => `- ${g.topic} (${g.status})`).join('\n') || '(nenhuma)'}`
  const system = `Você identifica LACUNAS relevantes no conhecimento pessoal do usuário.
${SAFETY}
- Só lacunas que melhorariam de verdade alguma funcionalidade listada ou objetivos conhecidos. Nada aleatório, nada para "encher" o perfil.
- Não pergunte sobre saúde, finanças detalhadas, sexualidade, religião, política ou terceiros, a menos que já exista contexto do usuário nisso — e mesmo assim marque sensitivity PRIVATE.
- Perguntas curtas, abertas, naturais.
- Máximo ${produce.rule.maxSuggestionsPerRun} lacunas. Zero é válido.
Formato: {"gaps":[{"topic":"curto","category":"slug","why":"por que ajudaria","beneficiaries":["funcionalidade"],"priority":1-3,"sensitivity":"NORMAL|PRIVATE","question":"pergunta"}]}`
  const raw = await callAi('lacunas', system, prompt)
  const parsed = parseJsonObject<{ gaps?: { topic?: string; category?: string; why?: string; beneficiaries?: string[]; priority?: number; sensitivity?: string; question?: string }[] }>(raw)
  let created = 0
  const cats = categoriesSync(db, owner)
  for (const g of (parsed.gaps ?? []).slice(0, produce.rule.maxSuggestionsPerRun)) {
    const topic = String(g.topic ?? '').trim().slice(0, 120)
    const question = String(g.question ?? '').trim().slice(0, 300)
    if (!topic || !question) continue
    // lacunas restritas nunca viram pergunta
    if (g.sensitivity === 'RESTRICTED') continue
    const cat = cats.find((c) => c.slug === g.category)
    if (cat && !categoryAllowed(produce.rule, cat.slug)) continue
    const given: Sensitivity = g.sensitivity === 'PRIVATE' ? 'PRIVATE' : 'NORMAL'
    const sens: Sensitivity = cat && SENS_RANK[cat.defaultSensitivity] > SENS_RANK[given] ? cat.defaultSensitivity : given
    if (SENS_RANK[sens] > SENS_RANK[produce.rule.maxSensitivity] || sens === 'RESTRICTED') continue
    created += exec(
      db,
      'INSERT OR IGNORE INTO memory_gaps (ownerId, topic, categoryId, why, beneficiaries, priority, sensitivity, question, normKey, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [
        owner,
        topic,
        cat?.id ?? null,
        String(g.why ?? '').slice(0, 300),
        JSON.stringify((Array.isArray(g.beneficiaries) ? g.beneficiaries : []).map(String).slice(0, 5)),
        Math.min(3, Math.max(1, Math.round(Number(g.priority) || 2))),
        sens,
        question,
        normText(topic),
        nowIso()
      ]
    )
  }
  saveDb()
  return { created, calls: 1 }
}

export async function setGapStatus(id: number, status: 'dismissed' | 'irrelevant' | 'open'): Promise<void> {
  await tx((db) => exec(db, 'UPDATE memory_gaps SET status = ?, resolvedAt = ? WHERE id = ? AND ownerId = ?', [status, status === 'open' ? null : nowIso(), id, currentOwner()]))
}

/** Responder uma lacuna: a resposta vira sugestões (nunca memória direta). */
export async function answerGap(id: number, answer: string): Promise<RunStats> {
  const owner = currentOwner()
  const db = await getDb()
  const g = one<{ question: string; topic: string }>(db, 'SELECT question, topic FROM memory_gaps WHERE id = ? AND ownerId = ?', [id, owner])
  if (!g) throw new MemoryError('Lacuna não encontrada.', 'not_found')
  const st = await extractFromText({ useCase: 'memory.interview', text: answer, sourceKind: 'interview', sourceRef: `lacuna#${id}`, op: 'entrevista', hint: `Resposta à pergunta: "${g.question}"` })
  exec(db, "UPDATE memory_gaps SET status = 'answered', resolvedAt = ? WHERE id = ? AND ownerId = ?", [nowIso(), id, owner])
  saveDb()
  return st
}

// ── Me conheça melhor (entrevista) ───────────────────────────────────────────

export interface InterviewTurn {
  question: string
  why?: string
  answer?: string
  skipped?: boolean
  at: string
  proposed?: number
}
export interface Interview {
  id: number
  topic: string
  categoryId: number | null
  status: 'open' | 'ended'
  turns: InterviewTurn[]
  createdAt: string
  endedAt: string | null
}

function interviewSync(db: Database, owner: string, id: number): Interview | null {
  const r = one<Interview & { turns: string }>(db, 'SELECT * FROM memory_interviews WHERE id = ? AND ownerId = ?', [id, owner])
  return r ? { ...r, id: Number(r.id), turns: jparse<InterviewTurn[]>(r.turns, []) } : null
}

export async function listInterviews(): Promise<Interview[]> {
  const owner = currentOwner()
  return read((db) => all<{ id: number }>(db, 'SELECT id FROM memory_interviews WHERE ownerId = ? ORDER BY id DESC LIMIT 20', [owner]).map((r) => interviewSync(db, owner, Number(r.id))!))
}

const INTERVIEW_SYSTEM = (max: number): string => `Você conduz uma conversa leve e natural ("Me conheça melhor") para entender melhor o usuário.
${SAFETY}
- Uma pergunta por vez, curta, aberta, contextualizada no que ele já contou. Pode ser complementar à resposta anterior.
- Nunca repita perguntas já feitas nem pergunte o que <memorias> já responde.
- Se a resposta for ambígua, peça esclarecimento.
- Não force temas sensíveis (saúde, finanças, relacionamentos, religião, política). Se o usuário pular, mude de assunto.
- Extraia da ÚLTIMA resposta apenas conhecimentos duradouros (máx. ${max}), com evidence = trecho literal da resposta. explicit=true só para o que ele disse.
- Se o tema se esgotou, next_question = null.
Formato: {"suggestions":[{"op":"CREATE|UPDATE","title":"","content":"","category":"slug","type":"FACT|PREFERENCE|GOAL|CONSTRAINT|HABIT|INSTRUCTION|EXPERIENCE|LEARNING|INFERENCE","tags":[],"importance":1-5,"stability":"permanent|stable|evolving|transient","sensitivity":"NORMAL|PRIVATE|RESTRICTED","explicit":true,"confidence":0-1,"rationale":"","benefit":"","evidence":"","targetIds":[]}],"next_question":"…"|null,"why":"por que essa pergunta"}`

async function interviewStep(id: number, answer: string | null): Promise<Interview> {
  const owner = currentOwner()
  const consume = await resolveConsume('memory.interview')
  const produce = await resolveProduce('memory.interview')
  if (!consume.ok || !produce.ok) throw new MemoryError('Entrevista bloqueada pela política.', 'forbidden')
  const db = await getDb()
  const iv = interviewSync(db, owner, id)
  if (!iv) throw new MemoryError('Entrevista não encontrada.', 'not_found')
  if (iv.status !== 'open') throw new MemoryError('Esta conversa já foi encerrada.')
  const last = iv.turns[iv.turns.length - 1]
  const cats = categoriesSync(db, owner, false)
  const cat = cats.find((c) => c.id === iv.categoryId)
  const known = retrieve(db, owner, { rule: consume.rule, query: `${iv.topic} ${cat?.name ?? ''} ${answer ?? ''}`, minRelevance: 0.1 }).selected
  const previousQs = all<{ turns: string }>(db, 'SELECT turns FROM memory_interviews WHERE ownerId = ? ORDER BY id DESC LIMIT 10', [owner])
    .flatMap((r) => jparse<InterviewTurn[]>(r.turns, []))
    .map((t) => t.question)
  const prompt = `Tema: ${sanitizeForPrompt(iv.topic, 200)}${cat ? ` (categoria ${cat.slug})` : ''}
Categorias permitidas: ${cats.filter((c) => categoryAllowed(produce.rule, c.slug)).map((c) => c.slug).join(', ')}

<memorias>\n${known.map((s) => `#${s.memory.id} ${s.line}`).join('\n') || '(nada ainda)'}\n</memorias>

Perguntas já feitas (não repita):\n${previousQs.slice(0, 40).map((q) => `- ${q}`).join('\n') || '(nenhuma)'}

<respostas>\n${iv.turns
    .slice(-6)
    .map((t) => `P: ${t.question}\nR: ${t.skipped ? '(pulou)' : sanitizeForPrompt(t.answer ?? '', 800)}`)
    .join('\n')}\n</respostas>
${answer == null ? (iv.turns.length ? 'O usuário pulou a última pergunta. Faça outra, de outro ângulo.' : 'Faça a primeira pergunta.') : 'Analise a última resposta e faça a próxima pergunta.'}`
  const raw = await callAi('entrevista', INTERVIEW_SYSTEM(produce.rule.maxSuggestionsPerRun), prompt)
  const parsed = parseJsonObject<{ suggestions?: unknown[]; next_question?: string | null; why?: string }>(raw)
  let proposed = 0
  if (answer && last) {
    proposed = proposeFromItems(db, owner, parsed.suggestions ?? [], produce.rule, { sourceKind: 'interview', sourceRef: `entrevista#${id}`, source: answer, allowedIds: new Set(known.map((k) => k.memory.id)) })
    last.proposed = proposed
  }
  const next = String(parsed.next_question ?? '').trim()
  if (next) iv.turns.push({ question: next.slice(0, 400), why: String(parsed.why ?? '').slice(0, 200), at: nowIso() })
  const ended = !next
  exec(db, 'UPDATE memory_interviews SET turns = ?, status = ?, updatedAt = ?, endedAt = ? WHERE id = ? AND ownerId = ?', [
    JSON.stringify(iv.turns),
    ended ? 'ended' : 'open',
    nowIso(),
    ended ? nowIso() : null,
    id,
    owner
  ])
  saveDb()
  return interviewSync(db, owner, id)!
}

export async function startInterview(topic: string, categoryId: number | null): Promise<Interview> {
  const owner = currentOwner()
  await ensureSeeded(owner)
  const t = String(topic ?? '').trim().slice(0, 200) || 'Descubra informações importantes que ainda não sabe sobre mim'
  const id = await tx((db) => {
    const now = nowIso()
    exec(db, 'INSERT INTO memory_interviews (ownerId, topic, categoryId, turns, createdAt, updatedAt) VALUES (?,?,?,?,?,?)', [owner, t, categoryId ?? null, '[]', now, now])
    return lastId(db)
  })
  return interviewStep(id, null)
}

export async function answerInterview(id: number, answer: string): Promise<Interview> {
  const owner = currentOwner()
  const text = String(answer ?? '').trim().slice(0, 4000)
  if (!text) throw new MemoryError('Resposta vazia.')
  await tx((db) => {
    const iv = interviewSync(db, owner, id)
    if (!iv) throw new MemoryError('Entrevista não encontrada.', 'not_found')
    const last = iv.turns[iv.turns.length - 1]
    if (!last || last.answer || last.skipped) throw new MemoryError('Não há pergunta aguardando resposta.')
    last.answer = text
    exec(db, 'UPDATE memory_interviews SET turns = ?, updatedAt = ? WHERE id = ?', [JSON.stringify(iv.turns), nowIso(), id])
  })
  return interviewStep(id, text)
}

export async function skipInterview(id: number): Promise<Interview> {
  const owner = currentOwner()
  await tx((db) => {
    const iv = interviewSync(db, owner, id)
    if (!iv) throw new MemoryError('Entrevista não encontrada.', 'not_found')
    const last = iv.turns[iv.turns.length - 1]
    if (last && !last.answer) last.skipped = true
    exec(db, 'UPDATE memory_interviews SET turns = ?, updatedAt = ? WHERE id = ?', [JSON.stringify(iv.turns), nowIso(), id])
  })
  return interviewStep(id, null)
}

export async function endInterview(id: number): Promise<Interview> {
  const owner = currentOwner()
  return tx((db) => {
    exec(db, "UPDATE memory_interviews SET status = 'ended', endedAt = ?, updatedAt = ? WHERE id = ? AND ownerId = ?", [nowIso(), nowIso(), id, owner])
    const iv = interviewSync(db, owner, id)
    if (!iv) throw new MemoryError('Entrevista não encontrada.', 'not_found')
    return iv
  })
}

// ── Linha do tempo ───────────────────────────────────────────────────────────

export interface TimelineEvent {
  at: string
  kind: string
  memoryId: number
  title: string
  categoryId: number | null
  occurredAt: string | null
  actor: string
  reason: string | null
}

export async function timeline(opts: { categoryId?: number | null; limit?: number } = {}): Promise<TimelineEvent[]> {
  const owner = currentOwner()
  return read((db) =>
    all<TimelineEvent & { memoryId: number }>(
      db,
      `SELECT r.createdAt AS at, r.changeKind AS kind, r.memoryId, m.title, m.categoryId, m.occurredAt, r.actor, r.reason
       FROM memory_revisions r JOIN memories m ON m.id = r.memoryId AND m.ownerId = r.ownerId
       WHERE r.ownerId = ? ${opts.categoryId != null ? 'AND m.categoryId = ?' : ''} AND r.changeKind NOT IN ('pin','unpin')
       ORDER BY r.id DESC LIMIT ?`,
      opts.categoryId != null ? [owner, Number(opts.categoryId), Math.min(1000, opts.limit ?? 300)] : [owner, Math.min(1000, opts.limit ?? 300)]
    ).map((e) => ({ ...e, memoryId: Number(e.memoryId) }))
  )
}
