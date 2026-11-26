import type { Database } from 'sql.js'
import { tt } from '../i18n'
import { VERSAO_PEDAGOGIA } from '../../shared/prompts/estudos/pedagogia/textos'
import { SCHEMA_EDITORIAL, SCHEMA_PACOTE, SCHEMA_SECAO, SCHEMA_SUBTOPICOS, SECOES, type Secao } from '../../shared/prompts/estudos/pedagogia/schemas'
import { normalizeAnswer } from '../../shared/estudos'
import type { MaterialRow, MaterialView, SuggestionRow } from '../../shared/estudos'
import { assinatura, contextoNo, idiomaDe } from './contexto'
import { insertCard, insertQuestion, type TopicRow } from './repo'
import { all, exec, nowIso, one, read, StudyError, tx } from './sql'
import { startRun, type RunRow } from './tutor'

export type { MaterialRow, MaterialView, SuggestionRow }

/**
 * Material do nó (C), revisão editorial (D) e subtópicos (E). Gerar = ação explícita (1 chamada);
 * abrir seção, revelar resposta, trocar aba = ler o último material persistido (0 chamadas).
 *
 *  - por seção: a última geração VÁLIDA fica (seção inválida/vazia num pacote não apaga a anterior);
 *  - uma execução antiga nunca sobrescreve material de uma mais nova (comparação por runId);
 *  - editar a nota NÃO apaga nada: o material fica marcado "anterior à última edição" até eu pedir;
 *  - sugestões (editorial/subtópico) ficam fora da nota/mapa até eu decidir; recusa é lembrada
 *    para a mesma versão do material; aplicada nunca volta a ficar pendente;
 *  - candidatos a cartão entram como cartões SUGERIDOS (fora do baralho até eu aprovar).
 */

const nodeKey = (nodeId: number | null): number => nodeId ?? 0

function topicOrThrow(db: Database, topicId: number): TopicRow {
  const t = one<TopicRow>(db, 'SELECT * FROM study_topics WHERE id = ?', [topicId])
  if (!t) throw new StudyError(tt('estudos.topicoNaoEncontrado'))
  return t
}

function invalid(): Error {
  return Object.assign(new Error(tt('estudos.respostaInvalida')), { invalid: true })
}

/** Validação mínima de uma seção (o schema já garante o formato no Codex; aqui é defesa). */
function secaoValida(s: Secao, v: unknown): boolean {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (s === 'explicacao' || s === 'resumo') return typeof o.conteudo === 'string'
  return Array.isArray(o.itens)
}

const fp = (...parts: string[]): string => assinatura(...parts.map((p) => normalizeAnswer(p ?? '')))

interface Gravacao {
  db: Database
  run: RunRow
  topicId: number
  nodeId: number | null
  noteSignature: string
  mapSignature: string
  isLatest: boolean
}

function gravarSecao(g: Gravacao, secao: Secao, valor: unknown): boolean {
  if (!secaoValida(secao, valor)) return false
  const cur = one<{ id: number; runId: number }>(g.db, 'SELECT id, runId FROM study_materials WHERE topicId = ? AND nodeKey = ? AND section = ?', [g.topicId, nodeKey(g.nodeId), secao])
  if (cur && cur.runId > g.run.id) return false // há material de uma execução mais nova
  const vals = [JSON.stringify(valor), g.run.id, g.run.model, g.run.effort, VERSAO_PEDAGOGIA, g.run.inputSignature, g.noteSignature, nowIso()]
  if (cur) exec(g.db, 'UPDATE study_materials SET content = ?, runId = ?, model = ?, effort = ?, promptVersion = ?, inputSignature = ?, noteSignature = ?, createdAt = ? WHERE id = ?', [...vals, cur.id])
  else
    exec(g.db, 'INSERT INTO study_materials (topicId, nodeKey, nodeId, section, content, runId, model, effort, promptVersion, inputSignature, noteSignature, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      g.topicId,
      nodeKey(g.nodeId),
      g.nodeId,
      secao,
      ...vals
    ])
  if (secao === 'revisaoEditorial') sugerir(g, 'editorial', (valor as { itens: Record<string, unknown>[] }).itens, g.noteSignature)
  if (secao === 'subtopicos') sugerir(g, 'subtopic', (valor as { itens: Record<string, unknown>[] }).itens, g.mapSignature)
  if (secao === 'cartoes') cartoesSugeridos(g, (valor as { itens: { front: string; back: string; exemplo?: string | null; leitura?: string | null }[] }).itens)
  return true
}

function sugerir(g: Gravacao, kind: 'editorial' | 'subtopic', itens: Record<string, unknown>[], base: string): void {
  // uma análise mais nova substitui as pendentes da anterior (mesmo item, mesmo tipo)
  if (g.isLatest) {
    exec(g.db, "UPDATE study_suggestions SET status = 'superseded', decidedAt = ? WHERE topicId = ? AND IFNULL(nodeId, -1) = IFNULL(?, -1) AND kind = ? AND status = 'pending' AND IFNULL(runId, 0) < ?", [
      nowIso(),
      g.topicId,
      g.nodeId,
      kind,
      g.run.id
    ])
  }
  const nota =
    (g.nodeId == null
      ? one<{ content: string }>(g.db, 'SELECT content FROM study_notes WHERE topicId = ? AND nodeId IS NULL', [g.topicId])
      : one<{ content: string }>(g.db, 'SELECT content FROM study_notes WHERE nodeId = ?', [g.nodeId]))?.content ?? ''
  for (const it of itens ?? []) {
    const f = kind === 'editorial' ? fp(kind, String(it.trecho ?? ''), String(it.sugestao ?? '')) : fp(kind, String(it.titulo ?? ''))
    const same = all<{ status: string; baseSignature: string | null }>(g.db, 'SELECT status, baseSignature FROM study_suggestions WHERE topicId = ? AND fingerprint = ?', [g.topicId, f])
    if (same.some((s) => s.status === 'accepted' || s.status === 'comment')) continue // aplicada/guardada não volta
    if (same.some((s) => s.status === 'pending')) continue // já está na lista
    if (same.some((s) => s.status === 'rejected' && recusaVale(kind, s.baseSignature, base, it, nota))) continue // recusada nesta versão
    if (kind === 'subtopic' && one(g.db, 'SELECT 1 FROM study_nodes WHERE topicId = ? AND lower(title) = lower(?)', [g.topicId, String(it.titulo ?? '')])) continue
    exec(g.db, 'INSERT INTO study_suggestions (topicId, nodeId, kind, fingerprint, payload, status, runId, baseSignature, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      g.topicId,
      g.nodeId,
      kind,
      f,
      JSON.stringify(it),
      g.isLatest ? 'pending' : 'superseded',
      g.run.id,
      base,
      nowIso()
    ])
  }
}

/**
 * A recusa vale enquanto o material que a motivou não mudou:
 *  - editorial: o trecho-alvo continua igual na nota (aceitar OUTRA proposta não "ressuscita" esta);
 *  - subtópico: objetivo igual e os itens que existiam na recusa ainda existem (acrescentar itens não conta).
 */
function recusaVale(kind: 'editorial' | 'subtopic', baseRecusa: string | null, baseAtual: string, it: Record<string, unknown>, nota: string): boolean {
  if (baseRecusa === baseAtual) return true
  if (kind === 'editorial') return !!String(it.trecho ?? '') && nota.includes(String(it.trecho))
  try {
    const a = JSON.parse(baseRecusa ?? 'null') as { goal: string; titles: string[] } | null
    const b = JSON.parse(baseAtual) as { goal: string; titles: string[] }
    if (!a || a.goal !== b.goal) return false
    const now = new Set(b.titles)
    return a.titles.every((x) => now.has(x))
  } catch {
    return false
  }
}

function cartoesSugeridos(g: Gravacao, itens: { front: string; back: string; exemplo?: string | null; leitura?: string | null }[]): void {
  if (!g.isLatest) return
  const existentes = new Set(all<{ front: string }>(g.db, 'SELECT front FROM study_flashcards WHERE topicId = ?', [g.topicId]).map((c) => normalizeAnswer(c.front)))
  for (const c of itens ?? []) {
    if (!c?.front?.trim() || !c?.back?.trim() || existentes.has(normalizeAnswer(c.front))) continue
    existentes.add(normalizeAnswer(c.front))
    insertCard(g.db, { topicId: g.topicId, nodeId: g.nodeId, front: c.front, back: c.back, example: c.exemplo ?? null, reading: c.leitura ?? null, status: 'suggested' })
  }
}

/** Versão do mapa para recusas de subtópico: objetivo + títulos existentes (JSON, comparado por inclusão). */
function mapSignature(db: Database, topicId: number): string {
  const goal = one<{ goal: string | null }>(db, 'SELECT goal FROM study_topics WHERE id = ?', [topicId])?.goal ?? ''
  const titles = all<{ title: string }>(db, 'SELECT title FROM study_nodes WHERE topicId = ?', [topicId]).map((n) => normalizeAnswer(n.title))
  return JSON.stringify({ goal: assinatura(goal), titles: [...new Set(titles)].sort() })
}

async function preparar(topicId: number, nodeId: number | null, vocabulario?: string[]): Promise<{ t: TopicRow; ctx: ReturnType<typeof contextoNo>; mapSig: string }> {
  return read((db) => {
    const t = topicOrThrow(db, topicId)
    if (nodeId != null && !one(db, 'SELECT 1 FROM study_nodes WHERE id = ? AND topicId = ?', [nodeId, topicId])) throw new StudyError(tt('estudos.topicoNaoEncontrado'))
    return { t, ctx: contextoNo(db, t, nodeId, { vocabulario }), mapSig: mapSignature(db, topicId) }
  })
}

/** "Preparar material do nó": UMA geração com todas as seções. */
export async function prepareNode(topicId: number, nodeId: number | null, opts: { vocabulario?: string[] } = {}): Promise<RunRow> {
  const { t, ctx, mapSig } = await preparar(topicId, nodeId, opts.vocabulario)
  return startRun({
    operation: 'pacote',
    chamada: 'estudos.pacoteNo',
    topicId,
    nodeId,
    requestKey: `pacote:${topicId}:${nodeKey(nodeId)}`,
    params: { ...idiomaDe(t), contexto: ctx.contexto, pedido: 'Preparar o material deste item (todas as seções).' },
    signature: ctx.inputSignature,
    schema: SCHEMA_PACOTE,
    timeoutMs: 10 * 60_000,
    apply: (db, parsed, run, isLatest) => {
      const p = parsed as Record<string, unknown>
      if (!p || typeof p !== 'object') throw invalid()
      const g: Gravacao = { db, run, topicId, nodeId, noteSignature: ctx.noteSignature, mapSignature: mapSig, isLatest }
      let gravadas = 0
      for (const s of SECOES) if (gravarSecao(g, s, p[s])) gravadas++
      if (!gravadas) throw invalid() // nada aproveitável: a execução vira "inválida" e nada muda
    }
  })
}

/** "Gerar de novo" uma seção (mesmo bloco do pacote). */
export async function regenerateSection(topicId: number, nodeId: number | null, secao: Secao): Promise<RunRow> {
  if (!SECOES.includes(secao)) throw new StudyError(tt('estudos.secaoInvalida'))
  const { t, ctx, mapSig } = await preparar(topicId, nodeId)
  return startRun({
    operation: 'secao',
    chamada: 'estudos.secaoNo',
    topicId,
    nodeId,
    section: secao,
    requestKey: `secao:${topicId}:${nodeKey(nodeId)}:${secao}`,
    params: { ...idiomaDe(t), contexto: ctx.contexto, pedido: `Gerar de novo só a seção ${secao}.`, secao },
    signature: ctx.inputSignature,
    schema: SCHEMA_SECAO(secao),
    timeoutMs: 6 * 60_000,
    apply: (db, parsed, run, isLatest) => {
      const g: Gravacao = { db, run, topicId, nodeId, noteSignature: ctx.noteSignature, mapSignature: mapSig, isLatest }
      if (!gravarSecao(g, secao, (parsed as Record<string, unknown>)?.[secao])) throw invalid()
    }
  })
}

/** "Revisar minha anotação" isolada (perfil editorial). */
export async function reviewNote(topicId: number, nodeId: number | null): Promise<RunRow> {
  const { t, ctx, mapSig } = await preparar(topicId, nodeId)
  if (!ctx.temNotaAutoral) throw new StudyError(tt('estudos.notaVaziaParaRevisar'))
  return startRun({
    operation: 'revisao',
    chamada: 'estudos.revisaoEditorial',
    topicId,
    nodeId,
    section: 'revisaoEditorial',
    requestKey: `revisao:${topicId}:${nodeKey(nodeId)}`,
    params: { ...idiomaDe(t), contexto: ctx.contexto, pedido: 'Revise minha anotação mantendo minha voz.' },
    signature: ctx.inputSignature,
    schema: SCHEMA_EDITORIAL,
    timeoutMs: 5 * 60_000,
    apply: (db, parsed, run, isLatest) => {
      const g: Gravacao = { db, run, topicId, nodeId, noteSignature: ctx.noteSignature, mapSignature: mapSig, isLatest }
      if (!gravarSecao(g, 'revisaoEditorial', (parsed as Record<string, unknown>)?.revisaoEditorial)) throw invalid()
    }
  })
}

/** "Sugerir subtópicos" pontual (perfil editorial). Lista vazia é resultado válido. */
export async function suggestSubtopics(topicId: number, nodeId: number | null): Promise<RunRow> {
  const { t, ctx, mapSig } = await preparar(topicId, nodeId)
  return startRun({
    operation: 'subtopicos',
    chamada: 'estudos.subtopicos',
    topicId,
    nodeId,
    section: 'subtopicos',
    requestKey: `subtopicos:${topicId}:${nodeKey(nodeId)}`,
    params: { ...idiomaDe(t), contexto: ctx.contexto, pedido: 'Há subtópicos que faltam? Zero itens é válido.' },
    signature: ctx.inputSignature,
    schema: SCHEMA_SUBTOPICOS,
    timeoutMs: 5 * 60_000,
    apply: (db, parsed, run, isLatest) => {
      const g: Gravacao = { db, run, topicId, nodeId, noteSignature: ctx.noteSignature, mapSignature: mapSig, isLatest }
      if (!gravarSecao(g, 'subtopicos', (parsed as Record<string, unknown>)?.subtopicos)) throw invalid()
    }
  })
}

// ── Leitura (zero chamadas) ──────────────────────────────────────────────────


export async function getMaterial(topicId: number, nodeId: number | null): Promise<MaterialView> {
  return read((db) => {
    const nota =
      (nodeId == null
        ? one<{ content: string }>(db, 'SELECT content FROM study_notes WHERE topicId = ? AND nodeId IS NULL', [topicId])
        : one<{ content: string }>(db, 'SELECT content FROM study_notes WHERE nodeId = ?', [nodeId]))?.content ?? ''
    const sig = assinatura(nota)
    const rows = all<MaterialRow>(db, 'SELECT * FROM study_materials WHERE topicId = ? AND nodeKey = ?', [topicId, nodeKey(nodeId)])
    return {
      sections: rows.map((r) => ({ ...r, stale: r.noteSignature !== sig })),
      suggestions: all<SuggestionRow>(
        db,
        "SELECT * FROM study_suggestions WHERE topicId = ? AND IFNULL(nodeId, -1) = IFNULL(?, -1) AND status IN ('pending', 'comment') ORDER BY id",
        [topicId, nodeId]
      ),
      noteSignature: sig
    }
  })
}

// ── Decisões (zero chamadas) ─────────────────────────────────────────────────

function sugestao(db: Database, id: number): SuggestionRow {
  const s = one<SuggestionRow>(db, 'SELECT * FROM study_suggestions WHERE id = ?', [id])
  if (!s) throw new StudyError(tt('estudos.sugestaoNaoEncontrada'))
  return s
}

export type EditorialResult = { ok: true; content: string } | { ok: false; reason: 'stale' | 'ambiguous' | 'decided' }

/**
 * Aceitar (ou aceitar editado) uma proposta editorial: altera SÓ o trecho-alvo. Se o trecho não
 * está mais na nota (ou aparece mais de uma vez), devolve 'stale'/'ambiguous' para reconciliação —
 * nunca troca a nota inteira. `anchor` permite reconciliar escolhendo o novo trecho.
 */
export async function acceptEditorial(id: number, opts: { text?: string | null; anchor?: string | null; replace?: boolean } = {}): Promise<EditorialResult> {
  return tx((db) => {
    const s = sugestao(db, id)
    if (s.kind !== 'editorial') throw new StudyError(tt('estudos.sugestaoNaoEncontrada'))
    if (s.status !== 'pending' && s.status !== 'comment') return { ok: false, reason: 'decided' }
    const p = JSON.parse(s.payload) as { trecho: string; sugestao: string; substituicao: string | null; tipo: string }
    const note =
      s.nodeId == null
        ? one<{ id: number; content: string }>(db, 'SELECT id, content FROM study_notes WHERE topicId = ? AND nodeId IS NULL', [s.topicId])
        : one<{ id: number; content: string }>(db, 'SELECT id, content FROM study_notes WHERE nodeId = ?', [s.nodeId])
    if (!note) return { ok: false, reason: 'stale' }
    const anchor = (opts.anchor ?? p.trecho) || ''
    const at = note.content.indexOf(anchor)
    if (!anchor || at < 0) return { ok: false, reason: 'stale' }
    if (note.content.indexOf(anchor, at + 1) >= 0) return { ok: false, reason: 'ambiguous' }
    const replace = opts.replace ?? p.substituicao != null
    const texto = opts.text ?? (replace ? p.substituicao ?? '' : p.sugestao)
    const novo = replace
      ? note.content.slice(0, at) + texto + note.content.slice(at + anchor.length)
      : note.content.slice(0, at + anchor.length) + (texto.startsWith(' ') || texto.startsWith('\n') ? '' : ' ') + texto + note.content.slice(at + anchor.length)
    exec(db, 'UPDATE study_notes SET content = ?, updatedAt = ? WHERE id = ?', [novo, nowIso(), note.id])
    exec(db, "UPDATE study_suggestions SET status = 'accepted', decidedAt = ? WHERE id = ?", [nowIso(), id])
    return { ok: true, content: novo }
  })
}

export async function decideSuggestion(id: number, status: 'rejected' | 'comment' | 'pending'): Promise<void> {
  await tx((db) => {
    sugestao(db, id)
    exec(db, 'UPDATE study_suggestions SET status = ?, decidedAt = ? WHERE id = ?', [status, nowIso(), id])
  })
}

/** Aprovar subtópico (com o pai que EU escolher, título editável) → vira nó. */
export async function acceptSubtopic(id: number, opts: { parentId?: number | null; title?: string | null; position?: number | null } = {}): Promise<number> {
  return tx((db) => {
    const s = sugestao(db, id)
    if (s.kind !== 'subtopic' || s.status !== 'pending') throw new StudyError(tt('estudos.sugestaoNaoEncontrada'))
    const p = JSON.parse(s.payload) as { parentId: number | null; posicao: number | null; titulo: string; motivo: string; conexaoObjetivo: string; tipo: string; prerequisito: string | null }
    const parentId = opts.parentId !== undefined ? opts.parentId : p.parentId
    if (parentId != null && !one(db, 'SELECT 1 FROM study_nodes WHERE id = ? AND topicId = ?', [parentId, s.topicId])) throw new StudyError(tt('estudos.paiInvalido'))
    const title = (opts.title ?? p.titulo ?? '').trim()
    if (!title) throw new StudyError(tt('estudos.topicoSemTitulo'))
    const siblings = all<{ id: number }>(db, 'SELECT id FROM study_nodes WHERE topicId = ? AND IFNULL(parentId, -1) = IFNULL(?, -1) ORDER BY orderIndex, id', [s.topicId, parentId])
    const pos = Math.max(0, Math.min(siblings.length, opts.position ?? p.posicao ?? siblings.length))
    const desc = [p.tipo === 'pre-requisito' ? '_(pré-requisito)_' : '_(aprofundamento opcional)_', p.motivo, p.conexaoObjetivo && `**Conexão com o objetivo:** ${p.conexaoObjetivo}`, p.prerequisito && `**Pré-requisito:** ${p.prerequisito}`]
      .filter(Boolean)
      .join('\n')
    const newId = exec(db, "INSERT INTO study_nodes (topicId, parentId, title, description, status, orderIndex, createdAt, origin) VALUES (?, ?, ?, ?, 'todo', ?, ?, 'manual')", [s.topicId, parentId, title, desc, pos, nowIso()])
    const ordered = [...siblings.map((x) => x.id)]
    ordered.splice(pos, 0, newId)
    ordered.forEach((nid, i) => exec(db, 'UPDATE study_nodes SET orderIndex = ? WHERE id = ?', [i, nid]))
    exec(db, "UPDATE study_suggestions SET status = 'accepted', decidedAt = ? WHERE id = ?", [nowIso(), id])
    return newId
  })
}

/** Guarda um item do material como pergunta para "Testar o que ficou" (ação minha). */
export async function saveItemAsQuestion(topicId: number, nodeId: number | null, kind: 'recall' | 'exercise' | 'socratic', prompt: string, reference: string | null, hint: string | null): Promise<number> {
  return tx((db) => {
    topicOrThrow(db, topicId)
    const dup = one<{ id: number }>(db, 'SELECT id FROM study_questions WHERE topicId = ? AND prompt = ?', [topicId, prompt.trim()])
    if (dup) return dup.id
    return insertQuestion(db, { topicId, nodeId, kind, prompt, reference, hint, origin: 'tutor' })
  })
}
