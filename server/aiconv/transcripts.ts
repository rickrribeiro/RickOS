import fs from 'fs'
import os from 'os'
import path from 'path'
import type { AiBlock, AiTurn, TerminalSession } from '../../shared/aiConversations'

/**
 * Leitura dos transcripts do Claude Code (`<config>/projects/<dir>/<sessão>.jsonl`), para
 * listar sessões do terminal e importá-las como conversas do Prompt Runner. Lê todas as
 * contas: `~/.claude` e `~/.claude-*` (ex.: `~/.claude-trabalho` de um alias).
 */

const HEAD_BYTES = 96 * 1024
const TAIL_BYTES = 64 * 1024
const TOOL_RESULT_MAX = 8000

/** Diretórios de configuração do Claude Code com transcripts. */
export function configDirs(): string[] {
  const home = os.homedir()
  const out: string[] = []
  const env = process.env.CLAUDE_CONFIG_DIR
  if (env && fs.existsSync(path.join(env, 'projects'))) out.push(path.resolve(env))
  let names: string[] = []
  try {
    names = fs.readdirSync(home)
  } catch {
    return out
  }
  for (const n of names) {
    if (n !== '.claude' && !n.startsWith('.claude-')) continue
    const dir = path.join(home, n)
    try {
      if (fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, 'projects')) && !out.includes(dir)) out.push(dir)
    } catch {
      // ignora
    }
  }
  return out
}

function readSlice(file: string, start: number, length: number): string {
  const fd = fs.openSync(file, 'r')
  try {
    const buf = Buffer.alloc(length)
    const n = fs.readSync(fd, buf, 0, length, start)
    return buf.subarray(0, n).toString('utf8')
  } finally {
    fs.closeSync(fd)
  }
}

interface Entry {
  type?: string
  uuid?: string
  parentUuid?: string | null
  isSidechain?: boolean
  isMeta?: boolean
  isCompactSummary?: boolean
  cwd?: string
  entrypoint?: string
  timestamp?: string
  aiTitle?: string
  customTitle?: string
  title?: string
  lastPrompt?: string
  summary?: string
  message?: {
    role?: string
    content?: string | Array<{ type?: string; text?: string; thinking?: string; id?: string; name?: string; input?: Record<string, unknown>; tool_use_id?: string; content?: unknown; is_error?: boolean }>
    usage?: { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; output_tokens?: number }
  }
}

function parseLines(text: string, dropFirstPartial: boolean): Entry[] {
  const lines = text.split('\n')
  if (dropFirstPartial) lines.shift()
  const out: Entry[] = []
  for (const l of lines) {
    if (!l.trim()) continue
    try {
      out.push(JSON.parse(l))
    } catch {
      // linha cortada nas bordas do recorte
    }
  }
  return out
}

/** Texto de uma mensagem do usuário (string ou blocos de texto). */
function userText(e: Entry): string | null {
  const c = e.message?.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) {
    const texts = c.filter((x) => x.type === 'text').map((x) => x.text ?? '')
    if (texts.length && !c.some((x) => x.type === 'tool_result')) return texts.join('\n')
  }
  return null
}

/** Rótulo legível para prompts "técnicos" do terminal (comandos, notificações, resumo). */
function cleanPrompt(text: string, e: Entry): string | null {
  if (e.isCompactSummary) return '🗜️ (resumo da conversa anterior, gerado ao compactar)'
  const cmd = /<command-name>([^<]+)<\/command-name>/.exec(text)
  if (cmd) {
    const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1]?.trim()
    return `${cmd[1].trim()}${args ? ' ' + args : ''}`
  }
  if (/^\s*<local-command-(stdout|stderr|caveat)>/.test(text)) return null
  if (/^\s*<task-notification>/.test(text)) {
    const summary = /<summary>([\s\S]*?)<\/summary>/.exec(text)?.[1]?.trim()
    return `🔔 ${summary || 'Notificação de tarefa em segundo plano'}`
  }
  return text
}

function oneLine(s: string, max = 120): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Sessões recentes do terminal (mais novas primeiro). */
export function listTerminalSessions(limit = 60): Omit<TerminalSession, 'projectId' | 'conversationId'>[] {
  const files: { file: string; configDir: string; mtime: number; size: number }[] = []
  for (const cfg of configDirs()) {
    const root = path.join(cfg, 'projects')
    let dirs: string[] = []
    try {
      dirs = fs.readdirSync(root)
    } catch {
      continue
    }
    for (const d of dirs) {
      const dir = path.join(root, d)
      let names: string[] = []
      try {
        names = fs.readdirSync(dir)
      } catch {
        continue
      }
      for (const n of names) {
        if (!n.endsWith('.jsonl')) continue
        const file = path.join(dir, n)
        try {
          const st = fs.statSync(file)
          if (st.isFile() && st.size > 0) files.push({ file, configDir: cfg, mtime: st.mtimeMs, size: st.size })
        } catch {
          // sumiu
        }
      }
    }
  }
  files.sort((a, b) => b.mtime - a.mtime)

  const out: Omit<TerminalSession, 'projectId' | 'conversationId'>[] = []
  for (const f of files) {
    if (out.length >= limit) break
    try {
      const head = parseLines(readSlice(f.file, 0, Math.min(HEAD_BYTES, f.size)), false)
      const firstUser = head.find((e) => e.type === 'user' && !e.isSidechain && !e.isMeta && e.cwd)
      if (!firstUser) continue
      // só sessões interativas do terminal (o rickOS e outros SDKs usam entrypoint "sdk-*")
      if (firstUser.entrypoint && firstUser.entrypoint !== 'cli') continue
      const tailStart = Math.max(0, f.size - TAIL_BYTES)
      const tail = tailStart > 0 ? parseLines(readSlice(f.file, tailStart, f.size - tailStart), true) : head
      const pick = (k: 'aiTitle' | 'customTitle' | 'lastPrompt' | 'summary'): string => {
        for (let i = tail.length - 1; i >= 0; i--) if (tail[i][k]) return String(tail[i][k])
        for (let i = head.length - 1; i >= 0; i--) if (head[i][k]) return String(head[i][k])
        return ''
      }
      let firstPrompt = ''
      for (const e of head) {
        if (e.type !== 'user' || e.isMeta || e.isSidechain) continue
        const t = userText(e)
        const c = t != null ? cleanPrompt(t, e) : null
        if (c) {
          firstPrompt = c
          break
        }
      }
      const title = pick('customTitle') || pick('aiTitle') || pick('summary') || oneLine(firstPrompt, 80) || '(sem título)'
      out.push({
        sessionId: path.basename(f.file, '.jsonl'),
        file: f.file,
        configDir: f.configDir,
        cwd: firstUser.cwd!,
        title,
        lastPrompt: oneLine(pick('lastPrompt') || firstPrompt),
        updatedAt: new Date(f.mtime).toISOString(),
        sizeBytes: f.size
      })
    } catch {
      // arquivo ilegível: pula
    }
  }
  return out
}

/** Acha o transcript de uma sessão (em qualquer conta). */
export function findTranscript(sessionId: string, configDir?: string | null): { file: string; configDir: string } | null {
  if (!/^[A-Za-z0-9-]+$/.test(sessionId)) return null
  const dirs = configDir ? [configDir, ...configDirs().filter((d) => d !== configDir)] : configDirs()
  for (const cfg of dirs) {
    const root = path.join(cfg, 'projects')
    let subs: string[] = []
    try {
      subs = fs.readdirSync(root)
    } catch {
      continue
    }
    for (const d of subs) {
      const file = path.join(root, d, `${sessionId}.jsonl`)
      if (fs.existsSync(file)) return { file, configDir: cfg }
    }
  }
  return null
}

export interface ParsedTranscript {
  cwd: string | null
  title: string
  turns: Omit<AiTurn, 'id' | 'conversationId'>[]
  contextTokens: number
  updatedAt: string
  createdAt: string
}

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((x: { type?: string; text?: string }) => (x?.type === 'text' ? x.text ?? '' : x?.type === 'image' ? '[imagem]' : '')).join('\n')
  }
  return ''
}

/**
 * Converte o transcript em turnos. O arquivo é uma árvore (parentUuid): segue o ramo
 * atual, da última mensagem até a raiz, para ignorar ramos abandonados e retomadas.
 */
export function parseTranscript(file: string): ParsedTranscript {
  const entries = parseLines(fs.readFileSync(file, 'utf8'), false)
  const byUuid = new Map<string, Entry>()
  for (const e of entries) if (e.uuid) byUuid.set(e.uuid, e)

  let leaf: Entry | undefined
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if ((e.type === 'user' || e.type === 'assistant') && e.uuid && !e.isSidechain) {
      leaf = e
      break
    }
  }
  const chain: Entry[] = []
  const seen = new Set<string>()
  let cur = leaf
  while (cur && cur.uuid && !seen.has(cur.uuid)) {
    seen.add(cur.uuid)
    chain.push(cur)
    cur = cur.parentUuid ? byUuid.get(cur.parentUuid) : undefined
  }
  chain.reverse()

  const turns: ParsedTranscript['turns'] = []
  let turn: ParsedTranscript['turns'][number] | null = null
  let cwd: string | null = null
  let contextTokens = 0
  const tools = new Map<string, Extract<AiBlock, { type: 'tool' }>>()

  const newTurn = (prompt: string, ts?: string): ParsedTranscript['turns'][number] => {
    const t = {
      createdAt: ts || new Date().toISOString(),
      prompt,
      blocks: [] as AiBlock[],
      status: 'done' as const,
      error: null,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      contextTokens: 0,
      durationMs: null,
      attachments: [] as string[]
    }
    turns.push(t)
    return t
  }

  for (const e of chain) {
    if (e.cwd && !cwd) cwd = e.cwd
    if (e.type === 'user') {
      if (e.isMeta) continue
      const c = e.message?.content
      if (Array.isArray(c) && c.some((x) => x.type === 'tool_result')) {
        for (const x of c) {
          if (x.type !== 'tool_result' || !x.tool_use_id) continue
          const b = tools.get(x.tool_use_id)
          if (b) {
            const r = toolResultText(x.content)
            b.result = r.length > TOOL_RESULT_MAX ? r.slice(0, TOOL_RESULT_MAX) + '\n…' : r
            b.isError = !!x.is_error
          }
        }
        continue
      }
      const t = userText(e)
      let p = t != null ? cleanPrompt(t, e) : null
      const imgs = Array.isArray(c) ? c.filter((x) => x.type === 'image').length : 0
      if (imgs) p = `${p ?? ''}${p ? '\n' : ''}[🖼️ ${imgs} imagem${imgs > 1 ? 'ns' : ''}]`
      if (p) turn = newTurn(p, e.timestamp)
      continue
    }
    if (e.type === 'assistant' && e.message?.content && Array.isArray(e.message.content)) {
      if (!turn) turn = newTurn('(início da sessão)', e.timestamp)
      for (const c of e.message.content) {
        if (c.type === 'text' && c.text?.trim()) turn.blocks.push({ type: 'text', text: c.text })
        else if (c.type === 'thinking' && c.thinking?.trim()) turn.blocks.push({ type: 'thinking', text: c.thinking })
        else if (c.type === 'tool_use' && c.id) {
          const b: Extract<AiBlock, { type: 'tool' }> = { type: 'tool', id: c.id, name: c.name || 'tool', input: c.input ?? {} }
          tools.set(c.id, b)
          turn.blocks.push(b)
        }
      }
      const u = e.message.usage
      if (u) {
        const ctx = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.output_tokens ?? 0)
        if (ctx) {
          contextTokens = ctx
          turn.contextTokens = ctx
          turn.outputTokens += u.output_tokens ?? 0
        }
      }
    }
  }

  let title = ''
  for (let i = entries.length - 1; i >= 0 && !title; i--) title = entries[i].customTitle || entries[i].aiTitle || ''
  if (!title && turns[0]) title = oneLine(turns[0].prompt, 60)
  const st = fs.statSync(file)
  return {
    cwd,
    title,
    turns,
    contextTokens,
    createdAt: turns[0]?.createdAt ?? new Date(st.birthtimeMs || st.mtimeMs).toISOString(),
    updatedAt: new Date(st.mtimeMs).toISOString()
  }
}
