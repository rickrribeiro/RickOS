import { spawn } from 'child_process'
import os from 'os'
import type { ClaudeUsageAccount, ClaudeUsageLimit, ClaudeUsageSnapshot } from '../../shared/aiConversations'
import { buildPath } from '../services/claude'
import { configLabel } from './claudeSkills'
import { configDirs } from './transcripts'

/**
 * Limites de uso do Claude Code (os mesmos do `/usage` do terminal): roda
 * `claude -p /usage` em cada conta. É um comando local do CLI, não gasta tokens,
 * e `--no-session-persistence` evita criar transcript (não aparece em "Terminal").
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
      reject(new Error('O Claude CLI demorou demais para responder.'))
    }, TIMEOUT_MS)
    child.stdout.on('data', (b: Buffer) => (out += b.toString()))
    child.stderr.on('data', (b: Buffer) => (err += b.toString()))
    child.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      reject(new Error(e.code === 'ENOENT' ? 'Claude CLI não encontrado no PATH.' : e.message))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0 || out.trim()) resolve(out)
      else reject(new Error(err.trim().split('\n').pop() || `claude saiu com código ${code}`))
    })
  })
}

async function fetchAccount(configDir: string): Promise<ClaudeUsageAccount> {
  const label = configLabel(configDir)
  try {
    const out = await runUsage(configDir)
    const limits = parseUsageOutput(out)
    return { configDir, label, limits, raw: limits.length ? null : out.trim().slice(0, 600) || null, error: null }
  } catch (e) {
    return { configDir, label, limits: [], raw: null, error: e instanceof Error ? e.message : String(e) }
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
      const accounts = await Promise.all((dirs.length ? dirs : [`${os.homedir()}/.claude`]).map(fetchAccount))
      cache = { fetchedAt: new Date().toISOString(), accounts }
      return cache
    } finally {
      inflight = null
    }
  })()
  return inflight
}
