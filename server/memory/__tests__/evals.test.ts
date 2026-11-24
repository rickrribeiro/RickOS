import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { isolateDb, resetMemory } from './helpers'

isolateDb('memory-evals')

/* eslint-disable @typescript-eslint/consistent-type-imports */
let repo: typeof import('../repo')
let ctx: typeof import('../context')
let cases: typeof import('../evals/cases')
const ids = new Map<string, number>()

/**
 * Avaliação de recuperação (determinística): precisão/recall sobre um perfil fictício,
 * incluindo casos em que o certo é devolver NADA. Integrações candidatas são avaliadas
 * pelo modo simulação (mesma política, sem aprovação, sem LLM).
 */
before(async () => {
  repo = await import('../repo')
  ctx = await import('../context')
  cases = await import('../evals/cases')
  await resetMemory()
  const cats = await repo.listCategories('me')
  for (const f of cases.FIXTURE) {
    const m = await repo.createMemory('me', { ...f, categoryId: cats.find((c) => c.slug === f.category)!.id })
    ids.set(f.key, m.id)
  }
})

describe('evals de recuperação', () => {
  const scores: { name: string; precision: number; recall: number }[] = []

  it('cada caso respeita inclusões, exclusões e contexto vazio', async () => {
    for (const c of cases.RETRIEVAL_CASES) {
      ctx.clearContextCache()
      const r = await ctx.getMemoryContext({ useCase: c.useCase, query: c.query, simulate: true })
      assert.equal(r.allowed, true, `${c.name}: ${r.blockedReason}`)
      const got = new Set(r.items.map((i) => i.id))
      const keyOf = (id: number): string => [...ids.entries()].find(([, v]) => v === id)?.[0] ?? `#${id}`
      for (const k of c.mustExclude) assert.ok(!got.has(ids.get(k)!), `${c.name}: não devia trazer "${k}" (veio: ${[...got].map(keyOf).join(', ')})`)
      for (const k of c.mustInclude) assert.ok(got.has(ids.get(k)!), `${c.name}: devia trazer "${k}" (veio: ${[...got].map(keyOf).join(', ')})`)
      if (c.expectEmpty) assert.equal(r.items.length, 0, `${c.name}: devia ser vazio (veio: ${[...got].map(keyOf).join(', ')})`)
      assert.ok(r.tokens <= r.budget)
      const relevant = new Set(c.mustInclude.map((k) => ids.get(k)!))
      const tp = [...got].filter((id) => relevant.has(id)).length
      scores.push({ name: c.name, precision: got.size ? tp / got.size : c.expectEmpty || !relevant.size ? 1 : 0, recall: relevant.size ? tp / relevant.size : 1 })
    }
  })

  it('placar agregado acima do mínimo', () => {
    const avg = (k: 'precision' | 'recall'): number => scores.reduce((s, x) => s + x[k], 0) / scores.length
    // precisão é "pelo menos não-irrelevante": itens fora de mustInclude podem ser aceitáveis, então o limiar é moderado
    assert.ok(avg('recall') === 1, `recall médio ${avg('recall')}`)
    assert.ok(avg('precision') >= 0.6, `precisão média ${avg('precision').toFixed(2)}`)
  })
})
