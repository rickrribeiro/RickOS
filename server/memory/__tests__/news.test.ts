import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { isolateDb, resetMemory } from './helpers'

isolateDb('memory-news')

/* eslint-disable @typescript-eslint/consistent-type-imports */
let repo: typeof import('../repo')
let ai: typeof import('../ai')
let sug: typeof import('../suggestions')
let jobs: typeof import('../jobs')
let integ: typeof import('../integrations')
let news: typeof import('../../services/news')
let queries: typeof import('../../database/queries')
const OWNER = 'me'

let prompts: string[] = []
let responder: () => string = () => '{"suggestions":[]}'

before(async () => {
  repo = await import('../repo')
  ai = await import('../ai')
  sug = await import('../suggestions')
  jobs = await import('../jobs')
  integ = await import('../integrations')
  news = await import('../../services/news')
  queries = await import('../../database/queries')
  ai.setMemoryAi({
    id: 'mock',
    async complete(_system, prompt) {
      prompts.push(prompt)
      return responder()
    }
  })
})
after(() => ai.setMemoryAi(null))
beforeEach(async () => {
  await resetMemory()
  await repo.ensureSeeded(OWNER)
  await queries.setSetting('news_reads', '[]')
  await queries.setSetting('news_categories', '')
  await queries.setSetting('news_digest', '')
  prompts = []
  responder = () => '{"suggestions":[]}'
})

const catId = async (slug: string): Promise<number> => (await repo.listCategories(OWNER)).find((c) => c.slug === slug)!.id

const DIGEST = {
  generatedAt: '2026-11-25T10:00:00.000Z',
  targetDate: '2026-11-24',
  model: 'gemini-2.5-flash',
  categories: [
    {
      categoria: 'Tech',
      collected: 3,
      topics: [{ categoria: 'Tech', titulo_resumido: 'Nvidia anuncia nova GPU', resumo_curto: 'Chip voltado a IA.', url_fonte: 'https://news.google.com/rss/articles/abc' }]
    }
  ]
}

describe('Resumo de Notícias × Memória Pessoal (news.digest)', () => {
  it('consumo: só interesses/objetivos/profissional NORMAL — nada de finanças, saúde ou relacionamentos', async () => {
    await repo.createMemory(OWNER, { content: 'Acompanho de perto o mercado de GPUs e a Nvidia.', categoryId: await catId('interesses'), type: 'PREFERENCE' })
    await repo.createMemory(OWNER, { content: 'Tenho ações da Nvidia na carteira.', categoryId: await catId('financas') })
    await repo.createMemory(OWNER, { content: 'Uso GPU Nvidia para tratar insônia jogando.', categoryId: await catId('saude') })
    const r = await integ.newsDigestContext('Tech', ['Nvidia anuncia nova GPU', 'Apple lança iPhone'])
    assert.equal(r.allowed, true)
    assert.match(r.block, /mercado de GPUs/)
    assert.doesNotMatch(r.block, /ações|carteira|insônia/)
    assert.ok(r.tokens <= 300)
    assert.equal(prompts.length, 0, 'consumo não chama LLM')
  })

  it('consumo respeita o desligamento global dos consumers', async () => {
    await repo.createMemory(OWNER, { content: 'Acompanho de perto o mercado de GPUs e a Nvidia.', categoryId: await catId('interesses') })
    await queries.setSetting('memory_consumers_enabled', '0')
    const r = await integ.newsDigestContext('Tech', ['Nvidia anuncia nova GPU'])
    assert.equal(r.allowed, false)
    assert.equal(r.block, '')
  })

  it('leitura só registra tópicos do resumo salvo e sem duplicar', async () => {
    await queries.setSetting('news_digest', JSON.stringify(DIGEST))
    assert.equal(await news.markNewsRead('https://evil.example/x'), 0)
    assert.equal(await news.markNewsRead(DIGEST.categories[0].topics[0].url_fonte), 1)
    assert.equal(await news.markNewsRead(DIGEST.categories[0].topics[0].url_fonte), 1)
  })

  it('produção: sem leituras nem categorias próprias, recusa; com leituras, vira sugestão no Inbox', async () => {
    const channels = new Map<string, (e: unknown, ...a: unknown[]) => unknown>()
    integ.registerMemoryIntegrations((ch, fn) => channels.set(ch, fn))
    const produce = (): Promise<number> => Promise.resolve(channels.get('memory:produceNews')!(null)) as Promise<number>

    await assert.rejects(produce(), /Ler mais/)

    await queries.setSetting('news_digest', JSON.stringify(DIGEST))
    await news.setNewsCategories(['Brasil', 'Mundo', 'Tech', 'Finance', 'Games'])
    await news.markNewsRead(DIGEST.categories[0].topics[0].url_fonte)
    responder = () =>
      '```json\n' +
      JSON.stringify({ suggestions: [{ op: 'CREATE', content: 'Tenho interesse em GPUs e hardware para IA.', category: 'interesses', type: 'PREFERENCE', explicit: false, evidence: 'Nvidia anuncia nova GPU' }] }) +
      '\n```'
    const jobId = await produce()
    for (let i = 0; i < 100 && (await jobs.getJob(jobId))?.status !== 'done'; i++) await new Promise((r) => setTimeout(r, 10))
    assert.match(prompts.join('\n'), /Games/)
    assert.match(prompts.join('\n'), /Nvidia anuncia nova GPU/)
    const [s] = await sug.listSuggestions(OWNER)
    assert.equal(s.sourceKind, 'producer')
    assert.match(s.sourceRef ?? '', /^noticias#/)
    assert.equal((await repo.listMemories(OWNER)).total, 0, 'nunca cria memória direto')
  })
})
