import type { ConfigIa } from './definicao'

/** Padrões de modelo/effort reaproveitados pelas definições de chamada. */
export const CLAUDE_MODEL: ConfigIa = { setting: 'claude_model', padrao: '' }
/** Codex: '' = o modelo e o effort do ~/.codex/config.toml. */
export const CODEX_MODEL: ConfigIa = { padrao: '' }
export const RUNNER_MODEL: ConfigIa = { setting: 'prompt_runner_model', padrao: 'opus' }
export const RUNNER_EFFORT: ConfigIa = { setting: 'prompt_runner_effort', padrao: 'medium' }
export const MEM_FAST: ConfigIa = { setting: 'memory_ai_model_fast', padrao: 'haiku' }
export const MEM_MAIN: ConfigIa = { setting: 'memory_ai_model', padrao: 'sonnet' }
export const FLIGHTS_MODEL: ConfigIa = { setting: 'flights_ai_model', padrao: 'haiku' }
export const CHATS_MODEL: ConfigIa = { setting: 'chats_ai_model', padrao: 'sonnet' }

/** Bloco de memória anexado ao fim (`\n\n<bloco>`) ou nada. */
export const anexo = (bloco: string | null | undefined): string => (bloco ? `\n\n${bloco}` : '')
