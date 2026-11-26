import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { isolateDb, resetStudies } from './helpers'
import { AULA_TURNO, MASTERCLASS_BACKEND } from './fixtures'

/**
 * Modelo de roadmap: exportar a trilha (árvore + briefing + aulas + notas opcionais) e importar em
 * tópico novo ou existente. Motor FALSO só para montar o roteiro de origem; importar = zero chamadas.
 */
isolateDb('estudos-modelo')

/* eslint-disable @typescript-eslint/consistent-type-imports */
let repo: typeof import('../repo')
let tutor: typeof import('../tutor')
let modelo: typeof import('../modelo')
let motores: typeof import('../../ia/motores')
let q: typeof import('../../database/queries')
let chamadas = 0
let fila: string[] = []

before(async () => {
  repo = await import('../repo')
  tutor = await import('../tutor')
  modelo = await import('../modelo')
  motores = await import('../../ia/motores')
  q = await import('../../database/queries')
  motores.definirMotorDeTeste((motor) => ({
    id: motor,
    async executar() {
      chamadas++
      return fila.shift() ?? '{}'
    }
  }))
})
after(() => motores.definirMotorDeTeste(null))
beforeEach(async () => {
  await resetStudies()
  const { getDb } = await import('../../database/db')
  const db = await getDb()
  for (const t of ['study_lesson_turns', 'study_lessons', 'study_plans', 'study_ai_runs']) db.run(`DELETE FROM ${t}`)
  chamadas = 0
  fila = []
})

async function esperar(runId: number): Promise<void> {
  for (let i = 0; i < 400; i++) {
    const r = (await tutor.listRuns({ limit: 50 })).find((x) => x.id === runId)!
    if (r.status !== 'running') return
    await new Promise((res) => setTimeout(res, 5))
  }
  throw new Error('execução não terminou')
}

const PEDIDO = 'Quero estudar backend multiplayer para decidir a arquitetura do Trama. Conheço backend SaaS e Postgres.'

/** Tópico de origem: roteiro aprovado, aula com abertura + 1 troca, nota num módulo e nota geral. */
async function origem(): Promise<{ topicId: number; lessonId: number }> {
  const t = await repo.createTopic({ name: 'Backend multiplayer', goal: 'decidir a arquitetura do Trama' })
  fila.push(JSON.stringify(MASTERCLASS_BACKEND))
  await esperar((await tutor.startMasterclass(t.id, PEDIDO)).id)
  const [p] = await tutor.listPlans(t.id)
  const { lessonId } = await tutor.approvePlan(p.id)
  fila.push(JSON.stringify(AULA_TURNO))
  await esperar((await tutor.sendTurn(lessonId!, 'acho que o tiro acontece no cliente', 'chave-modelo-01')).id)
  const l = await tutor.getLesson(lessonId!)
  await q.saveStudyNote(t.id, l.lesson.nodeId, 'minha nota do módulo')
  await q.saveStudyNote(t.id, null, 'nota geral')
  // progresso pessoal NÃO vai no modelo
  const no = (await q.getStudyNodes(t.id)).find((x) => x.id === l.lesson.nodeId)!
  await q.updateStudyNode(no.id, no.title, no.description, 'done', no.estimatedHours)
  return { topicId: t.id, lessonId: lessonId! }
}

describe('exportar modelo', () => {
  it('árvore, briefing e aulas; notas só se eu pedir; sem progresso', async () => {
    const { topicId } = await origem()
    const { nome, conteudo } = await modelo.exportarModelo(topicId)
    assert.equal(nome, 'backend-multiplayer.roteiro.json')
    const m = JSON.parse(conteudo)
    assert.equal(m.formato, 'rickos-roteiro')
    assert.equal(m.roteiro.pedido, PEDIDO)
    assert.equal(m.itens[0].titulo, 'Panorama ponta a ponta')
    const mod = m.itens[0].itens[0]
    assert.equal(mod.titulo, 'Do input ao estado compartilhado')
    assert.deepEqual(mod.aula.turnos.map((x: { papel: string }) => x.papel), ['tutor', 'eu', 'tutor'])
    assert.ok(mod.aula.turnos[0].conteudo.includes('t=40: o servidor valida'))
    assert.equal(mod.nota, undefined)
    assert.ok(!conteudo.includes('"status"') && !conteudo.includes('"done"'), 'sem progresso')
    const comNotas = JSON.parse((await modelo.exportarModelo(topicId, { notas: true })).conteudo)
    assert.equal(comNotas.itens[0].itens[0].nota, 'minha nota do módulo')
    assert.equal(comNotas.notaGeral, 'nota geral')
    const semAulas = JSON.parse((await modelo.exportarModelo(topicId, { aulas: false })).conteudo)
    assert.equal(semAulas.itens[0].itens[0].aula, undefined)
    assert.equal(chamadas, 2, 'só as chamadas de montar a origem')
  })
})

describe('importar modelo', () => {
  it('tópico novo: mesma árvore, aula pronta (zero chamadas), briefing acompanha a aula; ida e volta idêntica', async () => {
    const { topicId } = await origem()
    const json = (await modelo.exportarModelo(topicId, { notas: true })).conteudo
    const n = chamadas
    const prev = await modelo.previaModelo(json, null)
    assert.deepEqual([prev.nome, prev.itens, prev.aulas, prev.turnos, prev.notas, prev.erros.length], ['Backend multiplayer', 7, 1, 3, 2, 0])
    assert.equal(prev.raiz[0].titulo, 'Panorama ponta a ponta')
    const r = await modelo.importarModelo(json, { topicId: null, nome: 'Trama (cópia)' })
    assert.deepEqual([r.itens, r.aulas, r.notas], [7, 1, 2])
    const nodes = await q.getStudyNodes(r.topicId)
    const mod = nodes.find((x) => x.title === 'Do input ao estado compartilhado')!
    assert.equal(mod.status, 'todo', 'progresso não vem junto')
    assert.equal(r.primeiraAulaNodeId, mod.id, 'a tela cai direto na primeira aula importada')
    const aberta = await tutor.openLesson(r.topicId, mod.id)
    assert.deepEqual(aberta.turns.map((x) => x.role), ['tutor', 'me', 'tutor'])
    assert.equal(aberta.briefing?.request, PEDIDO)
    assert.equal(chamadas, n, 'importar e abrir a aula = zero chamadas')
    // o próximo turno manda o briefing e a abertura importada ao provedor
    fila.push(JSON.stringify(AULA_TURNO))
    await esperar((await tutor.sendTurn(aberta.lesson.id, 'e se o host cair?', 'chave-modelo-02')).id)
    assert.equal(chamadas, n + 1)
    // ida e volta: exportar o importado dá o mesmo modelo (fora o nome)
    const volta = JSON.parse((await modelo.exportarModelo(r.topicId, { notas: true })).conteudo)
    const orig = JSON.parse(json)
    volta.topico.nome = orig.topico.nome
    volta.itens[0].itens[0].aula.turnos = volta.itens[0].itens[0].aula.turnos.slice(0, 3)
    volta.itens[0].itens[0].aula.perguntaAberta = orig.itens[0].itens[0].aula.perguntaAberta
    volta.itens[0].itens[0].aula.fraseDeRetomada = orig.itens[0].itens[0].aula.fraseDeRetomada
    assert.deepEqual(volta, orig)
  })

  it('tópico existente: itens entram depois dos meus, nada é apagado; avisos na prévia', async () => {
    const { topicId } = await origem()
    const json = (await modelo.exportarModelo(topicId, { notas: true })).conteudo
    const destino = await repo.createTopic({ name: 'Meu tópico' })
    const meu = await q.createStudyNode(destino.id, null, 'Minhas anotações', null, null)
    await q.saveStudyNote(destino.id, meu.id, 'texto meu')
    await q.saveStudyNote(destino.id, null, 'geral minha')
    const prev = await modelo.previaModelo(json, destino.id)
    assert.ok(prev.avisos.some((a) => a.includes('nota geral')))
    await modelo.importarModelo(json, { topicId: destino.id })
    const nodes = await q.getStudyNodes(destino.id)
    const raiz = nodes.filter((x) => x.parentId == null).sort((a, b) => a.orderIndex - b.orderIndex)
    assert.equal(raiz[0].title, 'Minhas anotações')
    assert.equal(raiz[1].title, 'Panorama ponta a ponta')
    assert.equal((await q.getStudyNote(destino.id, meu.id))!.content, 'texto meu')
    const geral = (await q.getStudyNote(destino.id, null))!.content
    assert.ok(geral.startsWith('geral minha') && geral.includes('nota geral'))
  })

  it('modelo escrito à mão (só títulos) importa; arquivo inválido ou com erro não grava nada', async () => {
    const mao = { formato: 'rickos-roteiro', versao: 1, topico: { nome: 'Mandarim', tipo: 'idioma', idiomaAlvo: 'zh' }, itens: [{ titulo: 'Dias e horas', itens: [{ titulo: '几点', aula: { titulo: '', turnos: [{ papel: 'tutor', conteudo: '明天几点见面？' }] } }] }] }
    const r = await modelo.importarModelo(JSON.stringify(mao), { topicId: null })
    const t = await repo.getTopic(r.topicId)
    assert.equal(t?.kind, 'language')
    assert.equal(r.aulas, 1)
    const antes = (await repo.getLibrary()).length
    await assert.rejects(modelo.previaModelo('{nada', null), /ilegível/)
    await assert.rejects(modelo.previaModelo(JSON.stringify({ formato: 'outro' }), null), /não é um modelo/)
    const ruim = { ...mao, itens: [{ titulo: 'ok' }, { descricao: 'sem título' }] }
    assert.equal((await modelo.previaModelo(JSON.stringify(ruim), null)).erros.length, 1)
    await assert.rejects(modelo.importarModelo(JSON.stringify(ruim), { topicId: null }), /nada foi importado/)
    assert.equal((await repo.getLibrary()).length, antes)
  })
})
