import { spawn, type ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { AiBlock, AiConversation, AiImageInput, AiPromptResponse, AiQueuedMessage, AiTurn } from '../../shared/aiConversations'
import { broadcast } from '../events'
import { recordAiUsage } from '../database/queries'
import { buildPath, usageFromResult, type ResultEvent } from '../services/claude'
import { notify } from '../services/notifications'
import { createWorktree, createWorkspaceWorktree } from './git'
import * as repo from './repo'

/**
 * Executor das conversas do Prompt Runner. Cada mensagem vira um processo do Claude CLI:
 *
 *   claude --input-format stream-json --output-format stream-json --verbose
 *          --include-partial-messages --permission-prompt-tool stdio
 *          [--resume <sessionId>] [--model …] [--effort …] [--append-system-prompt …]
 *
 * Com `--permission-prompt-tool stdio`, cada ferramenta que precisaria de aprovação (e
 * cada pergunta do `AskUserQuestion` / plano do `ExitPlanMode`) chega no stdout como
 * `control_request` `can_use_tool`; a resposta do usuário volta pelo stdin como
 * `control_response`. Um turno por vez por conversa; mensagens enviadas durante um turno
 * entram na fila e rodam em sequência.
 */

/** O que o executor precisa saber do resto do servidor (resolvido em server/rpc.ts). */
export interface RunnerDeps {
  resolveCommand: (conv: AiConversation) => Promise<string>
  resolveModel: (conv: AiConversation) => Promise<string>
  /** Diretório do projeto (localPath), se houver. */
  resolveProjectCwd: (projectId: number | null) => Promise<string | undefined>
  /** Repositórios do projeto workspace (pasta raiz com vários repos); null = projeto de 1 repo. */
  projectWorkspaceRepos: (projectId: number | null) => Promise<{ name: string; rel: string; dir: string }[] | null>
  /** Ferramentas pré-liberadas (`--allowedTools …`). */
  allowedToolsArgs: () => Promise<string[]>
  /** Prompt de sistema extra: contexto do projeto + agente + skills. */
  systemPrompt: (conv: AiConversation) => Promise<string>
}

interface PendingRequest {
  toolUseId: string
  toolName: string
  input: Record<string, unknown>
  suggestions?: unknown[]
}

interface LiveRun {
  conversationId: string
  turn: AiTurn
  child: ChildProcess | null
  pending: Map<string, PendingRequest>
  startedAt: number
  cancelled: boolean
  /** "Conversar sobre isso": o usuário interrompeu de propósito (não é erro). */
  chatAbout: boolean
  gotResult: boolean
  stderr: string
  mainModel: string
  contextWindow: number
  compacted: boolean
  emitTimer: NodeJS.Timeout | null
  killTimer: NodeJS.Timeout | null
}

const live = new Map<string, LiveRun>()
/** Comandos `/` que o CLI anunciou no init, por conversa e por pasta (+ conta). */
const slashByConv = new Map<string, string[]>()
const slashByDir = new Map<string, string[]>()
const dirKey = (cwd: string | null, configDir: string | null): string => `${cwd ?? ''}|${configDir ?? ''}`

export function knownSlashNames(c: AiConversation): string[] | null {
  return slashByConv.get(c.id) ?? (c.cwd ? slashByDir.get(dirKey(c.cwd, c.configDir)) ?? null : null)
}
const queues = new Map<string, AiQueuedMessage[]>()
let deps: RunnerDeps | null = null

const TOOL_RESULT_MAX = 8000

export function initRunner(d: RunnerDeps): void {
  deps = d
}

export function isRunning(conversationId: string): boolean {
  return live.has(conversationId)
}
export function liveTurn(conversationId: string): AiTurn | null {
  return live.get(conversationId)?.turn ?? null
}
export function pendingCount(conversationId: string): number {
  return live.get(conversationId)?.pending.size ?? 0
}
/** Fila para exibição (texto + marcação das imagens). */
export function queuedMessages(conversationId: string): string[] {
  return (queues.get(conversationId) ?? []).map((m) => (m.images.length ? `🖼️×${m.images.length} ` : '') + (m.text || '(só imagens)'))
}

/** Conversa com o estado ao vivo (rodando, pedidos pendentes, fila). */
export function withLive(c: AiConversation): AiConversation {
  return { ...c, running: isRunning(c.id), pendingPrompts: pendingCount(c.id), queued: queuedMessages(c.id) }
}

async function emitConversation(conversationId: string): Promise<void> {
  const c = await repo.getConversation(conversationId)
  if (c) broadcast('conv:update', { conversationId, conversation: withLive(c) })
}

function emitTurn(run: LiveRun, immediate = false): void {
  const send = (): void => {
    run.emitTimer = null
    broadcast('conv:update', { conversationId: run.conversationId, turn: run.turn })
  }
  if (immediate) {
    if (run.emitTimer) clearTimeout(run.emitTimer)
    send()
    return
  }
  if (!run.emitTimer) run.emitTimer = setTimeout(send, 120)
}

/**
 * Servidor desligando: encerra os processos do Claude (senão ficam órfãos, ainda editando
 * arquivos sem ninguém ouvindo) e grava os turnos como interrompidos.
 */
export async function stopAllRuns(): Promise<void> {
  const runs = [...live.values()]
  queues.clear()
  for (const run of runs) {
    live.delete(run.conversationId)
    if (run.emitTimer) clearTimeout(run.emitTimer)
    if (run.killTimer) clearTimeout(run.killTimer)
    try {
      run.child?.kill('SIGTERM')
    } catch {
      // já saiu
    }
    const turn = run.turn
    for (const b of turn.blocks) {
      if ((b.type === 'text' || b.type === 'thinking') && b.live) b.live = false
      if (b.type === 'tool' && b.permission?.status === 'pending') b.permission = { ...b.permission, status: 'denied', note: 'Sem resposta' }
    }
    turn.status = 'interrupted'
    turn.error = 'O servidor foi reiniciado durante a execução.'
    turn.durationMs = Date.now() - run.startedAt
    try {
      await repo.saveTurn(turn)
    } catch {
      // banco indisponível: a limpeza da próxima inicialização marca o turno
    }
  }
  // o CLI pode demorar para sair com SIGTERM: espera um pouco e força quem ficou
  const pending = runs.map((r) => r.child).filter((c): c is ChildProcess => !!c && c.exitCode === null && c.signalCode === null)
  if (!pending.length) return
  await Promise.race([Promise.all(pending.map((c) => new Promise((res) => c.once('exit', res)))), new Promise((res) => setTimeout(res, 1500))])
  for (const c of pending) {
    if (c.exitCode === null && c.signalCode === null) {
      try {
        c.kill('SIGKILL')
      } catch {
        // já saiu
      }
    }
  }
}

/** Envia uma mensagem: roda já, ou entra na fila se a conversa estiver ocupada. */
export async function sendMessage(conversationId: string, text: string, images: AiImageInput[] = []): Promise<void> {
  const msg: AiQueuedMessage = { text: text.trim(), images }
  if (!msg.text && !msg.images.length) return
  if (live.has(conversationId)) {
    queues.set(conversationId, [...(queues.get(conversationId) ?? []), msg])
    await emitConversation(conversationId)
    return
  }
  await startTurn(conversationId, msg)
}

export async function removeQueued(conversationId: string, index: number): Promise<void> {
  const q = [...(queues.get(conversationId) ?? [])]
  q.splice(index, 1)
  if (q.length) queues.set(conversationId, q)
  else queues.delete(conversationId)
  await emitConversation(conversationId)
}

/** Interrompe o turno atual (como o Esc do terminal) e descarta a fila. */
export async function cancel(conversationId: string): Promise<boolean> {
  queues.delete(conversationId)
  const run = live.get(conversationId)
  if (!run) {
    await emitConversation(conversationId)
    return false
  }
  run.cancelled = true
  // Interrupção limpa primeiro (o transcript da sessão fica consistente); se o CLI não
  // encerrar, mata o processo.
  writeLine(run, { type: 'control_request', request_id: randomUUID(), request: { subtype: 'interrupt' } })
  for (const [requestId] of run.pending) {
    writeLine(run, controlResponse(requestId, { behavior: 'deny', message: 'O usuário interrompeu a execução.', interrupt: true }))
  }
  run.pending.clear()
  run.killTimer = setTimeout(() => {
    try {
      run.child?.kill('SIGKILL')
    } catch {
      // já saiu
    }
  }, 4000)
  return true
}

function controlResponse(requestId: string, response: Record<string, unknown>): Record<string, unknown> {
  return { type: 'control_response', response: { subtype: 'success', request_id: requestId, response } }
}

function writeLine(run: LiveRun, obj: unknown): void {
  try {
    run.child?.stdin?.write(JSON.stringify(obj) + '\n')
  } catch {
    // pipe fechado: o processo está saindo
  }
}

function findTool(turn: AiTurn, id: string): Extract<AiBlock, { type: 'tool' }> | undefined {
  return turn.blocks.find((b): b is Extract<AiBlock, { type: 'tool' }> => b.type === 'tool' && b.id === id)
}

/** Resposta do usuário a uma permissão / pergunta / plano pendente. */
export async function respond(conversationId: string, requestId: string, r: AiPromptResponse): Promise<boolean> {
  const run = live.get(conversationId)
  const p = run?.pending.get(requestId)
  if (!run || !p) return false
  run.pending.delete(requestId)
  const block = findTool(run.turn, p.toolUseId)
  let response: Record<string, unknown>
  let note = ''
  let status: 'allowed' | 'denied' = 'allowed'
  if (r.kind === 'allow') {
    response = { behavior: 'allow', updatedInput: p.input }
    if (r.always && p.suggestions?.length) {
      response.updatedPermissions = p.suggestions
      note = 'Permitido sempre'
    } else note = 'Permitido'
  } else if (r.kind === 'answer') {
    response = { behavior: 'allow', updatedInput: { ...p.input, answers: r.answers } }
    if (block) block.answers = r.answers
    note = 'Respondido'
  } else if (r.kind === 'chat') {
    response = {
      behavior: 'deny',
      message: 'O usuário quer conversar sobre isso antes de escolher. Pare aqui e aguarde a próxima mensagem dele.',
      interrupt: true
    }
    run.chatAbout = true
    status = 'denied'
    note = '💬 Conversar sobre isso'
  } else if (r.kind === 'approvePlan') {
    response = { behavior: 'allow', updatedInput: p.input, updatedPermissions: [{ type: 'setMode', mode: r.mode, destination: 'session' }] }
    note = r.mode === 'acceptEdits' ? 'Plano aprovado · aceitando edições' : 'Plano aprovado'
    await repo.updateConversation(conversationId, { permissionMode: r.mode })
    void emitConversation(conversationId)
  } else {
    const msg = r.message?.trim()
    response = { behavior: 'deny', message: msg ? `O usuário negou e disse: ${msg}` : 'O usuário negou esta ação.' }
    status = 'denied'
    note = msg ? `Negado: ${msg}` : 'Negado'
  }
  writeLine(run, controlResponse(requestId, response))
  if (block?.permission) block.permission = { ...block.permission, status, note }
  emitTurn(run, true)
  void emitConversation(conversationId)
  return true
}

function contextFromUsage(u: { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; output_tokens?: number } | undefined): number {
  if (!u) return 0
  return (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.output_tokens ?? 0)
}

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((x: { type?: string; text?: string }) => (x?.type === 'text' ? x.text ?? '' : x?.type === 'image' ? '[imagem]' : ''))
      .join('\n')
  }
  return ''
}

function clip(s: string, max = TOOL_RESULT_MAX): string {
  return s.length > max ? s.slice(0, max) + `\n… (${s.length - max} caracteres omitidos)` : s
}

/** Diretório padrão de uma conversa sem projeto. */
function defaultCwd(): string {
  return os.homedir()
}

function isDefaultConfigDir(dir: string | null): boolean {
  if (!dir) return true
  return path.resolve(dir) === path.join(os.homedir(), '.claude')
}

async function startTurn(conversationId: string, message: AiQueuedMessage): Promise<void> {
  if (!deps) throw new Error('Executor de conversas não inicializado.')
  let conv = await repo.getConversation(conversationId)
  if (!conv) throw new Error('Conversa não encontrada.')
  const prompt = message.text

  if (!conv.title) {
    const title = (prompt || 'Imagem').replace(/\s+/g, ' ').trim().slice(0, 60)
    await repo.setConversationRuntime(conversationId, { title })
    conv = (await repo.getConversation(conversationId))!
  }

  const turn = await repo.createTurn(
    conversationId,
    prompt,
    message.images.map((i) => i.thumb)
  )
  const run: LiveRun = {
    conversationId,
    turn,
    child: null,
    pending: new Map(),
    startedAt: Date.now(),
    cancelled: false,
    chatAbout: false,
    gotResult: false,
    stderr: '',
    mainModel: '',
    contextWindow: 0,
    compacted: false,
    emitTimer: null,
    killTimer: null
  }
  live.set(conversationId, run)
  emitTurn(run, true)
  void emitConversation(conversationId)

  let cwd: string
  try {
    // Diretório: o da sessão (o --resume só acha a sessão nele) → worktree novo → projeto → home.
    if (conv.cwd) {
      cwd = conv.cwd
      if (!fs.existsSync(cwd)) throw new Error(`O diretório desta conversa não existe mais: ${cwd}`)
    } else {
      const projectDir = await deps.resolveProjectCwd(conv.projectId)
      if (conv.useWorktree) {
        if (!projectDir || !fs.existsSync(projectDir)) throw new Error('O worktree isolado precisa de um projeto com pasta local.')
        turn.blocks.push({ type: 'notice', text: '🌿 Criando worktree isolado…' })
        emitTurn(run, true)
        const wsRepos = await deps.projectWorkspaceRepos(conv.projectId)
        const wt = wsRepos?.length
          ? await createWorkspaceWorktree(projectDir, wsRepos, conv.title || prompt)
          : await createWorktree(projectDir, conv.title || prompt)
        turn.blocks = turn.blocks.filter((b) => b.type !== 'notice')
        turn.blocks.push({
          type: 'notice',
          text: wsRepos?.length
            ? `🌿 Workspace isolado (${wsRepos.map((r) => r.name).join(', ')}) na branch ${wt.branch}`
            : `🌿 Worktree isolado na branch ${wt.branch}`
        })
        cwd = wt.cwd
        await repo.setConversationRuntime(conversationId, { cwd, repoPath: wt.repoPath, worktreeBranch: wt.branch, baseRef: wt.baseRef })
      } else {
        cwd = projectDir && fs.existsSync(projectDir) ? projectDir : defaultCwd()
        await repo.setConversationRuntime(conversationId, { cwd })
      }
      conv = (await repo.getConversation(conversationId))!
      void emitConversation(conversationId)
    }

    const command = await deps.resolveCommand(conv)
    const model = await deps.resolveModel(conv)
    const system = await deps.systemPrompt(conv)
    const args = [
      ...(await deps.allowedToolsArgs()),
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-prompt-tool',
      'stdio',
      '--permission-mode',
      conv.permissionMode,
      ...(model ? ['--model', model] : []),
      ...(conv.effort ? ['--effort', conv.effort] : []),
      // ramificação: retoma a sessão de origem numa sessão nova
      ...(conv.forkFrom && !conv.sessionId ? ['--resume', conv.forkFrom, '--fork-session'] : conv.sessionId ? ['--resume', conv.sessionId] : []),
      ...(system.trim() ? ['--append-system-prompt', system] : [])
    ]
    const env: NodeJS.ProcessEnv = { ...process.env, PATH: buildPath(), RICKOS_CLAUDE_RUN: '1' }
    if (!isDefaultConfigDir(conv.configDir)) env.CLAUDE_CONFIG_DIR = conv.configDir!
    run.child = await spawnCli(command, args, cwd, env)
  } catch (e) {
    await finishTurn(run, e instanceof Error ? e.message : String(e))
    return
  }

  wireChild(run, conv)
  const content: unknown[] = message.images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.data } }))
  content.push({ type: 'text', text: prompt || 'Veja a(s) imagem(ns) anexada(s).' })
  writeLine(run, { type: 'user', message: { role: 'user', content } })
}

/**
 * Sobe o CLI. Primeiro como binário; se não existir (ENOENT, típico de alias como
 * `claude-trabalho`), via shell interativo, passando os argumentos como "$@" (nunca
 * interpolados na string de comando).
 */
function spawnCli(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<ChildProcess> {
  const bin = (command || '').trim() || 'claude'
  if (!/^[A-Za-z0-9_./-]+$/.test(bin)) return Promise.reject(new Error(`Comando inválido: "${bin}".`))
  const trySpawn = (viaShell: boolean): Promise<ChildProcess> =>
    new Promise((resolve, reject) => {
      const shell = process.env.SHELL || '/bin/zsh'
      const child = viaShell
        ? spawn(shell, ['-ilc', `${bin} "$@"`, shell, ...args], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
        : spawn(bin, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
      const onError = (err: NodeJS.ErrnoException): void => reject(err)
      child.once('error', onError)
      child.once('spawn', () => {
        child.off('error', onError)
        resolve(child)
      })
    })
  return trySpawn(false).catch((err: NodeJS.ErrnoException) => {
    if (err?.code !== 'ENOENT') throw err
    return trySpawn(true)
  })
}

interface StreamEvent {
  type?: string
  subtype?: string
  session_id?: string
  model?: string
  slash_commands?: string[]
  parent_tool_use_id?: string | null
  request_id?: string
  request?: {
    subtype?: string
    tool_name?: string
    input?: Record<string, unknown>
    tool_use_id?: string
    permission_suggestions?: unknown[]
    blocked_path?: string
    description?: string
  }
  event?: {
    type?: string
    index?: number
    content_block?: { type?: string }
    delta?: { type?: string; text?: string; thinking?: string }
  }
  message?: {
    content?: Array<{ type?: string; text?: string; thinking?: string; id?: string; name?: string; input?: Record<string, unknown>; tool_use_id?: string; content?: unknown; is_error?: boolean }>
    usage?: { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; output_tokens?: number }
  }
  result?: unknown
  is_error?: boolean
}

function wireChild(run: LiveRun, conv: AiConversation): void {
  const child = run.child!
  let buf = ''
  child.stdout?.on('data', (d: Buffer) => {
    buf += d.toString()
    let i: number
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue
      let evt: StreamEvent
      try {
        evt = JSON.parse(line)
      } catch {
        continue // ruído do shell interativo
      }
      handleEvent(run, conv, evt)
    }
  })
  child.stderr?.on('data', (d: Buffer) => {
    run.stderr = (run.stderr + d.toString()).slice(-4000)
  })
  child.on('close', (code) => {
    if (run.killTimer) clearTimeout(run.killTimer)
    let error: string | null = null
    if (run.cancelled) error = null
    else if (!run.gotResult) error = run.stderr.trim().split('\n').slice(-6).join('\n') || `Claude CLI saiu com código ${code}.`
    void finishTurn(run, error)
  })
  child.stdin?.on('error', () => {
    // EPIPE: o processo saiu; o 'close' cuida do resto
  })
}

function lastLive(turn: AiTurn, type: 'text' | 'thinking'): Extract<AiBlock, { type: 'text' | 'thinking' }> | undefined {
  for (let i = turn.blocks.length - 1; i >= 0; i--) {
    const b = turn.blocks[i]
    if (b.type === type && b.live) return b as Extract<AiBlock, { type: 'text' | 'thinking' }>
  }
  return undefined
}

function handleEvent(run: LiveRun, conv: AiConversation, evt: StreamEvent): void {
  const turn = run.turn
  // Mensagens de subagentes (Task) ficam de fora: o resultado aparece no bloco da ferramenta.
  if (evt.parent_tool_use_id) return

  if (evt.type === 'system' && evt.subtype === 'init') {
    if (evt.model) run.mainModel = evt.model
    if (Array.isArray(evt.slash_commands)) {
      slashByConv.set(conv.id, evt.slash_commands)
      slashByDir.set(dirKey(conv.cwd, conv.configDir), evt.slash_commands)
    }
    if (evt.session_id && evt.session_id !== conv.sessionId) {
      conv.sessionId = evt.session_id
      conv.forkFrom = null
      void repo.setConversationRuntime(conv.id, { sessionId: evt.session_id, forkFrom: null }).then(() => emitConversation(conv.id))
    }
    return
  }
  if (evt.type === 'system' && evt.subtype === 'compact_boundary') {
    turn.blocks.push({ type: 'notice', text: '🗜️ Contexto compactado' })
    turn.contextTokens = 0 // medido de novo na próxima resposta
    run.compacted = true
    emitTurn(run)
    return
  }

  if (evt.type === 'stream_event' && evt.event) {
    const ev = evt.event
    if (ev.type === 'content_block_start') {
      const t = ev.content_block?.type
      if (t === 'text' || t === 'thinking') turn.blocks.push({ type: t, text: '', live: true })
    } else if (ev.type === 'content_block_delta' && ev.delta) {
      if (ev.delta.type === 'text_delta' && ev.delta.text) {
        const b = lastLive(turn, 'text')
        if (b) b.text += ev.delta.text
      } else if (ev.delta.type === 'thinking_delta' && ev.delta.thinking) {
        const b = lastLive(turn, 'thinking')
        if (b) b.text += ev.delta.thinking
      }
    }
    emitTurn(run)
    return
  }

  if (evt.type === 'assistant' && evt.message?.content) {
    for (const c of evt.message.content) {
      if (c.type === 'text' || c.type === 'thinking') {
        const full = (c.type === 'text' ? c.text : c.thinking) ?? ''
        const b = turn.blocks.find((x) => x.type === c.type && 'live' in x && x.live) as Extract<AiBlock, { type: 'text' | 'thinking' }> | undefined
        if (b) {
          if (full) b.text = full
          b.live = false
        } else if (full) turn.blocks.push({ type: c.type, text: full })
      } else if (c.type === 'tool_use' && c.id) {
        if (!findTool(turn, c.id)) turn.blocks.push({ type: 'tool', id: c.id, name: c.name || 'tool', input: c.input ?? {} })
      }
    }
    // remove blocos de pensamento vazios (pensamento oculto)
    turn.blocks = turn.blocks.filter((b) => !(b.type === 'thinking' && !b.live && !b.text.trim()))
    const ctx = contextFromUsage(evt.message.usage)
    if (ctx) turn.contextTokens = ctx
    emitTurn(run)
    return
  }

  if (evt.type === 'user' && evt.message?.content && Array.isArray(evt.message.content)) {
    for (const c of evt.message.content) {
      if (c.type === 'tool_result' && c.tool_use_id) {
        const b = findTool(turn, c.tool_use_id)
        if (b) {
          b.result = clip(toolResultText(c.content))
          b.isError = !!c.is_error
        }
      }
    }
    emitTurn(run)
    return
  }

  if (evt.type === 'control_request' && evt.request_id) {
    const req = evt.request ?? {}
    if (req.subtype !== 'can_use_tool') {
      writeLine(run, { type: 'control_response', response: { subtype: 'error', request_id: evt.request_id, error: `Não suportado: ${req.subtype}` } })
      return
    }
    const toolUseId = req.tool_use_id || evt.request_id
    let block = findTool(turn, toolUseId)
    if (!block) {
      block = { type: 'tool', id: toolUseId, name: req.tool_name || 'tool', input: req.input ?? {} }
      turn.blocks.push(block)
    }
    block.permission = {
      requestId: evt.request_id,
      status: 'pending',
      suggestions: req.permission_suggestions,
      blockedPath: req.blocked_path,
      description: req.description
    }
    run.pending.set(evt.request_id, { toolUseId, toolName: req.tool_name || 'tool', input: req.input ?? {}, suggestions: req.permission_suggestions })
    emitTurn(run, true)
    void emitConversation(run.conversationId)
    scheduleAttentionNotice(run, evt.request_id, req.tool_name || 'tool', conv)
    return
  }

  if (evt.type === 'result') {
    run.gotResult = true
    const r = evt as ResultEvent & StreamEvent & { modelUsage?: Record<string, { contextWindow?: number; outputTokens?: number }>; subtype?: string }
    const u = usageFromResult(r)
    if (u) {
      turn.costUsd = u.costUsd
      turn.inputTokens = u.inputTokens + u.cacheReadTokens + u.cacheCreationTokens
      turn.outputTokens = u.outputTokens
      turn.durationMs = u.durationMs
      recordAiUsage({ ...u, source: 'prompt-runner', projectId: conv.projectId, model: u.model || run.mainModel || null }).catch(() => {
        // contabilidade é best-effort
      })
    }
    // janela de contexto do modelo principal (o init diz qual é; senão, o que mais escreveu)
    const mu = Object.entries(r.modelUsage ?? {})
    const base = run.mainModel.replace(/\[.*\]$/, '')
    const main = (base && mu.find(([m]) => m === base || m.startsWith(base) || base.startsWith(m))) || mu.sort((a, b) => (b[1]?.outputTokens ?? 0) - (a[1]?.outputTokens ?? 0))[0]
    if (main?.[1]?.contextWindow) run.contextWindow = main[1].contextWindow
    const hasText = turn.blocks.some((b) => b.type === 'text' && b.text.trim())
    if (!hasText && typeof r.result === 'string' && r.result.trim()) turn.blocks.push({ type: 'text', text: r.result })
    if (r.is_error && !run.cancelled && !run.chatAbout) turn.error = typeof r.result === 'string' && r.result.trim() ? r.result : `Erro (${r.subtype ?? 'desconhecido'})`
    // fim do turno: fecha o stdin para o CLI sair
    try {
      run.child?.stdin?.end()
    } catch {
      // já fechado
    }
    emitTurn(run)
  }
}

/** Se um pedido ficar esperando, avisa (útil no celular / fora da tela). */
function scheduleAttentionNotice(run: LiveRun, requestId: string, toolName: string, conv: AiConversation): void {
  setTimeout(() => {
    if (!run.pending.has(requestId) || live.get(run.conversationId) !== run) return
    const what = toolName === 'AskUserQuestion' ? 'tem uma pergunta' : toolName === 'ExitPlanMode' ? 'quer aprovar um plano' : `pede permissão para ${toolName}`
    void notify({ title: `🤚 Claude ${what}`, body: conv.title || 'Prompt Runner', source: 'claude', page: 'ai-runner' })
  }, 15_000)
}

async function finishTurn(run: LiveRun, error: string | null): Promise<void> {
  if (live.get(run.conversationId) !== run) return
  if (run.emitTimer) clearTimeout(run.emitTimer)
  const turn = run.turn
  for (const b of turn.blocks) {
    if ((b.type === 'text' || b.type === 'thinking') && b.live) b.live = false
    if (b.type === 'tool' && b.permission?.status === 'pending') b.permission = { ...b.permission, status: 'denied', note: 'Sem resposta' }
  }
  turn.blocks = turn.blocks.filter((b) => !(b.type === 'thinking' && !b.text.trim()))
  if (run.cancelled) {
    turn.status = 'cancelled'
    turn.error = null
  } else if (run.chatAbout && !turn.error) {
    turn.status = 'done'
    turn.blocks.push({ type: 'notice', text: '💬 Você quis conversar sobre a pergunta: escreva abaixo.' })
  } else if (error || turn.error) {
    turn.status = 'error'
    turn.error = turn.error || error
  } else turn.status = 'done'
  if (!turn.durationMs) turn.durationMs = Date.now() - run.startedAt
  live.delete(run.conversationId)
  try {
    await repo.saveTurn(turn)
    const cw = run.contextWindow
    await repo.setConversationRuntime(run.conversationId, {
      ...(turn.contextTokens || run.compacted ? { contextTokens: turn.contextTokens } : {}),
      ...(cw ? { contextWindow: cw } : {}),
      addCost: turn.costUsd,
      addInput: turn.inputTokens,
      addOutput: turn.outputTokens
    })
  } catch {
    // persistência best-effort: o turno ao vivo ainda chega aos clientes
  }
  broadcast('conv:update', { conversationId: run.conversationId, turn })
  await emitConversation(run.conversationId)

  // Execuções longas avisam ao terminar (o usuário provavelmente saiu da tela).
  if (Date.now() - run.startedAt >= 60_000 && !run.cancelled) {
    const conv = await repo.getConversation(run.conversationId)
    void notify({
      title: turn.status === 'done' ? '✅ Claude terminou' : '⚠️ Claude parou com erro',
      body: conv?.title || turn.prompt.slice(0, 120),
      source: 'claude',
      page: 'ai-runner'
    })
  }

  // Próxima mensagem da fila (só se o turno não falhou nem foi cancelado).
  const q = queues.get(run.conversationId) ?? []
  if (q.length && turn.status === 'done') {
    const [next, ...rest] = q
    if (rest.length) queues.set(run.conversationId, rest)
    else queues.delete(run.conversationId)
    startTurn(run.conversationId, next).catch(() => {
      // erro já registrado no turno
    })
  }
}
