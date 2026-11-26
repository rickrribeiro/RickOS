import assert from 'node:assert/strict'
import fs from 'node:fs'
import { after, before, beforeEach, describe, it } from 'node:test'
import { isolateDb, resetStudies } from './helpers'
import { AULA_TURNO, MASTERCLASS_BACKEND, MASTERCLASS_MANDARIM } from './fixtures'

/**
 * Etapa 3: integração Codex (contrato), masterclass A → roteiro aprovável, aula B.
 * Motor FALSO: nenhuma chamada real, nenhum token. Verifica chamadas zero/uma.
 */
isolateDb('estudos-etapa3')

/* eslint-disable @typescript-eslint/consistent-type-imports */
let repo: typeof import('../repo')
let tutor: typeof import('../tutor')
let motores: typeof import('../../ia/motores')

interface Chamada {
  prompt: string
  sistema?: string
  modelo?: string
  effort?: string
  schema?: Record<string, unknown>
  ferramentas?: string
  cwd?: string
}
let chamadas: Chamada[] = []
/** Cada chamada pega a próxima resposta da fila (string, Error ou promessa controlada). */
let fila: (string | Error | Promise<string>)[] = []

before(async () => {
  repo = await import('../repo')
  tutor = await import('../tutor')
  motores = await import('../../ia/motores')
  motores.definirMotorDeTeste((motor) => ({
    id: motor,
    async executar(req) {
      chamadas.push({ prompt: req.prompt, sistema: req.sistema, modelo: req.modelo, effort: req.effort, schema: req.schemaSaida, ferramentas: req.ferramentas, cwd: req.cwd })
      req.onTokens?.({ input: 1000, output: 200, cached: 0, reasoning: 50 })
      const r = fila.shift() ?? '{}'
      if (r instanceof Error) throw r
      return r
    }
  }))
})
after(() => motores.definirMotorDeTeste(null))
beforeEach(async () => {
  await resetStudies()
  const { getDb } = await import('../../database/db')
  const db = await getDb()
  for (const t of ['study_lesson_turns', 'study_lessons', 'study_plans', 'study_ai_runs']) db.run(`DELETE FROM ${t}`)
  chamadas = []
  fila = []
})

async function esperar(runId: number): Promise<import('../tutor').RunRow> {
  for (let i = 0; i < 200; i++) {
    const r = (await tutor.listRuns({ limit: 50 })).find((x) => x.id === runId)!
    if (r.status !== 'running') return r
    await new Promise((res) => setTimeout(res, 5))
  }
  throw new Error('execução não terminou')
}

function controlada(): { p: Promise<string>; resolver: (s: string) => void } {
  let resolver!: (s: string) => void
  const p = new Promise<string>((res) => (resolver = res))
  return { p, resolver }
}

describe('masterclass (A) → roteiro aprovável', () => {
  it('uma chamada, perfil astra/high, schema e sandbox sem ferramentas; contexto e prompt A no envio', async () => {
    const t = await repo.createTopic({ name: 'Backend multiplayer', goal: 'decidir a arquitetura do meu jogo Unity' })
    fila.push(JSON.stringify(MASTERCLASS_BACKEND))
    const run = await tutor.startMasterclass(t.id, 'quero estudar backend multiplayer para decidir a arquitetura do meu jogo Unity')
    const fim = await esperar(run.id)
    assert.equal(fim.status, 'ok')
    assert.equal(chamadas.length, 1)
    const c = chamadas[0]
    assert.deepEqual([c.modelo, c.effort, c.ferramentas], ['gpt-6.2-astra', 'high', 'nenhuma'])
    assert.ok(c.schema && (c.schema as { required: string[] }).required.includes('aberturaPrimeiraAula'))
    assert.ok(c.prompt.includes('Você é meu mentor neste assunto'))
    assert.ok(c.prompt.includes('decidir a arquitetura do meu jogo Unity'))
    assert.ok(c.sistema?.includes('Não edite arquivos'))
    assert.equal(fs.readdirSync(c.cwd!).length, 0) // diretório vazio: nada além do contexto enviado
    assert.deepEqual([fim.model, fim.effort, fim.inputTokens, fim.outputTokens], ['gpt-6.2-astra', 'high', 1000, 250])
    assert.ok(fim.promptVersion?.startsWith('estudos-pedagogia-'))
    const [plano] = await tutor.listPlans(t.id)
    assert.equal(plano.status, 'proposed')
  })

  it('clique duplo / duas abas → a mesma execução e uma chamada só', async () => {
    const t = await repo.createTopic({ name: 'X' })
    const ctl = controlada()
    fila.push(ctl.p)
    const [a, b] = await Promise.all([tutor.startMasterclass(t.id, 'quero estudar X para Y'), tutor.startMasterclass(t.id, 'quero estudar X para Y')])
    assert.equal(a.id, b.id)
    ctl.resolver(JSON.stringify(MASTERCLASS_MANDARIM))
    await esperar(a.id)
    assert.equal(chamadas.length, 1)
    assert.equal((await tutor.listPlans(t.id)).length, 1)
  })

  it('uma execução antiga que termina depois não sobrescreve a proposta mais nova', async () => {
    const t = await repo.createTopic({ name: 'Y' })
    const velha = controlada()
    fila.push(velha.p, JSON.stringify(MASTERCLASS_MANDARIM))
    const r1 = await tutor.startMasterclass(t.id, 'pedido 1')
    const r2 = await tutor.startMasterclass(t.id, 'pedido 2')
    await esperar(r2.id)
    velha.resolver(JSON.stringify(MASTERCLASS_BACKEND))
    await esperar(r1.id)
    const planos = await tutor.listPlans(t.id)
    const ativo = planos.filter((p) => p.status === 'proposed')
    assert.equal(ativo.length, 1)
    assert.equal(ativo[0].request, 'pedido 2')
  })

  it('JSON inválido e erro do provedor preservam o que já era válido', async () => {
    const t = await repo.createTopic({ name: 'Z' })
    fila.push(JSON.stringify(MASTERCLASS_MANDARIM))
    await esperar((await tutor.startMasterclass(t.id, 'a')).id)
    fila.push('isto não é json')
    const inv = await esperar((await tutor.startMasterclass(t.id, 'b')).id)
    assert.equal(inv.status, 'invalid')
    fila.push(new Error('Codex CLI não encontrado ("codex"). Instale ou ajuste em Configurações.'))
    const err = await esperar((await tutor.startMasterclass(t.id, 'c')).id)
    assert.equal(err.status, 'error')
    assert.match(err.error!, /não encontrado/)
    const planos = await tutor.listPlans(t.id)
    assert.deepEqual(planos.map((p) => [p.request, p.status]), [['a', 'proposed']])
  })

  it('aprovar com edições: nós do roteiro depois dos meus, primeira aula com a abertura reutilizada (zero chamadas)', async () => {
    const t = await repo.createTopic({ name: 'Unity netcode' })
    const { createStudyNode, saveStudyNote, getStudyNodes } = await import('../../database/queries')
    const meu = await createStudyNode(t.id, null, 'Minhas anotações soltas', null, null)
    await saveStudyNote(t.id, meu.id, 'texto que eu escrevi')
    fila.push(JSON.stringify(MASTERCLASS_BACKEND))
    await esperar((await tutor.startMasterclass(t.id, 'quero estudar backend multiplayer')).id)
    const [plano] = await tutor.listPlans(t.id)
    chamadas = []
    const editado = JSON.parse(plano.content)
    editado.partes[0].modulos[0].titulo = 'Do botão ao estado de todos' // minha edição
    editado.partes[1].modulos[0].excluir = true // tiro o opcional
    await tutor.editPlan(plano.id, editado)
    const r = await tutor.approvePlan(plano.id)
    const nodes = await getStudyNodes(t.id)
    assert.equal(nodes.find((n) => n.id === meu.id)!.orderIndex, 0) // o meu continua primeiro
    const titulos = nodes.filter((n) => (n as { origin?: string }).origin === 'plan').map((n) => n.title)
    assert.ok(titulos.includes('Do botão ao estado de todos'))
    assert.ok(!titulos.includes('Predição do cliente e reconciliação'))
    assert.ok(!titulos.includes('Mecanismos e falhas')) // parte sem módulos não vira nó
    assert.ok(titulos.includes('Workshops') && titulos.includes('ADR da arquitetura'))
    const primeiro = nodes.find((n) => n.title === 'Do botão ao estado de todos')!
    assert.equal(primeiro.estimatedHours, 0.42)
    const aula = await tutor.getLesson(r.lessonId!)
    assert.equal(aula.lesson.nodeId, primeiro.id)
    assert.equal(aula.turns.length, 1)
    assert.ok(aula.turns[0].content.includes('escreva em 5 linhas'))
    assert.equal(chamadas.length, 0)
    // Continuar aponta para o próximo nó do roteiro aprovado
    const c = await repo.getContinue()
    assert.equal(c.reason, 'plan')
    assert.equal(c.nodeId, primeiro.id)
    // a nota que eu escrevi está intacta
    const { getStudyNote } = await import('../../database/queries')
    assert.equal((await getStudyNote(t.id, meu.id))!.content, 'texto que eu escrevi')
  })
})

describe('aula conversacional (B)', () => {
  it('abrir/reabrir = zero chamadas; enviar = uma; reenvio com a mesma chave não duplica', async () => {
    const t = await repo.createTopic({ name: 'Unity netcode' })
    const { lesson } = await tutor.openLesson(t.id, null)
    await tutor.openLesson(t.id, null)
    await tutor.getLesson(lesson.id)
    assert.equal(chamadas.length, 0)
    fila.push(JSON.stringify(AULA_TURNO))
    const run = await tutor.sendTurn(lesson.id, 'acho que o tiro acontece no cliente', 'chave-0001')
    const again = await tutor.sendTurn(lesson.id, 'acho que o tiro acontece no cliente', 'chave-0001')
    assert.equal(again.id, run.id)
    const fim = await esperar(run.id)
    assert.deepEqual([fim.model, fim.effort], ['gpt-6.2-sol', 'medium'])
    const l = await tutor.getLesson(lesson.id)
    assert.deepEqual(l.turns.map((x) => x.role), ['me', 'tutor'])
    assert.equal(l.lesson.openQuestion, AULA_TURNO.perguntaAberta)
    assert.equal(l.lesson.resumePhrase, AULA_TURNO.fraseDeRetomada)
    assert.equal(chamadas.length, 1)
    assert.ok(chamadas[0].prompt.includes('Conduza um turno de cada vez'))
    assert.ok(chamadas[0].prompt.includes('acho que o tiro acontece no cliente'))
    // reabrir lê o salvo
    const n = chamadas.length
    await tutor.openLesson(t.id, null)
    assert.equal(chamadas.length, n)
  })

  it('um turno por vez; falha mantém meu turno e "tentar de novo" responde', async () => {
    const t = await repo.createTopic({ name: 'Mandarim', kind: 'language', targetLanguage: 'zh' })
    const { lesson } = await tutor.openLesson(t.id, null)
    const ctl = controlada()
    fila.push(ctl.p)
    const r1 = await tutor.sendTurn(lesson.id, '明天不行', 'chave-0002')
    await assert.rejects(tutor.sendTurn(lesson.id, 'outra coisa', 'chave-0003'), /respondendo/)
    ctl.resolver('lixo')
    assert.equal((await esperar(r1.id)).status, 'invalid')
    let l = await tutor.getLesson(lesson.id)
    assert.deepEqual(l.turns.map((x) => x.role), ['me'])
    fila.push(JSON.stringify({ ...AULA_TURNO, resposta: '不好意思，明天不行，改到星期六可以吗？' }))
    await esperar((await tutor.runLessonTurn(lesson.id)).id)
    l = await tutor.getLesson(lesson.id)
    assert.deepEqual(l.turns.map((x) => x.role), ['me', 'tutor'])
    assert.ok(chamadas.at(-1)!.sistema!.includes('idioma-alvo (zh)'))
    assert.ok(chamadas.at(-1)!.prompt.includes('idioma-alvo: zh'))
  })

  it('cancelar descarta a resposta que chegar depois', async () => {
    const t = await repo.createTopic({ name: 'K' })
    const { lesson } = await tutor.openLesson(t.id, null)
    const ctl = controlada()
    fila.push(ctl.p)
    const r = await tutor.sendTurn(lesson.id, 'oi', 'chave-0004')
    await tutor.cancelRun(r.id)
    ctl.resolver(JSON.stringify(AULA_TURNO))
    assert.equal((await esperar(r.id)).status, 'canceled')
    assert.deepEqual((await tutor.getLesson(lesson.id)).turns.map((x) => x.role), ['me'])
  })

  it('"adicionar à nota" só acrescenta por ação minha', async () => {
    const t = await repo.createTopic({ name: 'Q' })
    const { saveStudyNote, getStudyNote } = await import('../../database/queries')
    await saveStudyNote(t.id, null, 'minha nota')
    await tutor.appendToNote(t.id, null, 'trecho da aula')
    assert.equal((await getStudyNote(t.id, null))!.content, 'minha nota\n\ntrecho da aula\n')
  })
})
