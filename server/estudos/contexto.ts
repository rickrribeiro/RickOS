import crypto from 'crypto'
import type { Database } from 'sql.js'
import { treeOrder, type NodeRow, type TopicRow } from './repo'
import { all, one } from './sql'

/**
 * Recortes de contexto que o app ENVIA ao provedor (o Codex roda local, mas este texto vai para a
 * OpenAI). Só material de Estudos do próprio tópico — nada de Memória Pessoal (decisão do usuário).
 * Orçamentos em caracteres para manter o custo previsível. Prompts/contexto em pt.
 */
export const ORCAMENTO = { notas: 9000, fontes: 4000, notaNo: 6000, turnos: 9000, tentativas: 1500 }

export const assinatura = (...partes: string[]): string => crypto.createHash('sha1').update(partes.join('\u0001')).digest('hex').slice(0, 16)

const corta = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n)}\n[…cortado: ${s.length - n} caracteres]` : s)

export function idiomaDe(t: TopicRow): { idioma: string; idiomaAlvo: string } {
  return { idioma: t.explanationLanguage || 'pt-BR', idiomaAlvo: t.kind === 'language' ? t.targetLanguage || '—' : '—' }
}

export function cabecalhoTopico(t: TopicRow): string {
  return [
    `Tópico: ${t.name}`,
    `Tipo: ${t.kind === 'language' ? `idioma (idioma-alvo: ${t.targetLanguage ?? 'não informado'})` : 'tema (engenharia etc.)'}`,
    `Objetivo declarado: ${t.goal || '(não informado)'}`,
    `Idioma das explicações: ${t.explanationLanguage || 'pt-BR'}`
  ].join('\n')
}

/** Mapa do tópico com IDs, hierarquia e status (para E e para o A "repensar"). */
export function mapaComIds(nodes: NodeRow[]): string {
  const by = new Map(nodes.map((n) => [n.id, n]))
  const depth = (n: NodeRow): number => {
    let d = 0
    let c: NodeRow | undefined = n
    while (c?.parentId != null && by.has(c.parentId) && d < 20) {
      c = by.get(c.parentId)
      d++
    }
    return d
  }
  const ordered = treeOrder(nodes)
  if (!ordered.length) return '(mapa vazio)'
  return ordered.map((n) => `${'  '.repeat(depth(n))}- [id ${n.id}] ${n.title}${n.status === 'done' ? ' (concluído)' : ''}${n.origin === 'plan' ? ' (roteiro)' : ''}`).join('\n')
}

export function contextoMasterclass(db: Database, t: TopicRow): string {
  const nodes = all<NodeRow>(db, 'SELECT * FROM study_nodes WHERE topicId = ?', [t.id])
  const notes = all<{ nodeId: number | null; content: string }>(db, "SELECT nodeId, content FROM study_notes WHERE topicId = ? AND TRIM(content) <> ''", [t.id])
  const titleOf = new Map(nodes.map((n) => [n.id, n.title]))
  let budget = ORCAMENTO.notas
  const notasTxt: string[] = []
  for (const n of notes) {
    if (budget <= 0) break
    const piece = corta(n.content.trim(), Math.min(2500, budget))
    budget -= piece.length
    notasTxt.push(`### ${n.nodeId == null ? 'Nota geral do tópico' : titleOf.get(n.nodeId) ?? 'item'}\n${piece}`)
  }
  const sources = all<{ title: string; content: string; url: string | null; locator: string | null }>(db, 'SELECT title, content, url, locator FROM study_sources WHERE topicId = ? ORDER BY updatedAt DESC', [t.id])
  let fb = ORCAMENTO.fontes
  const fontesTxt: string[] = []
  for (const s of sources) {
    if (fb <= 0) break
    const piece = corta(s.content.trim(), Math.min(1200, fb))
    fb -= piece.length
    fontesTxt.push(`### ${s.title}${s.url ? ` <${s.url}>` : ''}${s.locator ? ` (${s.locator})` : ''}\n${piece}`)
  }
  const plano = one<{ content: string }>(db, "SELECT content FROM study_plans WHERE topicId = ? AND status = 'approved' ORDER BY approvedAt DESC LIMIT 1", [t.id])
  return [
    cabecalhoTopico(t),
    `## Mapa atual (com IDs)\n${mapaComIds(nodes)}`,
    plano ? `## Roteiro aprovado anterior (resumo)\n${resumoPlano(plano.content)}` : '',
    notasTxt.length ? `## Minhas notas (recortes)\n${notasTxt.join('\n\n')}` : '## Minhas notas\n(nenhuma)',
    fontesTxt.length ? `## Materiais externos (recortes)\n${fontesTxt.join('\n\n')}` : ''
  ]
    .filter(Boolean)
    .join('\n\n')
}

function resumoPlano(json: string): string {
  try {
    const p = JSON.parse(json)
    return (p.partes ?? []).map((pt: { titulo: string; modulos?: { titulo: string }[] }) => `- ${pt.titulo}: ${(pt.modulos ?? []).map((m) => m.titulo).join('; ')}`).join('\n')
  } catch {
    return ''
  }
}

export interface TurnoCtx {
  role: string
  content: string
}

export function contextoAula(
  db: Database,
  t: TopicRow,
  lesson: { nodeId: number | null; title: string; openQuestion: string | null; returnPoint: string | null },
  turnos: TurnoCtx[]
): string {
  const node = lesson.nodeId != null ? one<NodeRow>(db, 'SELECT * FROM study_nodes WHERE id = ?', [lesson.nodeId]) : null
  const nota = lesson.nodeId != null ? one<{ content: string }>(db, 'SELECT content FROM study_notes WHERE nodeId = ?', [lesson.nodeId])?.content ?? '' : ''
  const tentativas = lesson.nodeId != null
    ? all<{ prompt: string; answer: string | null; outcome: string }>(
        db,
        `SELECT q.prompt, a.answer, a.outcome FROM study_attempts a JOIN study_questions q ON q.id = a.questionId
         WHERE q.nodeId = ? ORDER BY a.createdAt DESC LIMIT 5`,
        [lesson.nodeId]
      )
    : []
  // turnos mais recentes primeiro até o orçamento, depois na ordem certa
  let budget = ORCAMENTO.turnos
  const recentes: string[] = []
  for (const tr of [...turnos].reverse()) {
    const piece = `${tr.role === 'me' ? 'EU' : 'TUTOR'}: ${corta(tr.content.trim(), 1800)}`
    if (budget - piece.length < 0 && recentes.length) break
    budget -= piece.length
    recentes.unshift(piece)
  }
  return [
    cabecalhoTopico(t),
    `## Módulo\n${lesson.title}${node?.description ? `\n${node.description}` : ''}`,
    lesson.openQuestion ? `## Pergunta aberta\n${lesson.openQuestion}` : '',
    lesson.returnPoint ? `## Ponto de retorno\n${lesson.returnPoint}` : '',
    recentes.length ? `## Turnos anteriores (${recentes.length} de ${turnos.length})\n${recentes.join('\n\n')}` : '## Turnos anteriores\n(início da aula)',
    tentativas.length ? `## Minhas tentativas recentes neste item\n${tentativas.map((a) => `- ${a.prompt} → ${a.answer ?? '(sem resposta)'} [${a.outcome}]`).join('\n')}` : '',
    nota.trim() ? `## Minha nota deste item (recorte)\n${corta(nota.trim(), ORCAMENTO.notaNo)}` : ''
  ]
    .filter(Boolean)
    .join('\n\n')
}

export interface ContextoNo {
  contexto: string
  /** Assinatura da minha nota (para "material anterior à última edição"). */
  noteSignature: string
  /** Assinatura das entradas relevantes (nota, aula, fontes, mapa, tentativas). */
  inputSignature: string
  temNotaAutoral: boolean
}

/** Contexto do material do nó (C/D/E). nodeId null = tópico inteiro. */
export function contextoNo(db: Database, t: TopicRow, nodeId: number | null, opts: { vocabulario?: string[] } = {}): ContextoNo {
  const nodes = all<NodeRow>(db, 'SELECT * FROM study_nodes WHERE topicId = ?', [t.id])
  const node = nodeId != null ? nodes.find((n) => n.id === nodeId) ?? null : null
  const nota =
    (nodeId == null
      ? one<{ content: string }>(db, 'SELECT content FROM study_notes WHERE topicId = ? AND nodeId IS NULL', [t.id])
      : one<{ content: string }>(db, 'SELECT content FROM study_notes WHERE nodeId = ?', [nodeId]))?.content ?? ''
  const fontes = all<{ title: string; content: string; locator: string | null }>(
    db,
    'SELECT title, content, locator FROM study_sources WHERE topicId = ? AND IFNULL(nodeId, -1) = IFNULL(?, -1) ORDER BY updatedAt DESC',
    [t.id, nodeId]
  )
  const lesson = one<{ id: number }>(db, 'SELECT id FROM study_lessons WHERE topicId = ? AND IFNULL(nodeId, -1) = IFNULL(?, -1) ORDER BY id DESC LIMIT 1', [t.id, nodeId])
  const turnos = lesson ? all<{ role: string; content: string }>(db, 'SELECT role, content FROM study_lesson_turns WHERE lessonId = ? ORDER BY id', [lesson.id]) : []
  const tentativas = all<{ prompt: string; answer: string | null; outcome: string }>(
    db,
    `SELECT q.prompt, a.answer, a.outcome FROM study_attempts a JOIN study_questions q ON q.id = a.questionId
     WHERE q.topicId = ? AND (? IS NULL OR q.nodeId = ?) ORDER BY a.createdAt DESC LIMIT 8`,
    [t.id, nodeId, nodeId]
  )
  const cartoes = all<{ front: string }>(db, "SELECT front FROM study_flashcards WHERE topicId = ? AND (? IS NULL OR nodeId = ?) AND status <> 'suggested' LIMIT 80", [t.id, nodeId, nodeId])
  const recusas = all<{ kind: string; payload: string }>(db, "SELECT kind, payload FROM study_suggestions WHERE topicId = ? AND status = 'rejected' ORDER BY id DESC LIMIT 30", [t.id])
  const recusasTxt = recusas
    .map((r) => {
      try {
        const p = JSON.parse(r.payload)
        return r.kind === 'subtopic' ? `- subtópico recusado: ${p.titulo}` : `- edição recusada sobre "${String(p.trecho ?? '').slice(0, 80)}"`
      } catch {
        return ''
      }
    })
    .filter(Boolean)
  let budget = ORCAMENTO.turnos
  const aula: string[] = []
  for (const tr of [...turnos].reverse()) {
    const piece = `${tr.role === 'me' ? 'EU' : 'TUTOR'}: ${corta(tr.content.trim(), 1500)}`
    if (budget - piece.length < 0 && aula.length) break
    budget -= piece.length
    aula.unshift(piece)
  }
  const fontesTxt = fontes.slice(0, 4).map((f) => `### ${f.title}${f.locator ? ` (${f.locator})` : ''}\n${corta(f.content.trim(), 1500)}`)
  const temNotaAutoral = !!nota.trim()
  const contexto = [
    cabecalhoTopico(t),
    `## Mapa completo (com IDs)\n${mapaComIds(nodes)}`,
    `## Item selecionado\n${node ? `[id ${node.id}] ${node.title}${node.description ? `\n${node.description}` : ''}` : 'Tópico inteiro (visão geral)'}`,
    temNotaAutoral ? `## Minha nota (autoral)\n${corta(nota.trim(), ORCAMENTO.notaNo)}` : '## Minha nota (autoral)\n(vazia — deixe a revisão editorial vazia)',
    fontesTxt.length ? `## Material externo deste item\n${fontesTxt.join('\n\n')}` : '',
    aula.length ? `## Aula gerada (turnos recentes)\n${aula.join('\n\n')}` : '',
    tentativas.length ? `## Minhas tentativas recentes\n${tentativas.map((a) => `- ${a.prompt} → ${a.answer ?? '(sem resposta)'} [${a.outcome}]`).join('\n')}` : '',
    cartoes.length ? `## Cartões que já existem (não duplicar)\n${cartoes.map((c) => `- ${c.front}`).join('\n')}` : '',
    opts.vocabulario?.length ? `## Cobertura de vocabulário escolhida (cubra todos, sem duplicar)\n${opts.vocabulario.map((v) => `- ${v}`).join('\n')}` : '',
    recusasTxt.length ? `## Recusas anteriores (não reapresente)\n${recusasTxt.join('\n')}` : ''
  ]
    .filter(Boolean)
    .join('\n\n')
  const noteSignature = assinatura(nota)
  return { contexto, noteSignature, inputSignature: assinatura(contexto), temNotaAutoral }
}
