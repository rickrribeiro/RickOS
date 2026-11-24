/**
 * Numeração incremental dos itens do ROADMAP_RICKOS.md: `- [ ] #12 Tarefa`.
 * O número é um ID estável (não é posição): nunca se renumera nem se reaproveita.
 * Item novo recebe o maior número do arquivo + 1.
 */

/** Item com checkbox: indentação, marcador, checkbox e o resto do texto. */
const CHECK_ITEM = /^(\s*[-*+]\s+\[(?: |x|X|~|-)\]\s+)(.*)$/
/** `#12` no início do texto do item. */
export const ROADMAP_NUM = /^#(\d+)(?:\s+|$)/

function isQuote(line: string): boolean {
  return line.trimStart().startsWith('>')
}

/** Maior número já usado no arquivo (0 se nenhum). */
export function maxRoadmapNumber(content: string): number {
  let max = 0
  for (const line of content.split('\n')) {
    if (isQuote(line)) continue
    const m = line.match(CHECK_ITEM)
    const n = m?.[2].match(ROADMAP_NUM)
    if (n) max = Math.max(max, Number(n[1]))
  }
  return max
}

/** Quantos itens com checkbox ainda estão sem número. */
export function unnumberedRoadmapItems(content: string): number {
  return content.split('\n').filter((l) => !isQuote(l) && CHECK_ITEM.test(l) && !l.match(CHECK_ITEM)![2].match(ROADMAP_NUM)).length
}

/** Numera, na ordem do arquivo, os itens com checkbox que ainda não têm `#N`. Não mexe nos já numerados. */
export function numberRoadmap(content: string): { content: string; added: number } {
  let next = maxRoadmapNumber(content) + 1
  let added = 0
  const lines = content.split('\n').map((line) => {
    if (isQuote(line)) return line
    const m = line.match(CHECK_ITEM)
    if (!m || ROADMAP_NUM.test(m[2])) return line
    added++
    return `${m[1]}#${next++} ${m[2]}`
  })
  return { content: lines.join('\n'), added }
}
