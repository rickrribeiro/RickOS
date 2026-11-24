import type {
  ExportBundle,
  FeedbackVerdict,
  MemoryCategory,
  MemoryDetail,
  MemoryFilter,
  MemoryInput,
  MemoryPage,
  MemoryStatus,
  MemorySuggestion,
  PersonalMemory,
  ProposedMemory,
  RelationKind,
  Sensitivity,
  SuggestionFilter
} from '../../../shared/memory'

/** Espelhos dos retornos do servidor (server/memory/*). */
export interface ImportResult {
  created: number
  suggested: number
  skipped: number
  reasons: Record<string, number>
  alreadyImported?: boolean
}
export interface JobView {
  id: number
  kind: string
  status: 'queued' | 'running' | 'done' | 'failed'
  attempts: number
  error: string | null
  stats: Record<string, unknown>
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}
export interface LegacyStatus {
  hasLegacy: boolean
  chars: number
  bullets: number
  sourceHash: string | null
  imports: { kind: string; createdAt: string; stats: ImportResult }[]
  pending: number
  approved: number
}
export interface ContextItem {
  id: number
  title: string
  layer: string
  score: number
  reason: string
  category: string | null
  tokens: number
}
export interface MemoryContext {
  allowed: boolean
  blockedReason: string | null
  degraded: boolean
  text: string
  instructions: string
  items: ContextItem[]
  tokens: number
  budget: number
  durationMs: number
  vector: boolean
  traceId: number | null
}
export interface PolicyView {
  useCase: string
  label: string
  module: string
  purpose: string
  internal: boolean
  approved: boolean
  consume: false | { categories: string[] | '*'; types?: string[]; maxSensitivity: Sensitivity; maxTokens: number; maxItems: number; instructions: boolean }
  produce: false | { categories: string[] | '*'; maxSensitivity: Sensitivity; maxSuggestionsPerRun: number }
}
export interface TraceView {
  id: number
  createdAt: string
  useCase: string
  policy: string
  purpose: string
  queryPreview: string | null
  queryHash: string | null
  simulated: boolean
  blocked: string | null
  selected: { id: number; layer: string; score: number; reason: string; tokens: number; title: string; restricted: boolean; exists: boolean }[]
  discarded: { id: number; reason: string; score?: number; title: string; restricted: boolean; exists: boolean }[]
  policyFiltered: Record<string, number>
  tokens: number
  budget: number
  durationMs: number
  vector: boolean
  policyVersion: number
}
export interface FreshnessItem {
  memory: PersonalMemory
  reason: string
  dueSince: string
  severity: 'baixa' | 'media' | 'alta'
}
export type CoverageState = 'pouco_explorado' | 'parcial' | 'bem_documentado' | 'revisar'
export interface CoverageRow {
  categoryId: number
  slug: string
  name: string
  icon: string
  active: number
  confirmed: number
  stale: number
  openGaps: number
  highGaps: number
  conflicts: number
  lastUpdate: string | null
  usedBy: string[]
  state: CoverageState
  why: string
}
export interface KnowledgeGap {
  id: number
  topic: string
  categoryId: number | null
  category: string | null
  why: string
  beneficiaries: string[]
  priority: number
  sensitivity: Sensitivity
  question: string
  status: 'open' | 'answered' | 'dismissed' | 'irrelevant'
  createdAt: string
  resolvedAt: string | null
}
export interface InterviewTurn {
  question: string
  why?: string
  answer?: string
  skipped?: boolean
  at: string
  proposed?: number
}
export interface Interview {
  id: number
  topic: string
  categoryId: number | null
  status: 'open' | 'ended'
  turns: InterviewTurn[]
  createdAt: string
  endedAt: string | null
}
export interface TimelineEvent {
  at: string
  kind: string
  memoryId: number
  title: string
  categoryId: number | null
  occurredAt: string | null
  actor: string
  reason: string | null
}
export interface PolicyOverride {
  disabled?: boolean
  produceDisabled?: boolean
  maxTokens?: number
  maxItems?: number
  categories?: string[]
  maxSensitivity?: Sensitivity
}
export interface MemorySettings {
  values: Record<string, string>
  overrides: Record<string, PolicyOverride>
}
export interface Overview {
  counts: Record<'active' | 'unconfirmed' | 'archived' | 'pinned' | 'pending' | 'conflicts' | 'categories' | 'needsReview' | 'openGaps' | 'pendingEvents' | 'failedEvents', number>
  suggestions: { byStatus: Record<string, number>; oldestPendingDays: number | null }
  recent: PersonalMemory[]
  used: PersonalMemory[]
  review: FreshnessItem[]
  gaps: KnowledgeGap[]
  growth: { month: string; n: number }[]
  jobs: JobView[]
  lastConsolidation: string | null
  agentEnabled: boolean
  retrieval: { useCase: string; calls: number; blocked: number; empty: number; avgMs: number; avgTokens: number }[]
  cost: { source: string; calls: number; inputTokens: number; outputTokens: number; costUsd: number }[]
  llm: { day: string; n: number; limit: number }
}
export interface ApproveOptions {
  edited?: Partial<ProposedMemory> | null
  resolution?: { mode: 'proposed' | 'keep'; keepId?: number }
}
export interface CategoryInput {
  name: string
  icon?: string
  description?: string
  defaultSensitivity?: Sensitivity
}

/** Bloco de contexto pessoal para uma integração aprovada (vazio = nada relevante). */
export interface ConsumerBlock {
  allowed: boolean
  degraded: boolean
  block: string
  items: { id: number; title: string; category: string | null }[]
  tokens: number
}

export interface MemoryApi {
  // integrações aprovadas: o caso de uso é fixado no servidor (server/memory/integrations.ts)
  ctxTripItinerary(destination?: string): Promise<ConsumerBlock>
  ctxTravelInterests(keywords?: string): Promise<ConsumerBlock>
  ctxStays(query?: string): Promise<ConsumerBlock>
  ctxWeekPlan(query?: string): Promise<ConsumerBlock>
  ctxWeeklyReview(query?: string): Promise<ConsumerBlock>
  produceWeeklyReview(text: string): Promise<number>
  produceBraindump(text: string): Promise<number>
  /** Resumo de Notícias: o servidor monta a evidência (categorias + notícias abertas em "Ler mais"). */
  produceNews(): Promise<number>
  categories(includeArchived?: boolean): Promise<MemoryCategory[]>
  createCategory(input: CategoryInput): Promise<MemoryCategory>
  updateCategory(id: number, input: Partial<CategoryInput> & { archived?: boolean }): Promise<MemoryCategory>
  reorderCategories(ids: number[]): Promise<void>
  list(filter: MemoryFilter): Promise<MemoryPage>
  get(id: number): Promise<MemoryDetail | null>
  create(input: MemoryInput): Promise<PersonalMemory>
  update(id: number, patch: MemoryInput, expectedVersion?: number): Promise<PersonalMemory>
  setStatus(id: number, status: MemoryStatus, reason?: string): Promise<PersonalMemory>
  confirm(id: number): Promise<PersonalMemory>
  pin(id: number, pinned: boolean): Promise<PersonalMemory>
  delete(id: number): Promise<boolean>
  addRelation(fromId: number, toId: number, kind: RelationKind, note?: string): Promise<void>
  removeRelation(id: number): Promise<void>
  graph(): Promise<{ memories: PersonalMemory[]; relations: { id: number; fromId: number; toId: number; kind: RelationKind }[] }>
  suggestions(f: SuggestionFilter): Promise<MemorySuggestion[]>
  approve(id: number, opts?: ApproveOptions): Promise<MemorySuggestion>
  approveMany(ids: number[]): Promise<{ approved: number[]; skipped: { id: number; reason: string }[] }>
  reject(id: number, verdict?: FeedbackVerdict, note?: string): Promise<MemorySuggestion>
  snooze(id: number, days?: number): Promise<MemorySuggestion>
  needsInfo(id: number, note: string): Promise<MemorySuggestion>
  undo(id: number): Promise<MemorySuggestion>
  extractText(text: string): Promise<number>
  analyze(): Promise<number>
  consolidateNow(): Promise<number>
  jobs(limit?: number): Promise<JobView[]>
  job(id: number): Promise<JobView | null>
  legacyStatus(): Promise<LegacyStatus>
  migrate(opts: { ai?: boolean; force?: boolean }): Promise<{ jobId?: number; result?: ImportResult }>
  exportJson(o?: { includeArchived?: boolean; includeRestricted?: boolean }): Promise<ExportBundle>
  exportMarkdown(o?: { includeArchived?: boolean; includeRestricted?: boolean }): Promise<string>
  importJson(data: unknown, mode?: 'direct' | 'review'): Promise<ImportResult>
  importMarkdown(md: string, ai?: boolean): Promise<{ jobId?: number; result?: ImportResult }>
  policies(): Promise<PolicyView[]>
  simulate(useCase: string, query: string): Promise<MemoryContext>
  traces(limit?: number): Promise<TraceView[]>
  freshness(): Promise<FreshnessItem[]>
  coverage(): Promise<{ version: string; criteria: string[]; rows: CoverageRow[] }>
  gaps(status?: KnowledgeGap['status'] | 'all'): Promise<KnowledgeGap[]>
  detectGaps(): Promise<number>
  gapStatus(id: number, status: 'dismissed' | 'irrelevant' | 'open'): Promise<void>
  answerGap(id: number, answer: string): Promise<number>
  interviews(): Promise<Interview[]>
  startInterview(topic: string, categoryId?: number | null): Promise<Interview>
  answerInterview(id: number, answer: string): Promise<Interview>
  skipInterview(id: number): Promise<Interview>
  endInterview(id: number): Promise<Interview>
  timeline(opts?: { categoryId?: number | null; limit?: number }): Promise<TimelineEvent[]>
  overview(): Promise<Overview>
  settings(): Promise<MemorySettings>
  saveSettings(patch: Record<string, unknown>): Promise<void>
}

export const MEMORY_METHODS: (keyof MemoryApi)[] = [
  'ctxTripItinerary',
  'ctxTravelInterests',
  'ctxStays',
  'ctxWeekPlan',
  'ctxWeeklyReview',
  'produceWeeklyReview',
  'produceBraindump',
  'produceNews',
  'categories',
  'createCategory',
  'updateCategory',
  'reorderCategories',
  'list',
  'get',
  'create',
  'update',
  'setStatus',
  'confirm',
  'pin',
  'delete',
  'addRelation',
  'removeRelation',
  'graph',
  'suggestions',
  'approve',
  'approveMany',
  'reject',
  'snooze',
  'needsInfo',
  'undo',
  'extractText',
  'analyze',
  'consolidateNow',
  'jobs',
  'job',
  'legacyStatus',
  'migrate',
  'exportJson',
  'exportMarkdown',
  'importJson',
  'importMarkdown',
  'policies',
  'simulate',
  'traces',
  'freshness',
  'coverage',
  'gaps',
  'detectGaps',
  'gapStatus',
  'answerGap',
  'interviews',
  'startInterview',
  'answerInterview',
  'skipInterview',
  'endInterview',
  'timeline',
  'overview',
  'settings',
  'saveSettings'
]

export type MemoryWindowApi = MemoryApi & {
  onUpdated: (cb: (p: { kind: string }) => void) => () => void
  onJob: (cb: (p: { id: number; kind: string; status: string; error?: string; stats?: unknown }) => void) => () => void
}
