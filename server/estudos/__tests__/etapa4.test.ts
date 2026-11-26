import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { isolateDb, resetStudies } from './helpers'
import { pacoteMandarim } from './fixtures'

/**
 * Etapa 4: pacote C/D/E persistido, regeneração por seção, revisão editorial e subtópicos.
 * Motor FALSO (fixtures): valida contrato, chamadas zero/uma, concorrência, versão antiga e erro.
 */
isolateDb('estudos-etapa4')

/* eslint-disable @typescript-eslint/consistent-type-imports */
let repo: typeof import('../repo')
let tutor: typeof import('../tutor')
let material: typeof import('../material')
let q: typeof import('../../database/queries')
let motores: typeof import('../../ia/motores')
let chamadas: { prompt: string; modelo?: string; effort?: string }[] = []
let fila: (string | Error | Promise<string>)[] = []

before(async () => {
  repo = await import('../repo')
  tutor = await import('../tutor')
  material = await import('../material')
  q = await import('../../database/queries')
  motores = await import('../../ia/motores')
  motores.definirMotorDeTeste((motor) => ({
    id: motor,
    async executar(req) {
      chamadas.push({ prompt: req.prompt, modelo: req.modelo, effort: req.effort })
      const r = fila.shift() ?? '{}'
      if (r instanceof Error) throw r
      return r
    }
  }))
})
after(() => motores.definirMotorDeTeste(null))

const NOTA = '# Aula 1\n\n明天 = amanhã\n几点 = que horas\n见面 = encontrar-se\n'
let topicId = 0
let nodeId = 0
let parentId = 0

beforeEach(async () => {
  await resetStudies()
  const { getDb } = await import('../../database/db')
  const db = await getDb()
  for (const t of ['study_suggestions', 'study_materials', 'study_lesson_turns', 'study_lessons', 'study_plans', 'study_ai_runs']) db.run(`DELETE FROM ${t}`)
  chamadas = []
  fila = []
  const t = await repo.createTopic({ name: 'Mandarim', kind: 'language', targetLanguage: 'zh', goal: 'remarcar um encontro em mandarim' })
  topicId = t.id
  parentId = (await q.createStudyNode(topicId, null, 'Situação comunicativa', null, null)).id
  nodeId = (await q.createStudyNode(topicId, parentId, 'Marcar encontro', null, null)).id
  await q.saveStudyNote(topicId, nodeId, NOTA)
})

async function esperar(runId: number): Promise<import('../tutor').RunRow> {
  for (let i = 0; i < 300; i++) {
    const r = (await tutor.listRuns({ limit: 50 })).find((x) => x.id === runId)!
    if (r.status !== 'running') return r
    await new Promise((res) => setTimeout(res, 5))
  }
  throw new Error('execução não terminou')
}
function controlada(): { p: Promise<string>; resolver: (s: string) => void } {
  let resolver!: (s: string) => void
  return { p: new Promise<string>((res) => (resolver = res)), resolver }
}
const nota = async (): Promise<string> => (await q.getStudyNote(topicId, nodeId))!.content

describe('pacote do nó (C)', () => {
  it('um clique = uma chamada; depois ler/abrir seções = zero; nada é aplicado sozinho', async () => {
    fila.push(JSON.stringify(pacoteMandarim(parentId)))
    const run = await material.prepareNode(topicId, nodeId, { vocabulario: ['明天', '星期六'] })
    const fim = await esperar(run.id)
    assert.deepEqual([fim.status, fim.model, fim.effort], ['ok', 'gpt-6.2-sol', 'medium'])
    assert.equal(chamadas.length, 1)
    assert.ok(chamadas[0].prompt.includes('Cada seção tem uma finalidade própria'))
    assert.ok(chamadas[0].prompt.includes('Regra D') && chamadas[0].prompt.includes('Regra E'))
    assert.ok(chamadas[0].prompt.includes('Cobertura de vocabulário escolhida') && chamadas[0].prompt.includes('星期六'))
    for (let i = 0; i < 5; i++) await material.getMaterial(topicId, nodeId)
    assert.equal(chamadas.length, 1)
    const v = await material.getMaterial(topicId, nodeId)
    assert.equal(v.sections.length, 8)
    assert.ok(v.sections.every((s) => !s.stale && s.promptVersion?.startsWith('estudos-pedagogia-')))
    // nada aplicado automaticamente
    assert.equal(await nota(), NOTA)
    assert.equal((await q.getStudyNodes(topicId)).length, 2)
    assert.equal((await repo.getReviewQueue({})).items.length, 0) // cartões só sugeridos
    assert.equal((await repo.listCards({ topicId, status: 'suggested' })).length, 2)
    assert.equal(v.suggestions.filter((s) => s.status === 'pending').length, 3) // 2 editoriais + 1 subtópico
  })

  it('editar a nota marca "anterior à última edição" e mantém o material', async () => {
    fila.push(JSON.stringify(pacoteMandarim(parentId)))
    await esperar((await material.prepareNode(topicId, nodeId)).id)
    await q.saveStudyNote(topicId, nodeId, NOTA + '\n星期六 = sábado\n')
    const v = await material.getMaterial(topicId, nodeId)
    assert.equal(v.sections.length, 8)
    assert.ok(v.sections.every((s) => s.stale))
  })

  it('seção inválida no pacote preserva a anterior; erro do provedor preserva tudo', async () => {
    fila.push(JSON.stringify(pacoteMandarim(parentId)))
    await esperar((await material.prepareNode(topicId, nodeId)).id)
    const antes = (await material.getMaterial(topicId, nodeId)).sections.find((s) => s.section === 'resumo')!
    const p2 = pacoteMandarim(parentId)
    p2.resumo = { semConteudo: true }
    ;(p2.explicacao as { conteudo: string }).conteudo = 'explicação nova'
    fila.push(JSON.stringify(p2))
    await esperar((await material.prepareNode(topicId, nodeId)).id)
    const v = await material.getMaterial(topicId, nodeId)
    assert.equal(v.sections.find((s) => s.section === 'resumo')!.content, antes.content)
    assert.ok(v.sections.find((s) => s.section === 'explicacao')!.content.includes('explicação nova'))
    fila.push(new Error('Codex não respondeu em 600 s.'))
    const err = await esperar((await material.prepareNode(topicId, nodeId)).id)
    assert.equal(err.status, 'timeout')
    assert.ok((await material.getMaterial(topicId, nodeId)).sections.find((s) => s.section === 'explicacao')!.content.includes('explicação nova'))
  })

  it('gerar de novo UMA seção; pacote antigo que termina depois não sobrescreve a seção mais nova', async () => {
    const velho = controlada()
    fila.push(velho.p)
    const r1 = await material.prepareNode(topicId, nodeId)
    fila.push(JSON.stringify({ resumo: { conteudo: 'resumo NOVO', vazio: null } }))
    const r2 = await material.regenerateSection(topicId, nodeId, 'resumo')
    await esperar(r2.id)
    assert.equal(chamadas.length, 2)
    assert.ok(chamadas[1].prompt.includes('Seção pedida') && chamadas[1].prompt.includes('resumo:'))
    velho.resolver(JSON.stringify(pacoteMandarim(parentId)))
    await esperar(r1.id)
    const v = await material.getMaterial(topicId, nodeId)
    assert.ok(v.sections.find((s) => s.section === 'resumo')!.content.includes('resumo NOVO'))
    assert.equal(v.sections.find((s) => s.section === 'explicacao')!.runId, r1.id) // o resto veio do pacote
  })

  it('cliente concorrente (duas abas) → mesma execução, uma chamada', async () => {
    const ctl = controlada()
    fila.push(ctl.p)
    const [a, b] = await Promise.all([material.prepareNode(topicId, nodeId), material.prepareNode(topicId, nodeId)])
    assert.equal(a.id, b.id)
    ctl.resolver(JSON.stringify(pacoteMandarim(parentId)))
    await esperar(a.id)
    assert.equal(chamadas.length, 1)
  })
})

describe('revisão editorial (D)', () => {
  it('perfil editorial (sol/low); aceitar muda só o trecho; recusa lembrada; aplicada não volta', async () => {
    const pac = pacoteMandarim(parentId)
    fila.push(JSON.stringify({ revisaoEditorial: pac.revisaoEditorial }))
    const run = await esperar((await material.reviewNote(topicId, nodeId)).id)
    assert.deepEqual([run.model, run.effort], ['gpt-6.2-sol', 'low'])
    assert.ok(chamadas[0].prompt.includes('Preserve meu português'))
    let v = await material.getMaterial(topicId, nodeId)
    const [acr, perg] = v.suggestions
    const r = await material.acceptEditorial(acr.id)
    assert.ok(r.ok)
    assert.equal(await nota(), NOTA.replace('明天 = amanhã', '明天 = amanhã (míngtiān)')) // mudança mínima, o resto intacto
    await material.decideSuggestion(perg.id, 'rejected')
    // nova revisão sobre a MESMA versão devolve as mesmas propostas: nada reaparece
    fila.push(JSON.stringify({ revisaoEditorial: pac.revisaoEditorial }))
    await esperar((await material.reviewNote(topicId, nodeId)).id)
    v = await material.getMaterial(topicId, nodeId)
    assert.equal(v.suggestions.filter((s) => s.status === 'pending').length, 0)
  })

  it('trecho mudou → reconciliação em vez de trocar a nota; guardar como comentário', async () => {
    fila.push(JSON.stringify({ revisaoEditorial: pacoteMandarim(parentId).revisaoEditorial }))
    await esperar((await material.reviewNote(topicId, nodeId)).id)
    const [acr, perg] = (await material.getMaterial(topicId, nodeId)).suggestions
    await q.saveStudyNote(topicId, nodeId, NOTA.replace('明天 = amanhã', '明天 (amanhã)'))
    const r = await material.acceptEditorial(acr.id)
    assert.deepEqual(r, { ok: false, reason: 'stale' })
    assert.equal(await nota(), NOTA.replace('明天 = amanhã', '明天 (amanhã)')) // intacta
    const r2 = await material.acceptEditorial(acr.id, { anchor: '明天 (amanhã)' })
    assert.ok(r2.ok)
    assert.ok((await nota()).includes('明天 (amanhã) (míngtiān)'))
    await material.decideSuggestion(perg.id, 'comment')
    const v = await material.getMaterial(topicId, nodeId)
    assert.equal(v.suggestions.find((s) => s.id === perg.id)!.status, 'comment')
    assert.ok(!(await nota()).includes('Quer anotar'))
  })

  it('nota vazia não gera revisão (e não chama a IA)', async () => {
    await q.saveStudyNote(topicId, nodeId, '')
    await assert.rejects(material.reviewNote(topicId, nodeId))
    assert.equal(chamadas.length, 0)
  })
})

describe('subtópicos (E)', () => {
  it('pai real sugerido; posso mudar o pai; aprovar cria o nó no lugar certo; recusa lembrada', async () => {
    const pac = pacoteMandarim(parentId)
    fila.push(JSON.stringify({ subtopicos: pac.subtopicos }))
    const run = await esperar((await material.suggestSubtopics(topicId, nodeId)).id)
    assert.equal(run.effort, 'low')
    assert.ok(chamadas[0].prompt.includes(`[id ${parentId}] Situação comunicativa`))
    const [s] = (await material.getMaterial(topicId, nodeId)).suggestions
    const novo = await material.acceptSubtopic(s.id, { parentId: nodeId, title: 'Dias da semana' })
    const nodes = await q.getStudyNodes(topicId)
    const n = nodes.find((x) => x.id === novo)!
    assert.deepEqual([n.parentId, n.title, n.orderIndex], [nodeId, 'Dias da semana', 0])
    // a mesma sugestão vinda de novo não reaparece (já aplicada)
    fila.push(JSON.stringify({ subtopicos: pac.subtopicos }))
    await esperar((await material.suggestSubtopics(topicId, nodeId)).id)
    assert.equal((await material.getMaterial(topicId, nodeId)).suggestions.filter((x) => x.status === 'pending').length, 0)
  })

  it('lista vazia é um resultado válido', async () => {
    fila.push(JSON.stringify({ subtopicos: { itens: [], vazio: 'O mapa cobre o objetivo.' } }))
    const r = await esperar((await material.suggestSubtopics(topicId, nodeId)).id)
    assert.equal(r.status, 'ok')
    const v = await material.getMaterial(topicId, nodeId)
    assert.equal(v.suggestions.length, 0)
    assert.ok(v.sections.find((s) => s.section === 'subtopicos')!.content.includes('O mapa cobre o objetivo.'))
  })

  it('itens do material viram perguntas para "Testar o que ficou" só por ação minha', async () => {
    const id1 = await material.saveItemAsQuestion(topicId, nodeId, 'recall', 'Como se pergunta a hora de amanhã?', '明天几点见面？', null)
    const id2 = await material.saveItemAsQuestion(topicId, nodeId, 'recall', 'Como se pergunta a hora de amanhã?', '明天几点见面？', null)
    assert.equal(id1, id2)
    assert.equal((await repo.listQuestions({ topicId })).length, 1)
  })
})
