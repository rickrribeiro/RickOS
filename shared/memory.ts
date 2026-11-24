/**
 * Memória Pessoal — tipos e helpers puros compartilhados entre servidor e front.
 * Arquitetura: docs/memoria/arquitetura.md.
 */

export const MEMORY_TYPES = ['FACT', 'PREFERENCE', 'GOAL', 'CONSTRAINT', 'HABIT', 'INSTRUCTION', 'EXPERIENCE', 'LEARNING', 'INFERENCE'] as const
export type MemoryType = (typeof MEMORY_TYPES)[number]

export const MEMORY_LAYERS = ['semantic', 'episodic', 'procedural', 'temporal', 'reflective'] as const
export type MemoryLayer = (typeof MEMORY_LAYERS)[number]

export const MEMORY_STATUSES = ['active', 'unconfirmed', 'outdated', 'archived', 'superseded', 'expired'] as const
export type MemoryStatus = (typeof MEMORY_STATUSES)[number]

export const SENSITIVITIES = ['NORMAL', 'PRIVATE', 'RESTRICTED'] as const
export type Sensitivity = (typeof SENSITIVITIES)[number]

export const RELIABILITIES = ['stated', 'observed', 'inferred'] as const
export type Reliability = (typeof RELIABILITIES)[number]

export const STABILITIES = ['permanent', 'stable', 'evolving', 'transient'] as const
export type Stability = (typeof STABILITIES)[number]

export const ORIGINS = ['manual', 'import', 'migration', 'agent', 'interview', 'consolidation', 'text'] as const
export type MemoryOrigin = (typeof ORIGINS)[number]

export const RELATION_KINDS = ['RELATED_TO', 'SUPPORTS', 'CONTRADICTS', 'DERIVED_FROM', 'SUPERSEDES', 'PART_OF'] as const
export type RelationKind = (typeof RELATION_KINDS)[number]

export const SUGGESTION_OPS = ['CREATE', 'UPDATE', 'MERGE', 'ARCHIVE', 'RESOLVE', 'ASK'] as const
export type SuggestionOp = (typeof SUGGESTION_OPS)[number]

export const SUGGESTION_STATUSES = ['pending', 'approved', 'rejected', 'snoozed', 'needs_info', 'undone', 'superseded'] as const
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number]

export const FEEDBACK_VERDICTS = ['approved', 'approved_edited', 'rejected', 'snoozed', 'irrelevant', 'incorrect', 'duplicate', 'too_personal', 'other'] as const
export type FeedbackVerdict = (typeof FEEDBACK_VERDICTS)[number]

export const TYPE_LABEL: Record<MemoryType, string> = {
  FACT: 'Fato',
  PREFERENCE: 'Preferência',
  GOAL: 'Objetivo',
  CONSTRAINT: 'Restrição',
  HABIT: 'Hábito',
  INSTRUCTION: 'Instrução para IA',
  EXPERIENCE: 'Experiência',
  LEARNING: 'Aprendizado',
  INFERENCE: 'Inferência'
}

export const LAYER_LABEL: Record<MemoryLayer, string> = {
  semantic: 'Semântica',
  episodic: 'Episódica',
  procedural: 'Procedural',
  temporal: 'Temporal',
  reflective: 'Reflexiva'
}

export const STATUS_LABEL: Record<MemoryStatus, string> = {
  active: 'Ativa',
  unconfirmed: 'Não confirmada',
  outdated: 'Desatualizada',
  archived: 'Arquivada',
  superseded: 'Substituída',
  expired: 'Expirada'
}

export const SENSITIVITY_LABEL: Record<Sensitivity, string> = { NORMAL: 'Normal', PRIVATE: 'Privada', RESTRICTED: 'Restrita' }
export const RELIABILITY_LABEL: Record<Reliability, string> = { stated: 'Declarada por mim', observed: 'Observada', inferred: 'Inferida pela IA' }
export const STABILITY_LABEL: Record<Stability, string> = { permanent: 'Permanente', stable: 'Estável', evolving: 'Muda com o tempo', transient: 'Temporária' }
export const ORIGIN_LABEL: Record<MemoryOrigin, string> = {
  manual: 'Manual',
  import: 'Importação',
  migration: 'Migração da Base',
  agent: 'Memory Agent',
  interview: 'Me conheça melhor',
  consolidation: 'Consolidação',
  text: 'Texto livre'
}
export const RELATION_LABEL: Record<RelationKind, string> = {
  RELATED_TO: 'Relacionada a',
  SUPPORTS: 'Sustenta',
  CONTRADICTS: 'Contradiz',
  DERIVED_FROM: 'Derivada de',
  SUPERSEDES: 'Substitui',
  PART_OF: 'Parte de'
}
export const OP_LABEL: Record<SuggestionOp, string> = {
  CREATE: 'Nova memória',
  UPDATE: 'Atualizar',
  MERGE: 'Consolidar',
  ARCHIVE: 'Arquivar',
  RESOLVE: 'Resolver conflito',
  ASK: 'Pergunta'
}
export const VERDICT_LABEL: Record<FeedbackVerdict, string> = {
  approved: 'Aprovada',
  approved_edited: 'Aprovada com edição',
  rejected: 'Rejeitada',
  snoozed: 'Adiada',
  irrelevant: 'Irrelevante',
  incorrect: 'Incorreta',
  duplicate: 'Duplicada',
  too_personal: 'Pessoal demais',
  other: 'Outro motivo'
}

/** Camada padrão de cada tipo (o usuário pode trocar). */
export function defaultLayer(type: MemoryType): MemoryLayer {
  switch (type) {
    case 'EXPERIENCE':
      return 'episodic'
    case 'HABIT':
    case 'INSTRUCTION':
      return 'procedural'
    case 'LEARNING':
    case 'INFERENCE':
      return 'reflective'
    case 'GOAL':
      return 'temporal'
    default:
      return 'semantic'
  }
}

export const SENS_RANK: Record<Sensitivity, number> = { NORMAL: 0, PRIVATE: 1, RESTRICTED: 2 }
export function maxSensitivity(a: Sensitivity, b: Sensitivity): Sensitivity {
  return SENS_RANK[a] >= SENS_RANK[b] ? a : b
}

export interface MemoryCategory {
  id: number
  slug: string
  name: string
  icon: string
  description: string
  defaultSensitivity: Sensitivity
  sortOrder: number
  archivedAt: string | null
  memoryCount?: number
}

export interface PersonalMemory {
  id: number
  title: string
  content: string
  categoryId: number | null
  tags: string[]
  type: MemoryType
  layer: MemoryLayer
  status: MemoryStatus
  pinned: boolean
  importance: number
  extractionConfidence: number | null
  reliability: Reliability
  stability: Stability
  origin: MemoryOrigin
  originRef: string | null
  scope: string
  sensitivity: Sensitivity
  /** Sensibilidade efetiva = máx(memória, padrão da categoria). Calculada no servidor. */
  effectiveSensitivity: Sensitivity
  occurredAt: string | null
  validFrom: string | null
  validUntil: string | null
  confirmedAt: string | null
  lastUsedAt: string | null
  useCount: number
  version: number
  supersededById: number | null
  createdAt: string
  updatedAt: string
  embeddingModel: string | null
}

export interface MemoryInput {
  title?: string
  content: string
  categoryId?: number | null
  tags?: string[]
  type?: MemoryType
  layer?: MemoryLayer
  pinned?: boolean
  importance?: number
  stability?: Stability
  scope?: string
  sensitivity?: Sensitivity
  occurredAt?: string | null
  validFrom?: string | null
  validUntil?: string | null
}

export interface MemoryFilter {
  q?: string
  categoryId?: number | null
  type?: MemoryType | null
  status?: MemoryStatus | 'all' | null
  tag?: string | null
  sensitivity?: Sensitivity | null
  pinned?: boolean | null
  sort?: 'recent' | 'importance' | 'used' | 'title'
  offset?: number
  limit?: number
}

export interface MemoryPage {
  items: PersonalMemory[]
  total: number
}

export interface MemoryRevision {
  id: number
  memoryId: number
  version: number
  changeKind: string
  actor: 'user' | 'agent' | 'system'
  reason: string | null
  suggestionId: number | null
  snapshot: Partial<PersonalMemory> | null
  createdAt: string
}

export interface MemoryEvidence {
  id: number
  memoryId: number | null
  suggestionId: number | null
  sourceKind: string
  sourceRef: string | null
  excerpt: string
  contentHash: string
  createdAt: string
}

export interface MemoryRelation {
  id: number
  fromId: number
  toId: number
  kind: RelationKind
  note: string | null
  createdAt: string
  /** Título da outra ponta (do ponto de vista de quem pediu). */
  otherTitle?: string
  otherId?: number
  direction?: 'out' | 'in'
}

export interface MemoryDetail {
  memory: PersonalMemory
  category: MemoryCategory | null
  revisions: MemoryRevision[]
  evidence: MemoryEvidence[]
  relations: MemoryRelation[]
}

/** Conteúdo proposto numa sugestão (CREATE/UPDATE/MERGE/RESOLVE). */
export interface ProposedMemory {
  title: string
  content: string
  category: string // slug
  type: MemoryType
  layer?: MemoryLayer
  tags?: string[]
  importance?: number
  stability?: Stability
  sensitivity?: Sensitivity
  occurredAt?: string | null
  validUntil?: string | null
  scope?: string
}

export interface MemorySuggestion {
  id: number
  op: SuggestionOp
  status: SuggestionStatus
  proposed: ProposedMemory | null
  question: string | null
  targetIds: number[]
  /** Estado das memórias-alvo no momento da sugestão (para o diff). */
  targetSnapshot: Partial<PersonalMemory>[]
  /** Estado atual das memórias-alvo (preenchido na leitura). */
  targets?: PersonalMemory[]
  rationale: string
  benefit: string
  extractionConfidence: number | null
  reliability: Reliability
  sensitivity: Sensitivity
  sourceKind: string
  sourceRef: string | null
  evidence: MemoryEvidence[]
  snoozedUntil: string | null
  resultMemoryIds: number[]
  batchId: string | null
  createdAt: string
  resolvedAt: string | null
}

export interface SuggestionFilter {
  status?: SuggestionStatus | 'open' | 'all'
  op?: SuggestionOp | null
  sourceKind?: string | null
  limit?: number
}

export interface ExportBundle {
  format: 'rickos-memory'
  version: 1
  exportedAt: string
  categories: Omit<MemoryCategory, 'id' | 'memoryCount'>[]
  memories: (Omit<PersonalMemory, 'id' | 'categoryId' | 'effectiveSensitivity' | 'embeddingModel' | 'supersededById'> & {
    ref: string
    category: string | null
    evidence: { sourceKind: string; sourceRef: string | null; excerpt: string }[]
    /** Referência estável, com namespace da fonte, para importações em revisão. */
    sourceRef?: string
    reviewNote?: string
  })[]
  relations: { from: string; to: string; kind: RelationKind; note: string | null }[]
}

/** Normaliza texto para comparação/dedupe: minúsculas, sem acento, sem pontuação, espaços únicos. */
export function normText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Estimativa barata de tokens (~4 caracteres por token). */
export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4)
}
