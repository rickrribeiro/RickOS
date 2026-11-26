import type { ConfigIa } from '../definicao'

/**
 * Perfis de execução SÓ do módulo Estudos (Codex). Configuráveis em Estudos → IA (chaves
 * `study_ai_*`) e, por chamada, em Configurações → IA. Valores iniciais validados contra o
 * catálogo local (`codex debug models`, codex-cli 0.172): gpt-6.2-astra / gpt-6.2-sol.
 * Sem `alternativas`: nunca troca de provedor em silêncio.
 */
export const PERFIL_PLANO = {
  modelo: { setting: 'study_ai_plan_model', padrao: 'gpt-6.2-astra' } as ConfigIa,
  effort: { setting: 'study_ai_plan_effort', padrao: 'high' } as ConfigIa
}
export const PERFIL_AULA = {
  modelo: { setting: 'study_ai_lesson_model', padrao: 'gpt-6.2-sol' } as ConfigIa,
  effort: { setting: 'study_ai_lesson_effort', padrao: 'medium' } as ConfigIa
}
export const PERFIL_EDITORIAL = {
  modelo: { setting: 'study_ai_edit_model', padrao: 'gpt-6.2-sol' } as ConfigIa,
  effort: { setting: 'study_ai_edit_effort', padrao: 'low' } as ConfigIa
}
export const PERFIS_ESTUDOS = { plano: PERFIL_PLANO, aula: PERFIL_AULA, editorial: PERFIL_EDITORIAL }
export type PerfilEstudos = keyof typeof PERFIS_ESTUDOS
