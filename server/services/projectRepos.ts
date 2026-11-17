import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getProjects, getProjectRepos, DbProject, DbProjectRepo } from '../database/queries'

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
  if (!root || !fs.existsSync(root)) throw new Error('Pasta não encontrada')
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
