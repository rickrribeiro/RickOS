import os from 'os'
import path from 'path'
import type { AiConversationPatch, AiImageInput, AiPromptResponse, AiTurn, ConvEffort, ConvListQuery, ConvPermissionMode, TerminalSession } from '../../shared/aiConversations'
import { CONV_TURNS_PAGE_SIZE, IMAGE_MEDIA_TYPES, MAX_IMAGES_PER_MESSAGE } from '../../shared/aiConversations'
import { runClaude } from '../services/claude'
import * as gitc from './git'
import { listClaudeSkills, readSkill, saveSkill, slashCommands } from './claudeSkills'
import { broadcast } from '../events'
import * as repo from './repo'
import * as runner from './runner'
import type { RunnerDeps } from './runner'
import { findTranscript, listTerminalSessions, parseTranscript } from './transcripts'
import { getUsageLimits } from './usageLimits'
import { tt } from '../i18n'

/**
 * Canais `conv:*` do Prompt Runner (conversas com o Claude CLI). Eventos ao vivo saem
 * pelo canal SSE `conv:update` ({ conversationId, turn? , conversation?, removed? }).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handle = (channel: string, fn: (event: unknown, ...args: any[]) => unknown) => void

export interface AiConvDeps extends RunnerDeps {
  /** Projetos com pasta local, para associar sessões do terminal ao projeto. */
  projectPaths: () => Promise<{ id: number; localPath: string; name: string; repos?: { name: string; dir: string }[] }[]>
}

interface CreateParams {
  title?: string
  projectId?: number | null
  agentId?: string | null
  skillIds?: string[]
  model?: string
  effort?: ConvEffort
  permissionMode?: ConvPermissionMode
  useWorktree?: boolean
}

const PERMISSION_MODES: ConvPermissionMode[] = ['default', 'acceptEdits', 'plan', 'bypassPermissions']
const EFFORTS: ConvEffort[] = ['', 'low', 'medium', 'high', 'xhigh', 'max']

function sanitizePatch(p: AiConversationPatch & CreateParams): AiConversationPatch {
  const out: AiConversationPatch = {}
  if (typeof p.title === 'string') out.title = p.title.slice(0, 200)
  if (p.projectId === null || typeof p.projectId === 'number') out.projectId = p.projectId
  if (p.agentId === null || typeof p.agentId === 'string') out.agentId = p.agentId || null
  if (Array.isArray(p.skillIds)) out.skillIds = p.skillIds.filter((x) => typeof x === 'string')
  if (typeof p.model === 'string') out.model = p.model.trim()
  if (typeof p.effort === 'string' && EFFORTS.includes(p.effort)) out.effort = p.effort
  if (typeof p.permissionMode === 'string' && PERMISSION_MODES.includes(p.permissionMode)) out.permissionMode = p.permissionMode
  if (typeof p.pinned === 'boolean') out.pinned = p.pinned
  if (typeof p.archived === 'boolean') out.archived = p.archived
  if (typeof p.claudeCommand === 'string' && /^[A-Za-z0-9_./-]*$/.test(p.claudeCommand.trim())) out.claudeCommand = p.claudeCommand
  if (typeof p.useWorktree === 'boolean') out.useWorktree = p.useWorktree
  return out
}

const MAX_IMAGE_B64 = 7 * 1024 * 1024 // ~5 MB de imagem
const MAX_THUMB = 80 * 1024

function sanitizeImages(raw: unknown): AiImageInput[] {
  if (!Array.isArray(raw)) return []
  if (raw.length > MAX_IMAGES_PER_MESSAGE) throw new Error(tt('aiconv.maximoDeImagensPorMensagem', { MAX_IMAGES_PER_MESSAGE }))
  return raw.map((x: Partial<AiImageInput>) => {
    if (!x || !IMAGE_MEDIA_TYPES.includes(x.mediaType as AiImageInput['mediaType'])) throw new Error(tt('aiconv.formatoDeImagemNaoSuportado'))
    if (typeof x.data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(x.data) || x.data.length > MAX_IMAGE_B64) throw new Error(tt('aiconv.imagemInvalidaOuGrandeDemais'))
    const thumb = typeof x.thumb === 'string' && x.thumb.startsWith('data:image/') && x.thumb.length <= MAX_THUMB ? x.thumb : ''
    return { mediaType: x.mediaType as AiImageInput['mediaType'], data: x.data, thumb }
  })
}

function matchProject(cwd: string, projects: { id: number; localPath: string }[]): number | null {
  const norm = (s: string): string => path.resolve(s).replace(/\/+$/, '')
  const c = norm(cwd)
  let best: { id: number; len: number } | null = null
  for (const p of projects) {
    const lp = norm(p.localPath)
    if ((c === lp || c.startsWith(lp + '/')) && (!best || lp.length > best.len)) best = { id: p.id, len: lp.length }
  }
  return best?.id ?? null
}

/** Aspas simples seguras para um comando de shell copiado pelo usuário. */
function sq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/**
 * Inicialização (com o banco aberto): turnos que ficaram "rodando" quando o servidor
 * parou de repente viram "interrompidos" — nenhum processo os acompanha mais.
 */
export async function recoverConversations(): Promise<void> {
  await repo.markStaleTurnsInterrupted()
}

export function registerAiConvRpc(handle: Handle, deps: AiConvDeps): void {
  runner.initRunner(deps)

  const emitConv = async (id: string): Promise<void> => {
    const c = await repo.getConversation(id)
    if (c) broadcast('conv:update', { conversationId: id, conversation: runner.withLive(c) })
  }

  handle('conv:list', async (_e, query?: ConvListQuery) => {
    const page = await repo.listConversations(query ?? {})
    return { ...page, items: page.items.map(runner.withLive) }
  })

  /** Conversa + os turnos mais recentes (ou todos a partir de `sinceId`, para recarregar a tela). */
  handle('conv:get', async (_e, id: string, opts?: { limit?: number; sinceId?: number | null }) => {
    const c = await repo.getConversation(id)
    if (!c) return null
    const page = await repo.listTurnsPage(id, { limit: opts?.limit ?? CONV_TURNS_PAGE_SIZE, sinceId: opts?.sinceId ?? null })
    const turns: AiTurn[] = page.turns
    const lt = runner.liveTurn(id)
    if (lt) {
      const i = turns.findIndex((t) => t.id === lt.id)
      if (i >= 0) turns[i] = lt
      else if (!turns.length || lt.id > turns[turns.length - 1].id) turns.push(lt)
    }
    return { conversation: runner.withLive(c), turns, hasMoreTurns: page.hasMore }
  })

  /** Turnos anteriores a `beforeId` ("carregar mensagens anteriores"). */
  handle('conv:olderTurns', async (_e, id: string, beforeId: number, limit?: number) =>
    repo.listTurnsPage(id, { limit: limit ?? CONV_TURNS_PAGE_SIZE, beforeId })
  )

  handle('conv:create', async (_e, params: CreateParams = {}) => {
    const p = sanitizePatch(params)
    const c = await repo.createConversation({
      title: p.title,
      projectId: p.projectId ?? null,
      agentId: p.agentId ?? null,
      skillIds: p.skillIds ?? [],
      model: p.model ?? '',
      effort: p.effort ?? '',
      permissionMode: p.permissionMode ?? 'default',
      useWorktree: !!p.useWorktree
    })
    await emitConv(c.id)
    return runner.withLive(c)
  })

  handle('conv:update', async (_e, id: string, patch: AiConversationPatch) => {
    const before = await repo.getConversation(id)
    if (!before) return null
    const p = sanitizePatch(patch ?? {})
    // projeto e worktree só mudam antes do primeiro turno (o --resume depende do diretório)
    if (before.cwd) {
      delete p.projectId
      delete p.useWorktree
    }
    const c = await repo.updateConversation(id, p)
    await emitConv(id)
    return c ? runner.withLive(c) : null
  })

  handle('conv:delete', async (_e, id: string, removeWorktree?: boolean) => {
    const c = await repo.getConversation(id)
    await runner.cancel(id)
    if (removeWorktree && c?.useWorktree && c.repoPath && c.cwd) {
      // espera o processo sair antes de apagar a pasta
      for (let i = 0; i < 20 && runner.isRunning(id); i++) await new Promise((r) => setTimeout(r, 250))
      await gitc.removeWorktree(c.repoPath, c.cwd, c.worktreeBranch)
    }
    await repo.deleteConversation(id)
    broadcast('conv:update', { conversationId: id, removed: true })
    return true
  })

  handle('conv:send', async (_e, id: string, text: string, images?: unknown) => {
    const imgs = sanitizeImages(images)
    if (typeof text !== 'string' || (!text.trim() && !imgs.length)) return false
    await runner.sendMessage(id, text, imgs)
    return true
  })

  /** Ramifica: conversa nova com o mesmo histórico, que continua numa sessão separada. */
  handle('conv:fork', async (_e, id: string) => {
    const c = await repo.getConversation(id)
    if (!c?.sessionId) throw new Error(tt('aiconv.aConversaAindaNaoTem'))
    if (runner.isRunning(id)) throw new Error(tt('aiconv.espereAExecucaoTerminarPara'))
    const turns = await repo.listTurns(id)
    const f = await repo.createConversation({
      title: `↳ ${c.title}`.slice(0, 200),
      projectId: c.projectId,
      agentId: c.agentId,
      skillIds: c.skillIds,
      model: c.model,
      effort: c.effort,
      permissionMode: c.permissionMode,
      cwd: c.cwd,
      configDir: c.configDir,
      claudeCommand: c.claudeCommand,
      forkFrom: c.sessionId,
      useWorktree: c.useWorktree,
      repoPath: c.repoPath,
      worktreeBranch: c.worktreeBranch,
      baseRef: c.baseRef,
      contextTokens: c.contextTokens,
      contextWindow: c.contextWindow,
      origin: c.origin
    })
    await repo.replaceTurns(f.id, turns.map(({ id: _id, conversationId: _c, ...t }) => t))
    await emitConv(f.id)
    return runner.withLive((await repo.getConversation(f.id))!)
  })

  // ── Mudanças no repositório da conversa ──
  /** Pasta git da operação: a da conversa ou, em workspace, o repo filho `repoRel` (conferido). */
  const convDir = async (id: string, repoRel?: string | null): Promise<{ dir: string; baseRef: string | null }> => {
    const c = await repo.getConversation(id)
    if (!c) throw new Error(tt('aiconv.conversaNaoEncontrada'))
    const root = c.cwd || (await deps.resolveProjectCwd(c.projectId))
    if (!root) throw new Error(tt('aiconv.estaConversaNaoTemPasta'))
    if (!repoRel) return { dir: root, baseRef: c.baseRef }
    const rel = String(repoRel)
    return { dir: gitc.resolveRepoDir(root, rel), baseRef: gitc.workspaceBaseRef(root, rel) }
  }
  handle('conv:changes', async (_e, id: string) => {
    const c = await repo.getConversation(id)
    const dir = c?.cwd || (c ? await deps.resolveProjectCwd(c.projectId) : undefined)
    if (!c || !dir) return { isRepo: false, branch: null, baseRef: null, files: [], unpushed: 0, hasRemote: false }
    return gitc.getChanges(dir, c.baseRef)
  })
  handle('conv:fileDiff', async (_e, id: string, filePath: string, repoRel?: string | null) => {
    const { dir } = await convDir(id, repoRel)
    return gitc.fileDiff(dir, String(filePath))
  })
  handle('conv:commit', async (_e, id: string, message: string, paths?: string[] | null, repoRel?: string | null) => {
    const { dir } = await convDir(id, repoRel)
    return gitc.commit(dir, String(message ?? ''), Array.isArray(paths) ? paths.map(String) : null)
  })
  handle('conv:discard', async (_e, id: string, filePath: string, repoRel?: string | null) => {
    if (runner.isRunning(id)) throw new Error(tt('aiconv.espereAExecucaoTerminar'))
    const { dir } = await convDir(id, repoRel)
    await gitc.discard(dir, String(filePath))
    return true
  })
  handle('conv:pr', async (_e, id: string, repoRel?: string | null) => {
    const { dir, baseRef } = await convDir(id, repoRel)
    return gitc.openPullRequest(dir, baseRef)
  })
  handle('conv:suggestCommit', async (_e, id: string, repoRel?: string | null) => {
    const c = await repo.getConversation(id)
    const { dir } = await convDir(id, repoRel)
    const ctx = await gitc.commitContext(dir)
    if (!ctx.trim()) throw new Error(tt('aiconv.nadaParaDescrever'))
    const out = await runClaude(
      `Escreva UMA mensagem de commit para as mudanças abaixo, no mesmo estilo e idioma dos commits recentes (ex.: convencional "tipo(escopo): resumo"). Responda só com a mensagem, sem aspas nem explicação; corpo opcional depois de uma linha em branco.\n\n${ctx}`,
      c ? await deps.resolveCommand(c) : 'claude',
      { model: 'haiku', timeoutMs: 90_000, usage: { source: 'prompt-runner', projectId: c?.projectId ?? null } }
    )
    return out.replace(/^```\w*\n?|```$/g, '').trim()
  })
  /** Apaga o worktree e a branch de uma conversa (e arquiva a conversa). */
  handle('conv:removeWorktree', async (_e, id: string) => {
    const c = await repo.getConversation(id)
    if (!c?.useWorktree || !c.repoPath || !c.cwd) throw new Error(tt('aiconv.estaConversaNaoTemWorktree'))
    if (runner.isRunning(id)) throw new Error(tt('aiconv.espereAExecucaoTerminar'))
    await gitc.removeWorktree(c.repoPath, c.cwd, c.worktreeBranch)
    await repo.updateConversation(id, { archived: true })
    await emitConv(id)
    return true
  })

  handle('conv:cancel', (_e, id: string) => runner.cancel(id))

  // ── Skills / comandos do Claude Code ──
  /** Comandos `/` para o autocompletar (conversa aberta ou rascunho de um projeto). */
  handle('conv:slashCommands', async (_e, id: string | null, projectId?: number | null) => {
    const projects = await deps.projectPaths()
    const c = id ? await repo.getConversation(id) : null
    return slashCommands(c ? runner.knownSlashNames(c) : null, projects, {
      projectId: c ? c.projectId : projectId ?? null,
      configDir: c?.configDir ?? null
    })
  })
  handle('claudeSkills:list', async (_e, fresh?: boolean) => listClaudeSkills(await deps.projectPaths(), !!fresh))
  handle('claudeSkills:read', async (_e, id: string) => readSkill(String(id), await deps.projectPaths()))
  handle('claudeSkills:save', async (_e, id: string, content: string) => saveSkill(String(id), content, await deps.projectPaths()))

  handle('conv:markSeen', async (_e, id: string) => {
    if (await repo.markSeen(id)) await emitConv(id)
    return true
  })

  handle('conv:respond', (_e, id: string, requestId: string, response: AiPromptResponse) => runner.respond(id, requestId, response))

  handle('conv:removeQueued', (_e, id: string, index: number) => runner.removeQueued(id, Number(index) || 0))

  // ── Limites de uso (/usage) ──
  handle('conv:usageLimits', (_e, refresh?: boolean) => getUsageLimits(!!refresh))

  // ── Sessões do terminal ──
  handle('conv:terminalSessions', async (): Promise<TerminalSession[]> => {
    const [sessions, inUse, projects] = await Promise.all([Promise.resolve(listTerminalSessions(60)), repo.sessionIdsInUse(), deps.projectPaths()])
    return sessions.map((s) => ({ ...s, projectId: matchProject(s.cwd, projects), conversationId: inUse.get(s.sessionId) ?? null }))
  })

  /** Importa (ou re-sincroniza) uma sessão do terminal como conversa. */
  handle('conv:importTerminal', async (_e, sessionId: string, configDir?: string | null) => {
    const found = findTranscript(sessionId, configDir)
    if (!found) throw new Error(tt('aiconv.transcriptDaSessaoNaoEncontrado'))
    const parsed = parseTranscript(found.file)
    const existing = await repo.findConversationBySession(sessionId)
    if (existing) {
      if (runner.isRunning(existing.id)) return runner.withLive(existing)
      await repo.replaceTurns(existing.id, parsed.turns)
      await repo.setConversationRuntime(existing.id, { contextTokens: parsed.contextTokens })
      await emitConv(existing.id)
      return runner.withLive((await repo.getConversation(existing.id))!)
    }
    const projects = await deps.projectPaths()
    const c = await repo.createConversation({
      title: parsed.title,
      sessionId,
      cwd: parsed.cwd,
      configDir: found.configDir,
      projectId: parsed.cwd ? matchProject(parsed.cwd, projects) : null,
      origin: 'terminal',
      contextTokens: parsed.contextTokens,
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt
    })
    await repo.replaceTurns(c.id, parsed.turns)
    await emitConv(c.id)
    return runner.withLive((await repo.getConversation(c.id))!)
  })

  /** Recarrega os turnos a partir do transcript (ex.: depois de continuar no terminal). */
  handle('conv:resync', async (_e, id: string) => {
    const c = await repo.getConversation(id)
    if (!c?.sessionId) throw new Error(tt('aiconv.estaConversaAindaNaoTem'))
    if (runner.isRunning(id)) throw new Error(tt('aiconv.aConversaEstaExecutando'))
    const found = findTranscript(c.sessionId, c.configDir)
    if (!found) throw new Error(tt('aiconv.transcriptDaSessaoNaoEncontrado'))
    const parsed = parseTranscript(found.file)
    // Os turnos do rickOS têm custo/duração; os do transcript não. Só substitui se o
    // transcript tiver mais turnos (ou seja, a conversa continuou fora daqui).
    const current = await repo.listTurns(id)
    if (parsed.turns.length <= current.length) return { updated: false }
    await repo.replaceTurns(id, parsed.turns)
    await repo.setConversationRuntime(id, { contextTokens: parsed.contextTokens })
    await emitConv(id)
    return { updated: true }
  })

  /** Comando para continuar a conversa no terminal. */
  handle('conv:terminalCommand', async (_e, id: string) => {
    const c = await repo.getConversation(id)
    if (!c?.sessionId) return null
    const command = await deps.resolveCommand(c)
    const home = os.homedir()
    const envPart = c.configDir && path.resolve(c.configDir) !== path.join(home, '.claude') ? `CLAUDE_CONFIG_DIR=${sq(c.configDir)} ` : ''
    const cdPart = c.cwd ? `cd ${sq(c.cwd)} && ` : ''
    return `${cdPart}${envPart}${command} --resume ${c.sessionId}`
  })
}
