/**
 * Estudos — tipos e regras puras compartilhadas entre servidor e front.
 *
 * Conteúdos distintos (nunca se misturam):
 *  - nota autoral (`study_notes`): o que EU escrevi;
 *  - fonte externa (`study_sources`): texto colado, TXT/MD importado ou link com localizador;
 *  - material do tutor (`study_materials`): última geração válida por tópico/nó/seção;
 *  - conversa (`study_lessons` + `study_lesson_turns`): aula conversacional;
 *  - tentativa (`study_attempts`): minha resposta a uma pergunta salva.
 */

// ── Biblioteca ────────────────────────────────────────────────────────────────

export type TopicStatus = 'studying' | 'planned' | 'paused' | 'completed'
export type LibraryGroup = 'ativos' | 'futuros' | 'antigos'

/** studying → Ativos; planned → Futuros; paused/completed → Antigos (o status continua distinto). */
export function groupOf(status: string): LibraryGroup {
  if (status === 'planned') return 'futuros'
  if (status === 'paused' || status === 'completed') return 'antigos'
  return 'ativos'
}

export type TopicKind = 'general' | 'language'

// ── SRS (SM-2, o mesmo algoritmo de antes da reforma) ────────────────────────

export type Rating = 'again' | 'hard' | 'good' | 'easy'
export const RATINGS: Rating[] = ['again', 'hard', 'good', 'easy']

export interface SrsState {
  easeFactor: number
  intervalDays: number
  repetitions: number
}

export interface SrsUpdate extends SrsState {
  nextReviewAt: string // YYYY-MM-DD (local)
  lastReviewedAt: string // ISO
}

export function localDate(d: Date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + days)
  return localDate(d)
}

const QUALITY: Record<Rating, number> = { again: 2, hard: 3, good: 4, easy: 5 }
const MIN_EASE = 1.3

/**
 * SM-2 (SuperMemo 2 / estilo Anki) — algoritmo idêntico ao `src/modules/estudos/srs.ts` original.
 * Comportamento REAL do Again (preservado de propósito, coberto por teste):
 *  - qualidade 2 → o ease cai 0,32 pela fórmula canônica (piso 1,3);
 *  - repetições = 0, intervalo = 0 e próxima revisão = HOJE: o cartão continua vencido e volta
 *    na fila do dia (atrás dos que venceram antes, pela ordem nextReviewAt, id).
 */
export function schedule(card: Partial<SrsState>, rating: Rating, now: Date = new Date()): SrsUpdate {
  const today = localDate(now)
  const q = QUALITY[rating]
  let ease = card.easeFactor || 2.5
  let reps = card.repetitions || 0
  let interval = card.intervalDays || 0

  ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  if (ease < MIN_EASE) ease = MIN_EASE

  if (q < 3) {
    reps = 0
    interval = 0
  } else {
    reps += 1
    if (reps === 1) interval = 1
    else if (reps === 2) interval = 6
    else interval = Math.round(interval * ease)
    if (rating === 'hard') interval = Math.max(1, Math.round(interval * 0.8))
    else if (rating === 'easy') interval = Math.round(interval * 1.3)
    interval = Math.max(1, interval)
  }

  return {
    easeFactor: Math.round(ease * 100) / 100,
    intervalDays: interval,
    repetitions: reps,
    nextReviewAt: addDays(today, interval),
    lastReviewedAt: now.toISOString()
  }
}

// ── Cartões ───────────────────────────────────────────────────────────────────

/**
 * Direção de prática. Num tópico de idioma: forward = Reconhecimento (vejo a frase no idioma-alvo),
 * reverse = Produção (vejo o significado/situação e formulo). Em temas técnicos: frente→verso e o
 * reverso opcional. Cada direção tem agenda SM-2 própria (`study_card_states`).
 */
export type CardDirection = 'forward' | 'reverse'
export type CardType = 'basic' | 'cloze'
export type CardStatus = 'active' | 'suspended' | 'suggested'

export interface StudyCardInput {
  topicId: number
  nodeId: number | null
  front: string
  back: string
  cardType?: CardType
  categoryId?: number | null
  language?: string | null
  example?: string | null
  reading?: string | null
  /** Formulações também aceitas na produção. */
  variants?: string[]
  /** Exercício contextual depois de revelar (ex.: "mude o encontro de amanhã para sábado"). */
  drill?: string | null
  /** Pratica também a direção reversa (Produção, nos idiomas). */
  reverse?: boolean
  status?: CardStatus
}

/** Lacuna em frase: `{{trecho}}` marca o que fica escondido. */
export const CLOZE_RE = /\{\{([^}]+)\}\}/g
export function clozeHide(text: string): string {
  return text.replace(CLOZE_RE, '＿＿＿')
}
export function clozeReveal(text: string): string {
  return text.replace(CLOZE_RE, '$1')
}

/** Normalização para comparar uma resposta digitada com a frente/variantes (sem acento, pontuação ou espaços extras). */
export function normalizeAnswer(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s\p{P}\p{S}]+/gu, '')
}

export function matchesAnswer(answer: string, accepted: string[]): boolean {
  const a = normalizeAnswer(answer)
  return !!a && accepted.some((x) => normalizeAnswer(x) === a)
}

// ── Retomada ──────────────────────────────────────────────────────────────────

export type CheckpointTarget = 'note' | 'source' | 'lesson' | 'cards' | 'test'

export type ContinueReason =
  | 'pinned' // ação fixada por mim
  | 'checkpoint' // checkpoint mais recente em tópico ativo
  | 'plan' // próximo nó elegível do roteiro aprovado
  | 'manual' // primeiro pendente pela ordem manual
  | 'empty-topic' // tópico ativo sem nada: começar escrevendo / importar / criar roteiro
  | 'nothing' // nenhum tópico ativo

export interface ContinueAction {
  reason: ContinueReason
  topicId: number | null
  topicName: string | null
  nodeId: number | null
  nodeTitle: string | null
  target: CheckpointTarget
  refId: number | null
  whereStopped: string | null
  position: string | null
}

export interface TimeOption {
  kind: 'node' | 'resume-note' | 'cards' | 'questions'
  topicId: number | null
  topicName: string | null
  nodeId: number | null
  title: string
  minutes: number | null
  count?: number
}

/** Minutos estimados de um nó (estimatedHours salvo); null quando não há estimativa. */
export function nodeMinutes(estimatedHours: number | null | undefined): number | null {
  return estimatedHours != null && estimatedHours > 0 ? Math.round(estimatedHours * 60) : null
}

// ── DTOs do servidor (server/estudos/repo.ts) ─────────────────────────────────

export interface CardDbShape {
  id: number
  topicId: number
  nodeId: number | null
  front: string
  back: string
  cardType: string
  categoryId: number | null
  language: string | null
  example: string | null
  reading: string | null
  variants: string | null
  drill: string | null
  status: CardStatus
  easeFactor: number
  intervalDays: number
  repetitions: number
  nextReviewAt: string | null
  lastReviewedAt: string | null
  createdAt: string
}


export interface TopicRow {
  id: number
  name: string
  category: string | null
  status: TopicStatus
  targetDate: string | null
  priority: number
  color: string
  createdAt: string
  kind: 'general' | 'language'
  targetLanguage: string | null
  explanationLanguage: string | null
  goal: string | null
  reviewWhenArchived: number
  readingMode: 'hidden' | 'visible'
  uid: string | null
}

export interface LibraryTopic extends TopicRow {
  group: LibraryGroup
  nodesDone: number
  nodesTotal: number
  cards: number
  due: number
  lastActivityAt: string | null
  whereStopped: string | null
}

export interface NodeRow {
  id: number
  topicId: number
  parentId: number | null
  title: string
  description: string | null
  status: string
  orderIndex: number
  estimatedHours: number | null
  completedAt: string | null
  createdAt: string
  origin: string
  planId: number | null
}

export interface StateRow {
  id: number
  cardId: number
  direction: CardDirection
  easeFactor: number
  intervalDays: number
  repetitions: number
  nextReviewAt: string | null
  lastReviewedAt: string | null
  introducedAt: string | null
  suspended: number
}


export interface CardOut extends Omit<CardDbShape, 'variants'> {
  variants: string[]
  categoryName: string | null
  states: StateRow[]
}

export interface ReviewItem {
  card: CardOut
  state: StateRow
  topicName: string
  topicKind: 'general' | 'language'
  targetLanguage: string | null
  readingMode: 'hidden' | 'visible'
  isNew: boolean
}

export interface CategoryRow {
  id: number
  name: string
  sortOrder: number
  cards: number
}

export interface SourceRow {
  id: number
  topicId: number
  nodeId: number | null
  kind: 'text' | 'file' | 'link'
  title: string
  content: string
  url: string | null
  locator: string | null
  originPath: string | null
  originHash: string | null
  createdAt: string
  updatedAt: string
}

export interface CheckpointRow {
  id: number
  topicId: number
  nodeId: number | null
  target: CheckpointTarget
  refId: number | null
  position: string | null
  whereStopped: string | null
  updatedAt: string
}

export interface QuestionRow {
  id: number
  topicId: number
  nodeId: number | null
  kind: 'recall' | 'exercise' | 'socratic' | 'quiz'
  prompt: string
  reference: string | null
  hint: string | null
  origin: string
  status: 'active' | 'archived'
  revisit: number
  createdAt: string
  updatedAt: string
}

export interface QuestionOut extends QuestionRow {
  topicName: string
  attempts: number
  lastOutcome: string | null
  lastAttemptAt: string | null
}

export interface AttemptRow {
  id: number
  questionId: number
  topicId: number
  answer: string | null
  helpUsed: string | null
  outcome: 'ok' | 'partial' | 'miss' | 'skipped'
  createdAt: string
}

export interface PinnedAction {
  topicId: number
  nodeId: number | null
  target: CheckpointTarget
  refId: number | null
}

export interface TopicInput {
  name: string
  category?: string | null
  status?: TopicStatus
  targetDate?: string | null
  priority?: number
  color?: string
  kind?: 'general' | 'language'
  targetLanguage?: string | null
  explanationLanguage?: string | null
  goal?: string | null
  reviewWhenArchived?: boolean
  readingMode?: 'hidden' | 'visible'
}

export interface TimeFilters {
  topicId?: number | null
  category?: string | null
  language?: string | null
}

export interface CardFilters {
  topicId?: number | null
  nodeId?: number | null
  /** número = categoria; 'none' = sem categoria. */
  categoryId?: number | 'none' | null
  language?: string | null
  status?: CardStatus | 'all' | null
  text?: string | null
}

export interface QueueFilters {
  topicId?: number | null
  nodeId?: number | null
  categoryId?: number | 'none' | null
  language?: string | null
  /** Inclui tópicos arquivados (pausados/concluídos) mesmo sem "revisar quando arquivado". */
  topicIds?: number[] | null
}

export interface SourceInput {
  topicId: number
  nodeId?: number | null
  kind?: 'text' | 'file' | 'link'
  title: string
  content?: string
  url?: string | null
  locator?: string | null
  originPath?: string | null
  originHash?: string | null
}

export interface ImportFileIn {
  path: string
  content: string
  hash: string
}

export interface ImportPreviewItem {
  path: string
  title: string
  chars: number
  /** new = nunca importado; unchanged = mesma origem e conteúdo; changed = mesma origem, conteúdo novo. */
  status: 'new' | 'unchanged' | 'changed'
  existingId: number | null
}

export interface CheckpointInput {
  topicId: number
  nodeId?: number | null
  target: CheckpointTarget
  refId?: number | null
  position?: string | null
  /** undefined = mantém a frase anterior. */
  whereStopped?: string | null
}

export interface QuestionInput {
  topicId: number
  nodeId?: number | null
  kind?: QuestionRow['kind']
  prompt: string
  reference?: string | null
  hint?: string | null
  origin?: string
}

// ── Repositório / Sincronizar / adoção (server/estudos/git.ts, adopt.ts, bundle.ts) ──

export interface GitConfig {
  remote: string
  branch: string
  folder: string
}

export interface SyncResult {
  status: SyncStatus
  /** Chave de mensagem para a UI (texto final é traduzido no front). */
  message: string
  detail?: string
  commit?: string | null
  committed: boolean
  /** Arquivos editados fora do rickOS mantidos como estão no repositório. */
  keptExternal: string[]
  /** Editados dos dois lados: repositório mantido, versão do rickOS salva em `divergenceDir`. */
  conflicts: string[]
  divergenceDir?: string | null
  at: string
}

export interface LinkPreview {
  remote: string
  branch: string
  folder: string
  emptyRepo: boolean
  branchExists: boolean
  /** free = pasta livre; managed = já tem manifesto do rickOS (dá para restaurar); occupied = ocupada por outros arquivos. */
  folderState: 'free' | 'managed' | 'occupied'
  folderFiles: number
  topLevel: string[]
  notesOutside: number
  suggestion: string | null
  previewId: string
}

export interface GitStatus {
  config: GitConfig | null
  linked: boolean
  pending: boolean
  last: SyncResult | null
}

export type SyncStatus = 'synced' | 'pushed' | 'pending' | 'divergent' | 'error'

export interface AdoptFile {
  path: string
  title: string
  section: string | null
  chars: number
  hash: string
  status: 'new' | 'unchanged' | 'changed'
  images: string[]
  missing: string[]
}

export interface AdoptPreview {
  subpath: string
  recognized: AdoptFile[]
  ignored: string[]
  collisions: { path: string; reason: 'mesmo-titulo' | 'ja-existe-no-topico' }[]
  missingLinks: { path: string; link: string }[]
}

export interface AdoptApply {
  subpath: string
  topicId: number | null
  newTopicName?: string | null
  /** note = vira nota autoral de um nó; source = vira fonte de leitura. */
  mode: 'note' | 'source'
  decisions: Record<string, 'create' | 'update' | 'skip'>
}

export interface RestoreReport {
  created: string[]
  skipped: string[]
  attachments: number
  missingAttachments: string[]
}


// ── Tutor (server/estudos/tutor.ts) ──

export type Operacao = 'masterclass' | 'aula' | 'pacote' | 'secao' | 'revisao' | 'subtopicos'

export interface RunRow {
  id: number
  topicId: number | null
  nodeId: number | null
  operation: Operacao
  section: string | null
  requestKey: string
  status: 'running' | 'ok' | 'error' | 'invalid' | 'canceled' | 'timeout'
  model: string | null
  effort: string | null
  promptVersion: string | null
  inputSignature: string | null
  contextChars: number | null
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  inputTokens: number | null
  outputTokens: number | null
  error: string | null
}

export interface PlanRow {
  id: number
  topicId: number
  request: string
  status: 'proposed' | 'approved' | 'discarded' | 'superseded'
  content: string
  runId: number | null
  edited: number
  createdAt: string
  approvedAt: string | null
}

export interface LessonRow {
  id: number
  topicId: number
  nodeId: number | null
  planId: number | null
  title: string
  openQuestion: string | null
  returnPoint: string | null
  resumePhrase: string | null
  createdAt: string
  updatedAt: string
}

/** Aula aberta: o que está salvo + o briefing do roteiro que a originou (zero chamadas). */
export interface LessonView {
  lesson: LessonRow
  briefing: { planId: number; request: string } | null
  turns: TurnRow[]
  running: RunRow | null
}

export interface TurnRow {
  id: number
  lessonId: number
  role: 'me' | 'tutor'
  content: string
  payload: string | null
  clientKey: string | null
  runId: number | null
  createdAt: string
}

export interface DiagnosticoCodex {
  instalado: boolean
  versao: string | null
  logado: boolean | null
  modelos: { slug: string; disponivel: boolean; efforts: string[] }[]
  erro: string | null
}

export interface IaPerfisView {
  perfis: Record<'plano' | 'aula' | 'editorial', { modelo: string; effort: string; padraoModelo: string; padraoEffort: string }>
  efforts: string[]
}

// ── Material do nó / sugestões (server/estudos/material.ts) ──

export interface MaterialRow {
  id: number
  topicId: number
  nodeKey: number
  nodeId: number | null
  section: string
  content: string
  runId: number
  model: string | null
  effort: string | null
  promptVersion: string | null
  inputSignature: string | null
  noteSignature: string | null
  createdAt: string
}

export interface SuggestionRow {
  id: number
  topicId: number
  nodeId: number | null
  kind: 'editorial' | 'subtopic'
  fingerprint: string
  payload: string
  status: 'pending' | 'accepted' | 'rejected' | 'comment' | 'superseded'
  runId: number | null
  baseSignature: string | null
  createdAt: string
  decidedAt: string | null
}

export interface MaterialView {
  sections: (MaterialRow & { stale: boolean })[]
  suggestions: SuggestionRow[]
  noteSignature: string
}

// ── Modelo de roadmap (exportar/importar a trilha com aulas) ──

export interface ModeloTurno {
  papel: 'tutor' | 'eu'
  conteudo: string
  /** Dados do turno do tutor (feedback, pergunta aberta…), opcionais. */
  extra?: Record<string, unknown>
}

export interface ModeloAula {
  titulo: string
  perguntaAberta?: string | null
  fraseDeRetomada?: string | null
  turnos: ModeloTurno[]
}

export interface ModeloItem {
  titulo: string
  descricao?: string
  horas?: number
  aula?: ModeloAula
  nota?: string
  itens?: ModeloItem[]
}

export interface ModeloRoadmap {
  formato: 'rickos-roteiro'
  versao: number
  topico: { nome: string; tipo: 'tema' | 'idioma'; idiomaAlvo?: string; idiomaExplicacao?: string; objetivo?: string; categoria?: string }
  /** Briefing que gerou a trilha: acompanha as aulas importadas. */
  roteiro?: { pedido: string; plano?: Record<string, unknown> }
  itens: ModeloItem[]
  aulaGeral?: ModeloAula
  notaGeral?: string
}

export interface ModeloPreview {
  nome: string
  tipo: 'tema' | 'idioma'
  objetivo: string | null
  pedido: string | null
  itens: number
  aulas: number
  turnos: number
  notas: number
  raiz: { titulo: string; subitens: number; aulas: number }[]
  erros: string[]
  avisos: string[]
}

export interface ModeloImportOpts {
  /** null = tópico novo. */
  topicId: number | null
  /** Nome do tópico novo (padrão: o do modelo). */
  nome?: string | null
  aulas?: boolean
  notas?: boolean
}
