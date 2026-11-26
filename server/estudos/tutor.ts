import fs from 'fs'
import path from 'path'
import type { Database } from 'sql.js'
import { dataDir } from '../config'
import { broadcast } from '../events'
import { tt } from '../i18n'
import { executarChamada, resolverExecucao } from '../ia/gateway'
import type { IdChamadaIa } from '../../shared/prompts/catalogo'
import { VERSAO_PEDAGOGIA } from '../../shared/prompts/estudos/pedagogia/textos'
import { SCHEMA_AULA, SCHEMA_MASTERCLASS } from '../../shared/prompts/estudos/pedagogia/schemas'
import type { ParamsTutor } from '../../shared/prompts/estudos/masterclass'
import { assinatura, contextoAula, contextoMasterclass, idiomaDe } from './contexto'
import type { TopicRow } from './repo'
import { all, exec, nowIso, one, read, StudyError, tx } from './sql'
import type { RunRow, PlanRow, LessonRow, TurnRow, Operacao } from '../../shared/estudos'
export type { RunRow, PlanRow, LessonRow, TurnRow, Operacao }


/**
 * Tutor de Estudos (Codex pelo gateway). Regras:
 *  - só roda por AÇÃO EXPLÍCITA (gerar, gerar de novo, enviar turno); abrir/ler/revisar = zero chamadas;
 *  - execução no servidor, em segundo plano: posso navegar e ver o resultado depois (SSE `estudos:ia`);
 *  - dedupe por `requestKey`: clique duplo, recomposição React ou duas abas → a MESMA execução;
 *  - a mais nova vence: uma execução antiga nunca sobrescreve resultado de uma mais nova;
 *  - falha, cancelamento, timeout ou JSON inválido não apagam nada do que já era válido;
 *  - o tutor não edita nada: devolve JSON (schema) e eu decido o que incorporar;
 *  - Codex roda local em sandbox read-only, num diretório vazio; o CONTEXTO vai ao provedor.
 */



interface RunSpec<P> {
  operation: Operacao
  chamada: IdChamadaIa
  topicId: number
  nodeId: number | null
  section?: string | null
  requestKey: string
  params: P
  signature: string
  schema: Record<string, unknown>
  timeoutMs: number
  /** Grava o resultado (dentro de uma transação). `isLatest` = nenhuma execução mais nova da mesma chave terminou ok. */
  apply: (db: Database, parsed: unknown, run: RunRow, isLatest: boolean) => void
}

const kills = new Map<number, () => void>()

function codexCwd(): string {
  // diretório vazio: o Codex não tem o que ler além do contexto que o app mandou
  const d = path.join(dataDir(), 'estudos', 'codex-vazio')
  fs.mkdirSync(d, { recursive: true })
  return d
}

function emit(run: RunRow, extra: Record<string, unknown> = {}): void {
  broadcast('estudos:ia', { runId: run.id, status: run.status, operation: run.operation, topicId: run.topicId, nodeId: run.nodeId, section: run.section, ...extra })
}

export function parseJson(raw: string): unknown {
  let s = (raw ?? '').trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a >= 0 && b > a) s = s.slice(a, b + 1)
  return JSON.parse(s)
}

/** Inicia (ou reaproveita) uma execução. Devolve logo; o resultado chega pelo SSE. */
export async function startRun<P extends ParamsTutor>(spec: RunSpec<P>): Promise<RunRow> {
  const exec0 = await resolverExecucao(spec.chamada)
  const created = await tx((db) => {
    const running = one<RunRow>(db, "SELECT * FROM study_ai_runs WHERE requestKey = ? AND status = 'running' ORDER BY id DESC LIMIT 1", [spec.requestKey])
    if (running) return { run: running, fresh: false }
    const id = exec(
      db,
      `INSERT INTO study_ai_runs (topicId, nodeId, operation, section, requestKey, status, model, effort, promptVersion, inputSignature, contextChars, startedAt)
       VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, ?)`,
      [spec.topicId, spec.nodeId, spec.operation, spec.section ?? null, spec.requestKey, exec0.modelo || null, exec0.effort || null, VERSAO_PEDAGOGIA, spec.signature, spec.params.contexto.length, nowIso()]
    )
    return { run: one<RunRow>(db, 'SELECT * FROM study_ai_runs WHERE id = ?', [id])!, fresh: true }
  })
  if (!created.fresh) return created.run
  const run = created.run
  emit(run)
  void execute(spec, run)
  return run
}

async function execute<P extends ParamsTutor>(spec: RunSpec<P>, run: RunRow): Promise<void> {
  const t0 = Date.now()
  let tokens: { input: number; output: number } | null = null
  let status: RunRow['status'] = 'ok'
  let error: string | null = null
  try {
    const out = await executarChamada(spec.chamada, spec.params as never, {
      ferramentas: 'nenhuma',
      cwd: codexCwd(),
      timeoutMs: spec.timeoutMs,
      schemaSaida: spec.schema,
      usage: { source: `estudos.${spec.operation}` },
      onTokens: (u) => (tokens = { input: u.input, output: u.output + u.reasoning }),
      registerChild: (kill) => kills.set(run.id, kill)
    })
    let parsed: unknown
    try {
      parsed = parseJson(out)
    } catch {
      throw Object.assign(new Error(tt('estudos.respostaInvalida')), { invalid: true })
    }
    await tx((db) => {
      const cur = one<RunRow>(db, 'SELECT * FROM study_ai_runs WHERE id = ?', [run.id])!
      if (cur.status !== 'running') return // cancelada enquanto rodava: descarta
      const newer = one(db, "SELECT 1 FROM study_ai_runs WHERE requestKey = ? AND status = 'ok' AND id > ? LIMIT 1", [spec.requestKey, run.id])
      spec.apply(db, parsed, cur, !newer)
      exec(db, "UPDATE study_ai_runs SET status = 'ok', finishedAt = ?, durationMs = ?, inputTokens = ?, outputTokens = ? WHERE id = ?", [
        nowIso(),
        Date.now() - t0,
        tokens?.input ?? null,
        tokens?.output ?? null,
        run.id
      ])
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    status = (e as { invalid?: boolean }).invalid ? 'invalid' : /não respondeu em|timeout/i.test(msg) ? 'timeout' : 'error'
    error = msg
    await tx((db) => {
      const cur = one<RunRow>(db, 'SELECT status FROM study_ai_runs WHERE id = ?', [run.id])
      if (cur?.status === 'running') {
        exec(db, 'UPDATE study_ai_runs SET status = ?, finishedAt = ?, durationMs = ?, error = ? WHERE id = ?', [status, nowIso(), Date.now() - t0, msg.slice(0, 2000), run.id])
      }
    })
  } finally {
    kills.delete(run.id)
  }
  const final = await read((db) => one<RunRow>(db, 'SELECT * FROM study_ai_runs WHERE id = ?', [run.id])!)
  emit(final, error ? { error } : {})
}

export async function cancelRun(runId: number): Promise<void> {
  await tx((db) => exec(db, "UPDATE study_ai_runs SET status = 'canceled', finishedAt = ? WHERE id = ? AND status = 'running'", [nowIso(), runId]))
  kills.get(runId)?.()
  const r = await read((db) => one<RunRow>(db, 'SELECT * FROM study_ai_runs WHERE id = ?', [runId]))
  if (r) emit(r)
}

export async function listRuns(f: { topicId?: number | null; nodeId?: number | null; limit?: number } = {}): Promise<RunRow[]> {
  return read((db) =>
    all<RunRow>(
      db,
      `SELECT * FROM study_ai_runs WHERE (? IS NULL OR topicId = ?) AND (? IS NULL OR IFNULL(nodeId, -1) = IFNULL(?, -1)) ORDER BY id DESC LIMIT ?`,
      [f.topicId ?? null, f.topicId ?? null, f.nodeId === undefined ? null : 1, f.nodeId ?? null, Math.min(200, f.limit ?? 30)]
    )
  )
}

/** Execuções que ficaram "running" de um processo anterior (servidor reiniciado) viram erro. */
export async function recoverStaleRuns(): Promise<void> {
  await tx((db) => exec(db, "UPDATE study_ai_runs SET status = 'error', error = 'servidor reiniciado', finishedAt = ? WHERE status = 'running'", [nowIso()]))
}

function topicOrThrow(db: Database, topicId: number): TopicRow {
  const t = one<TopicRow>(db, 'SELECT * FROM study_topics WHERE id = ?', [topicId])
  if (!t) throw new StudyError(tt('estudos.topicoNaoEncontrado'))
  return t
}

// ── A. Masterclass → roteiro aprovável ───────────────────────────────────────


export async function startMasterclass(topicId: number, pedido: string): Promise<RunRow> {
  const text = (pedido ?? '').trim()
  if (!text) throw new StudyError(tt('estudos.pedidoVazio'))
  const { t, contexto } = await read((db) => {
    const t = topicOrThrow(db, topicId)
    return { t, contexto: contextoMasterclass(db, t) }
  })
  const params: ParamsTutor = { ...idiomaDe(t), contexto, pedido: text }
  return startRun({
    operation: 'masterclass',
    chamada: 'estudos.masterclass',
    topicId,
    nodeId: null,
    requestKey: `masterclass:${topicId}:${assinatura(text, contexto)}`,
    params,
    signature: assinatura(text, contexto),
    schema: SCHEMA_MASTERCLASS,
    timeoutMs: 15 * 60_000,
    apply: (db, parsed, run, isLatest) => {
      const p = parsed as { partes?: unknown[]; perguntas?: unknown[] }
      if (!p || !Array.isArray(p.partes) || !Array.isArray(p.perguntas)) throw Object.assign(new Error(tt('estudos.respostaInvalida')), { invalid: true })
      // proposta mais nova vence: as anteriores ainda propostas viram "superseded"; uma antiga chegando depois já nasce superseded
      const newerPlan = one(db, "SELECT 1 FROM study_plans p JOIN study_ai_runs r ON r.id = p.runId WHERE p.topicId = ? AND r.id > ? LIMIT 1", [topicId, run.id])
      if (isLatest && !newerPlan) exec(db, "UPDATE study_plans SET status = 'superseded' WHERE topicId = ? AND status = 'proposed'", [topicId])
      exec(db, 'INSERT INTO study_plans (topicId, request, status, content, runId, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [
        topicId,
        text,
        isLatest && !newerPlan ? 'proposed' : 'superseded',
        JSON.stringify(parsed),
        run.id,
        nowIso()
      ])
    }
  })
}

/** O que vai ao provedor numa masterclass (sem chamar a IA): para mostrar antes de enviar. */
export async function previewMasterclassContext(topicId: number): Promise<{ chars: number; contexto: string }> {
  return read((db) => {
    const contexto = contextoMasterclass(db, topicOrThrow(db, topicId))
    return { chars: contexto.length, contexto }
  })
}

export async function listPlans(topicId: number): Promise<PlanRow[]> {
  return read((db) => all<PlanRow>(db, 'SELECT * FROM study_plans WHERE topicId = ? ORDER BY id DESC', [topicId]))
}

/** Guarda minhas edições na proposta (sem IA). */
export async function editPlan(planId: number, content: unknown): Promise<PlanRow> {
  return tx((db) => {
    const p = one<PlanRow>(db, 'SELECT * FROM study_plans WHERE id = ?', [planId])
    if (!p) throw new StudyError(tt('estudos.planoNaoEncontrado'))
    if (p.status !== 'proposed') throw new StudyError(tt('estudos.planoNaoEditavel'))
    validPlanContent(content)
    exec(db, 'UPDATE study_plans SET content = ?, edited = 1 WHERE id = ?', [JSON.stringify(content), planId])
    return one<PlanRow>(db, 'SELECT * FROM study_plans WHERE id = ?', [planId])!
  })
}

export async function discardPlan(planId: number): Promise<void> {
  await tx((db) => exec(db, "UPDATE study_plans SET status = 'discarded' WHERE id = ? AND status = 'proposed'", [planId]))
}

interface ModuloPlano {
  titulo: string
  perguntaCentral?: string
  conceitos?: string[]
  relacoes?: string
  exemplo?: string
  atividade?: string
  perguntaDiagnostica?: string
  criterioAvanco?: string
  opcional?: boolean
  minutos?: number | null
  prerequisitos?: string[]
  excluir?: boolean
}
interface ConteudoPlano {
  partes: { titulo: string; porque?: string; modulos: ModuloPlano[]; excluir?: boolean }[]
  workshops?: { titulo: string; entrega?: string; experimento?: string; excluir?: boolean }[]
  aberturaPrimeiraAula?: { titulo?: string; situacao?: string; primeiroPasso?: string; pergunta?: string }
}

function validPlanContent(c: unknown): asserts c is ConteudoPlano {
  const p = c as ConteudoPlano
  if (!p || !Array.isArray(p.partes) || p.partes.some((x) => !x || typeof x.titulo !== 'string' || !Array.isArray(x.modulos))) {
    throw new StudyError(tt('estudos.planoInvalido'))
  }
}

function descricaoModulo(m: ModuloPlano): string {
  const l: string[] = []
  if (m.opcional) l.push('_(aprofundamento opcional)_')
  if (m.perguntaCentral) l.push(`**Pergunta central:** ${m.perguntaCentral}`)
  if (m.conceitos?.length) l.push(`**Conceitos:** ${m.conceitos.join('; ')}`)
  if (m.relacoes) l.push(`**Relações:** ${m.relacoes}`)
  if (m.exemplo) l.push(`**Exemplo:** ${m.exemplo}`)
  if (m.atividade) l.push(`**Atividade:** ${m.atividade}`)
  if (m.perguntaDiagnostica) l.push(`**Pergunta diagnóstica:** ${m.perguntaDiagnostica}`)
  if (m.criterioAvanco) l.push(`**Para avançar:** ${m.criterioAvanco}`)
  if (m.prerequisitos?.length) l.push(`**Pré-requisitos:** ${m.prerequisitos.join('; ')}`)
  return l.join('\n')
}

/**
 * Aprovar (com minhas edições): vira nós `origin='plan'` APÓS os existentes — nada do que escrevi
 * é apagado ou movido. A primeira aula nasce com a abertura do plano (reutilizada, sem nova chamada).
 */
export async function approvePlan(planId: number, edited?: unknown): Promise<{ nodeIds: number[]; lessonId: number | null }> {
  return tx((db) => {
    const p = one<PlanRow>(db, 'SELECT * FROM study_plans WHERE id = ?', [planId])
    if (!p) throw new StudyError(tt('estudos.planoNaoEncontrado'))
    if (p.status !== 'proposed') throw new StudyError(tt('estudos.planoNaoEditavel'))
    const content = edited ?? JSON.parse(p.content)
    validPlanContent(content)
    const now = nowIso()
    exec(db, "UPDATE study_plans SET status = 'superseded' WHERE topicId = ? AND status = 'approved'", [p.topicId])
    exec(db, "UPDATE study_plans SET status = 'approved', approvedAt = ?, content = ?, edited = ? WHERE id = ?", [now, JSON.stringify(content), edited ? 1 : p.edited, planId])
    const nextRoot = (): number => one<{ n: number }>(db, 'SELECT COALESCE(MAX(orderIndex), -1) + 1 AS n FROM study_nodes WHERE topicId = ? AND parentId IS NULL', [p.topicId])!.n
    const insertNode = (parentId: number | null, title: string, description: string | null, order: number, minutes: number | null): number =>
      exec(db, "INSERT INTO study_nodes (topicId, parentId, title, description, status, orderIndex, estimatedHours, createdAt, origin, planId) VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, 'plan', ?)", [
        p.topicId,
        parentId,
        title.trim().slice(0, 300),
        description,
        order,
        minutes && minutes > 0 ? Math.round((minutes / 60) * 100) / 100 : null,
        now,
        planId
      ])
    const nodeIds: number[] = []
    let firstModule: { id: number; title: string } | null = null
    for (const parte of content.partes) {
      if (parte.excluir) continue
      const mods = parte.modulos.filter((m) => !m.excluir && m.titulo?.trim())
      if (!mods.length) continue
      const pid = insertNode(null, parte.titulo, parte.porque || null, nextRoot(), null)
      nodeIds.push(pid)
      mods.forEach((m, i) => {
        const id = insertNode(pid, m.titulo, descricaoModulo(m) || null, i, typeof m.minutos === 'number' ? m.minutos : null)
        nodeIds.push(id)
        if (!firstModule) firstModule = { id, title: m.titulo }
      })
    }
    const ws = (content.workshops ?? []).filter((w) => !w.excluir && w.titulo?.trim())
    if (ws.length) {
      const wid = insertNode(null, 'Workshops', null, nextRoot(), null)
      nodeIds.push(wid)
      ws.forEach((w, i) => nodeIds.push(insertNode(wid, w.titulo, [w.entrega && `**Entrega:** ${w.entrega}`, w.experimento && `**Experimento:** ${w.experimento}`].filter(Boolean).join('\n') || null, i, null)))
    }
    let lessonId: number | null = null
    const ab = content.aberturaPrimeiraAula
    const fm = firstModule as { id: number; title: string } | null
    if (fm && ab && (ab.situacao || ab.primeiroPasso || ab.pergunta)) {
      lessonId = exec(db, 'INSERT INTO study_lessons (topicId, nodeId, planId, title, openQuestion, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        p.topicId,
        fm.id,
        planId,
        fm.title,
        ab.pergunta || null,
        now,
        now
      ])
      const abertura = [ab.titulo && `### ${ab.titulo}`, ab.situacao, ab.primeiroPasso && `**Primeiro passo hoje:** ${ab.primeiroPasso}`, ab.pergunta && `**Pergunta:** ${ab.pergunta}`].filter(Boolean).join('\n\n')
      exec(db, "INSERT INTO study_lesson_turns (lessonId, role, content, payload, createdAt) VALUES (?, 'tutor', ?, ?, ?)", [
        lessonId,
        abertura,
        JSON.stringify({ tipo: 'explicacao', doPlano: true, perguntaAberta: ab.pergunta ?? null }),
        now
      ])
    }
    return { nodeIds, lessonId }
  })
}

// ── B. Aula conversacional ───────────────────────────────────────────────────


export async function listLessons(topicId: number): Promise<LessonRow[]> {
  return read((db) => all<LessonRow>(db, 'SELECT * FROM study_lessons WHERE topicId = ? ORDER BY updatedAt DESC, id DESC', [topicId]))
}

/** Abre a aula do item (cria se não existir) — sem IA. */
export async function openLesson(topicId: number, nodeId: number | null): Promise<{ lesson: LessonRow; turns: TurnRow[]; running: RunRow | null }> {
  const id = await tx((db) => {
    const t = topicOrThrow(db, topicId)
    const ex = one<LessonRow>(db, 'SELECT * FROM study_lessons WHERE topicId = ? AND IFNULL(nodeId, -1) = IFNULL(?, -1) ORDER BY id DESC LIMIT 1', [topicId, nodeId])
    if (ex) return ex.id
    const title = nodeId != null ? one<{ title: string }>(db, 'SELECT title FROM study_nodes WHERE id = ?', [nodeId])?.title ?? t.name : t.name
    return exec(db, 'INSERT INTO study_lessons (topicId, nodeId, title, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)', [topicId, nodeId, title, nowIso(), nowIso()])
  })
  return getLesson(id)
}

export async function getLesson(lessonId: number): Promise<{ lesson: LessonRow; turns: TurnRow[]; running: RunRow | null }> {
  return read((db) => {
    const lesson = one<LessonRow>(db, 'SELECT * FROM study_lessons WHERE id = ?', [lessonId])
    if (!lesson) throw new StudyError(tt('estudos.aulaNaoEncontrada'))
    return {
      lesson,
      turns: all<TurnRow>(db, 'SELECT * FROM study_lesson_turns WHERE lessonId = ? ORDER BY id', [lessonId]),
      running: one<RunRow>(db, "SELECT * FROM study_ai_runs WHERE requestKey = ? AND status = 'running' ORDER BY id DESC LIMIT 1", [`aula:${lessonId}`])
    }
  })
}

/**
 * Envia meu turno e pede o próximo turno do tutor (1 chamada). Idempotente por `clientKey`;
 * um turno por vez por aula (enquanto o tutor responde, outro envio é recusado).
 */
export async function sendTurn(lessonId: number, text: string, clientKey: string): Promise<RunRow> {
  const msg = (text ?? '').trim()
  if (!msg) throw new StudyError(tt('estudos.mensagemVazia'))
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(clientKey ?? '')) throw new StudyError(tt('estudos.idInvalido'))
  const prep = await tx((db) => {
    const running = one<RunRow>(db, "SELECT * FROM study_ai_runs WHERE requestKey = ? AND status = 'running' LIMIT 1", [`aula:${lessonId}`])
    const dup = one<TurnRow>(db, 'SELECT * FROM study_lesson_turns WHERE clientKey = ?', [clientKey])
    if (dup) return { dup: true as const, running }
    if (running) throw new StudyError(tt('estudos.aguardeTutor'))
    const lesson = one<LessonRow>(db, 'SELECT * FROM study_lessons WHERE id = ?', [lessonId])
    if (!lesson) throw new StudyError(tt('estudos.aulaNaoEncontrada'))
    exec(db, "INSERT INTO study_lesson_turns (lessonId, role, content, clientKey, createdAt) VALUES (?, 'me', ?, ?, ?)", [lessonId, msg, clientKey, nowIso()])
    exec(db, 'UPDATE study_lessons SET updatedAt = ? WHERE id = ?', [nowIso(), lessonId])
    return { dup: false as const, running: null }
  })
  if (prep.dup) {
    if (prep.running) return prep.running
    const last = await read((db) => one<RunRow>(db, 'SELECT * FROM study_ai_runs WHERE requestKey = ? ORDER BY id DESC LIMIT 1', [`aula:${lessonId}`]))
    if (last) return last
  }
  return runLessonTurn(lessonId)
}

/** Pede de novo o turno do tutor para o meu último turno (depois de falha/cancelamento). */
export async function runLessonTurn(lessonId: number): Promise<RunRow> {
  const { t, lesson, turns, contexto } = await read((db) => {
    const lesson = one<LessonRow>(db, 'SELECT * FROM study_lessons WHERE id = ?', [lessonId])
    if (!lesson) throw new StudyError(tt('estudos.aulaNaoEncontrada'))
    const t = topicOrThrow(db, lesson.topicId)
    const turns = all<TurnRow>(db, 'SELECT * FROM study_lesson_turns WHERE lessonId = ? ORDER BY id', [lessonId])
    const lastMe = [...turns].reverse().find((x) => x.role === 'me')
    if (!lastMe || turns[turns.length - 1].role !== 'me') throw new StudyError(tt('estudos.nadaParaResponder'))
    const contexto = contextoAula(db, t, lesson, turns.slice(0, -1))
    return { t, lesson, turns, contexto }
  })
  const lastMe = turns[turns.length - 1]
  const params: ParamsTutor = { ...idiomaDe(t), contexto, pedido: lastMe.content }
  return startRun({
    operation: 'aula',
    chamada: 'estudos.aula',
    topicId: lesson.topicId,
    nodeId: lesson.nodeId,
    requestKey: `aula:${lessonId}`,
    params,
    signature: assinatura(contexto, lastMe.content),
    schema: SCHEMA_AULA,
    timeoutMs: 6 * 60_000,
    apply: (db, parsed, run) => {
      const p = parsed as { resposta?: string; perguntaAberta?: string | null; pontoDeRetorno?: string | null; fraseDeRetomada?: string | null }
      if (!p || typeof p.resposta !== 'string' || !p.resposta.trim()) throw Object.assign(new Error(tt('estudos.respostaInvalida')), { invalid: true })
      // só responde se o meu último turno ainda é o último (ninguém respondeu antes)
      const last = one<TurnRow>(db, 'SELECT * FROM study_lesson_turns WHERE lessonId = ? ORDER BY id DESC LIMIT 1', [lessonId])
      if (!last || last.id !== lastMe.id) return
      exec(db, "INSERT INTO study_lesson_turns (lessonId, role, content, payload, runId, createdAt) VALUES (?, 'tutor', ?, ?, ?, ?)", [lessonId, p.resposta, JSON.stringify(parsed), run.id, nowIso()])
      exec(db, 'UPDATE study_lessons SET openQuestion = ?, returnPoint = ?, resumePhrase = COALESCE(?, resumePhrase), updatedAt = ? WHERE id = ?', [
        p.perguntaAberta ?? null,
        p.pontoDeRetorno ?? null,
        p.fraseDeRetomada ?? null,
        nowIso(),
        lessonId
      ])
    }
  })
}

/** "Adicionar à minha nota": só por ação minha; acrescenta no fim da nota do item. */
export async function appendToNote(topicId: number, nodeId: number | null, text: string): Promise<void> {
  const add = (text ?? '').trim()
  if (!add) return
  await tx((db) => {
    topicOrThrow(db, topicId)
    const n = nodeId == null
      ? one<{ id: number; content: string }>(db, 'SELECT id, content FROM study_notes WHERE topicId = ? AND nodeId IS NULL', [topicId])
      : one<{ id: number; content: string }>(db, 'SELECT id, content FROM study_notes WHERE nodeId = ?', [nodeId])
    if (n) exec(db, 'UPDATE study_notes SET content = ?, updatedAt = ? WHERE id = ?', [n.content.trim() ? `${n.content.trimEnd()}\n\n${add}\n` : `${add}\n`, nowIso(), n.id])
    else exec(db, 'INSERT INTO study_notes (topicId, nodeId, content, updatedAt) VALUES (?, ?, ?, ?)', [topicId, nodeId, `${add}\n`, nowIso()])
  })
}
