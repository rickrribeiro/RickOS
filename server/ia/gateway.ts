import { definicao, ehIdChamada, type ConfigIa, type IdChamadaIa, type MotorIa, type ParamsDe, type PromptSobrescrito } from '../../shared/prompts/catalogo'
import { motoresPermitidos, padraoDoMotor } from '../../shared/prompts/definicao'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { EFFORTS_DO_MOTOR } from '../../shared/prompts/motores'
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

/** Motor escolhido em Configurações → IA (se a chamada aceita) ou o padrão; modelo/effort são os padrões desse motor. */
export async function resolverExecucao(id: IdChamadaIa): Promise<ExecucaoResolvida> {
  const d = definicao(id)
  const row = await getAiChamada(id)
  const escolhido = row?.motor as MotorIa | null | undefined
  const motor = escolhido && motoresPermitidos(d).includes(escolhido) ? escolhido : d.motor
  const padrao = padraoDoMotor(d, motor) ?? { modelo: d.modelo, effort: d.effort }
  // modelo/effort escolhidos em Configurações → IA valem só para o motor em uso (trocar o motor os limpa)
  const modelo = row?.modelo?.trim() || (await valor(padrao.modelo))
  const effort = row?.effort && EFFORTS_DO_MOTOR[motor].includes(row.effort) ? row.effort : await valor(padrao.effort)
  return { motor, modelo, effort: EFFORTS_DO_MOTOR[motor].length ? effort : '' }
}

/** Padrões do Codex lidos do ~/.codex/config.toml (para mostrar como "padrão" na tela). */
export function padroesCodex(): { modelo: string | null; effort: string | null } {
  try {
    const toml = fs.readFileSync(path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml'), 'utf8')
    const topo = toml.split(/^\s*\[/m)[0] // só as chaves da raiz (antes da primeira [seção])
    const ler = (k: string): string | null => topo.match(new RegExp(`^\\s*${k}\\s*=\\s*"([^"]*)"`, 'm'))?.[1] ?? null
    return { modelo: ler('model'), effort: ler('model_reasoning_effort') }
  } catch {
    return { modelo: null, effort: null }
  }
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
