import { CATALOGO_IA, type ChamadaIa, type ConfigIa, type IdChamadaIa, type MotorIa } from '../../shared/prompts/catalogo'
import { getSetting } from '../database/queries'
import { criarMotor, type ExecucaoIa } from './motores'

/**
 * Gateway único de IA: toda execução passa por aqui com o id da chamada do catálogo.
 * Resolve motor/modelo/effort (padrões do catálogo + Configurações) e delega ao motor
 * certo via factory (`criarMotor`).
 */
export function chamada(id: IdChamadaIa): ChamadaIa {
  const c = CATALOGO_IA.find((x) => x.id === id)
  if (!c) throw new Error(`Chamada de IA desconhecida: ${id}`)
  return c
}

async function valor(cfg: ConfigIa | null): Promise<string> {
  if (!cfg) return ''
  const salvo = cfg.setting ? ((await getSetting(cfg.setting)) ?? '').trim() : ''
  return salvo || cfg.padrao
}

export interface ExecucaoResolvida {
  motor: MotorIa
  modelo: string
  effort: string
}

export async function resolverExecucao(id: IdChamadaIa): Promise<ExecucaoResolvida> {
  const c = chamada(id)
  return { motor: c.motor, modelo: await valor(c.modelo), effort: await valor(c.effort) }
}

/** Executa um prompt já montado na chamada `id`. */
export async function executarChamada(id: IdChamadaIa, req: Omit<ExecucaoIa, 'modelo' | 'effort'>): Promise<string> {
  const r = await resolverExecucao(id)
  return criarMotor(r.motor).executar({ ...req, modelo: r.modelo, effort: r.effort })
}
