import { definirChamada, ex } from '../definicao'
import { A_MASTERCLASS, INSTRUCOES_COMUNS } from './pedagogia/textos'
import { PERFIL_PLANO } from './perfis'

export interface ParamsTutor {
  idioma: string
  idiomaAlvo: string
  /** Contexto montado pelo servidor (server/estudos/contexto.ts), já com orçamento de caracteres. */
  contexto: string
  /** Pedido do usuário ou resposta a perguntas anteriores. */
  pedido: string
}

export const prepararTutor = (p: ParamsTutor): Record<string, string> => ({
  idioma: p.idioma || 'pt-BR',
  idiomaAlvo: p.idiomaAlvo || '—',
  contexto: p.contexto,
  pedido: p.pedido
})

/**
 * Estudos → criar a masterclass ou repensar o currículo a meu pedido (prompt A). Saída: SCHEMA_MASTERCLASS.
 * Usado em: server/estudos/tutor.ts.
 */
export const estudosMasterclass = definirChamada<ParamsTutor>({
  id: 'estudos.masterclass',
  modulo: 'estudos',
  tipo: 'executa',
  motor: 'codex',
  modelo: PERFIL_PLANO.modelo,
  effort: PERFIL_PLANO.effort,
  arquivo: 'estudos/masterclass.ts + estudos/pedagogia/textos.ts',
  usadoEm: 'server/estudos/tutor.ts',
  sistema: INSTRUCOES_COMUNS,
  template: `## Instrução pedagógica (A — masterclass)
${A_MASTERCLASS}

## Meu pedido
{{pedido}}

## Contexto autorizado enviado pelo app
{{contexto}}

## Contrato de saída
JSON conforme o schema: perguntas (0 a 2; preencha só se a resposta mudar profundamente a trilha — mesmo assim entregue o mapa com as suposições declaradas), suposicoes, situacao, jaSei, restricoes, preferenciasEnsino, decisoesEmAberto, fundamentos, demonstracaoFinal, partes[{titulo, porque, modulos[...]}], ordemJustificativa, aprofundamentosOpcionais, workshops, coberturaReversa, aberturaPrimeiraAula ({titulo, situacao, aula — a primeira aula em Markdown, que ensina antes de perguntar —, primeiroPasso, pergunta}), aConferir.`,
  preparar: prepararTutor,
  exemplo: { idioma: 'pt-BR', idiomaAlvo: '—', contexto: ex('objetivo, mapa atual, notas'), pedido: ex('quero estudar X para conseguir Y') }
})
