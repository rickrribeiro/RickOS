import { extractFromText } from './agent'
import { getMemoryContext, type MemoryContext } from './context'
import { startManualJob } from './jobs'
import { MemoryError } from './repo'

/**
 * Integrações APROVADAS com outros módulos (docs/memoria/integracoes.md, 2026-11-25).
 *
 * Cada canal fixa o `useCase` aqui no servidor: o front só manda a consulta (o que a
 * operação já sabe — destino, cidade, tarefas), nunca categorias, sensibilidade ou outro
 * caso de uso. A política (`policy.ts`) continua decidindo o que sai. Tudo é opcional:
 * memória vazia/indisponível devolve bloco vazio e a funcionalidade segue como antes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handle = (channel: string, fn: (event: unknown, ...args: any[]) => unknown) => void

export interface ConsumerBlock {
  allowed: boolean
  degraded: boolean
  /** Instruções pessoais + fatos, prontos para anexar ao prompt (vazio = nada relevante). */
  block: string
  /** Títulos das memórias usadas (para mostrar ao usuário / casar catálogos sem LLM). */
  items: { id: number; title: string; category: string | null }[]
  tokens: number
}

const q = (v: unknown, max = 1500): string => String(v ?? '').slice(0, max)

function toBlock(c: MemoryContext): ConsumerBlock {
  return {
    allowed: c.allowed,
    degraded: c.degraded,
    block: [c.instructions, c.text].filter(Boolean).join('\n\n'),
    items: c.items.map((i) => ({ id: i.id, title: i.title, category: i.category })),
    tokens: c.tokens
  }
}

const consume = async (useCase: string, query: string, purpose: string): Promise<ConsumerBlock> => toBlock(await getMemoryContext({ useCase, query, purpose }))

/** Produção por ação explícita do usuário: extrai já (sem esperar o agente periódico) e manda ao Inbox. */
async function produce(useCase: string, text: string, sourceRef: string): Promise<number> {
  const t = String(text ?? '').trim()
  if (t.length < 20) throw new MemoryError('Escreva um pouco mais para a IA sugerir memórias.')
  if (t.length > 20000) throw new MemoryError('Texto longo demais (máx. 20 mil caracteres).')
  return startManualJob('produce', () => extractFromText({ useCase, text: t, sourceKind: 'producer', sourceRef, op: 'agente' }))
}

export function registerMemoryIntegrations(handle: Handle): void {
  // ── Consumers ──
  handle('memory:ctxTripItinerary', (_e, destination?: string) =>
    consume('assistant.trip_itinerary', `viagem roteiro destino ${q(destination, 200)}`, 'personalizar um roteiro de viagem')
  )
  handle('memory:ctxTravelInterests', (_e, keywords?: string) => consume('travel.recommendations', q(keywords, 800), 'casar recomendações de viagem com interesses'))
  handle('memory:ctxStays', (_e, query?: string) => consume('stays.analysis', `hospedagem ${q(query, 400)}`, 'ranquear hospedagens'))
  handle('memory:ctxWeekPlan', (_e, query?: string) => consume('assistant.week_plan', `rotina semana trabalho ${q(query)}`, 'planejar a semana'))
  handle('memory:ctxWeeklyReview', (_e, query?: string) => consume('home.weekly_review', `objetivos semana aprendizados produtividade ${q(query)}`, 'revisão semanal'))

  // ── Producers (só por botão, só texto escrito pelo usuário) ──
  handle('memory:produceWeeklyReview', (_e, text: string) => produce('home.weekly_review', text, `revisao-semanal#${new Date().toISOString().slice(0, 10)}`))
  handle('memory:produceBraindump', (_e, text: string) => produce('braindump.extract', text, `braindump#${new Date().toISOString().slice(0, 10)}`))
}
