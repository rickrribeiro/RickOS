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

/** Só para testes: substitui todos os motores (fixtures sem gastar tokens e contagem de chamadas). */
let motorDeTeste: ((motor: MotorIa) => MotorExecutor) | null = null
export function definirMotorDeTeste(fn: ((motor: MotorIa) => MotorExecutor) | null): void {
  motorDeTeste = fn
}

export function criarMotor(motor: MotorIa): MotorExecutor {
  if (motorDeTeste) return motorDeTeste(motor)
  const m = MOTORES[motor]
  if (!m) throw new Error(`Motor de IA "${motor}" não executa prompts de texto genéricos.`)
  return m
}

export type { ExecucaoIa, MotorExecutor } from './tipos'
