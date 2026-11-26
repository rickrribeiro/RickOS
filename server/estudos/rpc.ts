import type { CardStatus, CheckpointTarget, Rating, StudyCardInput, TopicStatus } from '../../shared/estudos'
import { RATINGS } from '../../shared/estudos'
import { broadcast } from '../events'
import * as repo from './repo'
import * as gitSync from './git'
import { applyAdopt, previewAdopt, type AdoptApply } from './adopt'
import { listAttachments, storeAttachment } from './attachments'
import { exportAll } from './bundle'
import * as tutor from './tutor'
import * as material from './material'
import { exportarModelo, importarModelo, previaModelo } from './modelo'
import type { ModeloImportOpts } from '../../shared/estudos'
import { SECOES, type Secao } from '../../shared/prompts/estudos/pedagogia/schemas'
import { diagnosticoCodex } from '../ia/motores/codex'
import { EFFORTS_DO_MOTOR, modeloValido } from '../../shared/prompts/motores'
import { PERFIS_ESTUDOS, type PerfilEstudos } from '../../shared/prompts/estudos/perfis'
import { getSetting, setSetting } from '../database/queries'
import { tt } from '../i18n'
import { StudyError } from './sql'

/**
 * Canais `estudos:*` (Estudos v2). Nenhum deles chama IA: abrir, filtrar, revisar, aprovar,
 * exportar e sincronizar são locais. As gerações do tutor ficam em `estudos:ia*` (tutor.ts).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Handle = (channel: string, fn: (event: unknown, ...args: any[]) => unknown) => void

export const changed = (kind: string, topicId?: number | null): void => broadcast('estudos:updated', { kind, topicId: topicId ?? null })

export const id = (v: unknown): number => {
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) throw new StudyError(tt('estudos.idInvalido'))
  return n
}
const optId = (v: unknown): number | null => (v == null || v === '' ? null : id(v))

export function registerEstudosRpc(handle: Handle): void {
  // ── Biblioteca e retomada ──
  handle('estudos:library', () => repo.getLibrary())
  handle('estudos:topic', (_e, topicId: number) => repo.getTopic(id(topicId)))
  handle('estudos:createTopic', async (_e, input: repo.TopicInput) => {
    const t = await repo.createTopic(input)
    changed('topics', t.id)
    return t
  })
  handle('estudos:createFuture', async (_e, name: string) => {
    const t = await repo.createFutureTopic(String(name ?? ''))
    changed('topics', t.id)
    return t
  })
  handle('estudos:updateTopic', async (_e, topicId: number, patch: Partial<repo.TopicInput>) => {
    const t = await repo.updateTopic(id(topicId), patch ?? {})
    changed('topics', t.id)
    return t
  })
  handle('estudos:setTopicStatus', async (_e, topicId: number, status: TopicStatus) => {
    const t = await repo.setTopicStatus(id(topicId), status)
    changed('topics', t.id)
    return t
  })
  handle('estudos:continue', () => repo.getContinue())
  handle('estudos:prefs', () => repo.getPrefs())
  handle('estudos:setPinned', async (_e, p: repo.PinnedAction | null) => {
    await repo.setPinned(p ? { ...p, topicId: id(p.topicId), nodeId: optId(p.nodeId), refId: optId(p.refId) } : null)
    changed('prefs')
  })
  handle('estudos:setNewPerDay', async (_e, n: number) => {
    await repo.setNewPerDay(Number(n))
    changed('prefs')
  })
  handle('estudos:timeOptions', (_e, minutes: number, filters?: repo.TimeFilters) => {
    const m = Number(minutes)
    if (!Number.isFinite(m) || m <= 0 || m > 600) throw new StudyError(tt('estudos.tempoInvalido'))
    return repo.getTimeOptions(m, filters ?? {})
  })

  // ── Categorias ──
  handle('estudos:categories', () => repo.listCategories())
  handle('estudos:createCategory', async (_e, name: string) => {
    const c = await repo.createCategory(String(name ?? ''))
    changed('categories')
    return c
  })
  handle('estudos:renameCategory', async (_e, catId: number, name: string) => {
    await repo.renameCategory(id(catId), String(name ?? ''))
    changed('categories')
  })
  handle('estudos:deleteCategory', async (_e, catId: number) => {
    await repo.deleteCategory(id(catId))
    changed('categories')
  })

  // ── Cartões e revisão ──
  handle('estudos:cards', (_e, f?: repo.CardFilters) => repo.listCards(f ?? {}))
  handle('estudos:createCard', async (_e, input: StudyCardInput) => {
    const c = await repo.createCard({ ...input, topicId: id(input?.topicId), nodeId: optId(input?.nodeId) })
    changed('cards', c.topicId)
    return c
  })
  handle('estudos:updateCard', async (_e, cardId: number, input: StudyCardInput) => {
    const c = await repo.updateCard(id(cardId), { ...input, nodeId: optId(input?.nodeId) })
    changed('cards', c.topicId)
    return c
  })
  handle('estudos:setCardStatus', async (_e, cardId: number, status: CardStatus) => {
    await repo.setCardStatus(id(cardId), status)
    changed('cards')
  })
  handle('estudos:setStateSuspended', async (_e, stateId: number, suspended: boolean) => {
    await repo.setStateSuspended(id(stateId), !!suspended)
    changed('cards')
  })
  handle('estudos:deleteCard', async (_e, cardId: number) => {
    await repo.deleteCard(id(cardId))
    changed('cards')
  })
  handle('estudos:queue', (_e, f?: repo.QueueFilters) => repo.getReviewQueue(f ?? {}))
  handle('estudos:review', async (_e, stateId: number, rating: Rating) => {
    if (!RATINGS.includes(rating)) throw new StudyError(tt('estudos.avaliacaoInvalida'))
    const s = await repo.reviewState(id(stateId), rating)
    changed('review')
    return s
  })

  // ── Fontes externas e importação ──
  handle('estudos:sources', (_e, topicId: number, nodeId?: number | null) => repo.listSources(id(topicId), nodeId === undefined ? undefined : optId(nodeId)))
  handle('estudos:createSource', async (_e, s: repo.SourceInput) => {
    const r = await repo.createSource({ ...s, topicId: id(s?.topicId), nodeId: optId(s?.nodeId) })
    changed('sources', r.topicId)
    return r
  })
  handle('estudos:updateSource', async (_e, sourceId: number, patch: Partial<repo.SourceInput>) => {
    const r = await repo.updateSource(id(sourceId), patch ?? {})
    changed('sources', r.topicId)
    return r
  })
  handle('estudos:deleteSource', async (_e, sourceId: number) => {
    await repo.deleteSource(id(sourceId))
    changed('sources')
  })
  handle('estudos:previewImport', (_e, topicId: number, files: repo.ImportFileIn[]) => repo.previewImport(id(topicId), Array.isArray(files) ? files : []))
  handle('estudos:applyImport', async (_e, topicId: number, nodeId: number | null, files: Parameters<typeof repo.applyImport>[2]) => {
    const r = await repo.applyImport(id(topicId), optId(nodeId), Array.isArray(files) ? files : [])
    changed('sources', id(topicId))
    return r
  })

  // ── Checkpoints ──
  handle('estudos:saveCheckpoint', async (_e, c: repo.CheckpointInput) => {
    const r = await repo.saveCheckpoint({ ...c, topicId: id(c?.topicId), nodeId: optId(c?.nodeId), refId: optId(c?.refId) })
    // sem broadcast: o autosave dispara isto com frequência; a outra tela lê ao abrir
    return r
  })
  handle('estudos:checkpoint', (_e, topicId: number, nodeId: number | null, target: CheckpointTarget, refId?: number | null) =>
    repo.getCheckpoint(id(topicId), optId(nodeId), target, optId(refId))
  )

  // ── Perguntas e tentativas ──
  handle('estudos:questions', (_e, f?: Parameters<typeof repo.listQuestions>[0]) => repo.listQuestions(f ?? {}))
  handle('estudos:createQuestion', async (_e, q: repo.QuestionInput) => {
    const r = await repo.createQuestion({ ...q, topicId: id(q?.topicId), nodeId: optId(q?.nodeId) })
    changed('questions', r.topicId)
    return r
  })
  handle('estudos:updateQuestion', async (_e, qid: number, patch: Parameters<typeof repo.updateQuestion>[1]) => {
    await repo.updateQuestion(id(qid), patch ?? {})
    changed('questions')
  })
  handle('estudos:deleteQuestion', async (_e, qid: number) => {
    await repo.deleteQuestion(id(qid))
    changed('questions')
  })
  handle('estudos:recordAttempt', async (_e, qid: number, a: Parameters<typeof repo.recordAttempt>[1]) => {
    const r = await repo.recordAttempt(id(qid), a)
    changed('questions', r.topicId)
    return r
  })
  handle('estudos:attempts', (_e, qid: number) => repo.listAttempts(id(qid)))

  // ── Anexos (imagens do caderno) ──
  handle('estudos:uploadAttachment', async (_e, name: string, mime: string, base64: string) => {
    if (typeof base64 !== 'string' || !base64) throw new StudyError(tt('estudos.arquivoVazio'))
    const a = await storeAttachment(Buffer.from(base64, 'base64'), name ? String(name).slice(0, 200) : null, String(mime ?? ''))
    return { fileName: a.fileName, ref: `anexos/${a.fileName}`, mime: a.mime, size: a.size }
  })
  handle('estudos:attachments', () => listAttachments())

  // ── Exportação completa (pasta) — mesma do Git, sem IA ──
  handle('estudos:exportAll', async () => {
    const { files } = await exportAll()
    return files.map((f) => ({ path: f.path, base64: Buffer.isBuffer(f.content) ? f.content.toString('base64') : Buffer.from(f.content, 'utf8').toString('base64') }))
  })

  // ── Repositório de estudos / Sincronizar ──
  handle('estudos:gitStatus', () => gitSync.getStatus())
  handle('estudos:gitPreview', (_e, cfg: Partial<gitSync.GitConfig>) => gitSync.previewLink(cfg ?? {}))
  handle('estudos:gitLink', async (_e, cfg: gitSync.GitConfig & { previewId: string }) => {
    const r = await gitSync.link(cfg)
    changed('git')
    return r
  })
  handle('estudos:gitUnlink', async () => {
    await gitSync.unlink()
    changed('git')
  })
  handle('estudos:sync', () => gitSync.sync())
  handle('estudos:gitTree', async () => {
    await gitSync.refreshCheckout()
    return gitSync.repoTree()
  })
  handle('estudos:restoreFromRepo', async () => {
    const r = await gitSync.restoreFromRepo()
    changed('topics')
    return r
  })
  handle('estudos:adoptPreview', (_e, subpath: string, topicId: number | null) => previewAdopt(String(subpath ?? '.'), optId(topicId)))
  handle('estudos:adoptApply', async (_e, input: AdoptApply) => {
    const r = await applyAdopt({ ...input, topicId: optId(input?.topicId), mode: input?.mode === 'source' ? 'source' : 'note', decisions: input?.decisions ?? {} })
    changed('topics', r.topicId)
    return r
  })

  // ── Tutor (Codex): só por ação explícita; tudo o mais lê o que está salvo ──
  void tutor.recoverStaleRuns()
  handle('estudos:iaPerfis', async () => {
    const out: Record<string, { modelo: string; effort: string; padraoModelo: string; padraoEffort: string }> = {}
    for (const [k, p] of Object.entries(PERFIS_ESTUDOS)) {
      out[k] = {
        modelo: ((await getSetting(p.modelo.setting!)) ?? '').trim() || p.modelo.padrao,
        effort: ((await getSetting(p.effort.setting!)) ?? '').trim() || p.effort.padrao,
        padraoModelo: p.modelo.padrao,
        padraoEffort: p.effort.padrao
      }
    }
    return { perfis: out, efforts: EFFORTS_DO_MOTOR.codex }
  })
  handle('estudos:setIaPerfil', async (_e, perfil: PerfilEstudos, modelo: string, effort: string) => {
    const p = PERFIS_ESTUDOS[perfil]
    if (!p) throw new StudyError(tt('estudos.perfilInvalido'))
    if (modelo && !modeloValido(modelo)) throw new StudyError(tt('estudos.modeloInvalido'))
    if (effort && !EFFORTS_DO_MOTOR.codex.includes(effort)) throw new StudyError(tt('estudos.effortInvalido'))
    await setSetting(p.modelo.setting!, (modelo ?? '').trim())
    await setSetting(p.effort.setting!, (effort ?? '').trim())
    changed('iaPerfis')
  })
  // diagnóstico local (versão, login, modelos no catálogo do CLI) — não envia contexto
  handle('estudos:iaDiagnostico', async () => {
    const modelos: string[] = []
    for (const p of Object.values(PERFIS_ESTUDOS)) modelos.push(((await getSetting(p.modelo.setting!)) ?? '').trim() || p.modelo.padrao)
    return diagnosticoCodex([...new Set(modelos)])
  })
  handle('estudos:iaRuns', (_e, f?: { topicId?: number | null; nodeId?: number | null; limit?: number }) => tutor.listRuns(f ?? {}))
  handle('estudos:iaCancel', (_e, runId: number) => tutor.cancelRun(id(runId)))
  handle('estudos:masterclass', (_e, topicId: number, pedido: string) => tutor.startMasterclass(id(topicId), String(pedido ?? '')))
  handle('estudos:plans', (_e, topicId: number) => tutor.listPlans(id(topicId)))
  handle('estudos:masterclassContext', (_e, topicId: number) => tutor.previewMasterclassContext(id(topicId)))
  handle('estudos:editPlan', async (_e, planId: number, content: unknown) => {
    const p = await tutor.editPlan(id(planId), content)
    changed('plans', p.topicId)
    return p
  })
  handle('estudos:discardPlan', async (_e, planId: number) => {
    await tutor.discardPlan(id(planId))
    changed('plans')
  })
  // modelo de roadmap: zero chamadas de IA
  handle('estudos:modeloExport', (_e, topicId: number, opts?: { aulas?: boolean; notas?: boolean }) => exportarModelo(id(topicId), { aulas: opts?.aulas !== false, notas: opts?.notas === true }))
  handle('estudos:modeloPreview', (_e, json: string, topicId?: number | null) => previaModelo(String(json ?? ''), optId(topicId)))
  handle('estudos:modeloImport', async (_e, json: string, opts: ModeloImportOpts) => {
    const r = await importarModelo(String(json ?? ''), { topicId: optId(opts?.topicId), nome: opts?.nome ?? null, aulas: opts?.aulas !== false, notas: opts?.notas !== false })
    changed('topics', r.topicId)
    return r
  })
  handle('estudos:approvePlan', async (_e, planId: number, content?: unknown) => {
    const r = await tutor.approvePlan(id(planId), content)
    changed('plans')
    return r
  })
  handle('estudos:lessons', (_e, topicId: number) => tutor.listLessons(id(topicId)))
  handle('estudos:openLesson', (_e, topicId: number, nodeId: number | null) => tutor.openLesson(id(topicId), optId(nodeId)))
  handle('estudos:lesson', (_e, lessonId: number) => tutor.getLesson(id(lessonId)))
  handle('estudos:sendTurn', (_e, lessonId: number, text: string, clientKey: string) => tutor.sendTurn(id(lessonId), String(text ?? ''), String(clientKey ?? '')))
  handle('estudos:retryTurn', (_e, lessonId: number) => tutor.runLessonTurn(id(lessonId)))
  handle('estudos:appendToNote', async (_e, topicId: number, nodeId: number | null, text: string) => {
    await tutor.appendToNote(id(topicId), optId(nodeId), String(text ?? ''))
    changed('notes', id(topicId))
  })

  // ── Material do nó (C), revisão editorial (D), subtópicos (E) ──
  handle('estudos:material', (_e, topicId: number, nodeId: number | null) => material.getMaterial(id(topicId), optId(nodeId)))
  handle('estudos:prepareNode', (_e, topicId: number, nodeId: number | null, opts?: { vocabulario?: string[] }) =>
    material.prepareNode(id(topicId), optId(nodeId), { vocabulario: Array.isArray(opts?.vocabulario) ? opts!.vocabulario.map(String).slice(0, 300) : undefined })
  )
  handle('estudos:regenerateSection', (_e, topicId: number, nodeId: number | null, secao: Secao) => {
    if (!SECOES.includes(secao)) throw new StudyError(tt('estudos.secaoInvalida'))
    return material.regenerateSection(id(topicId), optId(nodeId), secao)
  })
  handle('estudos:reviewNote', (_e, topicId: number, nodeId: number | null) => material.reviewNote(id(topicId), optId(nodeId)))
  handle('estudos:suggestSubtopics', (_e, topicId: number, nodeId: number | null) => material.suggestSubtopics(id(topicId), optId(nodeId)))
  handle('estudos:acceptEditorial', async (_e, sid: number, opts?: { text?: string | null; anchor?: string | null; replace?: boolean }) => {
    const r = await material.acceptEditorial(id(sid), opts ?? {})
    if (r.ok) changed('notes')
    return r
  })
  handle('estudos:decideSuggestion', async (_e, sid: number, status: 'rejected' | 'comment' | 'pending') => {
    if (!['rejected', 'comment', 'pending'].includes(status)) throw new StudyError(tt('estudos.statusInvalido'))
    await material.decideSuggestion(id(sid), status)
    changed('suggestions')
  })
  handle('estudos:acceptSubtopic', async (_e, sid: number, opts?: { parentId?: number | null; title?: string | null; position?: number | null }) => {
    const nodeId = await material.acceptSubtopic(id(sid), { ...opts, parentId: opts?.parentId === undefined ? undefined : optId(opts.parentId) })
    changed('nodes')
    return nodeId
  })
  handle('estudos:saveItemAsQuestion', async (_e, topicId: number, nodeId: number | null, kind: 'recall' | 'exercise' | 'socratic', prompt: string, reference: string | null, hint: string | null) => {
    if (!['recall', 'exercise', 'socratic'].includes(kind)) throw new StudyError(tt('estudos.statusInvalido'))
    const qid = await material.saveItemAsQuestion(id(topicId), optId(nodeId), kind, String(prompt ?? ''), reference ?? null, hint ?? null)
    changed('questions', id(topicId))
    return qid
  })
}
