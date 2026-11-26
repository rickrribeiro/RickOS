import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { isolateDb, resetStudies } from './helpers'
import { AULA_TURNO, MASTERCLASS_BACKEND, MASTERCLASS_MANDARIM } from './fixtures'

/**
 * Masterclass → aula: o briefing acompanha cada aula do roteiro certo, a abertura didática vira o 1º
 * turno (planos antigos continuam legíveis) e o recorte dos turnos preserva o que o follow-up cita.
 * Motor FALSO: nenhuma chamada real, nenhum token.
 */
isolateDb('estudos-continuidade')

/* eslint-disable @typescript-eslint/consistent-type-imports */
let repo: typeof import('../repo')
let tutor: typeof import('../tutor')
let motores: typeof import('../../ia/motores')
let prompts: string[] = []
let fila: string[] = []

before(async () => {
  repo = await import('../repo')
  tutor = await import('../tutor')
  motores = await import('../../ia/motores')
  motores.definirMotorDeTeste((motor) => ({
    id: motor,
    async executar(req) {
      prompts.push(req.prompt)
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
  prompts = []
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

async function aprovar(topicId: number, pedido: string, plano: unknown): Promise<{ planId: number; lessonId: number | null }> {
  fila.push(JSON.stringify(plano))
  await esperar((await tutor.startMasterclass(topicId, pedido)).id)
  const p = (await tutor.listPlans(topicId)).find((x) => x.status === 'proposed')!
  const r = await tutor.approvePlan(p.id)
  return { planId: p.id, lessonId: r.lessonId }
}

async function turno(lessonId: number, texto: string, resposta: Record<string, unknown> = AULA_TURNO): Promise<string> {
  fila.push(JSON.stringify(resposta))
  await esperar((await tutor.sendTurn(lessonId, texto, `k${Math.random().toString(36).slice(2, 12)}`)).id)
  return prompts.at(-1)!
}

const TRAMA = 'Quero estudar backend multiplayer para decidir a arquitetura do Trama. Conheço backend SaaS e Postgres. Meu jogo é mobile em Unity, com oito posições. Quero entender os critérios antes de escolher a arquitetura.'

describe('abertura da primeira aula', () => {
  it('contrato novo: a aula didática vira o 1º turno, sem repetir a pergunta; zero chamadas', async () => {
    const t = await repo.createTopic({ name: 'Backend multiplayer' })
    const { lessonId } = await aprovar(t.id, TRAMA, MASTERCLASS_BACKEND)
    const n = prompts.length
    const l = await tutor.getLesson(lessonId!)
    const abertura = l.turns[0].content
    assert.ok(abertura.startsWith('### Do input ao estado compartilhado'))
    assert.ok(abertura.includes('t=40: o servidor valida'))
    assert.ok(abertura.includes('**Primeiro passo hoje:**'))
    assert.equal(abertura.match(/acontece de verdade/g)!.length, 1, 'a pergunta já está na aula: não repete')
    assert.equal(l.lesson.openQuestion, MASTERCLASS_BACKEND.aberturaPrimeiraAula.pergunta)
    assert.equal(l.briefing?.request, TRAMA)
    await tutor.openLesson(t.id, l.lesson.nodeId)
    assert.equal(prompts.length, n, 'reabrir não chama o modelo')
  })

  it('plano antigo (sem aula nem campos novos) continua aprovável e legível', async () => {
    const t = await repo.createTopic({ name: 'Mandarim', kind: 'language', targetLanguage: 'zh' })
    const antigo = JSON.parse(JSON.stringify(MASTERCLASS_MANDARIM))
    delete antigo.restricoes
    delete antigo.preferenciasEnsino
    delete antigo.decisoesEmAberto
    delete antigo.aberturaPrimeiraAula.aula
    const { lessonId } = await aprovar(t.id, 'quero conseguir remarcar um encontro em mandarim', antigo)
    const l = await tutor.getLesson(lessonId!)
    assert.ok(l.turns[0].content.includes('Seu amigo pergunta 明天几点见面？'))
    assert.ok(l.turns[0].content.includes('**Pergunta:** Como você responderia propondo sábado?'))
    const p = await turno(lessonId!, '星期六下午三点，可以吗？')
    assert.ok(p.includes('### Meu pedido original\nquero conseguir remarcar um encontro em mandarim'))
    assert.ok(!p.includes('Decisões em aberto'), 'campo ausente não vira linha vazia')
  })
})

describe('briefing acompanha cada aula', () => {
  it('módulos seguintes, reabertura e dois planos no tópico: cada aula usa o pedido do seu roteiro', async () => {
    const t = await repo.createTopic({ name: 'Backend multiplayer' })
    const a = await aprovar(t.id, TRAMA, MASTERCLASS_BACKEND)
    const segundoPedido = 'repense só a parte de persistência: quero comparar Postgres e Redis para o estado da partida'
    const b = await aprovar(t.id, segundoPedido, { ...MASTERCLASS_BACKEND, partes: [{ titulo: 'Persistência', porque: 'p', modulos: [{ ...MASTERCLASS_BACKEND.partes[0].modulos[0], titulo: 'Postgres vs Redis' }] }] })
    const { getStudyNodes } = await import('../../database/queries')
    const nodes = await getStudyNodes(t.id)
    const autoridade = nodes.find((n) => n.title === 'Autoridade: servidor, host ou relay')!
    const redis = nodes.find((n) => n.title === 'Postgres vs Redis')!
    // aula do 2º módulo do 1º plano: nasce por openLesson (sem abertura), ligada ao plano A
    const la = await tutor.openLesson(t.id, autoridade.id)
    assert.equal(la.lesson.planId, a.planId)
    assert.equal(la.briefing?.request, TRAMA)
    const pa = await turno(la.lesson.id, 'qual a diferença de relay?')
    assert.ok(pa.includes(TRAMA))
    assert.ok(!pa.includes(segundoPedido))
    assert.ok(pa.includes('- Já sei: Unity, C#, APIs HTTP.'))
    assert.ok(pa.includes('- Restrições: mobile; até 8 jogadores por partida'))
    assert.ok(pa.includes('- Decisões em aberto (não decida por mim): servidor dedicado vs host-cliente'))
    // posição pela árvore real (módulos + workshop)
    assert.ok(pa.includes('Panorama ponta a ponta › Autoridade: servidor, host ou relay (2 de 4)'), pa.slice(pa.indexOf('## Onde'), pa.indexOf('## Onde') + 200))
    assert.ok(pa.includes('Anterior: Do input ao estado compartilhado'))
    // aula do plano B
    const lb = await tutor.openLesson(t.id, redis.id)
    assert.equal(lb.lesson.planId, b.planId)
    const pb = await turno(lb.lesson.id, 'e se a partida cair?')
    assert.ok(pb.includes(segundoPedido) && !pb.includes(TRAMA))
    // reabrir (outro cliente) traz o mesmo briefing, sem chamada
    const n = prompts.length
    const again = await tutor.openLesson(t.id, autoridade.id)
    assert.equal(again.briefing?.request, TRAMA)
    assert.equal(prompts.length, n)
  })

  it('briefing colado longo: começo e fim preservados dentro do orçamento', async () => {
    const t = await repo.createTopic({ name: 'Backend multiplayer' })
    const longo = `${TRAMA}\n\n${'Contexto do estúdio e do jogo. '.repeat(400)}\n\nRESTRIÇÃO FINAL: nada de servidor pago antes do beta.`
    const { lessonId } = await aprovar(t.id, longo, MASTERCLASS_BACKEND)
    const p = await turno(lessonId!, 'ok')
    assert.ok(p.includes('Conheço backend SaaS e Postgres'))
    assert.ok(p.includes('RESTRIÇÃO FINAL: nada de servidor pago antes do beta.'))
    assert.ok(p.includes('caracteres omitidos no meio'))
  })
})

describe('recorte dos turnos', () => {
  it('o fim do último turno do tutor e a abertura chegam ao provedor; o que não cabe vira resumo; tamanho limitado', async () => {
    const t = await repo.createTopic({ name: 'Backend multiplayer' })
    const { lessonId } = await aprovar(t.id, TRAMA, MASTERCLASS_BACKEND)
    // várias trocas longas para estourar o orçamento
    for (let i = 0; i < 8; i++) {
      await turno(lessonId!, `PERGUNTA-${i}: ${'detalhe '.repeat(60)}`, { ...AULA_TURNO, resposta: `RESPOSTA-${i} ${'explicação longa. '.repeat(150)}`, perguntaAberta: `aberta-${i}` })
    }
    const ultima = `Resposta sobre a gema. ${'Transação serializa a escrita no Postgres. '.repeat(120)}No fim: o cliente mostra a gema como PENDENTE até o snapshot do tick 412 confirmar.`
    await turno(lessonId!, 'Se dois jogadores pegam a mesma gema, por que eu não resolveria isso com uma transação no Postgres?', { ...AULA_TURNO, resposta: ultima })
    const p = await turno(lessonId!, 'e esse PENDENTE do tick 412, quanto tempo dura no celular?')
    assert.ok(p.includes('PENDENTE até o snapshot do tick 412 confirmar.'), 'fim da resposta anterior preservado')
    assert.ok(p.includes('TUTOR (abertura do roteiro): ### Do input ao estado compartilhado'))
    assert.ok(p.includes('[turnos mais antigos resumidos, sem IA]'))
    assert.ok(p.includes('EU perguntei/respondi: PERGUNTA-0'))
    assert.ok(p.includes('por que eu não resolveria isso com uma transação no Postgres?'))
    const ctx = p.slice(p.indexOf('## Contexto da aula'), p.indexOf('## Meu turno agora'))
    assert.ok(ctx.length < 26000, `contexto previsível: ${ctx.length}`)
  })
})

describe('leitura da resposta do tutor', () => {
  it('Markdown com bloco de código dentro do JSON não vira "fora do formato"', async () => {
    const obj = { aberturaPrimeiraAula: { aula: 'Veja:\n\n```csharp\nvar cmd = new Pegar(17);\n```\n\nE ```json {"x":1}``` também.' }, partes: [] }
    const raw = JSON.stringify(obj)
    assert.deepEqual(tutor.parseJson(raw), obj)
    assert.deepEqual(tutor.parseJson(`\`\`\`json\n${raw}\n\`\`\``), obj, 'cerca envolvendo a resposta inteira')
    assert.deepEqual(tutor.parseJson(`Aqui está:\n${raw}`), obj, 'texto antes do JSON')
    assert.throws(() => tutor.parseJson('não é json'))
  })

  it('roteiro real com código na abertura é aceito e aprovado', async () => {
    const t = await repo.createTopic({ name: 'Backend multiplayer' })
    const plano = JSON.parse(JSON.stringify(MASTERCLASS_BACKEND))
    plano.aberturaPrimeiraAula.aula = 'O cliente envia:\n\n```csharp\nnet.Send(new Pegar { Id = "A17" });\n```\n\nQuem decide?'
    const { lessonId } = await aprovar(t.id, TRAMA, plano)
    const l = await tutor.getLesson(lessonId!)
    assert.ok(l.turns[0].content.includes('net.Send(new Pegar'))
  })
})
