import { definicao, ehIdChamada, type ConfigIa, type IdChamadaIa, type MotorIa, type ParamsDe, type PromptSobrescrito } from '../../shared/prompts/catalogo'
import { getAiChamada, getSetting } from '../database/queries'
import { criarMotor, type ExecucaoIa } from './motores'

/**
 * Gateway único de IA: toda execução passa por aqui com o id da chamada do catálogo e os
 * DADOS (não o prompt pronto). O gateway:
 *  1. lê a configuração da chamada no banco (prompt sobrescrito pelo usuário, se houver);
 *  2. monta o prompt com o template (padrão ou sobrescrito) — `montarChamada`;
 *  3. resolve motor/modelo/effort e executa pelo motor certo (factory `criarMotor`).
 */
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
  const d = definicao(id)
  return { motor: d.motor, modelo: await valor(d.modelo), effort: await valor(d.effort) }
}

/** Prompt sobrescrito salvo (null = usar o padrão). */
export async function promptSobrescrito(id: IdChamadaIa): Promise<PromptSobrescrito | null> {
  const row = await getAiChamada(id)
  return row && (row.template != null || row.sistema != null) ? { template: row.template, sistema: row.sistema } : null
}

export interface ChamadaMontada extends ExecucaoResolvida {
  sistema: string | null
  prompt: string
}

/** Monta o prompt (com o sobrescrito, se houver) e resolve motor/modelo/effort. */
export async function montarChamada<K extends IdChamadaIa>(id: K, params: ParamsDe<K>): Promise<ChamadaMontada> {
  const [m, exec] = await Promise.all([promptSobrescrito(id).then((s) => definicao(id).montar(params, s)), resolverExecucao(id)])
  return { ...m, ...exec }
}

export type OpcoesExecucao = Omit<ExecucaoIa, 'prompt' | 'sistema' | 'modelo' | 'effort'> & {
  /** Texto antes do prompt montado (ex.: "CONTEXTO DO PROJETO" do Assistente). */
  prefixo?: string
  /** Modelo/effort escolhidos pelo chamador para esta execução (ex.: os da conversa). */
  modelo?: string
  effort?: string
}

/** Monta e executa a chamada `id` com os dados `params`. */
export async function executarChamada<K extends IdChamadaIa>(id: K, params: ParamsDe<K>, opts: OpcoesExecucao = {}): Promise<string> {
  const c = await montarChamada(id, params)
  const { prefixo, modelo, effort, ...req } = opts
  return criarMotor(c.motor).executar({
    ...req,
    prompt: (prefixo ?? '') + c.prompt,
    sistema: c.sistema || undefined,
    modelo: modelo || c.modelo,
    effort: effort || c.effort
  })
}

/** Valida um id vindo do front (RPC). */
export function idValido(id: unknown): IdChamadaIa {
  if (typeof id !== 'string' || !ehIdChamada(id)) throw new Error(`Chamada de IA desconhecida: ${String(id)}`)
  return id
}
