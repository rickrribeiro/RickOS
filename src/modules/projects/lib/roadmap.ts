/**
 * Parser do padrão ROADMAP_RICKOS.md (ver docs/ROADMAP_RICKOS.md):
 *   ## Área / épico      ### Funcionalidade      - [ ] tarefa @v1.2 !alta
 * Marcadores: [ ] a fazer · [~] em andamento · [x] feito · [-] descartado.
 * Itens podem ser aninhados por indentação. `#12` no início do item = número estável (shared/roadmap.ts).
 */

import { ROADMAP_NUM } from '../../../../shared/roadmap'

export type RoadmapMark = ' ' | 'x' | '~' | '-'

export interface RoadmapNode {
  id: string
  kind: 'heading' | 'item'
  level: number // heading: 2..6 · item: profundidade de indentação
  text: string
  mark: RoadmapMark | null // null = item sem checkbox / heading
  line: number // índice da linha no arquivo (0-based)
  raw: string // texto original da linha (para conferir antes de gravar)
  version: string | null
  priority: string | null
  num: number | null // `#12` — ID incremental para citar o item (ex.: para a IA)
  children: RoadmapNode[]
}

export interface RoadmapStats {
  total: number
  done: number
  doing: number
  dropped: number
}

const HEADING = /^(#{1,6})\s+(.*)$/
const ITEM = /^(\s*)[-*+]\s+(?:\[( |x|X|~|-)\]\s+)?(.*)$/

function meta(text: string): { text: string; version: string | null; priority: string | null; num: number | null } {
  let num: number | null = null
  const n = text.match(ROADMAP_NUM)
  if (n) {
    num = Number(n[1])
    text = text.slice(n[0].length)
  }
  let version: string | null = null
  let priority: string | null = null
  const clean = text
    .replace(/(^|\s)@([\w.\-]+)/g, (_m, sp: string, v: string) => {
      version = v
      return sp
    })
    .replace(/(^|\s)!(alta|media|média|baixa)\b/gi, (_m, sp: string, v: string) => {
      priority = v.toLowerCase().replace('média', 'media')
      return sp
    })
    .replace(/\s{2,}/g, ' ')
    .trim()
  return { text: clean, version, priority, num }
}

export function parseRoadmap(content: string): RoadmapNode[] {
  const roots: RoadmapNode[] = []
  const headingStack: RoadmapNode[] = []
  let itemStack: { indent: number; node: RoadmapNode }[] = []
  const lines = content.split('\n')

  const container = (): RoadmapNode[] => (headingStack.length ? headingStack[headingStack.length - 1].children : roots)

  lines.forEach((raw, line) => {
    const h = raw.match(HEADING)
    if (h) {
      const level = h[1].length
      if (level === 1) return // título do documento
      const node: RoadmapNode = { id: `h${line}`, kind: 'heading', level, text: h[2].trim(), mark: null, line, raw, version: null, priority: null, num: null, children: [] }
      while (headingStack.length && headingStack[headingStack.length - 1].level >= level) headingStack.pop()
      container().push(node)
      headingStack.push(node)
      itemStack = []
      return
    }
    const it = raw.match(ITEM)
    if (!it) return
    if (raw.trimStart().startsWith('>')) return
    const indent = it[1].replace(/\t/g, '  ').length
    const mark = it[2] ? ((it[2] === 'X' ? 'x' : it[2]) as RoadmapMark) : null
    const m = meta(it[3])
    const node: RoadmapNode = { id: `i${line}`, kind: 'item', level: 0, text: m.text, mark, line, raw, version: m.version, priority: m.priority, num: mark ? m.num : null, children: [] }
    while (itemStack.length && itemStack[itemStack.length - 1].indent >= indent) itemStack.pop()
    if (itemStack.length) {
      node.level = itemStack.length
      itemStack[itemStack.length - 1].node.children.push(node)
    } else {
      container().push(node)
    }
    itemStack.push({ indent, node })
  })
  return roots
}

/** Conta só itens com checkbox (folhas e intermediários). */
export function roadmapStats(nodes: RoadmapNode[]): RoadmapStats {
  const s: RoadmapStats = { total: 0, done: 0, doing: 0, dropped: 0 }
  const walk = (n: RoadmapNode): void => {
    if (n.kind === 'item' && n.mark) {
      if (n.mark === '-') s.dropped++
      else {
        s.total++
        if (n.mark === 'x') s.done++
        if (n.mark === '~') s.doing++
      }
    }
    n.children.forEach(walk)
  }
  nodes.forEach(walk)
  return s
}

export interface RoadmapRow {
  node: RoadmapNode
  area: string
  feature: string
  parent: string
}

/** Achata a árvore para a visão em tabela. */
export function flattenRoadmap(nodes: RoadmapNode[]): RoadmapRow[] {
  const rows: RoadmapRow[] = []
  const walk = (n: RoadmapNode, area: string, feature: string, parent: string): void => {
    if (n.kind === 'heading') {
      const isArea = n.level === 2
      n.children.forEach((c) => walk(c, isArea ? n.text : area, isArea ? '' : n.text, ''))
      return
    }
    rows.push({ node: n, area, feature, parent })
    n.children.forEach((c) => walk(c, area, feature, n.text))
  }
  nodes.forEach((n) => walk(n, '', '', ''))
  return rows
}

export const MARK_LABEL: Record<RoadmapMark, string> = { ' ': 'A fazer', '~': 'Em andamento', x: 'Feito', '-': 'Descartado' }
export const MARK_ICON: Record<RoadmapMark, string> = { ' ': '○', '~': '◐', x: '●', '-': '⊘' }
export const nextMark = (m: RoadmapMark): RoadmapMark => (m === ' ' ? '~' : m === '~' ? 'x' : ' ')

/** Item que ainda pode ser delegado (a fazer ou em andamento). */
export const isOpenItem = (n: RoadmapNode): boolean => n.kind === 'item' && (n.mark === ' ' || n.mark === '~')

/** Ids dos itens abertos na subárvore (incluindo o próprio nó). */
export function openIds(n: RoadmapNode): string[] {
  const out: string[] = []
  const walk = (x: RoadmapNode): void => {
    if (isOpenItem(x)) out.push(x.id)
    x.children.forEach(walk)
  }
  walk(n)
  return out
}

/**
 * Monta a tarefa e as instruções para delegar vários itens do roadmap de uma vez:
 * em paralelo (subagentes), um commit por item, marcando [x] no arquivo.
 */
export function buildRoadmapDelegation(rows: RoadmapRow[]): { task: string; instructions: string; title: string } {
  const label = (n: RoadmapNode): string => (n.num != null ? `#${n.num}` : '(sem número)')
  const nums = rows.map((r) => label(r.node)).join(', ')
  const lines: string[] = [`Itens do roadmap (ROADMAP_RICKOS.md) a implementar — ${nums}:`]
  let group = ''
  for (const r of rows) {
    const g = [r.area, r.feature].filter(Boolean).join(' › ')
    if (g !== group) {
      lines.push('', g ? `**${g}**` : '**(sem área)**')
      group = g
    }
    const meta = [r.node.mark === '~' ? 'em andamento' : '', r.node.version ? `@${r.node.version}` : '', r.node.priority ? `!${r.node.priority}` : '']
      .filter(Boolean)
      .join(', ')
    lines.push(`- ${label(r.node)} ${r.node.text}${r.parent ? ` (parte de: ${r.parent})` : ''}${meta ? ` [${meta}]` : ''}`)
  }
  const instructions = `Regras para executar estes ${rows.length} itens (mantenha-as no prompt final):
- Trabalhe em PARALELO: use subagentes (ferramenta Agent) para os itens independentes; um item que depende de outro vai depois dele.
- UM COMMIT POR ITEM, nunca misture itens no mesmo commit. Os subagentes não commitam: você faz os commits um a um, adicionando só os arquivos daquele item (\`git add <arquivos>\`, nunca \`git add -A\`).
- Mensagem de commit no padrão do repositório, com o número do item numa linha do corpo: \`Roadmap-Item: 12\`.
- NÃO altere o ROADMAP_RICKOS.md: os itens já estão como em andamento e o usuário marca como concluído depois de validar.
- Item que não puder ser concluído: não commite pela metade; deixe-o como está e explique no fim.
- Não faça push. No fim, liste item → hash do commit.`
  const title = rows.length === 1 ? `${label(rows[0].node)} ${rows[0].node.text}` : `Roadmap ${nums}`
  return { task: lines.join('\n'), instructions, title }
}
