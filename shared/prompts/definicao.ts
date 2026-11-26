/**
 * Factory das chamadas de IA. Cada arquivo de shared/prompts/<módulo>/ exporta uma
 * definição criada por `definirChamada`: padrões de execução + o prompt como TEMPLATE
 * com variáveis `{{nome}}` + `preparar(params)`, que transforma os dados do chamador nas
 * variáveis. Assim o mesmo template serve para o prompt padrão e para o prompt
 * sobrescrito pelo usuário (Configurações → IA), que fica salvo no banco.
 */
export type MotorIa = 'claude-code' | 'codex' | 'gemini'

export type ModuloIa =
  | 'assistente'
  | 'promptRunner'
  | 'automacoes'
  | 'home'
  | 'inbox'
  | 'braindump'
  | 'estudos'
  | 'projetos'
  | 'github'
  | 'mensagens'
  | 'memoria'
  | 'passagens'
  | 'viagens'
  | 'crm'
  | 'financas'
  | 'noticias'

/** Valor configurável: lido de `setting` (Configurações) e, se vazio, `padrao`. `padrao: ''` = padrão do CLI/conta. */
export interface ConfigIa {
  setting?: string
  padrao: string
}

/** Padrões de execução de um motor numa chamada. */
export interface PadraoMotor {
  modelo: ConfigIa
  /** null = não envia effort (padrão do CLI/conta). */
  effort: ConfigIa | null
}

/** Prompt efetivo: o do usuário (banco) ou o padrão. `null` = usar o padrão. */
export interface PromptSobrescrito {
  template: string | null
  sistema: string | null
}

export interface DefinicaoChamada<P> {
  id: string
  modulo: ModuloIa
  /**
   * 'executa': o app chama a IA com este prompt.
   * 'texto': só monta o texto, que vai para outra chamada (ex.: Assistente, Prompt Runner).
   */
  tipo: 'executa' | 'texto'
  /** Motor padrão. `modelo`/`effort` são os padrões dele. */
  motor: MotorIa
  modelo: ConfigIa
  /** null = não envia effort (padrão do CLI/conta). */
  effort: ConfigIa | null
  /**
   * Outros motores que o usuário pode escolher (Configurações → IA), com os padrões de cada um.
   * Ausente = só o motor padrão (ex.: precisa de ferramenta que só o Claude Code tem).
   */
  alternativas?: Partial<Record<MotorIa, PadraoMotor>>
  /** Arquivo(s) em shared/prompts/ (null = prompt escrito pelo próprio usuário). */
  arquivo: string | null
  usadoEm: string
  /** System prompt (template). */
  sistema?: string
  /** Prompt (template). */
  template: string
  /** Dados do chamador → variáveis do template (todas strings, já formatadas). */
  preparar: (p: P) => Record<string, string>
  /** Dados de exemplo para mostrar o prompt montado. */
  exemplo: P
}

export interface PromptMontado {
  sistema: string | null
  prompt: string
}

export interface Chamada<P> extends DefinicaoChamada<P> {
  /** Variáveis usadas pelos templates padrão (para o editor). */
  readonly variaveis: string[]
  /** Monta o prompt com os dados (usando o sobrescrito, se houver). */
  montar(p: P, sobrescrito?: PromptSobrescrito | null): PromptMontado
}

const VAR = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g

/** Substitui `{{nome}}` numa passada só (o valor nunca é reinterpretado). Variável desconhecida fica como está. */
export function renderizarTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(VAR, (m, nome: string) => (Object.prototype.hasOwnProperty.call(vars, nome) ? vars[nome] : m))
}

export function variaveisDoTemplate(template: string): string[] {
  return [...new Set([...template.matchAll(VAR)].map((m) => m[1]))]
}

export function definirChamada<P>(d: DefinicaoChamada<P>): Chamada<P> {
  const variaveis = [...new Set([...variaveisDoTemplate(d.sistema ?? ''), ...variaveisDoTemplate(d.template)])]
  return {
    ...d,
    variaveis,
    montar(p, sobrescrito) {
      const vars = d.preparar(p)
      const sistema = sobrescrito?.sistema ?? d.sistema ?? null
      return {
        sistema: sistema == null ? null : renderizarTemplate(sistema, vars),
        prompt: renderizarTemplate(sobrescrito?.template ?? d.template, vars)
      }
    }
  }
}

/** Motores aceitos por uma chamada (o padrão primeiro). */
export function motoresPermitidos(d: Pick<DefinicaoChamada<unknown>, 'motor' | 'alternativas'>): MotorIa[] {
  return [d.motor, ...(Object.keys(d.alternativas ?? {}) as MotorIa[]).filter((m) => m !== d.motor)]
}

/** Padrões (modelo/effort) de um motor numa chamada; null se o motor não é aceito. */
export function padraoDoMotor(d: Pick<DefinicaoChamada<unknown>, 'motor' | 'modelo' | 'effort' | 'alternativas'>, motor: MotorIa): PadraoMotor | null {
  if (motor === d.motor) return { modelo: d.modelo, effort: d.effort }
  return d.alternativas?.[motor] ?? null
}

/** Marcador dos dados de exemplo. */
export const ex = (s: string): string => `«${s}»`
