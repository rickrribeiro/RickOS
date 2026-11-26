import fs from 'fs'
import path from 'path'
import type { Database } from 'sql.js'
import { attachmentsDir, listAttachments, referencedAttachments, slugify, storeAttachment, mimeFromName, ATTACHMENT_PREFIX } from './attachments'
import { treeOrder, type NodeRow } from './repo'
import { all, exec, one, read, StudyError, tx } from './sql'
import type { RestoreReport } from '../../shared/estudos'
import { tt } from '../i18n'
export type { RestoreReport }


/**
 * Cópia legível e restaurável do módulo de Estudos — SEM IA, determinística (mesmo banco →
 * mesmos bytes, para o Git só ver o que mudou).
 *
 *   <pasta gerenciada>/
 *     manifest.json            formato, versão, tópicos, anexos e vínculos externos
 *     README.md                como ler e restaurar
 *     anexos/<arquivo>         imagens (links relativos nas notas)
 *     <tópico>-<uid6>/
 *       README.md              visão geral + nota do tópico + roteiro
 *       notas/NNN-<nó>.md      uma nota por nó, na ordem do roteiro
 *       fontes/<id>-<título>.md
 *       dados.json             tudo que é preciso para restaurar (hierarquia, ordem, estados,
 *                              cartões, agenda SRS, logs, tentativas, checkpoints, aulas e
 *                              últimos materiais do tutor)
 */
export const BUNDLE_FORMAT = 'rickos-estudos'
export const BUNDLE_VERSION = 1

/** Tabelas por tópico, na ordem de restauração, e como remapear cada chave. */
interface TableSpec {
  table: string
  /** coluna → tabela de destino (o id antigo vira o novo). */
  refs: Record<string, string>
  /** Linhas: por topicId ou via pai. */
  by: { column: 'topicId' } | { column: string; parent: string }
}

export const TABLES: TableSpec[] = [
  { table: 'study_nodes', refs: { topicId: 'study_topics', parentId: 'study_nodes', planId: 'study_plans' }, by: { column: 'topicId' } },
  { table: 'study_notes', refs: { topicId: 'study_topics', nodeId: 'study_nodes' }, by: { column: 'topicId' } },
  { table: 'study_sources', refs: { topicId: 'study_topics', nodeId: 'study_nodes' }, by: { column: 'topicId' } },
  { table: 'study_flashcards', refs: { topicId: 'study_topics', nodeId: 'study_nodes' }, by: { column: 'topicId' } },
  { table: 'study_card_states', refs: { cardId: 'study_flashcards' }, by: { column: 'cardId', parent: 'study_flashcards' } },
  { table: 'study_review_log', refs: { flashcardId: 'study_flashcards', topicId: 'study_topics', stateId: 'study_card_states' }, by: { column: 'topicId' } },
  { table: 'study_questions', refs: { topicId: 'study_topics', nodeId: 'study_nodes' }, by: { column: 'topicId' } },
  { table: 'study_attempts', refs: { questionId: 'study_questions', topicId: 'study_topics' }, by: { column: 'topicId' } },
  { table: 'study_quiz_attempts', refs: { topicId: 'study_topics' }, by: { column: 'topicId' } },
  { table: 'study_plans', refs: { topicId: 'study_topics' }, by: { column: 'topicId' } },
  { table: 'study_lessons', refs: { topicId: 'study_topics', nodeId: 'study_nodes', planId: 'study_plans' }, by: { column: 'topicId' } },
  { table: 'study_lesson_turns', refs: { lessonId: 'study_lessons' }, by: { column: 'lessonId', parent: 'study_lessons' } },
  { table: 'study_materials', refs: { topicId: 'study_topics', nodeId: 'study_nodes' }, by: { column: 'topicId' } },
  { table: 'study_suggestions', refs: { topicId: 'study_topics', nodeId: 'study_nodes' }, by: { column: 'topicId' } },
  { table: 'study_checkpoints', refs: { topicId: 'study_topics', nodeId: 'study_nodes' }, by: { column: 'topicId' } },
  { table: 'study_origins', refs: { topicId: 'study_topics', nodeId: 'study_nodes' }, by: { column: 'topicId' } }
]

/** Dados de outros módulos que apontam para Estudos e NÃO vão na cópia (exigem o banco do app). */
export const EXTERNAL_LINKS = [
  { modulo: 'Time Tracker', onde: 'tasks.studyNodeId', efeito: 'horas de foco por tópico; após restaurar, sessões antigas não se religam aos nós novos' },
  { modulo: 'Metas', onde: "goals (kind = 'study', refId)", efeito: 'metas mensais ligadas a um tópico precisam ser religadas' },
  { modulo: 'Configurações', onde: 'settings study_* (fixado, limite de novos, Git)', efeito: 'preferências locais de cada instalação' }
]

type Row = Record<string, string | number | null>

function hasTable(db: Database, t: string): boolean {
  return !!one(db, "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [t])
}
function columns(db: Database, t: string): string[] {
  return all<{ name: string }>(db, `PRAGMA table_info(${t})`).map((c) => c.name)
}

export interface TopicData {
  formato: typeof BUNDLE_FORMAT
  versao: number
  topic: Row & { categoryNames?: Record<string, string> }
  tables: Record<string, Row[]>
  /** id da categoria → nome (cartões mapeiam por nome na restauração). */
  categories: Record<string, string>
}

export interface ExportFileOut {
  path: string
  /** utf-8 ou bytes (anexos). */
  content: string | Buffer
}

function ensureUids(db: Database): void {
  db.run("UPDATE study_topics SET uid = lower(hex(randomblob(8))) WHERE uid IS NULL OR uid = ''")
}

export function topicFolder(t: { name: string; uid: string | null; id: number }): string {
  return `${slugify(String(t.name), 'topico')}-${String(t.uid ?? t.id).slice(0, 6)}`
}

function stable(v: unknown): string {
  return JSON.stringify(v, null, 2) + '\n'
}

/** Ajusta links de anexo de uma nota para o caminho relativo do arquivo exportado. */
export function relinkAttachments(md: string, depth: number): string {
  const up = '../'.repeat(depth)
  return md.replace(/(!\[[^\]]*\]\()(?:\.\.\/)*anexos\//g, `$1${up}anexos/`)
}

function topicData(db: Database, topic: Row): TopicData {
  const tables: Record<string, Row[]> = {}
  const idsOf: Record<string, number[]> = {}
  for (const spec of TABLES) {
    if (!hasTable(db, spec.table)) continue
    let rows: Row[]
    if (spec.by.column === 'topicId' && !('parent' in spec.by)) {
      rows = all<Row>(db, `SELECT * FROM ${spec.table} WHERE topicId = ? ORDER BY id`, [topic.id])
    } else {
      const by = spec.by as { column: string; parent: string }
      const parents = idsOf[by.parent] ?? []
      rows = parents.length ? all<Row>(db, `SELECT * FROM ${spec.table} WHERE ${by.column} IN (${parents.map(() => '?').join(',')}) ORDER BY id`, parents) : []
    }
    tables[spec.table] = rows
    idsOf[spec.table] = rows.map((r) => Number(r.id))
  }
  const categories: Record<string, string> = {}
  for (const c of tables.study_flashcards ?? []) {
    if (c.categoryId == null) continue
    const k = one<{ name: string }>(db, 'SELECT name FROM study_card_categories WHERE id = ?', [c.categoryId])
    if (k) categories[String(c.categoryId)] = k.name
  }
  return { formato: BUNDLE_FORMAT, versao: BUNDLE_VERSION, topic, tables, categories }
}

function nodeMarkdown(n: Row, note: string): string {
  const head = `# ${n.title}${n.status === 'done' ? ' ✓' : ''}\n\n`
  const desc = n.description ? `${n.description}\n\n` : ''
  return head + desc + (note.trim() ? note.trim() + '\n' : '')
}

/** Gera todos os arquivos da cópia (caminhos relativos à pasta gerenciada). */
export async function exportAll(): Promise<{ files: ExportFileOut[]; manifest: Record<string, unknown> }> {
  const atts = await listAttachments()
  const files: ExportFileOut[] = []
  const manifestTopics: Record<string, unknown>[] = []
  const used = new Set<string>()
  await tx((db) => ensureUids(db))
  await read((db) => {
    const topics = all<Row>(db, 'SELECT * FROM study_topics ORDER BY uid, id')
    for (const t of topics) {
      const folder = topicFolder(t as { name: string; uid: string | null; id: number })
      const data = topicData(db, t)
      const nodes = treeOrder((data.tables.study_nodes ?? []) as unknown as NodeRow[])
      const notes = data.tables.study_notes ?? []
      const noteOf = (nodeId: number | null): string => String(notes.find((n) => (n.nodeId ?? null) === nodeId)?.content ?? '')
      // README do tópico: objetivo, nota do tópico e índice do roteiro
      const index = nodes.map((n, i) => `${'  '.repeat(depthOf(nodes, n))}- [${n.title}](notas/${fileOfNode(i, n)})${n.status === 'done' ? ' ✓' : ''}`)
      const readme =
        `# ${t.name}\n\n` +
        (t.goal ? `**Objetivo:** ${t.goal}\n\n` : '') +
        (t.kind === 'language' && t.targetLanguage ? `**Idioma praticado:** ${t.targetLanguage}\n\n` : '') +
        (noteOf(null).trim() ? relinkAttachments(noteOf(null).trim(), 1) + '\n\n' : '') +
        (index.length ? `## Roteiro\n\n${index.join('\n')}\n` : '')
      files.push({ path: `${folder}/README.md`, content: readme })
      nodes.forEach((n, i) => {
        files.push({ path: `${folder}/notas/${fileOfNode(i, n)}`, content: relinkAttachments(nodeMarkdown(n as unknown as Row, noteOf(n.id)), 2) })
      })
      for (const s of data.tables.study_sources ?? []) {
        const body = `# ${s.title}\n\n${s.url ? `<${s.url}>${s.locator ? ` · ${s.locator}` : ''}\n\n` : s.locator ? `${s.locator}\n\n` : ''}${String(s.content ?? '').trim()}\n`
        files.push({ path: `${folder}/fontes/${String(s.id).padStart(4, '0')}-${slugify(String(s.title), 'fonte')}.md`, content: relinkAttachments(body, 2) })
      }
      files.push({ path: `${folder}/dados.json`, content: stable(data) })
      for (const tb of Object.values(data.tables)) for (const r of tb) for (const v of Object.values(r)) if (typeof v === 'string' && v.includes(ATTACHMENT_PREFIX)) referencedAttachments(v).forEach((f) => used.add(f))
      manifestTopics.push({ uid: t.uid, nome: t.name, pasta: folder, status: t.status })
    }
  })
  // só os anexos referenciados por algum conteúdo (os órfãos ficam fora da cópia), com o nome do link
  const exportedAtts: { fileName: string; sha256: string; mime: string }[] = []
  for (const name of [...used].sort()) {
    const a = atts.find((x) => x.fileName === name) ?? atts.find((x) => /^[0-9a-f]{12}-/.test(name) && x.sha256.startsWith(name.slice(0, 12)))
    const f = a && path.join(attachmentsDir(), a.fileName)
    if (!a || !f || !fs.existsSync(f)) continue
    files.push({ path: `anexos/${name}`, content: fs.readFileSync(f) })
    exportedAtts.push({ fileName: name, sha256: a.sha256, mime: a.mime })
  }
  const manifest = {
    formato: BUNDLE_FORMAT,
    versao: BUNDLE_VERSION,
    topicos: manifestTopics,
    anexos: exportedAtts.map((a) => ({ arquivo: a.fileName, sha256: a.sha256, mime: a.mime })),
    vinculosExternos: EXTERNAL_LINKS,
    arquivos: [...files.map((f) => f.path), 'manifest.json', 'README.md'].sort()
  }
  files.push({ path: 'manifest.json', content: stable(manifest) })
  files.push({ path: 'README.md', content: ROOT_README })
  files.sort((a, b) => a.path.localeCompare(b.path))
  return { files, manifest }
}

const ROOT_README = `# Caderno de estudos (rickOS)

Pasta gerenciada pelo módulo Estudos do rickOS. Cada tópico tem uma pasta com o README (objetivo
e roteiro), \`notas/\` (uma nota por item, na ordem do roteiro), \`fontes/\` e \`dados.json\`.
As imagens ficam em \`anexos/\` com links relativos.

Para restaurar numa instalação nova: Estudos → Repositório → Restaurar. O \`dados.json\` guarda
hierarquia, ordem, estados, cartões com a agenda de revisão, logs, tentativas, checkpoints,
aulas e os últimos materiais do tutor. Arquivos fora desta pasta não são tocados pelo rickOS.
`

function depthOf(nodes: NodeRow[], n: NodeRow): number {
  let d = 0
  let cur: NodeRow | undefined = n
  const by = new Map(nodes.map((x) => [x.id, x]))
  while (cur?.parentId != null && by.has(cur.parentId) && d < 20) {
    cur = by.get(cur.parentId)
    d++
  }
  return d
}
function fileOfNode(i: number, n: NodeRow): string {
  return `${String(i + 1).padStart(3, '0')}-${slugify(n.title, 'item')}.md`
}

// ── Restauração ──────────────────────────────────────────────────────────────


/**
 * Restaura a partir de uma pasta exportada (manifest.json + <tópico>/dados.json + anexos/).
 * Tópico com o mesmo uid já existente é pulado (nada é sobrescrito).
 */
export async function restoreFromFolder(root: string): Promise<RestoreReport> {
  const manifestPath = path.join(root, 'manifest.json')
  if (!fs.existsSync(manifestPath)) throw new StudyError(tt('estudos.manifestoNaoEncontrado'))
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (manifest.formato !== BUNDLE_FORMAT) throw new StudyError(tt('estudos.naoECopia'))
  if (Number(manifest.versao) > BUNDLE_VERSION) throw new StudyError(tt('estudos.versaoCopia', { versao: String(manifest.versao) }))
  const report: RestoreReport = { created: [], skipped: [], attachments: 0, missingAttachments: [] }
  for (const a of manifest.anexos ?? []) {
    const f = path.join(root, 'anexos', String(a.arquivo))
    if (!fs.existsSync(f)) {
      report.missingAttachments.push(String(a.arquivo))
      continue
    }
    // mesmo nome da cópia; se o conteúdo já existe com outro nome, a rota resolve pelo prefixo do SHA
    await storeAttachment(fs.readFileSync(f), String(a.arquivo).replace(/^[0-9a-f]{12}-/, ''), String(a.mime || mimeFromName(a.arquivo) || ''), String(a.arquivo))
    report.attachments++
  }
  for (const t of manifest.topicos ?? []) {
    const dataPath = path.join(root, String(t.pasta), 'dados.json')
    if (!fs.existsSync(dataPath)) {
      report.skipped.push(`${t.nome} (sem dados.json)`)
      continue
    }
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as TopicData
    const r = await restoreTopic(data)
    ;(r ? report.created : report.skipped).push(String(t.nome))
  }
  return report
}

/** Insere um tópico com ids novos e todas as referências remapeadas. null = já existia (uid). */
export async function restoreTopic(data: TopicData): Promise<number | null> {
  return tx((db) => {
    const uid = data.topic.uid
    if (uid && one(db, 'SELECT 1 FROM study_topics WHERE uid = ?', [uid])) return null
    const maps: Record<string, Map<number, number>> = {}
    // instalação vazia → mantém o id original (a cópia restaurada exporta byte a byte igual);
    // id ocupado → id novo, e as referências são remapeadas do mesmo jeito
    const insert = (table: string, row: Row, override: Row): number => {
      const keepId = row.id != null && !one(db, `SELECT 1 FROM ${table} WHERE id = ?`, [row.id])
      const cols = columns(db, table).filter((c) => (c === 'id' ? keepId : c in row || c in override))
      const vals = cols.map((c) => (c in override ? override[c] : row[c]) ?? null)
      const newId = exec(db, `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, vals)
      return keepId ? Number(row.id) : newId
    }
    const topicId = insert('study_topics', data.topic, {})
    maps.study_topics = new Map([[Number(data.topic.id), topicId]])
    const catByName = new Map(all<{ id: number; name: string }>(db, 'SELECT id, name FROM study_card_categories').map((c) => [c.name, c.id]))
    const catId = (old: unknown): number | null => {
      if (old == null) return null
      const name = data.categories?.[String(old)]
      if (!name) return null
      if (!catByName.has(name)) {
        const max = one<{ m: number }>(db, 'SELECT COALESCE(MAX(sortOrder), 0) AS m FROM study_card_categories')?.m ?? 0
        catByName.set(name, exec(db, 'INSERT INTO study_card_categories (name, sortOrder, createdAt) VALUES (?, ?, ?)', [name, max + 10, new Date().toISOString()]))
      }
      return catByName.get(name)!
    }
    const deferred: { table: string; id: number; col: string; target: string; old: number }[] = []
    for (const spec of TABLES) {
      const rows = data.tables?.[spec.table]
      if (!rows?.length || !hasTable(db, spec.table)) continue
      maps[spec.table] = maps[spec.table] ?? new Map()
      // nós: pais antes dos filhos
      const ordered = spec.table === 'study_nodes' ? orderParentsFirst(rows) : rows
      for (const r of ordered) {
        const override: Row = {}
        for (const [col, target] of Object.entries(spec.refs)) {
          if (r[col] == null) continue
          const m = maps[target]?.get(Number(r[col]))
          if (m != null) override[col] = m
          else if (target === spec.table || target === 'study_plans' || target === 'study_card_states') {
            override[col] = null // resolvido depois (autorreferência ou tabela posterior)
            deferred.push({ table: spec.table, id: -1, col, target, old: Number(r[col]) })
          } else override[col] = null
        }
        if (spec.table === 'study_flashcards') override.categoryId = catId(r.categoryId)
        if (spec.table === 'study_checkpoints' && r.refId != null) {
          const target = r.target === 'source' ? 'study_sources' : r.target === 'lesson' ? 'study_lessons' : null
          override.refId = target ? maps[target]?.get(Number(r.refId)) ?? null : null
        }
        if (spec.table === 'study_origins' && one(db, 'SELECT 1 FROM study_origins WHERE originKey = ?', [r.originKey])) continue
        const newId = insert(spec.table, r, override)
        maps[spec.table].set(Number(r.id), newId)
        for (const d of deferred) if (d.id === -1 && d.table === spec.table) d.id = newId
      }
    }
    for (const d of deferred) {
      const m = maps[d.target]?.get(d.old)
      if (m != null && d.id > 0) exec(db, `UPDATE ${d.table} SET ${d.col} = ? WHERE id = ?`, [m, d.id])
    }
    return topicId
  })
}

function orderParentsFirst(rows: Row[]): Row[] {
  const out: Row[] = []
  const done = new Set<number>()
  const ids = new Set(rows.map((r) => Number(r.id)))
  let rest = [...rows]
  let guard = rows.length + 2
  while (rest.length && guard-- > 0) {
    const next: Row[] = []
    for (const r of rest) {
      const p = r.parentId == null ? null : Number(r.parentId)
      if (p == null || !ids.has(p) || done.has(p)) {
        out.push(r)
        done.add(Number(r.id))
      } else next.push(r)
    }
    rest = next
  }
  return [...out, ...rest]
}

/** Escreve a exportação numa pasta (usado pelo Git e pelos testes). Devolve os caminhos escritos. */
export function writeFiles(root: string, files: ExportFileOut[]): string[] {
  for (const f of files) {
    const dest = path.join(root, f.path)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, f.content)
  }
  return files.map((f) => f.path)
}
