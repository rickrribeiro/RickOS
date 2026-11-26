import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'
import { contarChamadas, isolateDb, resetStudies } from './helpers'

/**
 * Etapa 1: biblioteca, retomada, captura, preservação do SRS e fluxo de idiomas.
 * O banco começa LEGADO (user_version 44, sem as colunas novas) para provar a migração 45.
 */
const dir = isolateDb('estudos-etapa1')

/* eslint-disable @typescript-eslint/consistent-type-imports */
let repo: typeof import('../repo')
let legacy: typeof import('../../database/queries')
let srs: typeof import('../../../shared/estudos')
let chamadas: Awaited<ReturnType<typeof contarChamadas>>

const LEGACY_SCHEMA = `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE study_topics (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT, status TEXT NOT NULL DEFAULT 'studying',
    targetDate TEXT, priority INTEGER NOT NULL DEFAULT 0, color TEXT NOT NULL DEFAULT '#6366f1', createdAt TEXT NOT NULL);
  CREATE TABLE study_nodes (id INTEGER PRIMARY KEY AUTOINCREMENT, topicId INTEGER NOT NULL REFERENCES study_topics(id) ON DELETE CASCADE, parentId INTEGER,
    title TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'todo', orderIndex INTEGER NOT NULL DEFAULT 0, estimatedHours REAL, completedAt TEXT, createdAt TEXT NOT NULL);
  CREATE TABLE study_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, topicId INTEGER NOT NULL REFERENCES study_topics(id) ON DELETE CASCADE,
    nodeId INTEGER REFERENCES study_nodes(id) ON DELETE CASCADE, content TEXT NOT NULL DEFAULT '', updatedAt TEXT NOT NULL);
  CREATE TABLE study_flashcards (id INTEGER PRIMARY KEY AUTOINCREMENT, topicId INTEGER NOT NULL REFERENCES study_topics(id) ON DELETE CASCADE,
    nodeId INTEGER REFERENCES study_nodes(id) ON DELETE SET NULL, front TEXT NOT NULL, back TEXT NOT NULL, easeFactor REAL NOT NULL DEFAULT 2.5,
    intervalDays INTEGER NOT NULL DEFAULT 0, repetitions INTEGER NOT NULL DEFAULT 0, nextReviewAt TEXT, lastReviewedAt TEXT, createdAt TEXT NOT NULL);
  CREATE TABLE study_review_log (id INTEGER PRIMARY KEY AUTOINCREMENT, flashcardId INTEGER NOT NULL REFERENCES study_flashcards(id) ON DELETE CASCADE,
    topicId INTEGER NOT NULL, rating TEXT, reviewedAt TEXT NOT NULL);
  INSERT INTO study_topics (id, name, category, status, createdAt) VALUES (1, 'Redes (legado)', 'eng', 'studying', '2026-01-01T00:00:00Z');
  INSERT INTO study_nodes (id, topicId, title, orderIndex, createdAt) VALUES (1, 1, 'TCP', 0, '2026-01-01T00:00:00Z');
  INSERT INTO study_flashcards (id, topicId, nodeId, front, back, easeFactor, intervalDays, repetitions, nextReviewAt, lastReviewedAt, createdAt)
    VALUES (1, 1, 1, 'O que é o handshake?', 'SYN, SYN-ACK, ACK', 2.22, 6, 2, '2026-01-10', '2026-01-04T10:00:00Z', '2026-01-01T00:00:00Z');
  INSERT INTO study_review_log (flashcardId, topicId, rating, reviewedAt) VALUES (1, 1, 'good', '2026-01-04T10:00:00Z');
  PRAGMA user_version = 44;
`

before(async () => {
  const initSqlJs = (await import('sql.js')).default
  const wasm = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm')
  const SQL = await initSqlJs({ locateFile: () => wasm })
  const db = new SQL.Database()
  db.run(LEGACY_SCHEMA)
  fs.writeFileSync(path.join(dir, 'timetracker.db'), Buffer.from(db.export()))
  db.close()
  repo = await import('../repo')
  legacy = await import('../../database/queries')
  srs = await import('../../../shared/estudos')
  chamadas = await contarChamadas()
})

after(async () => {
  const { definirMotorDeTeste } = await import('../../ia/motores')
  definirMotorDeTeste(null)
})

describe('migração 45 preserva o legado', () => {
  it('o cartão antigo vira a direção forward com o histórico SM-2 intacto', async () => {
    const [card] = await repo.listCards({ topicId: 1 })
    assert.equal(card.front, 'O que é o handshake?')
    assert.equal(card.cardType, 'basic')
    assert.equal(card.categoryId, null) // "sem categoria"
    assert.equal(card.states.length, 1)
    const s = card.states[0]
    assert.equal(s.direction, 'forward')
    assert.deepEqual([s.easeFactor, s.intervalDays, s.repetitions, s.nextReviewAt], [2.22, 6, 2, '2026-01-10'])
    assert.equal(s.introducedAt, '2026-01-04T10:00:00Z') // já revisado: não consome a cota de novos
  })

  it('tópico legado continua Ativo, com o nó e o cartão vencido na fila', async () => {
    const lib = await repo.getLibrary()
    const t = lib.find((x) => x.id === 1)!
    assert.equal(t.group, 'ativos')
    assert.equal(t.kind, 'general')
    assert.equal(t.nodesTotal, 1)
    const q = await repo.getReviewQueue({})
    assert.equal(q.items.length, 1)
    assert.equal(q.items[0].isNew, false)
    // o canal antigo (Home/briefing/regra due_flashcards) enxerga a mesma fila
    assert.equal((await legacy.getDueFlashcards(new Date().toISOString())).length, 1)
  })

  it('categorias padrão editáveis foram semeadas', async () => {
    const names = (await repo.listCategories()).map((c) => c.name)
    for (const n of ['vocabulário', 'expressão', 'gramática', 'escrita', 'pronúncia']) assert.ok(names.includes(n), n)
  })
})

describe('SRS: comportamento real do Again preservado', () => {
  it('Again: ease −0,32, repetições 0, intervalo 0, volta HOJE e continua na fila', async () => {
    const before = (await repo.getReviewQueue({})).items[0]
    const now = new Date()
    const s = await repo.reviewState(before.state.id, 'again', now)
    assert.equal(s.easeFactor, 1.9) // 2.22 − 0.32
    assert.equal(s.repetitions, 0)
    assert.equal(s.intervalDays, 0)
    assert.equal(s.nextReviewAt, srs.localDate(now))
    const q = await repo.getReviewQueue({}, now)
    assert.equal(q.items.some((i) => i.state.id === s.id), true)
    // o cartão legado espelha a direção forward
    const [c] = await legacy.getStudyFlashcards(1)
    assert.equal(c.repetitions, 0)
  })

  it('schedule() é o SM-2 de antes (1 dia, 6 dias, intervalo × ease; hard ×0,8; easy ×1,3)', () => {
    const a = srs.schedule({ easeFactor: 2.5, intervalDays: 0, repetitions: 0 }, 'good')
    assert.deepEqual([a.repetitions, a.intervalDays, a.easeFactor], [1, 1, 2.5])
    const b = srs.schedule(a, 'good')
    assert.deepEqual([b.repetitions, b.intervalDays], [2, 6])
    const c = srs.schedule(b, 'good')
    assert.equal(c.intervalDays, 15)
    assert.equal(srs.schedule(b, 'hard').intervalDays, Math.max(1, Math.round(Math.round(6 * 2.36) * 0.8)))
    assert.equal(srs.schedule({ easeFactor: 1.3, intervalDays: 3, repetitions: 3 }, 'again').easeFactor, 1.3)
  })
})

describe('idiomas: duas direções com agenda independente', () => {
  beforeEach(resetStudies)

  it('mandarim: reconhecimento e produção do mesmo cartão evoluem separadamente', async () => {
    const t = await repo.createTopic({ name: 'Mandarim', kind: 'language', targetLanguage: 'zh', explanationLanguage: 'pt-BR' })
    const expr = (await repo.listCategories()).find((c) => c.name === 'expressão')!
    const card = await repo.createCard({
      topicId: t.id,
      nodeId: null,
      front: '明天几点见面？',
      back: 'Pergunte a que horas vamos nos encontrar amanhã',
      reading: 'Míngtiān jǐ diǎn jiànmiàn?',
      variants: ['明天我们几点见面？'],
      drill: 'Mude o encontro de amanhã para sábado.',
      categoryId: expr.id,
      reverse: true
    })
    assert.deepEqual(card.states.map((s) => s.direction), ['forward', 'reverse'])
    assert.equal(card.categoryName, 'expressão')
    assert.deepEqual(card.variants, ['明天我们几点见面？'])

    const q1 = await repo.getReviewQueue({})
    assert.equal(q1.items.length, 2)
    assert.ok(q1.items.every((i) => i.isNew))
    const fwd = q1.items.find((i) => i.state.direction === 'forward')!
    const rev = q1.items.find((i) => i.state.direction === 'reverse')!
    await repo.reviewState(fwd.state.id, 'good') // entendi a frase
    await repo.reviewState(rev.state.id, 'again') // não consegui formular
    const q2 = await repo.getReviewQueue({})
    assert.deepEqual(q2.items.map((i) => i.state.direction), ['reverse'])

    // produção aceita variantes (sem tradução literal única)
    assert.ok(srs.matchesAnswer('明天我们几点见面', [card.front, ...card.variants]))
    assert.ok(!srs.matchesAnswer('星期六几点见面', [card.front, ...card.variants]))
  })

  it('reverso opcional: desligar suspende sem apagar o histórico; filtro por categoria/idioma sem IA', async () => {
    const t = await repo.createTopic({ name: 'Inglês', kind: 'language', targetLanguage: 'en' })
    const c = await repo.createCard({ topicId: t.id, nodeId: null, front: 'to reschedule', back: 'remarcar', reverse: true })
    const rev = c.states.find((s) => s.direction === 'reverse')!
    await repo.reviewState(rev.id, 'good')
    const after = await repo.updateCard(c.id, { nodeId: null, front: c.front, back: c.back, reverse: false })
    const r2 = after.states.find((s) => s.direction === 'reverse')!
    assert.equal(r2.suspended, 1)
    assert.equal(r2.repetitions, 1)
    assert.equal((await repo.listCards({ language: 'en' })).length, 1)
    assert.equal((await repo.listCards({ language: 'zh' })).length, 0)
    assert.equal((await repo.listCards({ categoryId: 'none' })).length, 1)
  })

  it('lacuna em frase exige {{trecho}} e só tem a direção forward', async () => {
    const t = await repo.createTopic({ name: 'Alemão', kind: 'language', targetLanguage: 'de' })
    await assert.rejects(repo.createCard({ topicId: t.id, nodeId: null, front: 'Ich gehe nach Hause', back: '', cardType: 'cloze' }))
    const c = await repo.createCard({ topicId: t.id, nodeId: null, front: 'Ich {{gehe}} nach Hause', back: 'Vou para casa', cardType: 'cloze', reverse: true })
    assert.deepEqual(c.states.map((s) => s.direction), ['forward'])
    assert.equal(srs.clozeHide(c.front), 'Ich ＿＿＿ nach Hause')
  })
})

describe('fila diária: limite de novos, suspensão, sugeridos e grupos', () => {
  beforeEach(resetStudies)

  it('limite configurável de novos', async () => {
    const t = await repo.createTopic({ name: 'Go' })
    for (const n of [1, 2, 3]) await repo.createCard({ topicId: t.id, nodeId: null, front: `f${n}`, back: `b${n}` })
    await repo.setNewPerDay(1)
    const q = await repo.getReviewQueue({})
    assert.equal(q.items.length, 1)
    await repo.reviewState(q.items[0].state.id, 'good')
    const q2 = await repo.getReviewQueue({})
    assert.equal(q2.newLeft, 0)
    assert.equal(q2.items.length, 0)
  })

  it('suspenso e sugerido ficam fora do baralho ativo até eu aprovar', async () => {
    const t = await repo.createTopic({ name: 'Rust' })
    const a = await repo.createCard({ topicId: t.id, nodeId: null, front: 'a', back: 'a' })
    const s = await repo.createCard({ topicId: t.id, nodeId: null, front: 's', back: 's', status: 'suggested' })
    await repo.setCardStatus(a.id, 'suspended')
    assert.equal((await repo.getReviewQueue({})).items.length, 0)
    assert.equal((await repo.listCards({ topicId: t.id })).length, 1) // sugeridos não aparecem como salvos
    assert.equal((await repo.listCards({ topicId: t.id, status: 'suggested' })).length, 1)
    await repo.setCardStatus(s.id, 'active')
    assert.equal((await repo.getReviewQueue({})).items.length, 1)
  })

  it('Futuro só com título; arquivado sai da fila padrão e volta quando incluo o idioma', async () => {
    const fut = await repo.createFutureTopic('  Kotlin  ')
    assert.equal(fut.status, 'planned')
    assert.equal(fut.name, 'Kotlin')
    const jp = await repo.createTopic({ name: 'Japonês', kind: 'language', targetLanguage: 'ja' })
    await repo.createCard({ topicId: jp.id, nodeId: null, front: 'またね', back: 'até mais' })
    await repo.setTopicStatus(jp.id, 'paused')
    const lib = await repo.getLibrary()
    assert.equal(lib.find((x) => x.id === jp.id)!.group, 'antigos')
    assert.equal(lib.find((x) => x.id === jp.id)!.status, 'paused') // pausado ≠ concluído
    assert.equal((await repo.getReviewQueue({})).items.length, 0)
    await repo.updateTopic(jp.id, { reviewWhenArchived: true })
    assert.equal((await repo.getReviewQueue({})).items.length, 1)
    await repo.setTopicStatus(jp.id, 'completed')
    assert.equal((await repo.getLibrary()).find((x) => x.id === jp.id)!.status, 'completed')
    await repo.setTopicStatus(jp.id, 'studying') // reativar
    assert.equal((await repo.getLibrary()).find((x) => x.id === jp.id)!.group, 'ativos')
  })
})

describe('Continuar: ordem determinística', () => {
  beforeEach(resetStudies)

  it('nada → tópico vazio → pendente manual → roteiro aprovado → checkpoint → fixado', async () => {
    assert.equal((await repo.getContinue()).reason, 'nothing')
    const a = await repo.createTopic({ name: 'A', priority: 1 })
    assert.equal((await repo.getContinue()).reason, 'empty-topic')

    const { createStudyNode, updateStudyNode } = legacy
    const n1 = await createStudyNode(a.id, null, 'Módulo 1', null, null)
    const n11 = await createStudyNode(a.id, n1.id, 'Aula 1.1', null, null)
    await createStudyNode(a.id, null, 'Módulo 2', null, null)
    let c = await repo.getContinue()
    assert.deepEqual([c.reason, c.nodeId], ['manual', n11.id]) // primeira folha pendente pela ordem manual
    await updateStudyNode(n11.id, 'Aula 1.1', null, 'done', null)
    c = await repo.getContinue()
    assert.deepEqual([c.reason, c.nodeTitle], ['manual', 'Módulo 1'])

    const { getDb } = await import('../../database/db')
    const db = await getDb()
    const planNode = await createStudyNode(a.id, null, 'Workshop do plano', null, null)
    db.run(`UPDATE study_nodes SET origin = 'plan' WHERE id = ${planNode.id}`)
    c = await repo.getContinue()
    assert.deepEqual([c.reason, c.nodeId], ['plan', planNode.id])

    await repo.saveCheckpoint({ topicId: a.id, nodeId: n1.id, target: 'note', position: '{"cursor":42}', whereStopped: 'parei no exemplo do TCP' })
    c = await repo.getContinue()
    assert.deepEqual([c.reason, c.nodeId, c.whereStopped, c.position], ['checkpoint', n1.id, 'parei no exemplo do TCP', '{"cursor":42}'])

    // checkpoint de tópico arquivado não conta
    const b = await repo.createTopic({ name: 'B' })
    await repo.saveCheckpoint({ topicId: b.id, nodeId: null, target: 'note' })
    await repo.setTopicStatus(b.id, 'paused')
    assert.equal((await repo.getContinue()).topicId, a.id)

    await repo.setPinned({ topicId: b.id, nodeId: null, target: 'source', refId: null })
    c = await repo.getContinue()
    assert.deepEqual([c.reason, c.topicId, c.target], ['pinned', b.id, 'source'])
  })
})

describe('Tenho 10 / 25 / 50 minutos e Testar o que ficou', () => {
  beforeEach(resetStudies)

  it('filtra pelas estimativas salvas; sem nada que caiba oferece retomar e cartões', async () => {
    const t = await repo.createTopic({ name: 'SQL', category: 'eng' })
    await legacy.createStudyNode(t.id, null, 'Índices (40 min)', null, 40 / 60)
    await legacy.createStudyNode(t.id, null, 'EXPLAIN (10 min)', null, 10 / 60)
    await legacy.createStudyNode(t.id, null, 'Sem estimativa', null, null)
    await repo.createCard({ topicId: t.id, nodeId: null, front: 'x', back: 'y' })
    const r10 = await repo.getTimeOptions(10)
    assert.deepEqual(r10.fits.map((f) => f.title), ['EXPLAIN (10 min)'])
    const r50 = await repo.getTimeOptions(50)
    assert.deepEqual(r50.fits.map((f) => f.title), ['Índices (40 min)', 'EXPLAIN (10 min)'])
    const r5 = await repo.getTimeOptions(5, { category: 'eng' })
    assert.equal(r5.fits.length, 0)
    assert.deepEqual(r5.fallback.map((f) => f.kind), ['resume-note', 'cards'])
    assert.equal((await repo.getTimeOptions(50, { category: 'idiomas' })).fits.length, 0)
  })

  it('perguntas: tentativas múltiplas, ajuda usada, pular; erro vira "revisitar"', async () => {
    const t = await repo.createTopic({ name: 'Redes' })
    const q1 = await repo.createQuestion({ topicId: t.id, prompt: 'Explique o 3-way handshake sem olhar', reference: 'SYN, SYN-ACK, ACK', hint: 'são 3 mensagens' })
    const q2 = await repo.createQuestion({ topicId: t.id, prompt: 'Por que TIME_WAIT existe?' })
    await repo.recordAttempt(q1.id, { answer: 'SYN e ACK', helpUsed: 'hint', outcome: 'partial' })
    await repo.recordAttempt(q2.id, { outcome: 'skipped' })
    let list = await repo.listQuestions({})
    assert.equal(list[0].id, q1.id) // erro para revisitar primeiro
    assert.equal(list[0].revisit, 1)
    await repo.recordAttempt(q1.id, { answer: 'SYN, SYN-ACK, ACK', outcome: 'ok' })
    list = await repo.listQuestions({})
    assert.equal(list.find((q) => q.id === q1.id)!.attempts, 2)
    assert.equal(list.find((q) => q.id === q1.id)!.revisit, 0)
    const atts = await repo.listAttempts(q1.id)
    assert.equal(atts[1].helpUsed, 'hint')
  })
})

describe('captura: fonte externa, importação sem duplicar, checkpoint', () => {
  beforeEach(resetStudies)

  it('importar o mesmo TXT de novo reconhece a origem e propõe atualizar ou ignorar', async () => {
    const t = await repo.createTopic({ name: 'Mandarim', kind: 'language', targetLanguage: 'zh' })
    const f = { path: 'notas/aula-1.txt', content: '你好 = olá\n谢谢 = obrigado', hash: 'h1' }
    assert.equal((await repo.previewImport(t.id, [f]))[0].status, 'new')
    assert.deepEqual(await repo.applyImport(t.id, null, [{ ...f, decision: 'create' }]), { created: 1, updated: 0, skipped: 0 })
    assert.equal((await repo.previewImport(t.id, [f]))[0].status, 'unchanged')
    assert.deepEqual(await repo.applyImport(t.id, null, [{ ...f, decision: 'create' }]), { created: 0, updated: 0, skipped: 1 })
    const f2 = { ...f, content: f.content + '\n再见 = tchau', hash: 'h2' }
    assert.equal((await repo.previewImport(t.id, [f2]))[0].status, 'changed')
    await repo.applyImport(t.id, null, [{ ...f2, decision: 'update' }])
    const src = await repo.listSources(t.id)
    assert.equal(src.length, 1)
    assert.ok(src[0].content.includes('再见'))
    assert.equal(src[0].kind, 'file')
  })

  it('link com localizador e checkpoint de leitura', async () => {
    const t = await repo.createTopic({ name: 'Unity netcode' })
    const s = await repo.createSource({ topicId: t.id, kind: 'link', title: 'Palestra GDC', url: 'https://example.com/v', locator: '12:34' })
    await repo.saveCheckpoint({ topicId: t.id, target: 'source', refId: s.id, position: '{"scroll":0.4}' })
    await repo.saveCheckpoint({ topicId: t.id, target: 'source', refId: s.id, position: '{"scroll":0.6}', whereStopped: 'rollback' })
    await repo.saveCheckpoint({ topicId: t.id, target: 'source', refId: s.id, position: '{"scroll":0.7}' }) // mantém a frase
    const cp = await repo.getCheckpoint(t.id, null, 'source', s.id)
    assert.deepEqual([cp!.position, cp!.whereStopped], ['{"scroll":0.7}', 'rollback'])
  })
})

describe('zero chamadas ao provedor', () => {
  it('abrir, alterar tempo/categoria/idioma/tópico, revisar e filtrar não chamam IA', async () => {
    chamadas.reset()
    const t = await repo.createTopic({ name: 'Mandarim', kind: 'language', targetLanguage: 'zh', category: 'idiomas' })
    const c = await repo.createCard({ topicId: t.id, nodeId: null, front: '你好', back: 'olá', reverse: true })
    await repo.getLibrary()
    await repo.getContinue()
    for (const m of [10, 25, 50]) await repo.getTimeOptions(m, {})
    await repo.getTimeOptions(25, { category: 'idiomas' })
    await repo.getTimeOptions(25, { language: 'zh' })
    await repo.getTimeOptions(25, { topicId: t.id })
    const q = await repo.getReviewQueue({ language: 'zh' })
    await repo.reviewState(q.items[0].state.id, 'good')
    await repo.listCards({ topicId: t.id, categoryId: 'none' })
    await repo.setCardStatus(c.id, 'suspended')
    await repo.listQuestions({})
    assert.equal(chamadas.total(), 0)
  })
})
