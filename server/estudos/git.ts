import { execFile } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { dataDir } from '../config'
import { broadcast } from '../events'
import { exportAll, restoreFromFolder, writeFiles, BUNDLE_FORMAT, type RestoreReport } from './bundle'
import { exec, nowIso, one, read, StudyError, tx } from './sql'
import type { GitConfig, SyncResult, LinkPreview, GitStatus, SyncStatus } from '../../shared/estudos'
import { tt } from '../i18n'
export type { GitConfig, SyncResult, LinkPreview, GitStatus, SyncStatus }


/**
 * Repositório de estudos + botão Sincronizar. Manual e determinístico, SEM IA:
 *   exportar → conferir o remoto → preparar só os arquivos gerenciados → commit padrão → push.
 *
 * Garantias:
 *  - checkout dedicado controlado pelo servidor (<dataDir>/estudos/repo): nada que o usuário
 *    deixou staged no clone dele entra no commit;
 *  - só arquivos da pasta gerenciada que o rickOS escreveu são adicionados (pathspec explícito);
 *  - nunca reset destrutivo, nunca force push, nunca resolve conflito sobrescrevendo;
 *  - upstream avançou: fast-forward (ou merge limpo testado com merge-tree); se não for seguro, para;
 *  - arquivo gerenciado editado fora do rickOS: a versão do repositório fica; se o banco também
 *    mudou, a nossa vai para <dataDir>/estudos/divergencias/ e o resultado mostra a divergência;
 *  - push falhou: "Commit local salvo · envio pendente"; o próximo Sincronizar reenvia;
 *  - sucesso remoto só depois de conferir o ref no remoto (ls-remote).
 * Credenciais: as do git do servidor (chave SSH / credential helper). Nada é salvo pelo rickOS.
 */

export const COMMIT_MESSAGE = 'estudos: sincronizar caderno'
const KEY = { remote: 'study_git_remote', branch: 'study_git_branch', folder: 'study_git_folder', state: 'study_git_state' }




interface SyncState {
  /** caminho (relativo à pasta gerenciada) → sha1 do conteúdo que o rickOS escreveu por último. */
  ours: Record<string, string>
  last: SyncResult | null
}

// ── git ──────────────────────────────────────────────────────────────────────

interface GitOut {
  code: number
  stdout: string
  stderr: string
}

export function git(args: string[], cwd: string, timeoutMs = 60_000): Promise<GitOut> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo', LC_ALL: 'C' }
      },
      (err, stdout, stderr) => {
        const code = err ? (typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === 'number' ? Number((err as { code?: number }).code) : 1) : 0
        resolve({ code, stdout: String(stdout), stderr: String(stderr || (err && !stderr ? err.message : '')) })
      }
    )
  })
}

async function gitOk(args: string[], cwd: string, timeoutMs?: number): Promise<string> {
  const r = await git(args, cwd, timeoutMs)
  if (r.code !== 0) throw new StudyError(tt('estudos.git', { cmd: args[0], erro: (r.stderr || r.stdout).trim().split('\n').slice(-2).join(' ') }))
  return r.stdout.trim()
}

const sha1 = (b: string | Buffer): string => crypto.createHash('sha1').update(b).digest('hex')

// ── configuração ─────────────────────────────────────────────────────────────

function settingSync(db: Parameters<typeof one>[0], k: string): string | null {
  return one<{ value: string }>(db, 'SELECT value FROM settings WHERE key = ?', [k])?.value ?? null
}

export async function getConfig(): Promise<GitConfig | null> {
  return read((db) => {
    const remote = settingSync(db, KEY.remote)
    if (!remote) return null
    return { remote, branch: settingSync(db, KEY.branch) || 'main', folder: settingSync(db, KEY.folder) || 'rickos-estudos' }
  })
}

async function loadState(): Promise<SyncState> {
  return read((db) => {
    try {
      const v = JSON.parse(settingSync(db, KEY.state) || 'null')
      if (v && typeof v === 'object') return { ours: v.ours ?? {}, last: v.last ?? null }
    } catch { /* estado antigo */ }
    return { ours: {}, last: null }
  })
}

async function saveState(s: SyncState): Promise<void> {
  await tx((db) => {
    exec(db, 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [KEY.state, JSON.stringify(s)])
  })
}

export function checkoutDir(): string {
  return path.join(dataDir(), 'estudos', 'repo')
}

function validFolder(f: string): string {
  const clean = f.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (!clean || clean.split('/').some((p) => !p || p === '.' || p === '..' || p === '.git')) throw new StudyError(tt('estudos.pastaGerenciadaInvalida'))
  return clean
}

function validBranch(b: string): string {
  const v = b.trim() || 'main'
  if (!/^[A-Za-z0-9._/-]{1,100}$/.test(v) || v.includes('..') || v.startsWith('-')) throw new StudyError(tt('estudos.branchInvalido'))
  return v
}

function validRemote(r: string): string {
  const v = r.trim()
  if (!v || v.startsWith('-') || /\s/.test(v)) throw new StudyError(tt('estudos.remotoInvalido'))
  return v
}

// ── vincular ─────────────────────────────────────────────────────────────────


function previewDir(id: string): string {
  return path.join(dataDir(), 'estudos', `preview-${id}`)
}

function countFiles(dir: string, filter: (f: string) => boolean, skip = new Set(['.git'])): number {
  let n = 0
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (skip.has(e.name)) continue
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (filter(p)) n++
    }
  }
  if (fs.existsSync(dir)) walk(dir)
  return n
}

/** Clona numa pasta temporária e mostra o que vai acontecer — não muda nada no remoto. */
export async function previewLink(input: Partial<GitConfig>): Promise<LinkPreview> {
  const remote = validRemote(String(input.remote ?? ''))
  const branch = validBranch(String(input.branch ?? 'main'))
  const folder = validFolder(String(input.folder ?? 'rickos-estudos'))
  const id = crypto.randomBytes(6).toString('hex')
  const dir = previewDir(id)
  fs.mkdirSync(path.dirname(dir), { recursive: true })
  await gitOk(['clone', '--quiet', '--no-checkout', remote, dir], path.dirname(dir), 180_000)
  const heads = await gitOk(['ls-remote', '--heads', 'origin'], dir)
  const emptyRepo = !heads
  const branchExists = heads.split('\n').some((l) => l.endsWith(`refs/heads/${branch}`))
  if (branchExists) await gitOk(['checkout', '--quiet', '-B', branch, `origin/${branch}`], dir)
  else await gitOk(['checkout', '--quiet', '--orphan', branch], dir).catch(() => undefined)
  const target = path.join(dir, folder)
  let folderState: LinkPreview['folderState'] = 'free'
  let folderFiles = 0
  if (fs.existsSync(target)) {
    folderFiles = countFiles(target, () => true)
    const mf = path.join(target, 'manifest.json')
    let managed = false
    try {
      managed = fs.existsSync(mf) && JSON.parse(fs.readFileSync(mf, 'utf8')).formato === BUNDLE_FORMAT
    } catch { /* manifesto inválido */ }
    folderState = managed ? 'managed' : folderFiles ? 'occupied' : 'free'
  }
  const topLevel = fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x !== '.git').sort() : []
  const notesOutside = countFiles(dir, (p) => /\.(md|markdown|txt)$/i.test(p) && !p.startsWith(target + path.sep), new Set(['.git']))
  let suggestion: string | null = null
  if (folderState === 'occupied') {
    for (let i = 2; i < 50; i++) {
      const cand = `${folder}-${i}`
      if (!fs.existsSync(path.join(dir, cand))) {
        suggestion = cand
        break
      }
    }
  }
  return { remote, branch, folder, emptyRepo, branchExists, folderState, folderFiles, topLevel, notesOutside, suggestion, previewId: id }
}

/** Confirma o vínculo: a prévia vira o checkout dedicado. Recusa se o checkout atual tem envio pendente. */
export async function link(input: GitConfig & { previewId: string }): Promise<GitConfig> {
  const remote = validRemote(input.remote)
  const branch = validBranch(input.branch)
  const folder = validFolder(input.folder)
  if (!/^[0-9a-f]{12}$/.test(input.previewId)) throw new StudyError(tt('estudos.previaInvalida'))
  const src = previewDir(input.previewId)
  if (!fs.existsSync(src)) throw new StudyError(tt('estudos.previaExpirada'))
  // a pasta escolhida tem que estar livre ou já ser do rickOS
  const t = path.join(src, folder)
  if (fs.existsSync(t) && countFiles(t, () => true) > 0) {
    const mf = path.join(t, 'manifest.json')
    let ok = false
    try {
      ok = JSON.parse(fs.readFileSync(mf, 'utf8')).formato === BUNDLE_FORMAT
    } catch { /* sem manifesto */ }
    if (!ok) throw new StudyError(tt('estudos.pastaOcupada', { pasta: folder }))
  }
  const dest = checkoutDir()
  if (fs.existsSync(dest)) {
    if (await hasUnpushed(dest)) throw new StudyError(tt('estudos.pendenteAntesTrocar'))
    fs.renameSync(dest, `${dest}-antigo-${Date.now()}`) // nunca apaga: guarda o checkout anterior
  }
  fs.renameSync(src, dest)
  await ensureIdentity(dest)
  await tx((db) => {
    const set = (k: string, v: string): void => {
      exec(db, 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [k, v])
    }
    set(KEY.remote, remote)
    set(KEY.branch, branch)
    set(KEY.folder, folder)
    set(KEY.state, JSON.stringify({ ours: {}, last: null }))
  })
  return { remote, branch, folder }
}

export async function unlink(): Promise<void> {
  const dest = checkoutDir()
  if (fs.existsSync(dest) && (await hasUnpushed(dest))) throw new StudyError(tt('estudos.pendenteAntesDesvincular'))
  await tx((db) => {
    for (const k of Object.values(KEY)) exec(db, 'DELETE FROM settings WHERE key = ?', [k])
  })
}

async function ensureIdentity(dir: string): Promise<void> {
  const email = (await git(['config', 'user.email'], dir)).stdout.trim()
  if (!email) {
    await gitOk(['config', 'user.email', 'rickos@localhost'], dir)
    await gitOk(['config', 'user.name', 'rickOS'], dir)
  }
}

async function headCommit(dir: string): Promise<string | null> {
  const r = await git(['rev-parse', '--verify', '-q', 'HEAD'], dir)
  return r.code === 0 ? r.stdout.trim() : null
}

async function remoteRef(dir: string, branch: string): Promise<string | null> {
  const r = await git(['rev-parse', '--verify', '-q', `refs/remotes/origin/${branch}`], dir)
  return r.code === 0 ? r.stdout.trim() : null
}

async function hasUnpushed(dir: string): Promise<boolean> {
  const head = await headCommit(dir)
  if (!head) return false
  const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], dir)).stdout.trim()
  const rr = await remoteRef(dir, branch)
  const n = rr ? await gitOk(['rev-list', '--count', `${rr}..HEAD`], dir) : await gitOk(['rev-list', '--count', 'HEAD'], dir)
  return Number(n) > 0
}

// ── status ───────────────────────────────────────────────────────────────────


export async function getStatus(): Promise<GitStatus> {
  const config = await getConfig()
  const dir = checkoutDir()
  const linked = !!config && fs.existsSync(path.join(dir, '.git'))
  const state = await loadState()
  return { config, linked, pending: linked ? await hasUnpushed(dir) : false, last: state.last }
}

// ── sincronizar ──────────────────────────────────────────────────────────────

let running: Promise<SyncResult> | null = null

/** Um Sincronizar por vez: clique duplo / duas abas recebem o mesmo resultado. */
export function sync(): Promise<SyncResult> {
  if (!running) {
    running = doSync().finally(() => {
      running = null
    })
  }
  return running
}

async function doSync(): Promise<SyncResult> {
  const at = nowIso()
  const base: Omit<SyncResult, 'status' | 'message'> = { committed: false, keptExternal: [], conflicts: [], commit: null, at }
  const config = await getConfig()
  const dir = checkoutDir()
  if (!config || !fs.existsSync(path.join(dir, '.git'))) return finish({ ...base, status: 'error', message: 'git.naoVinculado' })
  const { branch, folder } = config
  const state = await loadState()
  broadcast('estudos:sync', { phase: 'running' })
  try {
    await ensureIdentity(dir)
    // 1. situação do remoto (offline não impede o commit local)
    const fetched = await git(['fetch', '--quiet', 'origin'], dir, 120_000)
    const rr = await remoteRef(dir, branch)
    let head = await headCommit(dir)
    if (rr) {
      const behind = head ? Number(await gitOk(['rev-list', '--count', `HEAD..${rr}`], dir)) : 1
      if (behind > 0) {
        const ahead = head ? Number(await gitOk(['rev-list', '--count', `${rr}..HEAD`], dir)) : 0
        if (!head) await gitOk(['checkout', '--quiet', '-B', branch, rr], dir)
        else if (ahead === 0) await gitOk(['merge', '--quiet', '--ff-only', rr], dir)
        else {
          // commit local pendente + remoto avançou: só junta se o merge for limpo
          const test = await git(['merge-tree', '--write-tree', 'HEAD', rr], dir)
          if (test.code !== 0) {
            return finish({ ...base, status: 'divergent', message: 'git.historicoDivergente', detail: rr.slice(0, 8) }, state)
          }
          await gitOk(['merge', '--quiet', '--no-edit', rr], dir)
        }
        head = await headCommit(dir)
      }
    }

    // 2. exportação consistente, escrita só onde é seguro
    const { files } = await exportAll()
    const root = path.join(dir, folder)
    const desired = new Map(files.map((f) => [f.path, f.content]))
    const ours = { ...state.ours }
    const toWrite: { path: string; content: string | Buffer }[] = []
    const kept: string[] = []
    const conflicts: { path: string; content: string | Buffer }[] = []
    for (const [p, content] of desired) {
      const abs = path.join(root, p)
      const cur = fs.existsSync(abs) ? fs.readFileSync(abs) : null
      const want = sha1(content)
      if (cur && sha1(cur) === want) {
        ours[p] = want
        continue
      }
      const prev = state.ours[p]
      const editedOutside = cur != null && (prev ? sha1(cur) !== prev : true)
      if (!editedOutside) {
        toWrite.push({ path: p, content })
        ours[p] = want
      } else if (prev && want === prev) {
        kept.push(p) // só o repositório mudou: a edição externa fica
      } else {
        conflicts.push({ path: p, content }) // os dois mudaram (ou arquivo desconhecido no lugar)
      }
    }
    const removed: string[] = []
    for (const p of Object.keys(state.ours)) {
      if (desired.has(p)) continue
      const abs = path.join(root, p)
      if (!fs.existsSync(abs)) {
        delete ours[p]
        continue
      }
      if (sha1(fs.readFileSync(abs)) === state.ours[p]) {
        fs.unlinkSync(abs)
        removed.push(p)
        delete ours[p]
      } else kept.push(p)
    }
    writeFiles(root, toWrite)
    let divergenceDir: string | null = null
    if (conflicts.length) {
      divergenceDir = path.join(dataDir(), 'estudos', 'divergencias', at.replace(/[:.]/g, '-'))
      writeFiles(divergenceDir, conflicts)
    }

    // 3. preparar SÓ os arquivos gerenciados que o rickOS escreveu/removeu
    const paths = [...toWrite.map((f) => f.path), ...removed].map((p) => `${folder}/${p}`)
    for (let i = 0; i < paths.length; i += 200) await gitOk(['add', '-A', '--', ...paths.slice(i, i + 200)], dir)
    const staged = (await git(['diff', '--cached', '--quiet', '--', folder], dir)).code !== 0
    let committed = false
    if (staged) {
      // pathspec da pasta gerenciada: algo que alguém deixou staged fora dela continua fora do commit
      await gitOk(['commit', '--quiet', '--no-verify', '-m', COMMIT_MESSAGE, '--', folder], dir)
      committed = true
    }
    const newState: SyncState = { ours, last: state.last }

    // 4. enviar o que estiver pendente (inclusive commit de uma tentativa anterior)
    head = await headCommit(dir)
    const rr2 = await remoteRef(dir, branch)
    const ahead = head ? Number(await gitOk(['rev-list', '--count', rr2 ? `${rr2}..HEAD` : 'HEAD'], dir)) : 0
    const extra = { ...base, committed, commit: head, keptExternal: kept.sort(), conflicts: conflicts.map((c) => c.path).sort(), divergenceDir }
    if (ahead === 0) {
      const status: SyncStatus = conflicts.length ? 'divergent' : 'synced'
      return finish({ ...extra, status, message: conflicts.length ? 'git.divergenciaArquivos' : 'git.tudoSincronizado' }, newState)
    }
    const push = await git(['push', '--quiet', 'origin', `HEAD:refs/heads/${branch}`], dir, 180_000)
    if (push.code !== 0) {
      const why = (push.stderr || fetched.stderr).trim().split('\n').slice(-2).join(' ')
      return finish({ ...extra, status: 'pending', message: 'git.envioPendente', detail: why }, newState)
    }
    // 5. sucesso remoto só depois de conferir o ref no remoto
    const ls = await git(['ls-remote', 'origin', `refs/heads/${branch}`], dir)
    const remoteHead = ls.stdout.trim().split(/\s+/)[0]
    if (remoteHead !== head) return finish({ ...extra, status: 'pending', message: 'git.envioNaoConfirmado' }, newState)
    await git(['fetch', '--quiet', 'origin'], dir)
    return finish({ ...extra, status: conflicts.length ? 'divergent' : 'pushed', message: conflicts.length ? 'git.enviadoComDivergencia' : 'git.enviado' }, newState)
  } catch (e) {
    return finish({ ...base, status: 'error', message: 'git.erro', detail: e instanceof Error ? e.message : String(e) }, state)
  }
}

async function finish(r: SyncResult, state?: SyncState): Promise<SyncResult> {
  if (state) await saveState({ ours: state.ours, last: r })
  broadcast('estudos:sync', { phase: 'done', result: r })
  return r
}

// ── restaurar e importar acervo ─────────────────────────────────────────────

export async function restoreFromRepo(): Promise<RestoreReport> {
  const config = await getConfig()
  if (!config) throw new StudyError(tt('estudos.repoNaoVinculado'))
  const root = path.join(checkoutDir(), config.folder)
  if (!fs.existsSync(path.join(root, 'manifest.json'))) throw new StudyError(tt('estudos.semCopiaParaRestaurar'))
  const report = await restoreFromFolder(root)
  // só passa a ser "nosso" o arquivo idêntico ao que o rickOS exportaria agora; um arquivo editado
  // fora (ex.: no GitHub) continua sendo do repositório e nunca é sobrescrito em silêncio
  const state = await loadState()
  const ours = { ...state.ours }
  const { files } = await exportAll()
  for (const f of files) {
    const abs = path.join(root, f.path)
    if (fs.existsSync(abs) && sha1(fs.readFileSync(abs)) === sha1(f.content)) ours[f.path] = sha1(f.content)
  }
  await saveState({ ours, last: state.last })
  return report
}

export async function repoTree(): Promise<string[]> {
  const config = await getConfig()
  if (!config) return []
  const dir = checkoutDir()
  const out: string[] = []
  const walk = (d: string, rel: string, depth: number): void => {
    if (depth > 4) return
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === '.git') continue
      const r = rel ? `${rel}/${e.name}` : e.name
      if (r === config.folder) continue
      out.push(r)
      walk(path.join(d, e.name), r, depth + 1)
    }
  }
  if (fs.existsSync(dir)) walk(dir, '', 0)
  return ['.', ...out.sort()]
}


/** Atualiza o checkout antes de ler o acervo: fetch + fast-forward só se não houver commit local pendente. */
export async function refreshCheckout(): Promise<void> {
  const config = await getConfig()
  const dir = checkoutDir()
  if (!config || !fs.existsSync(path.join(dir, '.git'))) return
  await git(['fetch', '--quiet', 'origin'], dir, 120_000)
  const rr = await remoteRef(dir, config.branch)
  if (!rr) return
  const head = await headCommit(dir)
  if (!head) await git(['checkout', '--quiet', '-B', config.branch, rr], dir)
  else if (!(await hasUnpushed(dir))) await git(['merge', '--quiet', '--ff-only', rr], dir)
}
