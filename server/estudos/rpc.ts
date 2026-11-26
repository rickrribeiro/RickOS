import type { CardStatus, CheckpointTarget, Rating, StudyCardInput, TopicStatus } from '../../shared/estudos'
import { RATINGS } from '../../shared/estudos'
import { broadcast } from '../events'
import * as repo from './repo'
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
  if (!Number.isInteger(n) || n <= 0) throw new StudyError('Identificador inválido.')
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
    if (!Number.isFinite(m) || m <= 0 || m > 600) throw new StudyError('Tempo inválido.')
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
    if (!RATINGS.includes(rating)) throw new StudyError('Avaliação inválida.')
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
}
