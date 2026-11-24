import type { MemoryType, Sensitivity } from '../../shared/memory'
import { MEMORY_TYPES, SENS_RANK, SENSITIVITIES } from '../../shared/memory'
import { getSetting } from '../database/queries'

/**
 * Política de acesso da Memória Pessoal — DENY BY DEFAULT.
 *
 * • Só casos de uso listados aqui podem consumir ou produzir memória.
 * • Consumir e produzir são permissões independentes.
 * • Integração externa NOVA nasce com `approved: false` (bloqueada) e só muda com aprovação
 *   explícita do usuário, registrada em docs/memoria/integracoes.md.
 * • Configurações do usuário (`memory_policy_overrides`) só RESTRINGEM: nunca ampliam
 *   categorias, sensibilidade, orçamento ou limite além do que está aqui.
 * • Quem chama informa apenas o `useCase`; categorias/permissões vêm daqui, nunca do chamador.
 */
export const POLICY_VERSION = 1

export interface ConsumeRule {
  categories: string[] | '*'
  types?: MemoryType[]
  maxSensitivity: Sensitivity
  maxTokens: number
  maxItems: number
  /** Pode receber memórias do tipo INSTRUCTION confirmadas (bloco separado). */
  instructions: boolean
}

export interface ProduceRule {
  categories: string[] | '*'
  maxSensitivity: Sensitivity
  maxSuggestionsPerRun: number
}

export interface MemoryPolicy {
  useCase: string
  label: string
  module: string
  purpose: string
  /** Funcionalidade do próprio módulo de Memória Pessoal. */
  internal: boolean
  /** Integração externa aprovada pelo usuário (Fase 3). Internas são sempre true. */
  approved: boolean
  consume: ConsumeRule | false
  produce: ProduceRule | false
}

const ALL = '*' as const

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) deepFreeze(v)
    Object.freeze(o)
  }
  return o
}

export const MEMORY_POLICIES: readonly MemoryPolicy[] = deepFreeze([
  // ── Internas (o próprio módulo) ──
  {
    useCase: 'memory.agent',
    label: 'Memory Agent',
    module: 'memoria',
    purpose: 'Comparar evidências novas com memórias existentes para sugerir criar/atualizar/consolidar.',
    internal: true,
    approved: true,
    consume: { categories: ALL, maxSensitivity: 'PRIVATE', maxTokens: 3000, maxItems: 60, instructions: false },
    produce: { categories: ALL, maxSensitivity: 'RESTRICTED', maxSuggestionsPerRun: 15 }
  },
  {
    useCase: 'memory.text',
    label: 'Extração de texto livre',
    module: 'memoria',
    purpose: 'Organizar um texto que o usuário colou em memórias atômicas.',
    internal: true,
    approved: true,
    consume: { categories: ALL, maxSensitivity: 'PRIVATE', maxTokens: 2500, maxItems: 50, instructions: false },
    produce: { categories: ALL, maxSensitivity: 'RESTRICTED', maxSuggestionsPerRun: 40 }
  },
  {
    useCase: 'memory.migration',
    label: 'Migração da Base de Conhecimento',
    module: 'memoria',
    purpose: 'Transformar o Markdown antigo em memórias atômicas para revisão.',
    internal: true,
    approved: true,
    consume: { categories: ALL, maxSensitivity: 'PRIVATE', maxTokens: 2500, maxItems: 50, instructions: false },
    produce: { categories: ALL, maxSensitivity: 'RESTRICTED', maxSuggestionsPerRun: 80 }
  },
  {
    useCase: 'memory.analyze',
    label: 'Analisar minhas memórias',
    module: 'memoria',
    purpose: 'Revisar as memórias existentes e sugerir consolidações, conflitos e atualizações.',
    internal: true,
    approved: true,
    consume: { categories: ALL, maxSensitivity: 'PRIVATE', maxTokens: 5000, maxItems: 120, instructions: false },
    produce: { categories: ALL, maxSensitivity: 'PRIVATE', maxSuggestionsPerRun: 20 }
  },
  {
    useCase: 'memory.consolidation',
    label: 'Consolidação periódica',
    module: 'memoria',
    purpose: 'Agrupar memórias parecidas e propor aprendizados/padrões para revisão.',
    internal: true,
    approved: true,
    consume: { categories: ALL, maxSensitivity: 'PRIVATE', maxTokens: 5000, maxItems: 120, instructions: false },
    produce: { categories: ALL, maxSensitivity: 'PRIVATE', maxSuggestionsPerRun: 10 }
  },
  {
    useCase: 'memory.gaps',
    label: 'Lacunas de conhecimento',
    module: 'memoria',
    purpose: 'Encontrar informações ausentes que ajudariam os casos de uso autorizados.',
    internal: true,
    approved: true,
    consume: { categories: ALL, maxSensitivity: 'NORMAL', maxTokens: 2500, maxItems: 80, instructions: false },
    produce: { categories: ALL, maxSensitivity: 'PRIVATE', maxSuggestionsPerRun: 8 }
  },
  {
    useCase: 'memory.interview',
    label: 'Me conheça melhor',
    module: 'memoria',
    purpose: 'Entrevista conversacional para descobrir conhecimentos novos.',
    internal: true,
    approved: true,
    consume: { categories: ALL, maxSensitivity: 'NORMAL', maxTokens: 1500, maxItems: 30, instructions: false },
    produce: { categories: ALL, maxSensitivity: 'PRIVATE', maxSuggestionsPerRun: 10 }
  },

  // ── Integrações externas — APROVADAS pelo usuário em 2026-11-25 (docs/memoria/integracoes.md).
  //    Pontos de chamada: server/memory/integrations.ts (canal dedicado por caso de uso). ──
  {
    useCase: 'assistant.trip_itinerary',
    label: 'Assistente: roteiro de viagem',
    module: 'ia',
    purpose: 'Personalizar roteiros com preferências de viagem.',
    internal: false,
    approved: true,
    consume: { categories: ['viagens', 'preferencias', 'interesses'], types: ['PREFERENCE', 'CONSTRAINT', 'FACT', 'EXPERIENCE', 'LEARNING'], maxSensitivity: 'NORMAL', maxTokens: 400, maxItems: 12, instructions: false },
    produce: false
  },
  {
    useCase: 'travel.recommendations',
    label: 'Viagens: recomendações',
    module: 'viagens',
    purpose: 'Casar o catálogo de recomendações com interesses de viagem (sem LLM).',
    internal: false,
    approved: true,
    consume: { categories: ['viagens', 'interesses', 'preferencias'], types: ['PREFERENCE', 'FACT'], maxSensitivity: 'NORMAL', maxTokens: 300, maxItems: 15, instructions: false },
    produce: false
  },
  {
    useCase: 'stays.analysis',
    label: 'Hospedagens: análise',
    module: 'viagens',
    purpose: 'Ranquear hospedagens com preferências de hospedagem.',
    internal: false,
    approved: true,
    consume: { categories: ['viagens', 'preferencias'], types: ['PREFERENCE', 'CONSTRAINT'], maxSensitivity: 'NORMAL', maxTokens: 250, maxItems: 8, instructions: false },
    produce: false
  },
  {
    useCase: 'assistant.week_plan',
    label: 'Assistente: planejar a semana',
    module: 'ia',
    purpose: 'Planejamento pessoal com preferências de rotina e objetivos.',
    internal: false,
    approved: true,
    consume: { categories: ['rotina', 'produtividade', 'objetivos'], maxSensitivity: 'NORMAL', maxTokens: 400, maxItems: 12, instructions: true },
    produce: false
  },
  {
    useCase: 'home.weekly_review',
    label: 'Revisão semanal',
    module: 'home',
    purpose: 'Reflexão semanal com objetivos; o texto escrito pelo usuário pode virar sugestão.',
    internal: false,
    approved: true,
    consume: { categories: ['objetivos', 'produtividade', 'aprendizados'], maxSensitivity: 'NORMAL', maxTokens: 500, maxItems: 12, instructions: true },
    produce: { categories: ['objetivos', 'produtividade', 'aprendizados', 'rotina', 'valores'], maxSensitivity: 'PRIVATE', maxSuggestionsPerRun: 5 }
  },
  {
    useCase: 'braindump.extract',
    label: 'Brain dump: sugerir memórias',
    module: 'braindump',
    purpose: 'Sugerir memórias a partir de um brain dump, por ação explícita.',
    internal: false,
    approved: true,
    consume: false,
    produce: { categories: ALL, maxSensitivity: 'PRIVATE', maxSuggestionsPerRun: 8 }
  },
  {
    useCase: 'jarvis.assistant',
    label: 'Jarvis (assistente pessoal)',
    module: 'jarvis',
    purpose: 'Assistente pessoal geral (ainda não implementado).',
    internal: false,
    approved: true,
    consume: { categories: ALL, maxSensitivity: 'NORMAL', maxTokens: 800, maxItems: 20, instructions: true },
    produce: false
  }
] satisfies MemoryPolicy[])

export function getPolicy(useCase: string): MemoryPolicy | null {
  return MEMORY_POLICIES.find((p) => p.useCase === useCase) ?? null
}

/** Ajustes do usuário — só podem restringir. */
export interface PolicyOverride {
  disabled?: boolean
  produceDisabled?: boolean
  maxTokens?: number
  maxItems?: number
  categories?: string[]
  maxSensitivity?: Sensitivity
}

export const OVERRIDES_KEY = 'memory_policy_overrides'

export async function loadOverrides(): Promise<Record<string, PolicyOverride>> {
  try {
    const v = JSON.parse((await getSetting(OVERRIDES_KEY)) || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, PolicyOverride>) : {}
  } catch {
    return {}
  }
}

const lowerSens = (a: Sensitivity, b: unknown): Sensitivity => {
  if (!SENSITIVITIES.includes(b as Sensitivity)) return a
  return SENS_RANK[b as Sensitivity] < SENS_RANK[a] ? (b as Sensitivity) : a
}
const smaller = (a: number, b: unknown): number => {
  const n = Number(b)
  return Number.isFinite(n) && n >= 0 ? Math.min(a, Math.floor(n)) : a
}
function narrowCats(base: string[] | '*', o: unknown): string[] | '*' {
  if (!Array.isArray(o)) return base
  const asked = o.map(String)
  return base === '*' ? asked : base.filter((c) => asked.includes(c))
}

/** Interseção base ∩ override. Nunca amplia. */
export function narrowConsume(base: ConsumeRule, o: PolicyOverride | undefined): ConsumeRule {
  if (!o) return base
  return {
    categories: narrowCats(base.categories, o.categories),
    types: base.types ? [...base.types] : undefined,
    maxSensitivity: lowerSens(base.maxSensitivity, o.maxSensitivity),
    maxTokens: smaller(base.maxTokens, o.maxTokens),
    maxItems: smaller(base.maxItems, o.maxItems),
    instructions: base.instructions
  }
}
export function narrowProduce(base: ProduceRule, o: PolicyOverride | undefined): ProduceRule {
  if (!o) return base
  return {
    categories: narrowCats(base.categories, o.categories),
    maxSensitivity: lowerSens(base.maxSensitivity, o.maxSensitivity),
    maxSuggestionsPerRun: base.maxSuggestionsPerRun
  }
}

export type Access<R> = { ok: true; policy: MemoryPolicy; rule: R } | { ok: false; reason: string }

/** Pode consumir? Resolve a regra efetiva (código ∩ configurações). */
export async function resolveConsume(useCase: string): Promise<Access<ConsumeRule>> {
  const p = getPolicy(useCase)
  if (!p) return { ok: false, reason: 'caso de uso não registrado na política' }
  if (!p.approved) return { ok: false, reason: 'integração aguardando aprovação' }
  if (!p.consume) return { ok: false, reason: 'caso de uso não autorizado a consumir memória' }
  if ((await getSetting('memory_consumers_enabled')) === '0') return { ok: false, reason: 'consumo de memória desligado nas configurações' }
  const o = (await loadOverrides())[useCase]
  if (o?.disabled) return { ok: false, reason: 'caso de uso desligado nas configurações' }
  const rule = narrowConsume(p.consume, o)
  if (Array.isArray(rule.categories) && rule.categories.length === 0) return { ok: false, reason: 'nenhuma categoria permitida' }
  return { ok: true, policy: p, rule }
}

/** Pode produzir sugestões? Independente de consumir. */
export async function resolveProduce(useCase: string): Promise<Access<ProduceRule>> {
  const p = getPolicy(useCase)
  if (!p) return { ok: false, reason: 'caso de uso não registrado na política' }
  if (!p.approved) return { ok: false, reason: 'integração aguardando aprovação' }
  if (!p.produce) return { ok: false, reason: 'caso de uso não autorizado a produzir memória' }
  const o = (await loadOverrides())[useCase]
  if (o?.disabled || o?.produceDisabled) return { ok: false, reason: 'produção desligada nas configurações' }
  const allowed = await getSetting('memory_extraction_categories')
  let rule = narrowProduce(p.produce, o)
  if (allowed) {
    try {
      const list = JSON.parse(allowed)
      if (Array.isArray(list)) rule = { ...rule, categories: narrowCats(rule.categories, list) }
    } catch {
      // ignora valor corrompido
    }
  }
  return { ok: true, policy: p, rule }
}

export function categoryAllowed(rule: { categories: string[] | '*' }, slug: string | null): boolean {
  if (rule.categories === '*') return true
  return slug != null && rule.categories.includes(slug)
}
export function sensitivityAllowed(rule: { maxSensitivity: Sensitivity }, s: Sensitivity): boolean {
  return SENS_RANK[s] <= SENS_RANK[rule.maxSensitivity]
}
export function typeAllowed(rule: ConsumeRule, t: MemoryType): boolean {
  return !rule.types || rule.types.includes(t)
}

/** Visão pública (UI de configurações / matriz). */
export function publicPolicies(): (MemoryPolicy & { types: readonly MemoryType[] })[] {
  return MEMORY_POLICIES.map((p) => ({ ...p, types: p.consume && p.consume.types ? p.consume.types : MEMORY_TYPES }))
}
