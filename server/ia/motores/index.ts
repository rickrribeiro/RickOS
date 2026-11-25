import type { MotorIa } from '../../../shared/prompts/catalogo'
import { motorClaudeCode } from './claudeCode'
import { motorCodex } from './codex'
import type { MotorExecutor } from './tipos'

/**
 * Factory de motores de IA. O Gemini (Notícias) não passa por aqui: usa o SDK com schema
 * de resposta em server/services/news.ts, e só o modelo/prompt vêm do gateway.
 */
const MOTORES: Partial<Record<MotorIa, MotorExecutor>> = {
  'claude-code': motorClaudeCode,
  codex: motorCodex
}

export function criarMotor(motor: MotorIa): MotorExecutor {
  const m = MOTORES[motor]
  if (!m) throw new Error(`Motor de IA "${motor}" não executa prompts de texto genéricos.`)
  return m
}

export type { ExecucaoIa, MotorExecutor } from './tipos'
