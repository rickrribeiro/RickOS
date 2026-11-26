import type { MotorIa } from '../../../shared/prompts/catalogo'
import type { CliUsage } from '../../services/claude'

/**
 * Contrato de um motor de IA (strategy). Cada motor sabe executar um prompt já montado
 * no seu CLI/SDK; quem decide QUAL motor, modelo e effort usar é o gateway (../gateway.ts).
 */
export interface ExecucaoIa {
  prompt: string
  /** System prompt (Claude: --append-system-prompt; Codex: vai antes do prompt). */
  sistema?: string
  /** '' = padrão do CLI/conta. */
  modelo?: string
  /** '' = padrão do CLI/conta. */
  effort?: string
  cwd?: string
  /** 0 = sem timeout. Padrão: 120 s. */
  timeoutMs?: number
  /**
   * O que o agente pode fazer:
   *  - 'nenhuma': só texto (Claude: --tools ""; Codex: sandbox read-only);
   *  - 'padrao': ferramentas liberadas pelo app (Claude: extraArgs; Codex: read-only);
   *  - 'agentic': executa ferramentas de verdade (Claude: agentic; Codex: workspace-write).
   */
  ferramentas?: 'nenhuma' | 'padrao' | 'agentic'
  /** Só Claude Code: flags extras controladas pelo app (ex.: --allowedTools). */
  claudeArgs?: string[]
  /** Só Claude Code: comando/alias do CLI (conta do projeto). */
  claudeCommand?: string
  /** Só Claude Code: CLAUDE_CONFIG_DIR desta execução (outra conta). */
  claudeConfigDir?: string
  /** Só Claude Code: recebe o uso de tokens (quem registra é o chamador; não use junto com `usage`). */
  onUsage?: (u: CliUsage) => void
  /** Só Claude Code: modo de permissão no agentic. */
  permissionMode?: 'default' | 'acceptEdits'
  /** Texto ao vivo. */
  onChunk?: (texto: string) => void
  registerChild?: (kill: () => void) => void
  /** Contabilidade de tokens (ai_usage). */
  usage?: { source: string; projectId?: number | null }
  /** Só Codex: JSON Schema da resposta final (`--output-schema`). */
  schemaSaida?: Record<string, unknown>
  /** Só Codex: tokens reportados pelo CLI no fim do turno. */
  onTokens?: (t: { input: number; output: number; cached: number; reasoning: number }) => void
}

export interface MotorExecutor {
  readonly id: MotorIa
  executar(req: ExecucaoIa): Promise<string>
}
