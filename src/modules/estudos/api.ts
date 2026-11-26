import type {
  MaterialView,
  DiagnosticoCodex,
  IaPerfisView,
  LessonRow,
  LessonView,
  PlanRow,
  RunRow,
  TurnRow,
  AdoptApply,
  AdoptPreview,
  GitConfig,
  GitStatus,
  LinkPreview,
  RestoreReport,
  SyncResult,
  AttemptRow,
  CardFilters,
  CardOut,
  CardStatus,
  CategoryRow,
  CheckpointInput,
  CheckpointRow,
  CheckpointTarget,
  ContinueAction,
  ImportFileIn,
  ImportPreviewItem,
  LibraryTopic,
  PinnedAction,
  QuestionInput,
  QuestionOut,
  QuestionRow,
  QueueFilters,
  Rating,
  ReviewItem,
  SourceInput,
  SourceRow,
  StateRow,
  StudyCardInput,
  TimeFilters,
  TimeOption,
  TopicInput,
  TopicRow,
  TopicStatus
} from '../../../shared/estudos'

/** `window.api.estudos`: canais `estudos:<método>` (server/estudos/rpc.ts) + evento `estudos:updated`. */
export interface EstudosApi {
  library(): Promise<LibraryTopic[]>
  topic(id: number): Promise<TopicRow | null>
  createTopic(input: TopicInput): Promise<TopicRow>
  createFuture(name: string): Promise<TopicRow>
  updateTopic(id: number, patch: Partial<TopicInput>): Promise<TopicRow>
  setTopicStatus(id: number, status: TopicStatus): Promise<TopicRow>
  continue(): Promise<ContinueAction>
  prefs(): Promise<{ newPerDay: number; pinned: PinnedAction | null }>
  setPinned(p: PinnedAction | null): Promise<void>
  setNewPerDay(n: number): Promise<void>
  timeOptions(minutes: number, filters?: TimeFilters): Promise<{ fits: TimeOption[]; fallback: TimeOption[] }>

  categories(): Promise<CategoryRow[]>
  createCategory(name: string): Promise<CategoryRow>
  renameCategory(id: number, name: string): Promise<void>
  deleteCategory(id: number): Promise<void>

  cards(f?: CardFilters): Promise<CardOut[]>
  createCard(input: StudyCardInput): Promise<CardOut>
  updateCard(id: number, input: StudyCardInput): Promise<CardOut>
  setCardStatus(id: number, status: CardStatus): Promise<void>
  setStateSuspended(stateId: number, suspended: boolean): Promise<void>
  deleteCard(id: number): Promise<void>
  queue(f?: QueueFilters): Promise<{ items: ReviewItem[]; newLeft: number; newPerDay: number; dueTotal: number }>
  review(stateId: number, rating: Rating): Promise<StateRow>

  sources(topicId: number, nodeId?: number | null): Promise<SourceRow[]>
  createSource(s: SourceInput): Promise<SourceRow>
  updateSource(id: number, patch: Partial<SourceInput>): Promise<SourceRow>
  deleteSource(id: number): Promise<void>
  previewImport(topicId: number, files: ImportFileIn[]): Promise<ImportPreviewItem[]>
  applyImport(
    topicId: number,
    nodeId: number | null,
    files: (ImportFileIn & { decision: 'create' | 'update' | 'skip'; title?: string })[]
  ): Promise<{ created: number; updated: number; skipped: number }>

  saveCheckpoint(c: CheckpointInput): Promise<CheckpointRow>
  checkpoint(topicId: number, nodeId: number | null, target: CheckpointTarget, refId?: number | null): Promise<CheckpointRow | null>

  questions(f?: { topicId?: number | null; nodeId?: number | null; includeArchived?: boolean; allGroups?: boolean }): Promise<QuestionOut[]>
  createQuestion(q: QuestionInput): Promise<QuestionRow>
  updateQuestion(id: number, patch: Partial<QuestionInput> & { status?: 'active' | 'archived'; revisit?: boolean }): Promise<void>
  deleteQuestion(id: number): Promise<void>
  recordAttempt(id: number, a: { answer?: string | null; helpUsed?: string | null; outcome: AttemptRow['outcome'] }): Promise<AttemptRow>
  attempts(id: number): Promise<AttemptRow[]>

  uploadAttachment(name: string, mime: string, base64: string): Promise<{ fileName: string; ref: string; mime: string; size: number }>
  exportAll(): Promise<{ path: string; base64: string }[]>
  gitStatus(): Promise<GitStatus>
  gitPreview(cfg: Partial<GitConfig>): Promise<LinkPreview>
  gitLink(cfg: GitConfig & { previewId: string }): Promise<GitConfig>
  gitUnlink(): Promise<void>
  sync(): Promise<SyncResult>
  gitTree(): Promise<string[]>
  restoreFromRepo(): Promise<RestoreReport>
  adoptPreview(subpath: string, topicId: number | null): Promise<AdoptPreview>
  adoptApply(input: AdoptApply): Promise<{ topicId: number; created: number; updated: number; skipped: number; images: number }>

  iaPerfis(): Promise<IaPerfisView>
  setIaPerfil(perfil: 'plano' | 'aula' | 'editorial', modelo: string, effort: string): Promise<void>
  iaDiagnostico(): Promise<DiagnosticoCodex>
  iaRuns(f?: { topicId?: number | null; nodeId?: number | null; limit?: number }): Promise<RunRow[]>
  iaCancel(runId: number): Promise<void>
  masterclass(topicId: number, pedido: string): Promise<RunRow>
  masterclassContext(topicId: number): Promise<{ chars: number; contexto: string }>
  plans(topicId: number): Promise<PlanRow[]>
  editPlan(planId: number, content: unknown): Promise<PlanRow>
  discardPlan(planId: number): Promise<void>
  approvePlan(planId: number, content?: unknown): Promise<{ nodeIds: number[]; lessonId: number | null }>
  lessons(topicId: number): Promise<LessonRow[]>
  openLesson(topicId: number, nodeId: number | null): Promise<LessonView>
  lesson(lessonId: number): Promise<LessonView>
  sendTurn(lessonId: number, text: string, clientKey: string): Promise<RunRow>
  retryTurn(lessonId: number): Promise<RunRow>
  appendToNote(topicId: number, nodeId: number | null, text: string): Promise<void>

  material(topicId: number, nodeId: number | null): Promise<MaterialView>
  prepareNode(topicId: number, nodeId: number | null, opts?: { vocabulario?: string[] }): Promise<RunRow>
  regenerateSection(topicId: number, nodeId: number | null, secao: string): Promise<RunRow>
  reviewNote(topicId: number, nodeId: number | null): Promise<RunRow>
  suggestSubtopics(topicId: number, nodeId: number | null): Promise<RunRow>
  acceptEditorial(id: number, opts?: { text?: string | null; anchor?: string | null; replace?: boolean }): Promise<{ ok: true; content: string } | { ok: false; reason: 'stale' | 'ambiguous' | 'decided' }>
  decideSuggestion(id: number, status: 'rejected' | 'comment' | 'pending'): Promise<void>
  acceptSubtopic(id: number, opts?: { parentId?: number | null; title?: string | null; position?: number | null }): Promise<number>
  saveItemAsQuestion(topicId: number, nodeId: number | null, kind: 'recall' | 'exercise' | 'socratic', prompt: string, reference: string | null, hint: string | null): Promise<number>
}

export const ESTUDOS_METHODS: (keyof EstudosApi)[] = [
  'library',
  'topic',
  'createTopic',
  'createFuture',
  'updateTopic',
  'setTopicStatus',
  'continue',
  'prefs',
  'setPinned',
  'setNewPerDay',
  'timeOptions',
  'categories',
  'createCategory',
  'renameCategory',
  'deleteCategory',
  'cards',
  'createCard',
  'updateCard',
  'setCardStatus',
  'setStateSuspended',
  'deleteCard',
  'queue',
  'review',
  'sources',
  'createSource',
  'updateSource',
  'deleteSource',
  'previewImport',
  'applyImport',
  'saveCheckpoint',
  'checkpoint',
  'questions',
  'createQuestion',
  'updateQuestion',
  'deleteQuestion',
  'recordAttempt',
  'attempts',
  'uploadAttachment',
  'exportAll',
  'gitStatus',
  'gitPreview',
  'gitLink',
  'gitUnlink',
  'sync',
  'gitTree',
  'restoreFromRepo',
  'adoptPreview',
  'adoptApply',
  'iaPerfis',
  'setIaPerfil',
  'iaDiagnostico',
  'iaRuns',
  'iaCancel',
  'masterclass',
  'masterclassContext',
  'plans',
  'editPlan',
  'discardPlan',
  'approvePlan',
  'lessons',
  'openLesson',
  'lesson',
  'sendTurn',
  'retryTurn',
  'appendToNote',
  'material',
  'prepareNode',
  'regenerateSection',
  'reviewNote',
  'suggestSubtopics',
  'acceptEditorial',
  'decideSuggestion',
  'acceptSubtopic',
  'saveItemAsQuestion'
]

export interface EstudosWindowApi extends EstudosApi {
  onUpdated(cb: (p: { kind: string; topicId: number | null }) => void): () => void
  onSync(cb: (p: { phase: 'running' | 'done'; result?: SyncResult }) => void): () => void
  onIa(cb: (p: IaEvent) => void): () => void
}

export interface IaEvent {
  runId: number
  status: RunRow['status']
  operation: RunRow['operation']
  topicId: number | null
  nodeId: number | null
  section: string | null
  error?: string
}
