import type { Database } from 'sql.js'
import type { ExportBundle, MemoryType, PersonalMemory, RelationKind, Sensitivity } from '../../shared/memory'
import { MEMORY_STATUSES, MEMORY_TYPES, RELATION_KINDS, TYPE_LABEL, normText } from '../../shared/memory'
import { getDb } from '../database/db'
import { getSetting } from '../database/queries'
import { extractFromText, type RunStats } from './agent'
import { resolveProduce } from './policy'
import {
  MEM_SELECT,
  MemoryError,
  addRelationSync,
  all,
  categoriesSync,
  categoryBySlug,
  createMemorySync,
  currentOwner,
  ensureSeeded,
  exec,
  findByNormSync,
  jparse,
  nowIso,
  one,
  read,
  sha,
  slugify,
  toMemory,
  tx
} from './repo'
import { proposeSync } from './suggestions'

/**
 * Importação/exportação e migração da Base de Conhecimento antiga.
 * A chave `settings.knowledge_base` é SOMENTE LIDA aqui — nunca alterada nem apagada.
 */

// ── Exportação ───────────────────────────────────────────────────────────────

export interface ExportOptions {
  includeArchived?: boolean
  /** Inclui memórias RESTRITAS (padrão: não). */
  includeRestricted?: boolean
}

function exportable(db: Database, owner: string, o: ExportOptions): (PersonalMemory & { catSlug: string | null })[] {
  const statuses = o.includeArchived ? MEMORY_STATUSES : (['active', 'unconfirmed', 'outdated'] as const)
  return all<Parameters<typeof toMemory>[0] & { catSlug: string | null }>(
    db,
    `${MEM_SELECT.replace('FROM memories m', ', c.slug AS catSlug FROM memories m')} WHERE m.ownerId = ? AND m.status IN (${statuses.map(() => '?').join(',')}) ORDER BY c.sortOrder, m.importance DESC, m.id`,
    [owner, ...statuses]
  )
    .map((r) => ({ ...toMemory(r), catSlug: r.catSlug }))
    .filter((m) => o.includeRestricted || m.effectiveSensitivity !== 'RESTRICTED')
}

export async function exportJson(o: ExportOptions = {}): Promise<ExportBundle> {
  const owner = currentOwner()
  await ensureSeeded(owner)
  return read((db) => {
    const mems = exportable(db, owner, o)
    const ref = (id: number): string => `m${id}`
    const ids = new Set(mems.map((m) => m.id))
    const evidence = new Map<number, { sourceKind: string; sourceRef: string | null; excerpt: string }[]>()
    for (const e of all<{ memoryId: number; sourceKind: string; sourceRef: string | null; excerpt: string }>(db, 'SELECT memoryId, sourceKind, sourceRef, excerpt FROM memory_evidence WHERE ownerId = ? AND memoryId IS NOT NULL', [owner]))
      if (ids.has(Number(e.memoryId))) evidence.set(Number(e.memoryId), [...(evidence.get(Number(e.memoryId)) ?? []), { sourceKind: e.sourceKind, sourceRef: e.sourceRef, excerpt: e.excerpt }])
    return {
      format: 'rickos-memory',
      version: 1,
      exportedAt: nowIso(),
      categories: categoriesSync(db, owner).map(({ slug, name, icon, description, defaultSensitivity, sortOrder, archivedAt }) => ({ slug, name, icon, description, defaultSensitivity, sortOrder, archivedAt })),
      memories: mems.map((m) => {
        const { id, categoryId: _c, effectiveSensitivity: _e, embeddingModel: _em, supersededById: _s, catSlug, ...rest } = m
        return { ...rest, ref: ref(id), category: catSlug, evidence: evidence.get(id) ?? [] }
      }),
      relations: all<{ fromId: number; toId: number; kind: string; note: string | null }>(db, 'SELECT fromId, toId, kind, note FROM memory_relations WHERE ownerId = ?', [owner])
        .filter((r) => ids.has(Number(r.fromId)) && ids.has(Number(r.toId)))
        .map((r) => ({ from: ref(Number(r.fromId)), to: ref(Number(r.toId)), kind: r.kind as RelationKind, note: r.note }))
    }
  })
}

export async function exportMarkdown(o: ExportOptions = {}): Promise<string> {
  const owner = currentOwner()
  await ensureSeeded(owner)
  return read((db) => {
    const mems = exportable(db, owner, o)
    const cats = categoriesSync(db, owner)
    const lines = ['# Memória Pessoal', '', `_Exportado em ${nowIso().slice(0, 10)} · ${mems.length} memórias_`, '']
    const groups: [string, typeof mems][] = [
      ...cats.map((c) => [`${c.icon} ${c.name}`, mems.filter((m) => m.categoryId === c.id)] as [string, typeof mems]),
      ['Sem categoria', mems.filter((m) => m.categoryId == null)]
    ]
    for (const [name, list] of groups) {
      if (!list.length) continue
      lines.push(`## ${name}`, '')
      for (const m of list) {
        const flags = [TYPE_LABEL[m.type], m.status !== 'active' ? m.status : '', m.reliability === 'inferred' ? 'inferência' : '', m.pinned ? 'fixada' : ''].filter(Boolean).join(', ')
        lines.push(`- ${m.content.replace(/\n+/g, ' ')} _(${flags})_${m.tags.length ? ` ${m.tags.map((t) => `#${t}`).join(' ')}` : ''}`)
      }
      lines.push('')
    }
    return lines.join('\n')
  })
}

// ── Importação ───────────────────────────────────────────────────────────────

export interface ImportResult {
  created: number
  suggested: number
  skipped: number
  reasons: Record<string, number>
  alreadyImported?: boolean
}

const bump = (r: ImportResult, k: string): void => {
  r.skipped++
  r.reasons[k] = (r.reasons[k] ?? 0) + 1
}

function registerImport(db: Database, owner: string, kind: string, sourceHash: string, stats: object): void {
  exec(db, 'INSERT OR REPLACE INTO memory_imports (ownerId, kind, sourceHash, status, stats, createdAt) VALUES (?,?,?,?,?,?)', [owner, kind, sourceHash, 'done', JSON.stringify(stats), nowIso()])
}

/**
 * Importa um JSON exportado pelo app. `direct` cria memórias (confiança no próprio arquivo,
 * escolha explícita do usuário); `review` manda tudo para o Inbox. Idempotente por normKey.
 */
export async function importJson(input: unknown, mode: 'direct' | 'review' = 'review'): Promise<ImportResult> {
  const owner = currentOwner()
  await ensureSeeded(owner)
  const b = (typeof input === 'string' ? jparse<unknown>(input, null) : input) as ExportBundle | null
  if (!b || b.format !== 'rickos-memory' || !Array.isArray(b.memories)) throw new MemoryError('Arquivo não é uma exportação da Memória Pessoal.')
  if (b.memories.length > 5000) throw new MemoryError('Arquivo grande demais (máx. 5000 memórias).')
  const produce = await resolveProduce('memory.text')
  return tx((db) => {
    const r: ImportResult = { created: 0, suggested: 0, skipped: 0, reasons: {} }
    for (const c of Array.isArray(b.categories) ? b.categories.slice(0, 200) : []) {
      const slug = slugify(String(c.slug || c.name || ''))
      if (!slug || categoryBySlug(db, owner, slug)) continue
      const now = nowIso()
      exec(db, 'INSERT INTO memory_categories (ownerId, slug, name, icon, description, defaultSensitivity, sortOrder, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?)', [
        owner,
        slug,
        String(c.name || slug).slice(0, 60),
        String(c.icon || '•').slice(0, 8),
        String(c.description || '').slice(0, 300),
        (['NORMAL', 'PRIVATE', 'RESTRICTED'] as Sensitivity[]).includes(c.defaultSensitivity) ? c.defaultSensitivity : 'NORMAL',
        Number(c.sortOrder) || 99,
        now,
        now
      ])
    }
    const refs = new Map<string, number>()
    for (const m of b.memories) {
      const content = String(m?.content ?? '').trim()
      if (!content) {
        bump(r, 'sem conteúdo')
        continue
      }
      const existing = findByNormSync(db, owner, normText(content))
      if (existing) {
        refs.set(String(m.ref), existing.id)
        bump(r, 'já existe')
        continue
      }
      const cat = m.category ? categoryBySlug(db, owner, slugify(String(m.category))) : null
      const type: MemoryType = MEMORY_TYPES.includes(m.type) ? m.type : 'FACT'
      if (mode === 'direct') {
        const created = createMemorySync(
          db,
          owner,
          {
            title: m.title,
            content,
            categoryId: cat?.id ?? null,
            tags: m.tags,
            type,
            layer: m.layer,
            pinned: !!m.pinned,
            importance: m.importance,
            stability: m.stability,
            scope: m.scope,
            sensitivity: m.sensitivity,
            occurredAt: m.occurredAt,
            validFrom: m.validFrom,
            validUntil: m.validUntil
          },
          {
            origin: 'import',
            originRef: 'json',
            reliability: m.reliability === 'inferred' ? 'inferred' : m.reliability === 'observed' ? 'observed' : 'stated',
            confirmed: !!m.confirmedAt,
            status: MEMORY_STATUSES.includes(m.status) && m.status !== 'superseded' ? m.status : 'active',
            evidence: (Array.isArray(m.evidence) && m.evidence.length ? m.evidence : [{ sourceKind: 'import', excerpt: content }]).slice(0, 10).map((e) => ({
              sourceKind: String(e.sourceKind || 'import'),
              sourceRef: (e as { sourceRef?: string | null }).sourceRef ?? null,
              excerpt: String(e.excerpt || content)
            }))
          }
        )
        refs.set(String(m.ref), created.id)
        r.created++
      } else {
        if (!produce.ok) throw new MemoryError(`Importação bloqueada: ${produce.reason}`, 'forbidden')
        const sourceRef = m.sourceRef
        if (sourceRef !== undefined) {
          if (typeof sourceRef !== 'string' || !sourceRef.trim() || sourceRef.length > 200) {
            bump(r, 'referência de origem inválida')
            continue
          }
          if (one(db, "SELECT id FROM memory_suggestions WHERE ownerId = ? AND sourceKind = 'import' AND sourceRef = ?", [owner, sourceRef])) {
            bump(r, 'referência já importada')
            continue
          }
        }
        const evidence = Array.isArray(m.evidence)
          ? m.evidence.filter((e) => typeof e?.excerpt === 'string' && e.excerpt.trim())
          : []
        const out = proposeSync(
          db,
          owner,
          {
            op: 'CREATE',
            proposed: { title: m.title, content, category: cat?.slug ?? '', type, layer: m.layer, tags: m.tags, importance: m.importance, stability: m.stability, sensitivity: m.sensitivity, occurredAt: m.occurredAt, validUntil: m.validUntil, scope: m.scope },
            explicit: m.reliability !== 'inferred' && type !== 'INFERENCE',
            extractionConfidence: m.extractionConfidence,
            rationale: m.reviewNote || 'Importado de arquivo JSON',
            sourceKind: 'import',
            sourceRef: sourceRef ?? 'json',
            evidence: evidence.length ? evidence : [{ excerpt: content }]
          },
          produce.rule
        )
        if (out.ok) r.suggested++
        else bump(r, out.reason)
      }
    }
    if (mode === 'direct')
      for (const rel of Array.isArray(b.relations) ? b.relations.slice(0, 20000) : []) {
        const from = refs.get(String(rel.from))
        const to = refs.get(String(rel.to))
        if (from && to && from !== to && RELATION_KINDS.includes(rel.kind)) addRelationSync(db, owner, from, to, rel.kind, rel.note ?? null)
      }
    registerImport(db, owner, `json-${mode}`, sha(JSON.stringify(b.memories)), r)
    return r
  })
}

// ── Markdown (sem IA): cada linha de lista vira sugestão ─────────────────────

const HEADING_TO_CATEGORY: [RegExp, string][] = [
  [/viag|travel|destin/, 'viagens'],
  [/trabalh|profiss|carreir|job|empreg/, 'profissional'],
  [/estud|educa|forma/, 'educacao'],
  [/objetiv|meta|goal/, 'objetivos'],
  [/habit|rotina|routine/, 'rotina'],
  [/produtiv/, 'produtividade'],
  [/financ|dinheir|money/, 'financas'],
  [/saud|health|bem.estar/, 'saude'],
  [/relac|famil|amig/, 'relacionamentos'],
  [/valor/, 'valores'],
  [/interess|hobb/, 'interesses'],
  [/prefer|gost/, 'preferencias'],
  [/ia\b|\bai\b|instru/, 'instrucoes-ia'],
  [/perfil|sobre|identi|quem sou/, 'identidade']
]

export function guessCategory(heading: string): string {
  const h = normText(heading)
  return HEADING_TO_CATEGORY.find(([re]) => re.test(h))?.[1] ?? ''
}

export function guessType(text: string): MemoryType {
  const t = normText(text)
  if (/\b(gosto|gosta|prefiro|prefere|adoro|adora|amo|curto|evito|evita|odeio|nao gosto)\b/.test(t)) return 'PREFERENCE'
  if (/\b(quero|pretendo|meta|objetivo|planejo|sonho)\b/.test(t)) return 'GOAL'
  if (/\b(nao posso|nao como|alerg|restric|nao bebo)\b/.test(t)) return 'CONSTRAINT'
  if (/\b(sempre|todo dia|toda manha|costumo|rotina)\b/.test(t)) return 'HABIT'
  if (/\b(responda|seja|use|nao use|escreva)\b/.test(t)) return 'INSTRUCTION'
  return 'FACT'
}

export interface MdItem {
  content: string
  heading: string
  category: string
  type: MemoryType
}

/** Extrai itens de lista (`-`, `*`, `1.`) com o cabeçalho em que estão. */
export function parseMarkdownItems(md: string): MdItem[] {
  let heading = ''
  const out: MdItem[] = []
  const seen = new Set<string>()
  for (const raw of md.replace(/\r\n/g, '\n').split('\n')) {
    const h = /^#{1,6}\s+(.+)/.exec(raw)
    if (h) {
      heading = h[1].trim()
      continue
    }
    const li = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.+)/.exec(raw)
    if (!li) continue
    const content = li[1].trim().replace(/\s+/g, ' ')
    const key = normText(content)
    if (content.length < 3 || seen.has(key)) continue
    seen.add(key)
    out.push({ content: content.charAt(0).toUpperCase() + content.slice(1), heading, category: guessCategory(heading), type: guessType(content) })
  }
  return out
}

export async function importMarkdownItems(md: string, sourceKind: 'import' | 'migration', sourceRef: string, useCase: 'memory.text' | 'memory.migration'): Promise<ImportResult> {
  const owner = currentOwner()
  await ensureSeeded(owner)
  const produce = await resolveProduce(useCase)
  if (!produce.ok) throw new MemoryError(`Importação bloqueada: ${produce.reason}`, 'forbidden')
  const items = parseMarkdownItems(String(md ?? '')).slice(0, 1000)
  return tx((db) => {
    const r: ImportResult = { created: 0, suggested: 0, skipped: 0, reasons: {} }
    for (const it of items) {
      const out = proposeSync(
        db,
        owner,
        {
          op: 'CREATE',
          proposed: { content: it.content, category: it.category, type: it.type },
          explicit: true,
          rationale: it.heading ? `Linha da seção "${it.heading}"` : 'Linha do documento',
          benefit: 'Preserva o que você já tinha escrito',
          sourceKind,
          sourceRef: `${sourceRef}${it.heading ? `#${it.heading.slice(0, 60)}` : ''}`,
          evidence: [{ excerpt: it.content }]
        },
        // a lista de linhas é do próprio usuário: o teto de quantidade é o do lote, não o do agente
        { ...produce.rule, maxSuggestionsPerRun: 1000 }
      )
      if (out.ok) r.suggested++
      else bump(r, out.reason)
    }
    return r
  })
}

// ── Migração da Base de Conhecimento ─────────────────────────────────────────

export interface LegacyStatus {
  hasLegacy: boolean
  chars: number
  bullets: number
  sourceHash: string | null
  imports: { kind: string; createdAt: string; stats: ImportResult }[]
  pending: number
  approved: number
}

async function legacyText(): Promise<string> {
  return ((await getSetting('knowledge_base')) ?? '').trim()
}

export async function legacyStatus(): Promise<LegacyStatus> {
  const owner = currentOwner()
  const text = await legacyText()
  return read((db) => ({
    hasLegacy: !!text,
    chars: text.length,
    bullets: parseMarkdownItems(text).length,
    sourceHash: text ? sha(text) : null,
    imports: all<{ kind: string; createdAt: string; stats: string }>(db, "SELECT kind, createdAt, stats FROM memory_imports WHERE ownerId = ? AND kind LIKE 'legacy%' ORDER BY id DESC", [owner]).map((r) => ({
      kind: r.kind,
      createdAt: r.createdAt,
      stats: jparse<ImportResult>(r.stats, { created: 0, suggested: 0, skipped: 0, reasons: {} })
    })),
    pending: Number(one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM memory_suggestions WHERE ownerId = ? AND sourceKind = 'migration' AND status IN ('pending','snoozed','needs_info')", [owner])?.n ?? 0),
    approved: Number(one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM memory_suggestions WHERE ownerId = ? AND sourceKind = 'migration' AND status = 'approved'", [owner])?.n ?? 0)
  }))
}

/**
 * Gera as sugestões da migração (preview no Inbox). Idempotente: o mesmo documento não
 * é reprocessado (salvo `force`), e cada item tem dedupe próprio.
 * `ai: false` → uma sugestão por linha de lista (sem custo); `ai: true` → extração atômica pela IA.
 */
export async function migrateLegacy(opts: { ai: boolean; force?: boolean }): Promise<ImportResult & { ai?: RunStats }> {
  const owner = currentOwner()
  await ensureSeeded(owner)
  const text = await legacyText()
  if (!text) throw new MemoryError('A Base de Conhecimento antiga está vazia.')
  const hash = sha(text)
  const kind = opts.ai ? 'legacy-ai' : 'legacy-lines'
  const db = await getDb()
  const prev = one<{ stats: string }>(db, 'SELECT stats FROM memory_imports WHERE ownerId = ? AND kind = ? AND sourceHash = ?', [owner, kind, hash])
  if (prev && !opts.force) return { ...jparse<ImportResult>(prev.stats, { created: 0, suggested: 0, skipped: 0, reasons: {} }), alreadyImported: true }
  let result: ImportResult & { ai?: RunStats }
  if (opts.ai) {
    const st = await extractFromText({ useCase: 'memory.migration', text, sourceKind: 'migration', sourceRef: 'knowledge_base', op: 'migracao' })
    result = { created: 0, suggested: st.proposed, skipped: Object.values(st.dropped).reduce((a, b) => a + b, 0), reasons: st.dropped, ai: st }
  } else {
    result = await importMarkdownItems(text, 'migration', 'knowledge_base', 'memory.migration')
  }
  await tx((d) => registerImport(d, owner, kind, hash, { created: result.created, suggested: result.suggested, skipped: result.skipped, reasons: result.reasons }))
  return result
}

