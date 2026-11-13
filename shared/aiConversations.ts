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
  /** diff unificado (ou conteúdo, para arquivo novo); pode vir truncado */
  diff: string
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
