import { spawn } from 'child_process'
import os from 'os'
import type { ClaudeUsageAccount, ClaudeUsageLimit, ClaudeUsageSnapshot } from '../../shared/aiConversations'
import { buildPath } from '../services/claude'
import { configLabel } from './claudeSkills'
import { configDirs } from './transcripts'
import { tt } from '../i18n'

/**
 * Limites de uso do Claude Code (os mesmos do `/usage` do terminal): roda
 * `claude -p /usage` em cada conta. É um comando local do CLI, não gasta tokens,
 * e `--no-session-persistence` evita criar transcript (não aparece em "Terminal").
 * Codex: pergunta `account/rateLimits/read` ao `codex app-server` (JSON-RPC via stdio).
 */

const TIMEOUT_MS = 30_000
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Diferença (ms) entre o relógio de `timeZone` e UTC no instante `utcMs`. */
function tzOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric'
  }).formatToParts(new Date(utcMs))
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - Math.floor(utcMs / 1000) * 1000
}

/** "Nov 14 at 8:09pm (Asia/Tokyo)" / "10am (Asia/Tokyo)" → ISO. null se não reconhecer. */
export function parseResetTime(text: string, now = new Date()): string | null {
  const m = /^(?:([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?\s+at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(?:\(([^)]+)\))?$/i.exec(text.trim())
  if (!m) return null
  const [, mon, day, year, hh, mm, ampm, tzRaw] = m
  const timeZone = tzRaw?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
  } catch {
    return null
  }
  let hour = Number(hh) % 12
  if (ampm.toLowerCase() === 'pm') hour += 12
  const minute = Number(mm ?? 0)

  // data "de hoje" no fuso indicado, como base
  const local = new Date(now.getTime() + tzOffsetMs(now.getTime(), timeZone))
  let y = year ? Number(year) : local.getUTCFullYear()
  let mo = local.getUTCMonth()
  let d = local.getUTCDate()
  if (mon) {
    const idx = MONTHS.indexOf(mon.toLowerCase())
    if (idx < 0) return null
    mo = idx
    d = Number(day)
  }
  const toUtc = (yy: number, mmo: number, dd: number): number => {
    const wall = Date.UTC(yy, mmo, dd, hour, minute)
    return wall - tzOffsetMs(wall - tzOffsetMs(wall, timeZone), timeZone)
  }
  let at = toUtc(y, mo, d)
  const DAY = 86_400_000
  if (!mon && at < now.getTime() - 60_000) at += DAY // só a hora: é a próxima ocorrência
  if (mon && !year && at < now.getTime() - DAY) at = toUtc(++y, mo, d) // virada de ano
  return new Date(at).toISOString()
}

/** Interpreta a saída do `/usage`. */
export function parseUsageOutput(out: string, now = new Date()): ClaudeUsageLimit[] {
  const limits: ClaudeUsageLimit[] = []
  for (const line of out.split('\n')) {
    const m = /^\s*Current (session|week)(?:\s*\(([^)]+)\))?\s*:\s*(\d+(?:\.\d+)?)%\s*used(?:\s*·\s*resets\s+(.+?))?\s*$/i.exec(line)
    if (!m) continue
    const resetsText = m[4]?.trim() || null
    limits.push({
      kind: m[1].toLowerCase() === 'session' ? 'session' : 'week',
      scope: m[2]?.trim() || null,
      percent: Math.max(0, Math.min(100, Number(m[3]))),
      resetsAt: resetsText ? parseResetTime(resetsText, now) : null,
      resetsText
    })
  }
  return limits
}

function runUsage(configDir: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env, PATH: buildPath(), RICKOS_CLAUDE_RUN: '1' }
    if (configDir === `${os.homedir()}/.claude`) delete env.CLAUDE_CONFIG_DIR
    else env.CLAUDE_CONFIG_DIR = configDir
    const child = spawn('claude', ['-p', '/usage', '--no-session-persistence'], { cwd: os.tmpdir(), env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(tt('aiconv.oClaudeCliDemorouDemais')))
    }, TIMEOUT_MS)
    child.stdout.on('data', (b: Buffer) => (out += b.toString()))
    child.stderr.on('data', (b: Buffer) => (err += b.toString()))
    child.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      reject(new Error(e.code === 'ENOENT' ? tt('aiconv.claudeCliNaoEncontradoNo') : e.message))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0 || out.trim()) resolve(out)
      else reject(new Error(err.trim().split('\n').pop() || tt('aiconv.claudeSaiuComCodigo', { code })))
    })
  })
}

/** Última leitura com limites de cada conta (o `/usage` às vezes vem sem eles). */
const lastGood = new Map<string, { limits: ClaudeUsageLimit[]; at: string }>()
const RETRIES = 2
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function fetchAccount(configDir: string): Promise<ClaudeUsageAccount> {
  const label = configLabel(configDir)
  try {
    let out = ''
    let limits: ClaudeUsageLimit[] = []
    // o CLI às vezes omite as linhas "Current …" (só traz "What's contributing…"): tenta de novo
    for (let i = 0; i <= RETRIES; i++) {
      if (i) await wait(1500)
      out = await runUsage(configDir)
      limits = parseUsageOutput(out)
      if (limits.length) break
    }
    if (limits.length) {
      lastGood.set(configDir, { limits, at: new Date().toISOString() })
      return { provider: 'claude', configDir, label, limits, raw: null, error: null }
    }
    // conta de assinatura sem os limites nesta leitura: usa a última boa em vez do texto cru
    if (/subscription/i.test(out)) {
      const prev = lastGood.get(configDir)
      if (prev) return { provider: 'claude', configDir, label, limits: prev.limits, raw: null, error: null, staleAt: prev.at }
      return { provider: 'claude', configDir, label, limits: [], raw: null, error: null, unavailable: true }
    }
    return { provider: 'claude', configDir, label, limits, raw: out.trim().slice(0, 600) || null, error: null }
  } catch (e) {
    const prev = lastGood.get(configDir)
    const error = e instanceof Error ? e.message : String(e)
    if (prev) return { provider: 'claude', configDir, label, limits: prev.limits, raw: null, error: null, staleAt: prev.at }
    return { provider: 'claude', configDir, label, limits: [], raw: null, error }
  }
}

// ── Codex ─────────────────────────────────────────────────────────────────────

interface CodexWindow {
  usedPercent?: number
  windowDurationMins?: number | null
  resetsAt?: number | null
}
interface CodexLimit {
  limitId?: string
  limitName?: string | null
  primary?: CodexWindow | null
  secondary?: CodexWindow | null
}
export interface CodexRateLimitsResult {
  rateLimits?: CodexLimit | null
  rateLimitsByLimitId?: Record<string, CodexLimit> | null
}

/** Converte a resposta de `account/rateLimits/read` em linhas (5 horas / semanal / outras janelas). */
export function codexLimits(res: CodexRateLimitsResult): ClaudeUsageLimit[] {
  const groups = res.rateLimitsByLimitId && Object.keys(res.rateLimitsByLimitId).length ? Object.values(res.rateLimitsByLimitId) : res.rateLimits ? [res.rateLimits] : []
  const out: ClaudeUsageLimit[] = []
  for (const g of groups) {
    const extra = g.limitId && g.limitId !== 'codex' ? g.limitName || g.limitId : null
    for (const w of [g.primary, g.secondary]) {
      if (!w || typeof w.usedPercent !== 'number') continue
      const mins = w.windowDurationMins ?? 0
      const kind: ClaudeUsageLimit['kind'] = mins && mins <= 24 * 60 ? 'session' : 'week'
      // janelas fora do padrão (≠ 5h / 7d) levam a duração no nome
      const odd = mins && mins !== 300 && mins !== 10080 ? (mins % 1440 === 0 ? `${mins / 1440}d` : `${Math.round(mins / 60)}h`) : null
      out.push({
        kind,
        scope: [extra, odd].filter(Boolean).join(' · ') || null,
        percent: Math.max(0, Math.min(100, Math.round(w.usedPercent))),
        resetsAt: w.resetsAt ? new Date(w.resetsAt * 1000).toISOString() : null,
        resetsText: null
      })
    }
  }
  return out
}

/** Sobe o `codex app-server`, pede os limites e encerra. null = Codex não instalado. */
function readCodexRateLimits(): Promise<CodexRateLimitsResult | null> {
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: buildPath() }
  const start = (viaShell: boolean): Promise<CodexRateLimitsResult | null> =>
    new Promise((resolve, reject) => {
      const shell = process.env.SHELL || '/bin/zsh'
      const child = viaShell
        ? spawn(shell, ['-ilc', 'codex app-server'], { cwd: os.tmpdir(), env, stdio: ['pipe', 'pipe', 'pipe'] })
        : spawn('codex', ['app-server'], { cwd: os.tmpdir(), env, stdio: ['pipe', 'pipe', 'pipe'] })
      let buf = ''
      let err = ''
      let done = false
      const finish = (fn: () => void): void => {
        if (done) return
        done = true
        clearTimeout(timer)
        child.kill('SIGTERM')
        fn()
      }
      const timer = setTimeout(() => finish(() => reject(new Error(tt('aiconv.oCodexDemorouDemaisPara')))), TIMEOUT_MS)
      const send = (msg: unknown): void => {
        child.stdin.write(JSON.stringify(msg) + '\n')
      }
      child.on('error', (e: NodeJS.ErrnoException) => finish(() => (e.code === 'ENOENT' ? resolve(null) : reject(e))))
      child.stdin.on('error', () => undefined) // EPIPE se o processo já saiu
      child.stderr.on('data', (b: Buffer) => (err += b.toString()))
      child.on('close', (code) => {
        // shell sem o comando: 127 = "command not found"
        finish(() => (code === 127 ? resolve(null) : reject(new Error(err.trim().split('\n').pop() || tt('aiconv.codexSaiuComCodigo', { code })))))
      })
      child.stdout.on('data', (b: Buffer) => {
        buf += b.toString()
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line) continue
          let msg: { id?: number; result?: unknown; error?: { message?: string } }
          try {
            msg = JSON.parse(line)
          } catch {
            continue
          }
          if (msg.id === 1) {
            send({ method: 'initialized' })
            send({ method: 'account/rateLimits/read', id: 2 })
          } else if (msg.id === 2) {
            finish(() => (msg.error ? reject(new Error(msg.error.message || tt('aiconv.erroDoCodex'))) : resolve(msg.result as CodexRateLimitsResult)))
          }
        }
      })
      send({ method: 'initialize', id: 1, params: { clientInfo: { name: 'rickos', title: 'rickOS', version: '1.0.0' } } })
    })
  // binário direto; se não estiver no PATH (app aberto pelo Finder, nvm), tenta pelo shell de login
  return start(false).then((r) => (r === null ? start(true) : r))
}

async function fetchCodex(): Promise<ClaudeUsageAccount | null> {
  try {
    const res = await readCodexRateLimits()
    if (!res) return null
    const limits = codexLimits(res)
    return { provider: 'codex', configDir: 'codex', label: 'Codex · pessoal', limits, raw: limits.length ? null : 'Sem limites informados pelo Codex (login por API key?).', error: null }
  } catch (e) {
    return { provider: 'codex', configDir: 'codex', label: 'Codex · pessoal', limits: [], raw: null, error: e instanceof Error ? e.message : String(e) }
  }
}

let cache: ClaudeUsageSnapshot | null = null
let inflight: Promise<ClaudeUsageSnapshot> | null = null
const FRESH_MS = 5 * 60_000

/** Limites de todas as contas. Sem `refresh`, reaproveita a leitura dos últimos 5 min. */
export function getUsageLimits(refresh = false): Promise<ClaudeUsageSnapshot> {
  if (!refresh && cache && Date.now() - new Date(cache.fetchedAt).getTime() < FRESH_MS) return Promise.resolve(cache)
  inflight ??= (async () => {
    try {
      const dirs = configDirs()
      const [claude, codex] = await Promise.all([Promise.all((dirs.length ? dirs : [`${os.homedir()}/.claude`]).map(fetchAccount)), fetchCodex()])
      cache = { fetchedAt: new Date().toISOString(), accounts: codex ? [...claude, codex] : claude }
      return cache
    } finally {
      inflight = null
    }
  })()
  return inflight
}
