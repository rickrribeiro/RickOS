import crypto from 'crypto'
import type { Database } from 'sql.js'
import { treeOrder, type NodeRow, type TopicRow } from './repo'
import { all, one } from './sql'

/**
 * Recortes de contexto que o app ENVIA ao provedor (o Codex roda local, mas este texto vai para a
 * OpenAI). Só material de Estudos do próprio tópico — nada de Memória Pessoal (decisão do usuário).
 * Orçamentos em caracteres para manter o custo previsível. Prompts/contexto em pt.
 */
export const ORCAMENTO = {
  notas: 9000,
  fontes: 4000,
  notaNo: 6000,
  tentativas: 1500,
  /** Turnos da aula (fora a abertura e o último turno do tutor, que têm cota própria). */
  turnos: 9000,
  /** Pedido original do roteiro (um briefing colado pode ser longo). */
  briefing: 4000,
  /** Abertura didática da aula (1º turno, vindo do roteiro). */
  abertura: 4000,
  /** Último turno do tutor: vai inteiro (até aqui), porque o follow-up costuma citar o fim dele. */
  ultimoTutor: 6000,
  /** Cada turno antigo dentro de `turnos`. */
  turnoAntigo: 1800,
  /** Linhas-resumo dos turnos que não couberam (sem IA: a partir do que já está salvo). */
  omitidos: 1500
}

export const assinatura = (...partes: string[]): string => crypto.createHash('sha1').update(partes.join('\u0001')).digest('hex').slice(0, 16)

const corta = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n)}\n[…cortado: ${s.length - n} caracteres]` : s)

/** Corte que preserva começo E fim (o fim de um turno costuma ter a pergunta e o detalhe citado depois). */
export function cortaMeio(s: string, n: number): string {
  if (s.length <= n) return s
  const cab = Math.floor(n * 0.55)
  const pe = n - cab
  return `${s.slice(0, cab)}\n[…${s.length - n} caracteres omitidos no meio…]\n${s.slice(s.length - pe)}`
}

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
  payload?: string | null
}

const linha1 = (s: string, n: number): string => {
  const l = s.replace(/\s+/g, ' ').trim()
  return l.length > n ? `${l.slice(0, n)}…` : l
}

/**
 * Turnos que vão ao provedor, com orçamento previsível e SEM IA:
 *  - a abertura do roteiro (1º turno) entra com cota própria, cortada no meio se for enorme;
 *  - o último turno do tutor entra inteiro (até `ultimoTutor`): o próximo turno costuma citar o fim dele;
 *  - os demais, dos mais recentes para os mais antigos, cortados no meio até o orçamento;
 *  - o que não couber vira uma linha cada (minha pergunta / pergunta aberta salva do tutor).
 */
export function turnosParaContexto(turnos: TurnoCtx[], orc = ORCAMENTO): { texto: string; completos: number; total: number } {
  if (!turnos.length) return { texto: '', completos: 0, total: 0 }
  const rot = (tr: TurnoCtx): string => (tr.role === 'me' ? 'EU' : 'TUTOR')
  const payload = (tr: TurnoCtx): Record<string, unknown> => {
    try {
      return tr.payload ? JSON.parse(tr.payload) : {}
    } catch {
      return {}
    }
  }
  const out = new Map<number, string>()
  const aberturaIdx = turnos[0].role === 'tutor' && payload(turnos[0]).doPlano ? 0 : -1
  if (aberturaIdx === 0) out.set(0, `TUTOR (abertura do roteiro): ${cortaMeio(turnos[0].content.trim(), orc.abertura)}`)
  let ultimoTutor = -1
  for (let i = turnos.length - 1; i >= 0; i--) if (turnos[i].role === 'tutor') { ultimoTutor = i; break }
  if (ultimoTutor > 0) out.set(ultimoTutor, `TUTOR (último turno, completo): ${cortaMeio(turnos[ultimoTutor].content.trim(), orc.ultimoTutor)}`)
  let budget = orc.turnos
  let parou = false
  for (let i = turnos.length - 1; i >= 0; i--) {
    if (out.has(i)) continue
    const piece = `${rot(turnos[i])}: ${cortaMeio(turnos[i].content.trim(), orc.turnoAntigo)}`
    if (parou || budget - piece.length < 0) {
      parou = true
      continue
    }
    budget -= piece.length
    out.set(i, piece)
  }
  // omitidos: uma linha cada, do que já está salvo (minha fala; pergunta aberta/retomada do tutor)
  let ob = orc.omitidos
  const resumo: string[] = []
  turnos.forEach((tr, i) => {
    if (out.has(i)) return
    const p = payload(tr)
    const l = tr.role === 'me' ? `- EU perguntei/respondi: ${linha1(tr.content, 160)}` : `- TUTOR: ${linha1(String(p.perguntaAberta || p.fraseDeRetomada || tr.content), 160)}`
    if (ob - l.length < 0) return
    ob -= l.length
    resumo.push(l)
  })
  const corpo: string[] = []
  let resumoPosto = false
  turnos.forEach((_, i) => {
    if (out.has(i)) corpo.push(out.get(i)!)
    else if (!resumoPosto && resumo.length) {
      corpo.push(`[turnos mais antigos resumidos, sem IA]\n${resumo.join('\n')}`)
      resumoPosto = true
    }
  })
  return { texto: corpo.join('\n\n'), completos: out.size, total: turnos.length }
}

interface PlanoSalvo {
  id: number
  request: string
  content: string
  status: string
}

/** Plano que criou o nó (ou um ancestral dele); null para nós que eu criei à mão. */
export function planoDoNo(db: Database, nodeId: number | null): number | null {
  let cur = nodeId
  for (let guard = 0; cur != null && guard < 20; guard++) {
    const n = one<{ parentId: number | null; planId: number | null }>(db, 'SELECT parentId, planId FROM study_nodes WHERE id = ?', [cur])
    if (!n) return null
    if (n.planId != null) return n.planId
    cur = n.parentId
  }
  return null
}

/**
 * Plano (roteiro) que originou esta aula: o da aula → o do nó → o de um ancestral → o roteiro
 * aprovado mais recente do tópico. Assim cada aula usa o briefing certo mesmo com vários planos.
 */
export function planoDaAula(db: Database, topicId: number, lesson: { planId?: number | null; nodeId: number | null }): PlanoSalvo | null {
  const byId = (id: number | null | undefined): PlanoSalvo | null => (id == null ? null : one<PlanoSalvo>(db, 'SELECT id, request, content, status FROM study_plans WHERE id = ?', [id]))
  return (
    byId(lesson.planId) ??
    byId(planoDoNo(db, lesson.nodeId)) ??
    one<PlanoSalvo>(db, "SELECT id, request, content, status FROM study_plans WHERE topicId = ? AND status = 'approved' ORDER BY approvedAt DESC LIMIT 1", [topicId])
  )
}

/** Briefing que acompanha a aula: meu pedido original + o que o roteiro registrou dele. */
export function briefingDoPlano(plano: PlanoSalvo): string {
  let c: Record<string, unknown> = {}
  try {
    c = JSON.parse(plano.content)
  } catch { /* conteúdo antigo/ilegível: fica só o pedido */ }
  const lista = (k: string): string[] => (Array.isArray(c[k]) ? (c[k] as unknown[]).map(String).filter((x) => x.trim()) : [])
  const txt = (k: string): string => (typeof c[k] === 'string' ? String(c[k]).trim() : '')
  const linhas = [
    txt('situacao') && `- Situação: ${txt('situacao')}`,
    txt('jaSei') && `- Já sei: ${txt('jaSei')}`,
    lista('restricoes').length ? `- Restrições: ${lista('restricoes').join('; ')}` : '',
    lista('preferenciasEnsino').length ? `- Preferências de ensino: ${lista('preferenciasEnsino').join('; ')}` : '',
    lista('decisoesEmAberto').length ? `- Decisões em aberto (não decida por mim): ${lista('decisoesEmAberto').join('; ')}` : '',
    lista('suposicoes').length ? `- Suposições do roteiro: ${lista('suposicoes').join('; ')}` : '',
    txt('demonstracaoFinal') && `- Entrega final: ${txt('demonstracaoFinal')}`
  ].filter(Boolean)
  return [`### Meu pedido original\n${cortaMeio(plano.request.trim(), ORCAMENTO.briefing)}`, linhas.length ? `### O que o roteiro registrou\n${linhas.join('\n')}` : '']
    .filter(Boolean)
    .join('\n\n')
}

/** Onde esta aula está no roteiro (pela árvore real, que reflete minhas edições). */
function posicaoNoRoteiro(db: Database, planId: number, nodeId: number | null): string {
  if (nodeId == null) return ''
  const nodes = all<NodeRow>(db, 'SELECT * FROM study_nodes WHERE planId = ?', [planId])
  const ordem = treeOrder(nodes)
  const modulos = ordem.filter((n) => n.parentId != null)
  const i = modulos.findIndex((n) => n.id === nodeId)
  if (i < 0) return ''
  const parte = nodes.find((n) => n.id === modulos[i].parentId)
  return [
    `${parte ? `${parte.title} › ` : ''}${modulos[i].title} (${i + 1} de ${modulos.length})`,
    i > 0 ? `Anterior: ${modulos[i - 1].title}${modulos[i - 1].status === 'done' ? ' (concluído)' : ''}` : '',
    i < modulos.length - 1 ? `Próximo: ${modulos[i + 1].title}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

export function contextoAula(
  db: Database,
  t: TopicRow,
  lesson: { nodeId: number | null; planId?: number | null; title: string; openQuestion: string | null; returnPoint: string | null },
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
  const plano = planoDaAula(db, t.id, lesson)
  const posicao = plano ? posicaoNoRoteiro(db, plano.id, lesson.nodeId) : ''
  const tr = turnosParaContexto(turnos)
  return [
    cabecalhoTopico(t),
    plano ? `## Briefing do roteiro\n${briefingDoPlano(plano)}` : '',
    `## Módulo\n${lesson.title}${node?.description ? `\n${node.description}` : ''}`,
    posicao ? `## Onde esta aula está no roteiro\n${posicao}` : '',
    lesson.openQuestion ? `## Pergunta aberta da aula\n${lesson.openQuestion}` : '',
    lesson.returnPoint ? `## Ponto de retorno\n${lesson.returnPoint}` : '',
    tr.total ? `## Turnos anteriores (${tr.completos} de ${tr.total} no texto)\n${tr.texto}` : '## Turnos anteriores\n(início da aula)',
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
  const turnos = lesson ? all<TurnoCtx>(db, 'SELECT role, content, payload FROM study_lesson_turns WHERE lessonId = ? ORDER BY id', [lesson.id]) : []
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
  // material do nó: a aula é contexto secundário → cotas menores (total ≈ o orçamento antigo)
  const aula = turnosParaContexto(turnos, { ...ORCAMENTO, turnos: 5000, abertura: 2000, ultimoTutor: 2000, turnoAntigo: 1500, omitidos: 800 })
  const fontesTxt = fontes.slice(0, 4).map((f) => `### ${f.title}${f.locator ? ` (${f.locator})` : ''}\n${corta(f.content.trim(), 1500)}`)
  const temNotaAutoral = !!nota.trim()
  const contexto = [
    cabecalhoTopico(t),
    `## Mapa completo (com IDs)\n${mapaComIds(nodes)}`,
    `## Item selecionado\n${node ? `[id ${node.id}] ${node.title}${node.description ? `\n${node.description}` : ''}` : 'Tópico inteiro (visão geral)'}`,
    temNotaAutoral ? `## Minha nota (autoral)\n${corta(nota.trim(), ORCAMENTO.notaNo)}` : '## Minha nota (autoral)\n(vazia — deixe a revisão editorial vazia)',
    fontesTxt.length ? `## Material externo deste item\n${fontesTxt.join('\n\n')}` : '',
    aula.total ? `## Aula gerada (turnos recentes)\n${aula.texto}` : '',
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
