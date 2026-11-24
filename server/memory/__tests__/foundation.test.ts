import assert from 'node:assert/strict'
import { before, beforeEach, describe, it } from 'node:test'
import { isolateDb, resetMemory } from './helpers'

isolateDb('memory-foundation')

/* eslint-disable @typescript-eslint/consistent-type-imports */
let repo: typeof import('../repo')
let policy: typeof import('../policy')
let queries: typeof import('../../database/queries')
const OWNER = 'me'

before(async () => {
  repo = await import('../repo')
  policy = await import('../policy')
  queries = await import('../../database/queries')
})
beforeEach(() => resetMemory())

const catId = async (slug: string): Promise<number> => (await repo.listCategories(OWNER)).find((c) => c.slug === slug)!.id

describe('categorias', () => {
  it('semeia as categorias iniciais uma única vez', async () => {
    const a = await repo.listCategories(OWNER)
    assert.equal(a.length, repo.SEED_CATEGORIES.length)
    repo.resetSeedCache()
    const b = await repo.listCategories(OWNER)
    assert.equal(b.length, a.length)
    assert.equal(a.find((c) => c.slug === 'saude')?.defaultSensitivity, 'PRIVATE')
  })

  it('cria, renomeia, arquiva e reordena sem mudar código', async () => {
    const c = await repo.createCategory(OWNER, { name: 'Música', icon: '🎵' })
    assert.equal(c.slug, 'musica')
    const c2 = await repo.createCategory(OWNER, { name: 'Música' })
    assert.equal(c2.slug, 'musica-2')
    const r = await repo.updateCategory(OWNER, c.id, { name: 'Música e shows', archived: true })
    assert.equal(r.name, 'Música e shows')
    assert.ok(r.archivedAt)
    assert.equal((await repo.listCategories(OWNER, false)).some((x) => x.id === c.id), false)
    await repo.reorderCategories(OWNER, [c2.id, c.id])
    const all = await repo.listCategories(OWNER)
    assert.equal(all[0].id, c2.id)
  })
})

describe('memórias', () => {
  it('cria memória manual confirmada com evidência e revisão', async () => {
    const m = await repo.createMemory(OWNER, { content: 'Seoul é minha cidade favorita.', categoryId: await catId('viagens'), type: 'PREFERENCE', tags: ['Coreia', 'cidades'] })
    assert.equal(m.status, 'active')
    assert.equal(m.reliability, 'stated')
    assert.ok(m.confirmedAt)
    assert.equal(m.layer, 'semantic')
    assert.deepEqual(m.tags, ['coreia', 'cidades'])
    assert.equal(m.title, 'Seoul é minha cidade favorita')
    const d = await repo.getMemoryDetail(OWNER, m.id)
    assert.equal(d!.evidence.length, 1)
    assert.equal(d!.evidence[0].sourceKind, 'manual')
    assert.equal(d!.revisions[0].changeKind, 'create')
  })

  it('rejeita conteúdo vazio e categoria de outro dono', async () => {
    await assert.rejects(repo.createMemory(OWNER, { content: '   ' }), /obrigatório/)
    const other = await repo.createCategory('outro', { name: 'X' })
    await assert.rejects(repo.createMemory(OWNER, { content: 'a', categoryId: other.id }), /Categoria inválida/)
  })

  it('atualização preserva o estado anterior e usa versão otimista', async () => {
    const m = await repo.createMemory(OWNER, { content: 'Prefiro hospedagens econômicas.' })
    const u = await repo.updateMemory(OWNER, m.id, { content: 'Prefiro hospedagens econômicas, mas com quarto privativo.' }, { expectedVersion: m.version })
    assert.equal(u.version, 2)
    const d = await repo.getMemoryDetail(OWNER, m.id)
    assert.equal(d!.revisions[0].changeKind, 'update')
    assert.equal(d!.revisions[0].snapshot?.content, 'Prefiro hospedagens econômicas.')
    await assert.rejects(repo.updateMemory(OWNER, m.id, { content: 'x' }, { expectedVersion: 1 }), (e: Error & { code?: string }) => e.code === 'conflict')
  })

  it('arquivar ≠ excluir; restaurar volta a ativa', async () => {
    const m = await repo.createMemory(OWNER, { content: 'Trabalho remotamente.' })
    await repo.setStatus(OWNER, m.id, 'archived')
    assert.equal((await repo.listMemories(OWNER)).total, 0)
    assert.equal((await repo.listMemories(OWNER, { status: 'archived' })).total, 1)
    const r = await repo.setStatus(OWNER, m.id, 'active')
    assert.equal(r.status, 'active')
    assert.equal((await repo.getMemoryDetail(OWNER, m.id))!.revisions.length, 3)
  })

  it('exclusão definitiva remove derivados e deixa só tombstone', async () => {
    const a = await repo.createMemory(OWNER, { content: 'Gosto de ramen.' })
    const b = await repo.createMemory(OWNER, { content: 'Gosto de izakaya.' })
    await repo.addRelation(OWNER, a.id, b.id, 'RELATED_TO')
    await repo.updateMemory(OWNER, a.id, { content: 'Gosto muito de ramen.' })
    const { getDb } = await import('../../database/db')
    const db = await getDb()
    db.run(`INSERT INTO memory_usage (ownerId, createdAt, useCase, selected) VALUES ('me', '2026-01-01', 'x', '[{"id":${a.id},"score":1},{"id":${b.id},"score":1}]')`)
    assert.equal(await repo.hardDelete(OWNER, a.id), true)
    const count = (sql: string): number => Number(db.exec(sql)[0]?.values[0][0] ?? 0)
    assert.equal(count(`SELECT COUNT(*) FROM memories WHERE id = ${a.id}`), 0)
    assert.equal(count(`SELECT COUNT(*) FROM memory_revisions WHERE memoryId = ${a.id}`), 0)
    assert.equal(count(`SELECT COUNT(*) FROM memory_evidence WHERE memoryId = ${a.id}`), 0)
    assert.equal(count(`SELECT COUNT(*) FROM memory_relations`), 0)
    assert.equal(count(`SELECT COUNT(*) FROM memory_tombstones WHERE memoryId = ${a.id}`), 1)
    const sel = String(db.exec('SELECT selected FROM memory_usage')[0].values[0][0])
    assert.ok(!sel.includes(`"id":${a.id},`))
    assert.ok(sel.includes(`"id":${b.id}`))
  })

  it('expira memórias com validade vencida', async () => {
    const m = await repo.createMemory(OWNER, { content: 'Estou morando em Lisboa.', validUntil: '2020-01-01' })
    const page = await repo.listMemories(OWNER, { status: 'all' })
    assert.equal(page.items.find((x) => x.id === m.id)?.status, 'expired')
  })

  it('isola dados por dono', async () => {
    await repo.createMemory(OWNER, { content: 'Memória minha.' })
    await repo.createMemory('outro', { content: 'Memória de outro.' })
    const mine = await repo.listMemories(OWNER, { status: 'all' })
    assert.equal(mine.total, 1)
    const other = (await repo.listMemories('outro', { status: 'all' })).items[0]
    assert.equal(await repo.getMemory(OWNER, other.id), null)
    assert.equal(await repo.hardDelete(OWNER, other.id), false)
    await assert.rejects(repo.updateMemory(OWNER, other.id, { content: 'x' }), /não encontrada/)
  })

  it('busca ignora acentos e filtra por categoria/tipo/tag/sensibilidade', async () => {
    await repo.createMemory(OWNER, { content: 'Ação rápida é importante para mim.', type: 'PREFERENCE', tags: ['trabalho'] })
    await repo.createMemory(OWNER, { content: 'Tenho rinite.', categoryId: await catId('saude'), sensitivity: 'RESTRICTED' })
    assert.equal((await repo.listMemories(OWNER, { q: 'acao' })).total, 1)
    assert.equal((await repo.listMemories(OWNER, { type: 'PREFERENCE' })).total, 1)
    assert.equal((await repo.listMemories(OWNER, { tag: 'trabalho' })).total, 1)
    assert.equal((await repo.listMemories(OWNER, { sensitivity: 'RESTRICTED' })).total, 1)
    const health = (await repo.listMemories(OWNER, { categoryId: await catId('saude') })).items[0]
    assert.equal(health.effectiveSensitivity, 'RESTRICTED')
  })

  it('sensibilidade efetiva herda a da categoria', async () => {
    const m = await repo.createMemory(OWNER, { content: 'Guardo 20% da renda.', categoryId: await catId('financas') })
    assert.equal(m.sensitivity, 'NORMAL')
    assert.equal(m.effectiveSensitivity, 'PRIVATE')
  })
})

describe('política de acesso', () => {
  it('nega casos de uso não registrados (deny-by-default)', async () => {
    for (const uc of ['flights.search', 'projects.analysis', 'chats.reply', 'prompt-runner', '', '__proto__']) {
      assert.equal((await policy.resolveConsume(uc)).ok, false, uc)
      assert.equal((await policy.resolveProduce(uc)).ok, false, uc)
    }
  })

  it('integrações externas ficam bloqueadas até aprovação', async () => {
    for (const p of policy.MEMORY_POLICIES.filter((x) => !x.internal)) {
      assert.equal(p.approved, false, p.useCase)
      const r = await policy.resolveConsume(p.useCase)
      assert.equal(r.ok, false)
      if (!r.ok) assert.match(r.reason, /aprovação/)
    }
  })

  it('consumir e produzir são independentes', async () => {
    const all = policy.MEMORY_POLICIES
    assert.ok(all.some((p) => p.consume && !p.produce))
    assert.ok(all.some((p) => !p.consume && p.produce))
  })

  it('configurações só restringem, nunca ampliam', async () => {
    await queries.setSetting(
      policy.OVERRIDES_KEY,
      JSON.stringify({ 'memory.interview': { maxTokens: 999999, maxItems: 5, maxSensitivity: 'RESTRICTED', categories: ['viagens', 'inexistente'] } })
    )
    const r = await policy.resolveConsume('memory.interview')
    assert.ok(r.ok)
    if (!r.ok) return
    assert.equal(r.rule.maxTokens, 1500)
    assert.equal(r.rule.maxItems, 5)
    assert.equal(r.rule.maxSensitivity, 'NORMAL')
    assert.deepEqual(r.rule.categories, ['viagens', 'inexistente'])
    // base restrita: override com categoria nova não amplia
    const base: import('../policy').ConsumeRule = { categories: ['viagens'], maxSensitivity: 'NORMAL', maxTokens: 100, maxItems: 3, instructions: false }
    const n = policy.narrowConsume(base, { categories: ['viagens', 'saude', 'financas'], maxTokens: -5 })
    assert.deepEqual(n.categories, ['viagens'])
    assert.equal(n.maxTokens, 100)
  })

  it('override pode desligar um caso de uso interno', async () => {
    await queries.setSetting(policy.OVERRIDES_KEY, JSON.stringify({ 'memory.agent': { disabled: true } }))
    assert.equal((await policy.resolveConsume('memory.agent')).ok, false)
    assert.equal((await policy.resolveProduce('memory.agent')).ok, false)
    await queries.setSetting('memory_consumers_enabled', '0')
    assert.equal((await policy.resolveConsume('memory.interview')).ok, false)
  })

  it('a lista de políticas é imutável em tempo de execução', () => {
    assert.throws(() => (policy.MEMORY_POLICIES as unknown as unknown[]).push({}))
    try {
      ;(policy.MEMORY_POLICIES[7] as { approved: boolean }).approved = true
    } catch {
      // modo estrito lança; fora dele a escrita é ignorada
    }
    assert.equal(policy.MEMORY_POLICIES[7].approved, false)
    assert.ok(Object.isFrozen(policy.getPolicy('memory.agent')!.consume))
  })
})
