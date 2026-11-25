import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getProjects, getProjectRepos, setProjectRepos, projectRefCounts, absorbProject, DbProject, DbProjectRepo } from '../database/queries'
import { tt } from '../i18n'

/**
 * Repositórios de um projeto. Um projeto pode ser:
 *  - simples: `localPath` é o próprio repositório (sem linhas em project_repos);
 *  - workspace: `localPath` é uma pasta raiz (CLAUDE.md, .claude/…) com vários
 *    repositórios dentro (front, back, infra…) listados em project_repos.
 * Todo código que mexe com git deve iterar `repoTargets()` em vez de usar
 * `localPath`/`githubRepoUrl` direto.
 */

export interface RepoTarget {
  /** Nome curto (ex.: "front"); no projeto simples, o nome do projeto. */
  name: string
  /** Caminho relativo ao localPath ('.' no projeto simples). */
  rel: string
  /** Caminho absoluto do repositório. */
  dir: string
  githubRepoUrl: string | null
  /** owner/name em minúsculas (null sem GitHub). */
  slug: string | null
}

export function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p
}

export function githubSlug(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.trim().match(/github\.com[:/]([^/\s]+\/[^/\s#?]+?)(?:\.git)?\/?$/i)
  return m ? m[1].toLowerCase() : null
}

/** Alvos git do projeto, a partir das linhas de project_repos já carregadas. */
export function repoTargetsFrom(p: DbProject, repos: DbProjectRepo[]): RepoTarget[] {
  const root = p.localPath?.trim() ? expandHome(p.localPath.trim()) : null
  const mine = repos.filter((r) => r.projectId === p.id)
  if (mine.length) {
    return mine
      .map((r) => {
        const rel = r.path.trim() || '.'
        const dir = path.isAbsolute(expandHome(rel)) ? expandHome(rel) : root ? path.join(root, rel) : null
        return dir ? { name: r.name, rel, dir, githubRepoUrl: r.githubRepoUrl || null, slug: githubSlug(r.githubRepoUrl) } : null
      })
      .filter((x): x is RepoTarget => !!x)
  }
  if (!root && !p.githubRepoUrl) return []
  return [{ name: p.name, rel: '.', dir: root ?? '', githubRepoUrl: p.githubRepoUrl || null, slug: githubSlug(p.githubRepoUrl) }]
}

export async function repoTargets(p: DbProject): Promise<RepoTarget[]> {
  return repoTargetsFrom(p, await getProjectRepos(p.id))
}

/** Alvos com pasta local existente. */
export function localTargets(targets: RepoTarget[]): RepoTarget[] {
  return targets.filter((t) => t.dir && fs.existsSync(t.dir))
}

export function isWorkspace(targets: RepoTarget[]): boolean {
  return targets.length > 1 || (targets.length === 1 && targets[0].rel !== '.')
}

function isGitDir(d: string): boolean {
  return fs.existsSync(path.join(d, '.git'))
}

function originUrl(dir: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('git', ['remote', 'get-url', 'origin'], { cwd: dir, timeout: 5000, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }, (err, out) =>
      resolve(err ? null : out.trim() || null)
    )
  })
}

function httpsUrl(remote: string | null): string | null {
  const slug = remote?.match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/i)?.[1]
  return slug ? `https://github.com/${slug}` : remote
}

export interface DetectedRepo {
  name: string
  path: string
  githubRepoUrl: string | null
}

/**
 * Sugestão de repositórios dentro de uma pasta raiz (filhos diretos e netos com .git).
 * Não grava nada: o usuário confirma na tela do projeto.
 */
export async function detectChildRepos(localPath: string): Promise<{ rootIsRepo: boolean; repos: DetectedRepo[] }> {
  const root = expandHome(localPath.trim())
  if (!root || !fs.existsSync(root)) throw new Error(tt('services.pastaNaoEncontrada'))
  const found: string[] = []
  const skip = (n: string): boolean => n.startsWith('.') || n === 'node_modules'
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory() || skip(e.name)) continue
    const sub = path.join(root, e.name)
    if (isGitDir(sub)) {
      found.push(e.name)
      continue
    }
    try {
      for (const e2 of fs.readdirSync(sub, { withFileTypes: true })) {
        if (e2.isDirectory() && !skip(e2.name) && isGitDir(path.join(sub, e2.name))) found.push(path.join(e.name, e2.name))
      }
    } catch {
      // pasta ilegível
    }
  }
  const repos = await Promise.all(
    found.sort().map(async (rel) => ({ name: path.basename(rel), path: rel, githubRepoUrl: httpsUrl(await originUrl(path.join(root, rel))) }))
  )
  return { rootIsRepo: isGitDir(root), repos }
}

/** Projeto dono de um repositório GitHub ("owner/name"), olhando todos os repos de cada projeto. */
export async function projectForGithubRepo(repo: string): Promise<DbProject | null> {
  const slug = repo.trim().toLowerCase()
  const [projects, rows] = await Promise.all([getProjects(), getProjectRepos()])
  return projects.find((p) => repoTargetsFrom(p, rows).some((t) => t.slug === slug)) ?? null
}

function realDir(p: string): string {
  try {
    return fs.realpathSync(p)
  } catch {
    return path.resolve(p)
  }
}

export interface WorkspaceDuplicate {
  /** Repositório do workspace que coincide. */
  repoName: string
  projectId: number
  projectName: string
  status: string
  /** Linhas vinculadas ao projeto antigo, por tabela (todos, tasks, project_notes…). */
  counts: Record<string, number>
}

/**
 * Projetos cadastrados à parte que são, na verdade, um dos repositórios deste workspace
 * (mesma pasta ou mesmo repo do GitHub). Só sugere: incorporar é uma ação do usuário.
 */
export async function workspaceDuplicates(targetId: number): Promise<WorkspaceDuplicate[]> {
  const [projects, rows] = await Promise.all([getProjects(), getProjectRepos()])
  const target = projects.find((p) => p.id === targetId)
  if (!target) return []
  const targets = repoTargetsFrom(target, rows)
  if (!isWorkspace(targets)) return []
  const out: WorkspaceDuplicate[] = []
  for (const p of projects) {
    if (p.id === targetId || rows.some((r) => r.projectId === p.id)) continue // outro workspace: não mexe
    const dir = p.localPath?.trim() ? realDir(expandHome(p.localPath.trim())) : null
    const slug = githubSlug(p.githubRepoUrl)
    const hit = targets.find((t) => (dir && t.dir && realDir(t.dir) === dir) || (slug && t.slug === slug))
    if (hit) out.push({ repoName: hit.name, projectId: p.id, projectName: p.name, status: p.status, counts: await projectRefCounts(p.id) })
  }
  return out
}

/** Incorpora um projeto duplicado no workspace (confere que é mesmo um dos repos dele). */
export async function absorbIntoWorkspace(targetId: number, sourceId: number): Promise<void> {
  const dup = (await workspaceDuplicates(targetId)).find((d) => d.projectId === sourceId)
  if (!dup) throw new Error(tt('services.esteProjetoNaoCorrespondeA'))
  // o GitHub do antigo fica no repo do workspace, se ainda não estiver lá
  const [projects, rows] = await Promise.all([getProjects(), getProjectRepos(targetId)])
  const source = projects.find((p) => p.id === sourceId)
  const repo = rows.find((r) => r.name === dup.repoName)
  if (source?.githubRepoUrl && repo && !repo.githubRepoUrl) {
    await setProjectRepos(
      targetId,
      rows.map((r) => ({ name: r.name, path: r.path, githubRepoUrl: r.id === repo.id ? source.githubRepoUrl : r.githubRepoUrl }))
    )
  }
  await absorbProject(targetId, sourceId)
}
