import type { Database } from 'sql.js'
import { tt } from '../i18n'
import { treeOrder, type NodeRow, type TopicRow } from './repo'
import { all, exec, nowIso, one, read, StudyError, tx } from './sql'
import type { ModeloAula, ModeloItem, ModeloPreview, ModeloRoadmap, ModeloImportOpts } from '../../shared/estudos'
export type { ModeloAula, ModeloItem, ModeloPreview, ModeloRoadmap, ModeloImportOpts }

/**
 * Modelo de roadmap: um arquivo JSON legível (e editável à mão) com a ÁRVORE do roteiro, o briefing
 * que o gerou e, se eu quiser, o conteúdo das aulas e as minhas notas. Serve para reaproveitar uma
 * trilha em outro tópico/instalação ou compartilhar. Não leva progresso, agenda SRS, cartões nem
 * execuções de IA. Importar não chama IA: os turnos já vêm prontos e reabrir a aula é zero chamadas.
 */
export const MODELO_FORMATO = 'rickos-roteiro'
export const MODELO_VERSAO = 1

const LIM = { itens: 600, profundidade: 12, texto: 200_000, turnos: 400 }

type Turno = { role: string; content: string; payload: string | null }

function aulaDe(db: Database, topicId: number, nodeId: number | null): ModeloAula | null {
  const l = one<{ id: number; title: string; openQuestion: string | null; resumePhrase: string | null }>(
    db,
    'SELECT id, title, openQuestion, resumePhrase FROM study_lessons WHERE topicId = ? AND IFNULL(nodeId, -1) = IFNULL(?, -1) ORDER BY id DESC LIMIT 1',
    [topicId, nodeId]
  )
  if (!l) return null
  const turnos = all<Turno>(db, 'SELECT role, content, payload FROM study_lesson_turns WHERE lessonId = ? ORDER BY id', [l.id])
  if (!turnos.length) return null
  return {
    titulo: l.title,
    perguntaAberta: l.openQuestion,
    fraseDeRetomada: l.resumePhrase,
    turnos: turnos.map((x) => {
      let extra: Record<string, unknown> | null = null
      try {
        extra = x.payload ? JSON.parse(x.payload) : null
      } catch { /* payload antigo */ }
      return { papel: x.role === 'me' ? 'eu' : 'tutor', conteudo: x.content, ...(extra ? { extra } : {}) }
    })
  }
}

/** Monta o modelo do tópico (sem IA). */
export async function exportarModelo(topicId: number, opts: { aulas?: boolean; notas?: boolean } = {}): Promise<{ nome: string; conteudo: string }> {
  const aulas = opts.aulas !== false
  const notas = opts.notas === true
  return read((db) => {
    const t = one<TopicRow>(db, 'SELECT * FROM study_topics WHERE id = ?', [topicId])
    if (!t) throw new StudyError(tt('estudos.topicoNaoEncontrado'))
    const nodes = treeOrder(all<NodeRow>(db, 'SELECT * FROM study_nodes WHERE topicId = ?', [topicId]))
    const nota = (nodeId: number | null): string =>
      (nodeId == null
        ? one<{ content: string }>(db, 'SELECT content FROM study_notes WHERE topicId = ? AND nodeId IS NULL', [topicId])
        : one<{ content: string }>(db, 'SELECT content FROM study_notes WHERE nodeId = ?', [nodeId]))?.content.trim() ?? ''
    const filhos = (parentId: number | null): ModeloItem[] =>
      nodes
        .filter((n) => (n.parentId ?? null) === parentId)
        .map((n) => {
          const item: ModeloItem = { titulo: n.title }
          if (n.description) item.descricao = n.description
          if (n.estimatedHours) item.horas = n.estimatedHours
          const a = aulas ? aulaDe(db, topicId, n.id) : null
          if (a) item.aula = a
          const nt = notas ? nota(n.id) : ''
          if (nt) item.nota = nt
          const f = filhos(n.id)
          if (f.length) item.itens = f
          return item
        })
    const plano = one<{ request: string; content: string }>(db, "SELECT request, content FROM study_plans WHERE topicId = ? AND status = 'approved' ORDER BY approvedAt DESC LIMIT 1", [topicId])
    let planoJson: Record<string, unknown> | null = null
    try {
      planoJson = plano ? JSON.parse(plano.content) : null
    } catch { /* fica só o pedido */ }
    const modelo: ModeloRoadmap = {
      formato: MODELO_FORMATO,
      versao: MODELO_VERSAO,
      topico: {
        nome: t.name,
        tipo: t.kind === 'language' ? 'idioma' : 'tema',
        ...(t.targetLanguage ? { idiomaAlvo: t.targetLanguage } : {}),
        ...(t.explanationLanguage ? { idiomaExplicacao: t.explanationLanguage } : {}),
        ...(t.goal ? { objetivo: t.goal } : {}),
        ...(t.category ? { categoria: t.category } : {})
      },
      ...(plano ? { roteiro: { pedido: plano.request, ...(planoJson ? { plano: planoJson } : {}) } } : {}),
      itens: filhos(null)
    }
    const geral = aulas ? aulaDe(db, topicId, null) : null
    if (geral) modelo.aulaGeral = geral
    const ng = notas ? nota(null) : ''
    if (ng) modelo.notaGeral = ng
    const slug = t.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'roteiro'
    return { nome: `${slug}.roteiro.json`, conteudo: JSON.stringify(modelo, null, 2) }
  })
}

// ── validar ──────────────────────────────────────────────────────────────────

const str = (v: unknown, max = LIM.texto): string | null => (typeof v === 'string' ? v.slice(0, max) : null)

function validarAula(a: unknown, onde: string, erros: string[]): ModeloAula | null {
  if (a == null) return null
  const x = a as Record<string, unknown>
  if (typeof x !== 'object' || !Array.isArray(x.turnos)) {
    erros.push(tt('estudos.modeloAulaInvalida', { onde }))
    return null
  }
  const turnos = (x.turnos as unknown[]).slice(0, LIM.turnos).flatMap((tr) => {
    const r = tr as Record<string, unknown>
    const conteudo = str(r?.conteudo)
    if (!conteudo?.trim()) return []
    const extra = r.extra && typeof r.extra === 'object' ? (r.extra as Record<string, unknown>) : undefined
    return [{ papel: r.papel === 'eu' ? ('eu' as const) : ('tutor' as const), conteudo, ...(extra ? { extra } : {}) }]
  })
  if (!turnos.length) return null
  return { titulo: str(x.titulo, 300) ?? '', perguntaAberta: str(x.perguntaAberta, 2000), fraseDeRetomada: str(x.fraseDeRetomada, 2000), turnos }
}

interface Validado {
  modelo: ModeloRoadmap
  erros: string[]
  itens: number
  aulas: number
  turnos: number
  notas: number
}

/** Lê o JSON, normaliza e conta. Erros = o que impede importar. */
export function validarModelo(raw: unknown): Validado {
  const erros: string[] = []
  let m: Record<string, unknown>
  try {
    m = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>
  } catch {
    throw new StudyError(tt('estudos.modeloIlegivel'))
  }
  if (!m || typeof m !== 'object' || m.formato !== MODELO_FORMATO) throw new StudyError(tt('estudos.modeloNaoE'))
  if (Number(m.versao) > MODELO_VERSAO) throw new StudyError(tt('estudos.modeloVersao', { versao: String(m.versao) }))
  const tp = (m.topico ?? {}) as Record<string, unknown>
  let itens = 0
  let aulas = 0
  let turnos = 0
  let notas = 0
  const normItens = (lista: unknown, prof: number, onde: string): ModeloItem[] => {
    if (lista == null) return []
    if (!Array.isArray(lista)) {
      erros.push(tt('estudos.modeloItensInvalidos', { onde }))
      return []
    }
    if (prof > LIM.profundidade) {
      erros.push(tt('estudos.modeloProfundo'))
      return []
    }
    return lista.flatMap((it, i) => {
      const x = it as Record<string, unknown>
      const titulo = str(x?.titulo, 300)?.trim()
      const aqui = `${onde} › ${titulo || `#${i + 1}`}`
      if (!titulo) {
        erros.push(tt('estudos.modeloItemSemTitulo', { onde: aqui }))
        return []
      }
      if (++itens > LIM.itens) {
        if (itens === LIM.itens + 1) erros.push(tt('estudos.modeloGrande', { max: LIM.itens }))
        return []
      }
      const item: ModeloItem = { titulo }
      const d = str(x.descricao)
      if (d) item.descricao = d
      if (typeof x.horas === 'number' && x.horas > 0) item.horas = Math.min(x.horas, 1000)
      const a = validarAula(x.aula, aqui, erros)
      if (a) {
        item.aula = a
        aulas++
        turnos += a.turnos.length
      }
      const n = str(x.nota)
      if (n?.trim()) {
        item.nota = n
        notas++
      }
      const f = normItens(x.itens, prof + 1, aqui)
      if (f.length) item.itens = f
      return [item]
    })
  }
  const lista = normItens(m.itens, 1, '')
  const geral = validarAula(m.aulaGeral, tt('estudos.modeloGeral'), erros)
  if (geral) {
    aulas++
    turnos += geral.turnos.length
  }
  const rot = (m.roteiro ?? null) as Record<string, unknown> | null
  const modelo: ModeloRoadmap = {
    formato: MODELO_FORMATO,
    versao: MODELO_VERSAO,
    topico: {
      nome: str(tp.nome, 200)?.trim() || 'Roteiro importado',
      tipo: tp.tipo === 'idioma' ? 'idioma' : 'tema',
      ...(str(tp.idiomaAlvo, 20) ? { idiomaAlvo: str(tp.idiomaAlvo, 20)! } : {}),
      ...(str(tp.idiomaExplicacao, 20) ? { idiomaExplicacao: str(tp.idiomaExplicacao, 20)! } : {}),
      ...(str(tp.objetivo, 2000) ? { objetivo: str(tp.objetivo, 2000)! } : {}),
      ...(str(tp.categoria, 100) ? { categoria: str(tp.categoria, 100)! } : {})
    },
    ...(rot && str(rot.pedido)?.trim() ? { roteiro: { pedido: str(rot.pedido)!, ...(rot.plano && typeof rot.plano === 'object' ? { plano: rot.plano as Record<string, unknown> } : {}) } } : {}),
    itens: lista,
    ...(geral ? { aulaGeral: geral } : {}),
    ...(str(m.notaGeral)?.trim() ? { notaGeral: str(m.notaGeral)! } : {})
  }
  if (modelo.notaGeral) notas++
  if (!lista.length) erros.push(tt('estudos.modeloVazio'))
  return { modelo, erros, itens: Math.min(itens, LIM.itens), aulas, turnos, notas }
}

/** Prévia: o que vai entrar e onde (nada é gravado). */
export async function previaModelo(raw: unknown, destinoTopicId: number | null): Promise<ModeloPreview> {
  const v = validarModelo(raw)
  const avisos: string[] = []
  if (destinoTopicId != null) {
    await read((db) => {
      if (!one(db, 'SELECT 1 FROM study_topics WHERE id = ?', [destinoTopicId])) throw new StudyError(tt('estudos.topicoNaoEncontrado'))
      if (v.modelo.aulaGeral && one(db, 'SELECT 1 FROM study_lessons WHERE topicId = ? AND nodeId IS NULL', [destinoTopicId])) avisos.push(tt('estudos.modeloAulaGeralExiste'))
      if (v.modelo.notaGeral && one(db, "SELECT 1 FROM study_notes WHERE topicId = ? AND nodeId IS NULL AND TRIM(content) <> ''", [destinoTopicId])) avisos.push(tt('estudos.modeloNotaGeralAnexada'))
      if (v.modelo.roteiro && one(db, "SELECT 1 FROM study_plans WHERE topicId = ? AND status = 'approved'", [destinoTopicId])) avisos.push(tt('estudos.modeloRoteiroVigente'))
    })
  }
  const resumo = (lista: ModeloItem[]): ModeloPreview['raiz'] =>
    lista.map((it) => {
      let n = 0
      let a = it.aula ? 1 : 0
      const conta = (l: ModeloItem[] | undefined): void => l?.forEach((x) => { n++; if (x.aula) a++; conta(x.itens) })
      conta(it.itens)
      return { titulo: it.titulo, subitens: n, aulas: a }
    })
  return {
    nome: v.modelo.topico.nome,
    tipo: v.modelo.topico.tipo,
    objetivo: v.modelo.topico.objetivo ?? null,
    pedido: v.modelo.roteiro?.pedido ?? null,
    itens: v.itens,
    aulas: v.aulas,
    turnos: v.turnos,
    notas: v.notas,
    raiz: resumo(v.modelo.itens),
    erros: v.erros,
    avisos
  }
}

/**
 * Importa numa transação só (falhou no meio → nada muda). Destino: tópico novo ou um existente, com
 * os itens DEPOIS dos que já estão lá (nada do que existe é apagado ou movido). Com roteiro, vira o
 * roteiro aprovado vigente e as aulas ficam ligadas a ele (o briefing acompanha as aulas).
 */
export async function importarModelo(raw: unknown, opts: ModeloImportOpts): Promise<{ topicId: number; itens: number; aulas: number; notas: number; primeiraAulaNodeId: number | null }> {
  const v = validarModelo(raw)
  if (v.erros.length) throw new StudyError(tt('estudos.modeloComErros', { erros: v.erros.slice(0, 5).join('; ') }))
  const m = v.modelo
  const incluirAulas = opts.aulas !== false
  const incluirNotas = opts.notas !== false
  return tx((db) => {
    const now = nowIso()
    let topicId: number
    if (opts.topicId != null) {
      if (!one(db, 'SELECT 1 FROM study_topics WHERE id = ?', [opts.topicId])) throw new StudyError(tt('estudos.topicoNaoEncontrado'))
      topicId = opts.topicId
    } else {
      const nome = (opts.nome ?? m.topico.nome).trim() || m.topico.nome
      topicId = exec(
        db,
        `INSERT INTO study_topics (name, category, status, priority, color, createdAt, kind, targetLanguage, explanationLanguage, goal, reviewWhenArchived, readingMode, uid)
         VALUES (?, ?, 'studying', 0, '#6366f1', ?, ?, ?, ?, ?, 0, 'hidden', lower(hex(randomblob(8))))`,
        [nome, m.topico.categoria ?? null, now, m.topico.tipo === 'idioma' ? 'language' : 'general', m.topico.idiomaAlvo ?? null, m.topico.idiomaExplicacao ?? null, m.topico.objetivo ?? null]
      )
    }
    let planId: number | null = null
    if (m.roteiro) {
      exec(db, "UPDATE study_plans SET status = 'superseded' WHERE topicId = ? AND status = 'approved'", [topicId])
      planId = exec(db, "INSERT INTO study_plans (topicId, request, status, content, runId, edited, createdAt, approvedAt) VALUES (?, ?, 'approved', ?, NULL, 0, ?, ?)", [
        topicId,
        m.roteiro.pedido,
        JSON.stringify(m.roteiro.plano ?? { partes: [] }),
        now,
        now
      ])
    }
    let itens = 0
    let aulas = 0
    let notas = 0
    let primeiraAulaNodeId: number | null = null
    const salvarAula = (nodeId: number | null, a: ModeloAula, tituloPadrao: string): void => {
      const lessonId = exec(db, 'INSERT INTO study_lessons (topicId, nodeId, planId, title, openQuestion, resumePhrase, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
        topicId,
        nodeId,
        planId,
        a.titulo || tituloPadrao,
        a.perguntaAberta ?? null,
        a.fraseDeRetomada ?? null,
        now,
        now
      ])
      for (const tr of a.turnos) {
        exec(db, 'INSERT INTO study_lesson_turns (lessonId, role, content, payload, createdAt) VALUES (?, ?, ?, ?, ?)', [
          lessonId,
          tr.papel === 'eu' ? 'me' : 'tutor',
          tr.conteudo,
          tr.extra ? JSON.stringify(tr.extra) : null,
          now
        ])
      }
      aulas++
    }
    const salvarNota = (nodeId: number | null, texto: string): void => {
      const cur = nodeId == null
        ? one<{ id: number; content: string }>(db, 'SELECT id, content FROM study_notes WHERE topicId = ? AND nodeId IS NULL', [topicId])
        : null
      if (cur) exec(db, 'UPDATE study_notes SET content = ?, updatedAt = ? WHERE id = ?', [cur.content.trim() ? `${cur.content.trimEnd()}\n\n${texto.trim()}\n` : `${texto.trim()}\n`, now, cur.id])
      else exec(db, 'INSERT INTO study_notes (topicId, nodeId, content, updatedAt) VALUES (?, ?, ?, ?)', [topicId, nodeId, `${texto.trim()}\n`, now])
      notas++
    }
    const inserir = (lista: ModeloItem[], parentId: number | null): void => {
      let ordem = parentId == null ? one<{ n: number }>(db, 'SELECT COALESCE(MAX(orderIndex), -1) + 1 AS n FROM study_nodes WHERE topicId = ? AND parentId IS NULL', [topicId])!.n : 0
      for (const it of lista) {
        const id = exec(
          db,
          "INSERT INTO study_nodes (topicId, parentId, title, description, status, orderIndex, estimatedHours, createdAt, origin, planId) VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?)",
          [topicId, parentId, it.titulo, it.descricao ?? null, ordem++, it.horas ?? null, now, planId != null ? 'plan' : 'manual', planId]
        )
        itens++
        if (incluirAulas && it.aula) {
          salvarAula(id, it.aula, it.titulo)
          primeiraAulaNodeId ??= id
        }
        if (incluirNotas && it.nota) salvarNota(id, it.nota)
        if (it.itens?.length) inserir(it.itens, id)
      }
    }
    inserir(m.itens, null)
    // aula/nota do tópico inteiro: só se o destino ainda não tem (nunca sobrescreve)
    if (incluirAulas && m.aulaGeral && !one(db, 'SELECT 1 FROM study_lessons WHERE topicId = ? AND nodeId IS NULL', [topicId])) salvarAula(null, m.aulaGeral, m.topico.nome)
    if (incluirNotas && m.notaGeral) salvarNota(null, m.notaGeral)
    return { topicId, itens, aulas, notas, primeiraAulaNodeId }
  })
}
