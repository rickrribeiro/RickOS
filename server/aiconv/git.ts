import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { ConvChangedFile, ConvChanges } from '../../shared/aiConversations'
import { buildPath } from '../services/claude'

/**
 * Git da pasta de uma conversa: worktree isolado, mudanças (status + diff), commit,
 * descarte e PR. Os caminhos que o front pode tocar são sempre conferidos contra o
 * `git status` atual: nada fora da lista de alterados é aceito.
 */

/** Limite do diff de UM arquivo (carregado sob demanda, ao abrir no painel). */
const FILE_DIFF_MAX = 400_000
const NEW_FILE_MAX = 400_000
const NEW_FILE_STAT_MAX = 2 * 1024 * 1024

/** Arquivos gerados que poluem o diff: vão para o fim da lista e saem do contexto do commit. */
const LOCKFILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'Cargo.lock', 'poetry.lock', 'composer.lock', 'Gemfile.lock', 'go.sum']
const isLockfile = (p: string): boolean => LOCKFILES.includes(path.basename(p))

function run(cmd: string, args: string[], cwd: string, timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, PATH: buildPath(), GIT_TERMINAL_PROMPT: '0' } })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${cmd} ${args[0]} demorou demais`))
    }, timeoutMs)
    child.stdout.on('data', (d) => (out += d.toString()))
    child.stderr.on('data', (d) => (err += d.toString()))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(out)
      else reject(new Error(err.trim() || out.trim() || `${cmd} saiu com código ${code}`))
    })
  })
}

const git = (cwd: string, args: string[], timeoutMs?: number): Promise<string> => run('git', args, cwd, timeoutMs)
const gitOk = (cwd: string, args: string[]): Promise<string | null> => git(cwd, args).catch(() => null)

export async function repoTop(dir: string): Promise<string | null> {
  if (!fs.existsSync(dir)) return null
  return (await gitOk(dir, ['rev-parse', '--show-toplevel']))?.trim() || null
}

function slugify(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'conversa'
  )
}

function stamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/**
 * Cria um worktree isolado para a conversa (mesma convenção das delegações: pasta irmã
 * `.worktrees/<repo>-<nome>`, branch `claude/rickos-<nome>`), a partir do HEAD atual.
 */
export async function createWorktree(projectDir: string, title: string): Promise<{ cwd: string; repoPath: string; branch: string; baseRef: string }> {
  const top = await repoTop(projectDir)
  if (!top) throw new Error('A pasta do projeto não é um repositório git; desmarque o worktree isolado.')
  const baseRef = (await gitOk(top, ['rev-parse', '--abbrev-ref', 'HEAD']))?.trim() || 'HEAD'
  const name = `rickos-${slugify(title)}-${stamp()}`
  const branch = `claude/${name}`
  const wtDir = path.join(path.dirname(top), '.worktrees', `${path.basename(top)}-${name}`)
  fs.mkdirSync(path.dirname(wtDir), { recursive: true })
  await git(top, ['worktree', 'add', '-b', branch, wtDir, 'HEAD'], 60_000)
  if (!fs.existsSync(wtDir)) throw new Error('Não consegui criar o worktree (git worktree add falhou).')
  // mantém a mesma subpasta do projeto dentro do worktree (monorepo)
  const rel = path.relative(top, path.resolve(projectDir))
  const cwd = rel && !rel.startsWith('..') ? path.join(wtDir, rel) : wtDir
  return { cwd: fs.existsSync(cwd) ? cwd : wtDir, repoPath: top, branch, baseRef }
}

/** Remove o worktree e apaga a branch (descarta o trabalho não mesclado). */
export async function removeWorktree(repoPath: string, worktreeDir: string, branch: string | null): Promise<void> {
  const top = (await repoTop(worktreeDir)) ?? worktreeDir
  if (fs.existsSync(top)) await gitOk(repoPath, ['worktree', 'remove', '--force', top])
  await gitOk(repoPath, ['worktree', 'prune'])
  if (branch) await gitOk(repoPath, ['branch', '-D', branch])
}

interface StatusEntry {
  path: string
  status: string
}

/** `git status --porcelain -z` → entradas (renomeados ficam com o caminho novo). */
async function statusEntries(top: string): Promise<StatusEntry[]> {
  const raw = (await gitOk(top, ['status', '--porcelain', '-z', '--untracked-files=all'])) ?? ''
  const parts = raw.split('\0')
  const out: StatusEntry[] = []
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (!p) continue
    const xy = p.slice(0, 2)
    const file = p.slice(3)
    if (xy[0] === 'R' || xy[0] === 'C') i++ // o próximo item é o caminho antigo
    const st = xy === '??' ? '??' : (xy[0] !== ' ' ? xy[0] : xy[1]).trim() || 'M'
    out.push({ path: file, status: st })
  }
  return out
}

export async function getChanges(dir: string, baseRef: string | null): Promise<ConvChanges> {
  const top = await repoTop(dir)
  if (!top) return { isRepo: false, branch: null, baseRef, files: [], unpushed: 0, hasRemote: false }
  const [branchRaw, entries, numstatRaw, remotes] = await Promise.all([
    gitOk(top, ['rev-parse', '--abbrev-ref', 'HEAD']),
    statusEntries(top),
    gitOk(top, ['diff', 'HEAD', '--numstat', '-z']),
    gitOk(top, ['remote'])
  ])
  const branch = branchRaw?.trim() || null
  const counts = new Map<string, { a: number; d: number }>()
  const numstatBinary = new Set<string>()
  // numstat -z: "a\td\tpath\0" (renomeado: "a\td\t\0old\0new\0")
  const ns = (numstatRaw ?? '').split('\0')
  for (let i = 0; i < ns.length; i++) {
    const m = /^(\d+|-)\t(\d+|-)\t(.*)$/.exec(ns[i])
    if (!m) continue
    let file = m[3]
    if (!file) {
      file = ns[i + 2] ?? ''
      i += 2
    }
    counts.set(file, { a: m[1] === '-' ? 0 : Number(m[1]), d: m[2] === '-' ? 0 : Number(m[2]) })
    if (m[1] === '-') numstatBinary.add(file)
  }

  // Só estatísticas aqui: o diff de cada arquivo vem sob demanda (fileDiff), senão um
  // lockfile gigante esgota o espaço e os outros arquivos ficam sem diff.
  const files: ConvChangedFile[] = []
  for (const e of entries.slice(0, 500)) {
    let additions = counts.get(e.path)?.a ?? 0
    const deletions = counts.get(e.path)?.d ?? 0
    let binary = false
    if (e.status === '??') {
      try {
        const st = fs.statSync(path.join(top, e.path))
        if (st.isFile() && st.size <= NEW_FILE_STAT_MAX) {
          const buf = fs.readFileSync(path.join(top, e.path))
          if (buf.includes(0)) binary = true
          else additions = buf.length ? buf.toString('utf8').split('\n').length - (buf[buf.length - 1] === 10 ? 1 : 0) : 0
        }
      } catch {
        // sumiu entre o status e a leitura
      }
    } else if (numstatBinary.has(e.path)) binary = true
    files.push({ path: e.path, status: e.status, additions, deletions, diff: '', binary })
  }
  files.sort((a, b) => Number(isLockfile(a.path)) - Number(isLockfile(b.path)))

  const hasRemote = !!remotes?.trim()
  let unpushed = 0
  if (hasRemote && branch && branch !== 'HEAD') {
    const upstream = await gitOk(top, ['rev-list', '--count', '@{upstream}..HEAD'])
    if (upstream != null) unpushed = Number(upstream.trim()) || 0
    else if (baseRef) unpushed = Number((await gitOk(top, ['rev-list', '--count', `${baseRef}..HEAD`]))?.trim() ?? 0) || 0
  }
  return { isRepo: true, branch, baseRef, files, unpushed, hasRemote }
}

/** Diff de um arquivo alterado (só os que estão no `git status`). */
export async function fileDiff(dir: string, filePath: string): Promise<{ diff: string; truncated: boolean; binary: boolean }> {
  const top = await repoTop(dir)
  if (!top) throw new Error('Não é um repositório git.')
  const [e] = await checkedPaths(top, [filePath])
  let diff = ''
  if (e.status === '??') {
    const abs = path.resolve(top, e.path)
    const st = fs.statSync(abs)
    if (!st.isFile()) return { diff: '', truncated: false, binary: false }
    const buf = fs.readFileSync(abs)
    if (buf.includes(0)) return { diff: '', truncated: false, binary: true }
    const txt = buf.toString('utf8')
    const body = txt.slice(0, NEW_FILE_MAX)
    diff = body
      .replace(/\n$/, '')
      .split('\n')
      .map((l) => '+' + l)
      .join('\n')
    return { diff, truncated: txt.length > body.length, binary: false }
  }
  diff = (await git(top, ['diff', 'HEAD', '--no-color', '--', e.path], 60_000).catch(() => '')) ?? ''
  if (/^Binary files /m.test(diff)) return { diff: '', truncated: false, binary: true }
  // tira o cabeçalho (diff --git / index / --- / +++)
  diff = diff.replace(/^diff --git[\s\S]*?\n(?=@@)/m, '')
  const truncated = diff.length > FILE_DIFF_MAX
  return { diff: truncated ? diff.slice(0, FILE_DIFF_MAX) : diff, truncated, binary: false }
}

/** Confere que os caminhos pedidos estão entre os alterados (nada arbitrário). */
async function checkedPaths(top: string, paths: string[] | null): Promise<StatusEntry[]> {
  const entries = await statusEntries(top)
  if (!paths) return entries
  const wanted = new Set(paths)
  const ok = entries.filter((e) => wanted.has(e.path))
  if (ok.length !== wanted.size) throw new Error('Arquivo fora da lista de alterados.')
  return ok
}

export async function commit(dir: string, message: string, paths: string[] | null): Promise<string> {
  const top = await repoTop(dir)
  if (!top) throw new Error('Não é um repositório git.')
  const msg = message.trim()
  if (!msg) throw new Error('Escreva a mensagem do commit.')
  const entries = await checkedPaths(top, paths)
  if (!entries.length) throw new Error('Nada para commitar.')
  await git(top, ['add', '-A', '--', ...entries.map((e) => e.path)])
  await git(top, ['commit', '-m', msg, '--', ...entries.map((e) => e.path)], 60_000)
  return ((await gitOk(top, ['rev-parse', '--short', 'HEAD'])) ?? '').trim()
}

export async function discard(dir: string, filePath: string): Promise<void> {
  const top = await repoTop(dir)
  if (!top) throw new Error('Não é um repositório git.')
  const [e] = await checkedPaths(top, [filePath])
  if (e.status === '??') {
    const abs = path.resolve(top, e.path)
    if (!abs.startsWith(top + path.sep)) throw new Error('Caminho inválido.')
    fs.rmSync(abs, { force: true })
    return
  }
  if (e.status === 'A') {
    await git(top, ['rm', '-f', '--', e.path])
    return
  }
  await git(top, ['checkout', 'HEAD', '--', e.path])
}

/** Push da branch + PR com `gh` contra a base. */
export async function openPullRequest(dir: string, baseRef: string | null): Promise<string> {
  const top = await repoTop(dir)
  if (!top) throw new Error('Não é um repositório git.')
  const branch = (await gitOk(top, ['rev-parse', '--abbrev-ref', 'HEAD']))?.trim()
  if (!branch || branch === 'HEAD') throw new Error('HEAD destacado: não há branch para o PR.')
  if (baseRef && branch === baseRef) throw new Error(`Você está na própria branch base (${branch}); use um worktree isolado para abrir PR.`)
  await git(top, ['push', '-u', 'origin', branch], 120_000)
  const args = ['pr', 'create', '--fill', '--head', branch, ...(baseRef ? ['--base', baseRef] : [])]
  try {
    const out = await run('gh', args, top, 60_000)
    return out.trim().split('\n').pop() || ''
  } catch (e) {
    // PR já existe: devolve a URL dele
    const existing = await run('gh', ['pr', 'view', branch, '--json', 'url', '-q', '.url'], top, 30_000).catch(() => '')
    if (existing.trim()) return existing.trim()
    throw e
  }
}

/** Texto para a IA sugerir a mensagem de commit: diff resumido + estilo dos commits. */
export async function commitContext(dir: string): Promise<string> {
  const top = await repoTop(dir)
  if (!top) return ''
  const [log, stat, diff] = await Promise.all([
    gitOk(top, ['log', '--oneline', '-12']),
    gitOk(top, ['diff', 'HEAD', '--stat']),
    gitOk(top, ['diff', 'HEAD', '--no-color', '--', '.', ...LOCKFILES.map((f) => `:(exclude,glob)**/${f}`)])
  ])
  const untracked = (await statusEntries(top)).filter((e) => e.status === '??').map((e) => e.path)
  return [
    '### Commits recentes (siga o mesmo estilo e idioma)',
    log?.trim() || '(nenhum)',
    '### Resumo',
    stat?.trim() || '',
    untracked.length ? `Arquivos novos: ${untracked.join(', ')}` : '',
    '### Diff',
    (diff ?? '').slice(0, 14_000)
  ].join('\n')
}
