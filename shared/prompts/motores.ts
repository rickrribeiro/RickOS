import type { MotorIa } from './definicao'

/**
 * Opções de modelo e effort por motor (Configurações → IA). Modelo também aceita texto
 * livre ("Outro…"); effort só os valores abaixo. Lista vazia de effort = motor sem effort.
 */
export const MODELOS_SUGERIDOS: Record<MotorIa, string[]> = {
  'claude-code': ['opus', 'sonnet', 'haiku'],
  codex: [],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro']
}

export const EFFORTS_DO_MOTOR: Record<MotorIa, string[]> = {
  'claude-code': ['low', 'medium', 'high', 'xhigh', 'max'],
  codex: ['minimal', 'low', 'medium', 'high', 'xhigh'],
  gemini: []
}

/** Nome de modelo aceitável (vai como argumento do CLI). */
export function modeloValido(m: string): boolean {
  return /^[A-Za-z0-9._:\-[\]/]{1,80}$/.test(m)
}
