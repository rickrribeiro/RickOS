/**
 * Resumo Diário de Notícias: coleta no Google News RSS (por categoria) + síntese com o
 * Gemini (`@google/genai`, saída JSON via `responseSchema`). Guarda só a ÚLTIMA busca
 * (cada busca nova sobrescreve) nas settings `news_digest` / `news_categories`.
 *
 * Memória Pessoal (caso de uso `news.digest`, aprovado em 2026-11-25 — docs/memoria/integracoes.md):
 * • consome: `newsDigestContext` (memory/integrations.ts) entra no prompt do Gemini para priorizar;
 * • produz: as notícias abertas em "Ler mais" ficam em `news_reads` e viram evidência do canal
 *   `memory:produceNews`, só quando o usuário clica em "Sugerir memórias".
 */
import { GoogleGenAI, Type } from '@google/genai'
import { getSetting, setSetting } from '../database/queries'
import { decodeSecret } from './secrets'
import { broadcast } from '../events'
import { newsDigestContext } from '../memory/integrations'
import {
  NEWS_DEFAULT_CATEGORIES,
  type NewsCategoryDigest,
  type NewsConfig,
  type NewsDigest,
  type NewsState,
  type NewsTopic
} from '../../shared/news'
import { tt } from '../i18n'
import { MODELO_NOTICIAS } from '../../shared/prompts/noticias/resumoCategoria'
import { montarChamada } from '../ia/gateway'

export const GEMINI_KEY_SETTING = 'gemini_api_key'
const CATEGORIES_SETTING = 'news_categories'
const DIGEST_SETTING = 'news_digest'
/** Notícias abertas em "Ler mais" (últimas MAX_READS), evidência para sugerir memórias. */
const READS_SETTING = 'news_reads'
const MAX_READS = 60
const MODEL = MODELO_NOTICIAS
/** Notícias do dia-alvo mandadas ao Gemini por categoria (o feed já vem por relevância). */
const MAX_ITEMS_PER_CATEGORY = 20
const MAX_TOPICS_PER_CATEGORY = 6

/**
 * Categorias padrão usam a seção editorial do Google Notícias (manchetes curadas, bem menos
 * ruído que a busca pela palavra). As do usuário usam a busca (`q=<categoria> when:2d`).
 */
const TOPIC_BY_CATEGORY: Record<string, string> = {
  brasil: 'NATION',
  mundo: 'WORLD',
  tech: 'TECHNOLOGY',
  finance: 'BUSINESS'
}

// ─── Configuração ─────────────────────────────────────────────────────────────

async function geminiKey(): Promise<string | null> {
  return decodeSecret(await getSetting(GEMINI_KEY_SETTING))?.trim() || null
}

export async function getNewsCategories(): Promise<string[]> {
  const raw = await getSetting(CATEGORIES_SETTING)
  if (!raw) return [...NEWS_DEFAULT_CATEGORIES]
  try {
    const list = JSON.parse(raw)
    if (Array.isArray(list)) return list.filter((c): c is string => typeof c === 'string' && !!c.trim())
  } catch {
    // setting corrompida: volta ao padrão
  }
  return [...NEWS_DEFAULT_CATEGORIES]
}

export async function setNewsCategories(list: string[]): Promise<string[]> {
  const seen = new Set<string>()
  const clean: string[] = []
  for (const c of list) {
    const name = String(c ?? '').trim().slice(0, 40)
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    clean.push(name)
  }
  await setSetting(CATEGORIES_SETTING, JSON.stringify(clean))
  broadcast('news:updated', { kind: 'categories' })
  return clean
}

export async function getNewsConfig(): Promise<NewsConfig> {
  return { hasGeminiKey: !!(await geminiKey()), categories: await getNewsCategories() }
}

export async function getNewsDigest(): Promise<NewsDigest | null> {
  const raw = await getSetting(DIGEST_SETTING)
  if (!raw) return null
  try {
    return JSON.parse(raw) as NewsDigest
  } catch {
    return null
  }
}

export async function getNewsState(): Promise<NewsState> {
  return {
    config: await getNewsConfig(),
    digest: await getNewsDigest(),
    readsCount: (await getReads()).length,
    generating: runInfo,
    lastError
  }
}

// ─── Leituras (evidência para a Memória Pessoal) ──────────────────────────────

interface NewsRead {
  at: string
  categoria: string
  titulo: string
  resumo: string
  url: string
}

async function getReads(): Promise<NewsRead[]> {
  try {
    const list = JSON.parse((await getSetting(READS_SETTING)) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** Registra um "Ler mais". Só aceita tópicos do resumo salvo (nunca texto vindo do front). */
export async function markNewsRead(url: string): Promise<number> {
  const digest = await getNewsDigest()
  const topic = digest?.categories.flatMap((c) => c.topics).find((t) => t.url_fonte === url)
  const reads = await getReads()
  if (!topic || reads.some((r) => r.url === url)) return reads.length
  reads.unshift({ at: new Date().toISOString(), categoria: topic.categoria, titulo: topic.titulo_resumido, resumo: topic.resumo_curto, url })
  await setSetting(READS_SETTING, JSON.stringify(reads.slice(0, MAX_READS)))
  broadcast('news:updated', { kind: 'reads' })
  return Math.min(reads.length, MAX_READS)
}

/** Texto-evidência para `memory:produceNews`: categorias personalizadas + notícias que o usuário abriu. */
export async function newsReadingEvidence(): Promise<string> {
  const custom = (await getNewsCategories()).filter((c) => !NEWS_DEFAULT_CATEGORIES.includes(c))
  const reads = await getReads()
  if (!reads.length && !custom.length) {
    throw new Error(tt('services.abraAlgumasNoticiasEmLer'))
  }
  const lines = [
    'Evidência de interesses vinda do meu Resumo Diário de Notícias (comportamento, não afirmações explícitas).',
    custom.length ? `Categorias de notícias que cadastrei para acompanhar: ${custom.join(', ')}.` : '',
    reads.length ? 'Notícias que escolhi abrir para ler mais:' : '',
    ...reads.map((r) => `- [${r.at.slice(0, 10)} · ${r.categoria}] ${r.titulo} — ${r.resumo}`)
  ]
  return lines.filter(Boolean).join('\n')
}

// ─── Coleta (Google News RSS) ─────────────────────────────────────────────────

interface FeedItem {
  title: string
  link: string
  pubDate: string
  source: string
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .trim()
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? decodeXml(m[1]) : ''
}

export function parseRss(xml: string): FeedItem[] {
  const items: FeedItem[] = []
  for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = m[1]
    const source = tag(block, 'source')
    let title = tag(block, 'title')
    // O Google News anexa " - Veículo" ao título
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3))
    const link = tag(block, 'link')
    if (title && link) items.push({ title, link, pubDate: tag(block, 'pubDate'), source })
  }
  return items
}

const FEED_LOCALE = 'hl=pt-BR&gl=BR&ceid=BR:pt-419'

function feedUrl(category: string): string {
  const topic = TOPIC_BY_CATEGORY[category.toLowerCase()]
  if (topic) return `https://news.google.com/rss/headlines/section/topic/${topic}?${FEED_LOCALE}`
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${category} when:2d`)}&${FEED_LOCALE}`
}

/** Data local (YYYY-MM-DD) de um instante, dado o `getTimezoneOffset()` do cliente. */
function localDay(date: Date, tzOffsetMin: number): string {
  return new Date(date.getTime() - tzOffsetMin * 60_000).toISOString().slice(0, 10)
}

async function collect(category: string, targetDate: string, tzOffsetMin: number): Promise<FeedItem[]> {
  const res = await fetch(feedUrl(category), {
    headers: { 'User-Agent': 'Mozilla/5.0 (rickOS news digest)' },
    signal: AbortSignal.timeout(20_000)
  })
  if (!res.ok) throw new Error(tt('services.googleNewsRespondeu', { status: res.status }))
  const items = parseRss(await res.text())
  const seen = new Set<string>()
  return items
    .filter((it) => {
      const d = new Date(it.pubDate)
      if (isNaN(d.getTime()) || localDay(d, tzOffsetMin) !== targetDate) return false
      const k = it.title.toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .slice(0, MAX_ITEMS_PER_CATEGORY)
}

// ─── Síntese (Gemini) ─────────────────────────────────────────────────────────

const TOPICS_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      indice: { type: Type.INTEGER, description: 'Número [n] da notícia de origem na lista enviada' },
      categoria: { type: Type.STRING },
      titulo_resumido: { type: Type.STRING, description: 'Título curto e objetivo, em pt-BR' },
      resumo_curto: { type: Type.STRING, description: 'Uma ou duas frases objetivas, em pt-BR' },
      url_fonte: { type: Type.STRING, description: 'URL exata da notícia de origem, copiada da lista' }
    },
    required: ['indice', 'categoria', 'titulo_resumido', 'resumo_curto', 'url_fonte'],
    propertyOrdering: ['indice', 'categoria', 'titulo_resumido', 'resumo_curto', 'url_fonte']
  }
}

/** Contexto da Memória Pessoal para a categoria (vazio se nada relevante, bloqueado ou erro). */
async function memoryFor(category: string, items: FeedItem[]): Promise<{ block: string; count: number }> {
  try {
    const c = await newsDigestContext(category, items.map((it) => it.title))
    return c.allowed && c.block ? { block: c.block, count: c.items.length } : { block: '', count: 0 }
  } catch {
    return { block: '', count: 0 }
  }
}

async function summarize(
  ai: GoogleGenAI,
  category: string,
  targetDate: string,
  items: FeedItem[],
  memory: string
): Promise<NewsTopic[]> {
  const list = items
    .map((it, i) => `[${i + 1}] ${it.title}${it.source ? ` (${it.source})` : ''}\nURL: ${it.link}`)
    .join('\n')
  // prompt (padrão ou sobrescrito) e modelo vêm do gateway; o Gemini é chamado aqui pelo schema de resposta
  const chamada = await montarChamada('noticias.resumo', { data: targetDate, categoria: category, maxTopicos: MAX_TOPICS_PER_CATEGORY, memoria: memory, manchetes: list })
  const prompt = chamada.prompt

  const res = await ai.models.generateContent({
    model: chamada.modelo || MODEL,
    contents: prompt,
    config: { responseMimeType: 'application/json', responseSchema: TOPICS_SCHEMA, temperature: 0.3 }
  })
  const parsed = JSON.parse(res.text ?? '[]') as Array<Partial<NewsTopic> & { indice?: number }>
  const out: NewsTopic[] = []
  const used = new Set<number>()
  for (const t of Array.isArray(parsed) ? parsed : []) {
    // O link vem SEMPRE da lista coletada (pelo índice, ou pela URL se o índice falhar): nunca um link inventado.
    let idx = typeof t.indice === 'number' ? t.indice - 1 : -1
    if (!items[idx]) idx = items.findIndex((it) => it.link === t.url_fonte)
    const src = items[idx]
    if (!src || used.has(idx) || !t.titulo_resumido) continue
    used.add(idx)
    out.push({
      categoria: category,
      titulo_resumido: String(t.titulo_resumido),
      resumo_curto: String(t.resumo_curto ?? ''),
      url_fonte: src.link,
      fonte: src.source || undefined
    })
  }
  return out.slice(0, MAX_TOPICS_PER_CATEGORY)
}

// ─── Busca completa ───────────────────────────────────────────────────────────

let running: Promise<NewsDigest> | null = null
/** O que está rodando agora e o erro da última busca: entram no `news:state` para o card/modal acompanharem a busca em segundo plano. */
let runInfo: NewsState['generating'] = null
let lastError: string | null = null

/** Chamadas simultâneas ao Gemini: o plano gratuito tem limite baixo por minuto. */
const GEMINI_CONCURRENCY = 2
const MAX_RETRIES = 2

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** 429 por minuto: espera o `retryDelay` sugerido pela API (máx. 30 s) e tenta de novo. Cota diária não adianta esperar. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const rateLimited = /429|RESOURCE_EXHAUSTED/i.test(msg) && !/PerDay/i.test(msg)
      if (!rateLimited || attempt >= MAX_RETRIES) throw e
      const suggested = Number(msg.match(/retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/)?.[1])
      await sleep(Math.min(Number.isFinite(suggested) && suggested > 0 ? suggested * 1000 + 500 : 15_000 * (attempt + 1), 30_000))
    }
  }
}

/** Fila simples: no máximo `limit` tarefas ao mesmo tempo. */
function limiter(limit: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let active = 0
  const queue: (() => void)[] = []
  return async (fn) => {
    if (active >= limit) await new Promise<void>((r) => queue.push(r))
    active++
    try {
      return await fn()
    } finally {
      active--
      queue.shift()?.()
    }
  }
}

/**
 * Coleta + resume as categorias e SOBRESCREVE o resumo salvo.
 * `targetDate`/`tzOffsetMin` vêm do cliente (o "ontem" é o do usuário, não o do servidor).
 * `only`: refaz só essas categorias (ex.: as que falharam) e mantém o resto do resumo salvo.
 */
export function generateNewsDigest(targetDate: string, tzOffsetMin: number, only?: string[]): Promise<NewsDigest> {
  if (running) return running
  runInfo = { only: Array.isArray(only) && only.length ? only : null, startedAt: new Date().toISOString() }
  lastError = null
  broadcast('news:updated', { kind: 'running' })
  running = (async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) throw new Error('Data inválida.')
    const key = await geminiKey()
    if (!key) throw new Error('Configure a chave de API do Google Gemini em Configurações → Resumo de Notícias.')
    const categories = await getNewsCategories()
    if (!categories.length) throw new Error('Cadastre ao menos uma categoria.')

    const previous = await getNewsDigest()
    const partial = Array.isArray(only) && only.length > 0
    if (partial && previous?.targetDate !== targetDate) throw new Error('O resumo salvo é de outro dia: busque todas as categorias de novo.')
    const targets = partial ? categories.filter((c) => only!.includes(c)) : categories
    if (!targets.length) throw new Error('Nenhuma das categorias pedidas está cadastrada.')

    // A SDK 3.x usa `v1` por padrão; JSON mode (`responseSchema`) só existe na `v1beta`.
    const ai = new GoogleGenAI({ apiKey: key, apiVersion: 'v1beta' })
    const offset = Number.isFinite(tzOffsetMin) ? tzOffsetMin : 0
    const gemini = limiter(GEMINI_CONCURRENCY)

    const fresh = await Promise.all(
      targets.map(async (categoria): Promise<NewsCategoryDigest> => {
        let items: FeedItem[] = []
        try {
          items = await collect(categoria, targetDate, offset)
          if (!items.length) return { categoria, topics: [], collected: 0 }
          const mem = await memoryFor(categoria, items)
          const topics = await gemini(() => withRetry(() => summarize(ai, categoria, targetDate, items, mem.block)))
          return { categoria, topics, collected: items.length, memoryItems: mem.count || undefined }
        } catch (e) {
          return { categoria, topics: [], collected: items.length, error: friendlyError(e) }
        }
      })
    )
    // Busca completa que falhou inteira não apaga o resumo anterior.
    if (!partial && fresh.every((r) => r.error)) throw new Error(fresh[0].error)

    const byName = new Map<string, NewsCategoryDigest>()
    if (partial) for (const c of previous!.categories) byName.set(c.categoria, c)
    for (const c of fresh) byName.set(c.categoria, c)
    const merged = categories.map((c) => byName.get(c)).filter((c): c is NewsCategoryDigest => !!c)

    const digest: NewsDigest = { generatedAt: new Date().toISOString(), targetDate, model: MODEL, categories: merged }
    await setSetting(DIGEST_SETTING, JSON.stringify(digest))
    return digest
  })()
    .catch((e: unknown) => {
      lastError = e instanceof Error ? e.message : String(e)
      throw e
    })
    .finally(() => {
      running = null
      runInfo = null
      broadcast('news:updated', { kind: 'digest' })
    })
  return running
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(msg)) return 'Chave do Gemini inválida ou sem permissão.'
  if (/PerDay/i.test(msg)) return 'Cota diária do Gemini esgotada. Tente amanhã ou use uma chave com faturamento.'
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) return 'Limite de uso do Gemini atingido. Tente de novo em instantes.'
  if (/timeout|aborted/i.test(msg)) return 'Tempo esgotado ao buscar notícias.'
  return msg.slice(0, 300)
}
