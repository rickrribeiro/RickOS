/**
 * Conversas do Prompt Runner: cada conversa é uma sessão do Claude Code CLI
 * (continuada com `--resume <sessionId>`), com turnos persistidos no banco.
 * Tipos puros, compartilhados entre servidor e front.
 */

/** Como o CLI lida com ferramentas nesta conversa. */
export type ConvPermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'

export const PERMISSION_MODE_LABELS: Record<ConvPermissionMode, string> = {
  default: 'Perguntar',
  acceptEdits: 'Aceitar edições',
  plan: 'Planejar',
  bypassPermissions: 'Executar tudo'
}

export type ConvEffort = '' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Modelos oferecidos no Prompt Runner (aliases do Claude CLI: sempre a versão mais recente da família). */
export const CONV_MODELS: { v: string; label: string }[] = [
  { v: 'opus', label: 'Opus' },
  { v: 'sonnet', label: 'Sonnet' },
  { v: 'haiku', label: 'Haiku' }
]

export const CONV_EFFORTS: { v: Exclude<ConvEffort, ''>; label: string }[] = [
  { v: 'low', label: 'Baixo' },
  { v: 'medium', label: 'Médio' },
  { v: 'high', label: 'Alto' },
  { v: 'xhigh', label: 'Muito alto' },
  { v: 'max', label: 'Máximo' }
]

/** Chaves de configuração do padrão do Prompt Runner (Configurações → IA). */
export const CONV_DEFAULT_MODEL_KEY = 'prompt_runner_model'
export const CONV_DEFAULT_EFFORT_KEY = 'prompt_runner_effort'
/** Padrão de fábrica quando nada foi salvo nas configurações. */
export const CONV_FALLBACK_MODEL = 'opus'
export const CONV_FALLBACK_EFFORT: Exclude<ConvEffort, ''> = 'medium'

/** Padrão efetivo a partir do valor salvo (vazio/inválido → padrão de fábrica). */
export function convDefaultModel(saved: string | null | undefined): string {
  const v = (saved ?? '').trim()
  return v || CONV_FALLBACK_MODEL
}

export function convDefaultEffort(saved: string | null | undefined): Exclude<ConvEffort, ''> {
  const v = (saved ?? '').trim()
  return CONV_EFFORTS.some((e) => e.v === v) ? (v as Exclude<ConvEffort, ''>) : CONV_FALLBACK_EFFORT
}

export interface AiQuestionOption {
  label: string
  description?: string
}

export interface AiQuestion {
  question: string
  header?: string
  options: AiQuestionOption[]
  multiSelect?: boolean
}

/** Pedido de permissão pendente/resolvido, preso ao bloco da ferramenta. */
export interface AiPermissionState {
  requestId: string
  status: 'pending' | 'allowed' | 'denied'
  /** Regras que o CLI sugere salvar ("permitir sempre"). */
  suggestions?: unknown[]
  /** O que foi decidido, para exibir ("Permitido sempre", "Negado: …"). */
  note?: string
  blockedPath?: string
  description?: string
}

export type AiBlock =
  | { type: 'text'; text: string; live?: boolean }
  | { type: 'thinking'; text: string; live?: boolean }
  | {
      type: 'tool'
      id: string
      name: string
      input: Record<string, unknown>
      result?: string
      isError?: boolean
      permission?: AiPermissionState
      /** AskUserQuestion: respostas escolhidas (pergunta → resposta). */
      answers?: Record<string, string>
    }
  | { type: 'notice'; text: string }

export type AiTurnStatus = 'running' | 'done' | 'error' | 'cancelled' | 'interrupted'

export interface AiTurn {
  id: number
  conversationId: string
  createdAt: string
  prompt: string
  blocks: AiBlock[]
  status: AiTurnStatus
  error: string | null
  costUsd: number
  inputTokens: number
  outputTokens: number
  /** Tamanho do contexto ao fim do turno (input + cache do último request). */
  contextTokens: number
  durationMs: number | null
  /** Miniaturas (data URL) das imagens enviadas junto com o prompt. */
  attachments: string[]
}

export interface AiConversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  projectId: number | null
  agentId: string | null
  skillIds: string[]
  model: string
  effort: ConvEffort
  permissionMode: ConvPermissionMode
  /** Sessão do CLI (preenchida no primeiro turno ou ao importar do terminal). */
  sessionId: string | null
  /** Diretório onde a sessão roda; o `--resume` só acha a sessão no mesmo diretório. */
  cwd: string | null
  /** CLAUDE_CONFIG_DIR de uma sessão importada de outra conta (ex.: ~/.claude-trabalho). */
  configDir: string | null
  /** Comando do CLI usado (ex.: "claude-trabalho"); vazio = o do projeto/global. */
  claudeCommand: string
  contextTokens: number
  contextWindow: number
  totalCostUsd: number
  totalInputTokens: number
  totalOutputTokens: number
  pinned: boolean
  archived: boolean
  origin: 'rickos' | 'terminal'
  /** Roda num git worktree isolado (criado no primeiro turno). */
  useWorktree: boolean
  worktreeBranch: string | null
  /** Repositório principal do worktree. */
  repoPath: string | null
  /** Branch de onde o worktree saiu (base do PR). */
  baseRef: string | null
  /** Ramificação ainda não iniciada: o primeiro turno usa `--resume <forkFrom> --fork-session`. */
  forkFrom: string | null
  /** Última vez que você viu a conversa (updatedAt visto); resposta mais nova = não lida. */
  seenAt: string | null
  /** Só na listagem: estado ao vivo. */
  running?: boolean
  pendingPrompts?: number
  queued?: string[]
  turnCount?: number
}

export type AiConversationPatch = Partial<
  Pick<AiConversation, 'title' | 'projectId' | 'agentId' | 'skillIds' | 'model' | 'effort' | 'permissionMode' | 'pinned' | 'archived' | 'claudeCommand' | 'useWorktree'>
>

/** Imagem anexada a uma mensagem: `data` vai ao Claude; `thumb` fica no histórico. */
export interface AiImageInput {
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  /** base64 sem prefixo data: */
  data: string
  /** miniatura em data URL */
  thumb: string
}

export const IMAGE_MEDIA_TYPES: AiImageInput['mediaType'][] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
export const MAX_IMAGES_PER_MESSAGE = 8

/** Mensagem na fila (texto + imagens). */
export interface AiQueuedMessage {
  text: string
  images: AiImageInput[]
}

/** Um arquivo alterado na pasta da conversa. */
export interface ConvChangedFile {
  path: string
  /** M, A, D, R, ?? (não rastreado)… */
  status: string
  additions: number
  deletions: number
  /** diff unificado: vazio na listagem (carregado sob demanda com conv:fileDiff) */
  diff: string
  binary?: boolean
}

export interface ConvFileDiff {
  diff: string
  truncated: boolean
  binary: boolean
}

export interface ConvChanges {
  isRepo: boolean
  branch: string | null
  /** Branch base (worktree) — destino do PR. */
  baseRef: string | null
  files: ConvChangedFile[]
  /** Commits na branch ainda não enviados ao remoto. */
  unpushed: number
  hasRemote: boolean
  /**
   * Projeto workspace (pasta raiz com vários repos): a raiz não é repo (`isRepo: false`)
   * e as mudanças vêm por repositório. As ações (diff/commit/PR) recebem o `rel`.
   */
  repos?: ConvRepoChanges[]
}

export interface ConvRepoChanges {
  name: string
  /** Caminho relativo à pasta da conversa (ex.: "front"). */
  rel: string
  changes: ConvChanges
}

/** Resposta do usuário a um pedido pendente. */
export type AiPromptResponse =
  | { kind: 'allow'; always?: boolean }
  | { kind: 'deny'; message?: string }
  | { kind: 'answer'; answers: Record<string, string> }
  /** ExitPlanMode aprovado: segue no modo escolhido. */
  | { kind: 'approvePlan'; mode: 'default' | 'acceptEdits' }
  /** "Chat about this": recusa a pergunta e para, esperando a sua próxima mensagem. */
  | { kind: 'chat' }

/** Sessão encontrada nos transcripts do Claude Code (terminal). */
export interface TerminalSession {
  sessionId: string
  file: string
  configDir: string
  cwd: string
  title: string
  lastPrompt: string
  updatedAt: string
  sizeBytes: number
  projectId: number | null
  /** Já importada como conversa (id da conversa). */
  conversationId: string | null
}

/** Evento ao vivo enviado pelo canal SSE `conv:update`. */
export interface AiConvUpdate {
  conversationId: string
  turn?: AiTurn
  conversation?: AiConversation
  removed?: boolean
}

/** Janela de contexto conhecida quando o CLI ainda não informou. */
export const DEFAULT_CONTEXT_WINDOW = 200_000

/** Skill ou comando do Claude Code criado por você (usuário ou projeto). */
export interface ClaudeSkillInfo {
  id: string
  name: string
  description: string
  argumentHint: string | null
  kind: 'skill' | 'command'
  scope: 'user' | 'project'
  /** "Pessoal", "Trabalho" (conta ~/.claude-trabalho) ou o nome do projeto */
  source: string
  configDir: string | null
  projectId: number | null
  path: string
  updatedAt: string
}

/** Item do autocompletar de `/` no Prompt Runner. */
export interface SlashCommandInfo {
  name: string
  description: string
  /** "Pessoal", "projeto X", "CLI", "plugin"… */
  source: string
  argumentHint: string | null
}

/** Uma linha do `/usage` do Claude Code (ex.: "Current session: 13% used · resets …"). */
export interface ClaudeUsageLimit {
  /** 'session' = janela de 5 horas; 'week' = semanal. */
  kind: 'session' | 'week'
  /** Qualificador da semanal: "all models", "Fable"… (null na de 5 horas). */
  scope: string | null
  percent: number
  /** Quando zera, em ISO (null se não deu para interpretar; veja `resetsText`). */
  resetsAt: string | null
  resetsText: string | null
}

/** Limites de uma conta: Claude Code (`~/.claude`, `~/.claude-trabalho`…) ou Codex CLI. */
export interface ClaudeUsageAccount {
  provider: 'claude' | 'codex'
  /** Claude: diretório de config; Codex: 'codex'. Serve de chave. */
  configDir: string
  label: string
  limits: ClaudeUsageLimit[]
  /** Texto cru quando nada foi reconhecido (ex.: conta via API key). */
  raw: string | null
  error: string | null
  /**
   * Os limites vieram de uma leitura anterior (ISO dela): às vezes o `/usage` do CLI
   * responde sem as linhas "Current …", e aí mostramos a última leitura boa.
   */
  staleAt?: string | null
  /** O `/usage` respondeu (conta de assinatura) mas sem os limites, e não há leitura anterior. */
  unavailable?: boolean
}

export interface ClaudeUsageSnapshot {
  fetchedAt: string
  accounts: ClaudeUsageAccount[]
}
