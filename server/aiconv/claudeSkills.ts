import { createHash } from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { ClaudeSkillInfo, SlashCommandInfo } from '../../shared/aiConversations'
import { configDirs } from './transcripts'
import { tt } from '../i18n'

/**
 * Skills e comandos do Claude Code criados por você:
 *   - de usuário: `~/.claude/skills/<nome>/SKILL.md` e `~/.claude/commands/**.md`
 *     (e de cada conta extra, ex.: `~/.claude-trabalho`);
 *   - de projeto: `<pasta do projeto>/.claude/skills|commands`.
 * Ficam de fora as sincronizadas pela Anthropic (`skills/synced`) e pastas `_…`/`.…`.
 */

const MAX_FILE = 512 * 1024

interface ProjectRef {
  id: number
  name: string
  localPath: string
  /** Projeto workspace: repositórios dentro da raiz (cada um pode ter o seu .claude/). */
  repos?: { name: string; dir: string }[]
}

function idFor(file: string): string {
  return createHash('sha1').update(file).digest('hex').slice(0, 16)
}

/** Lê os campos simples do frontmatter YAML (uma linha, com ou sem aspas; `>`/`|` em bloco). */
export function parseFrontmatter(text: string): { data: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!m) return { data: {}, body: text }
  const data: Record<string, string> = {}
  const lines = m[1].split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i])
    if (!kv) continue
    let v = kv[2].trim()
    if (v === '>' || v === '|' || v === '>-' || v === '|-') {
      const block: string[] = []
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) block.push(lines[++i].trim())
      v = block.join(v.startsWith('>') ? ' ' : '\n')
    }
    data[kv[1]] = v.replace(/^(['"])([\s\S]*)\1$/, '$2')
  }
  return { data, body: text.slice(m[0].length) }
}

export function configLabel(dir: string): string {
  const base = path.basename(dir)
  if (base === '.claude') return 'Pessoal'
  const rest = base.replace(/^\.claude-?/, '')
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : base
}

function readInfo(file: string, kind: 'skill' | 'command', name: string, base: Omit<ClaudeSkillInfo, 'id' | 'name' | 'description' | 'kind' | 'path' | 'argumentHint' | 'updatedAt'>): ClaudeSkillInfo | null {
  try {
    const st = fs.statSync(file)
    if (!st.isFile() || st.size > MAX_FILE) return null
    const { data, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'))
    const firstLine = body.split('\n').find((l) => l.trim() && !l.startsWith('#'))?.trim() ?? ''
    return {
      ...base,
      id: idFor(file),
      name: kind === 'skill' ? data.name?.trim() || name : name,
      description: (data.description || firstLine).slice(0, 400),
      argumentHint: data['argument-hint'] || null,
      kind,
      path: file,
      updatedAt: st.mtime.toISOString()
    }
  } catch {
    return null
  }
}

function scanRoot(root: string, base: Omit<ClaudeSkillInfo, 'id' | 'name' | 'description' | 'kind' | 'path' | 'argumentHint' | 'updatedAt'>): ClaudeSkillInfo[] {
  const out: ClaudeSkillInfo[] = []
  const skillsDir = path.join(root, 'skills')
  let names: string[] = []
  try {
    names = fs.readdirSync(skillsDir)
  } catch {
    names = []
  }
  for (const n of names) {
    if (n.startsWith('_') || n.startsWith('.') || n === 'synced') continue
    const info = readInfo(path.join(skillsDir, n, 'SKILL.md'), 'skill', n, base)
    if (info) out.push(info)
  }
  // comandos: subpastas viram namespace (ex.: commands/git/pr.md → /pr)
  const cmdDir = path.join(root, 'commands')
  const walk = (dir: string, depth: number): void => {
    if (depth > 3) return
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name.startsWith('_')) continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p, depth + 1)
      else if (e.isFile() && e.name.endsWith('.md')) {
        const info = readInfo(p, 'command', e.name.slice(0, -3), base)
        if (info) out.push(info)
      }
    }
  }
  walk(cmdDir, 0)
  return out
}

let cache: { at: number; items: ClaudeSkillInfo[] } | null = null

export function listClaudeSkills(projects: ProjectRef[], fresh = false): ClaudeSkillInfo[] {
  if (!fresh && cache && Date.now() - cache.at < 15_000) return cache.items
  const items: ClaudeSkillInfo[] = []
  for (const dir of configDirs()) {
    items.push(...scanRoot(dir, { scope: 'user', source: configLabel(dir), configDir: dir, projectId: null }))
  }
  const seen = new Set<string>()
  for (const p of projects) {
    const root = path.join(p.localPath.replace(/^~(?=$|\/)/, os.homedir()), '.claude')
    if (seen.has(root) || !fs.existsSync(root)) continue
    seen.add(root)
    items.push(...scanRoot(root, { scope: 'project', source: p.name, configDir: null, projectId: p.id }))
    for (const r of p.repos ?? []) {
      const sub = path.join(r.dir, '.claude')
      if (seen.has(sub) || !fs.existsSync(sub)) continue
      seen.add(sub)
      items.push(...scanRoot(sub, { scope: 'project', source: `${p.name} · ${r.name}`, configDir: null, projectId: p.id }))
    }
  }
  items.sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name))
  cache = { at: Date.now(), items }
  return items
}

/** Caminho de uma skill listada (só arquivos que o scanner encontrou). */
export function skillFile(id: string, projects: ProjectRef[]): ClaudeSkillInfo | null {
  return listClaudeSkills(projects, true).find((s) => s.id === id) ?? null
}

export function readSkill(id: string, projects: ProjectRef[]): { info: ClaudeSkillInfo; content: string } {
  const info = skillFile(id, projects)
  if (!info) throw new Error(tt('aiconv.skillNaoEncontrada'))
  return { info, content: fs.readFileSync(info.path, 'utf8') }
}

export function saveSkill(id: string, content: string, projects: ProjectRef[]): ClaudeSkillInfo {
  const info = skillFile(id, projects)
  if (!info) throw new Error(tt('aiconv.skillNaoEncontrada'))
  if (typeof content !== 'string' || content.length > MAX_FILE) throw new Error(tt('aiconv.conteudoInvalido'))
  fs.writeFileSync(info.path, content, 'utf8')
  cache = null
  return skillFile(id, projects) ?? info
}

// Comandos nativos do CLI que fazem sentido aqui (com descrição em pt-BR).
const BUILTIN: Record<string, string> = {
  compact: 'Resume a conversa para liberar contexto',
  clear: 'Limpa o contexto da sessão',
  context: 'Mostra o uso de contexto',
  init: 'Cria/atualiza o CLAUDE.md do projeto',
  review: 'Revisa um PR',
  'security-review': 'Revisão de segurança das mudanças',
  'code-review': 'Revisão de código do diff atual',
  simplify: 'Simplifica o código alterado',
  cost: 'Custo da sessão'
}

/**
 * Comandos `/` para o autocompletar: nomes reais da sessão (vindos do init do CLI) +
 * descrições lidas dos arquivos. Sem init ainda, usa o que dá para escanear.
 */
export function slashCommands(initNames: string[] | null, projects: ProjectRef[], opts: { projectId: number | null; configDir: string | null }): SlashCommandInfo[] {
  const all = listClaudeSkills(projects)
  const relevant = all.filter((s) => (s.scope === 'project' ? s.projectId === opts.projectId : !opts.configDir || s.configDir === opts.configDir))
  const byName = new Map<string, ClaudeSkillInfo>()
  for (const s of relevant) if (!byName.has(s.name)) byName.set(s.name, s)
  const out: SlashCommandInfo[] = []
  const add = (name: string): void => {
    if (out.some((x) => x.name === name)) return
    const s = byName.get(name)
    out.push({
      name,
      description: s?.description ?? BUILTIN[name] ?? '',
      source: s ? (s.scope === 'project' ? `projeto ${s.source}` : s.source) : BUILTIN[name] ? 'CLI' : 'plugin',
      argumentHint: s?.argumentHint ?? null
    })
  }
  if (initNames?.length) {
    for (const n of initNames) if (!n.startsWith('__')) add(n)
  } else {
    for (const s of relevant) add(s.name)
    for (const n of Object.keys(BUILTIN)) add(n)
  }
  // os seus primeiro, depois CLI/plugins
  const rank = (x: SlashCommandInfo): number => (x.source.startsWith('projeto') ? 0 : x.source === 'CLI' || x.source === 'plugin' ? 2 : 1)
  return out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}
