import { definirChamada, ex } from '../definicao'
import { D_REVISAO, INSTRUCOES_COMUNS } from './pedagogia/textos'
import { PERFIL_EDITORIAL } from './perfis'
import { prepararTutor, type ParamsTutor } from './masterclass'

/**
 * Estudos → "Revisar minha anotação" isolada (prompt D). Saída: SCHEMA_EDITORIAL.
 * Usado em: server/estudos/tutor.ts.
 */
export const estudosRevisaoEditorial = definirChamada<ParamsTutor>({
  id: 'estudos.revisaoEditorial',
  modulo: 'estudos',
  tipo: 'executa',
  motor: 'codex',
  modelo: PERFIL_EDITORIAL.modelo,
  effort: PERFIL_EDITORIAL.effort,
  arquivo: 'estudos/revisaoEditorial.ts + estudos/pedagogia/textos.ts',
  usadoEm: 'server/estudos/tutor.ts',
  sistema: INSTRUCOES_COMUNS,
  template: `## Instrução pedagógica (D — revisão editorial)
${D_REVISAO}

## Contexto enviado pelo app (objetivo, nó e a MINHA nota; recusas anteriores)
{{contexto}}

## Pedido
{{pedido}}

## Contrato de saída
JSON: revisaoEditorial { itens: [{trecho, motivo, tipo, sugestao, substituicao}], vazio }. "trecho" é cópia EXATA de um pedaço da nota. Zero itens é uma resposta válida.`,
  preparar: prepararTutor,
  exemplo: { idioma: 'pt-BR', idiomaAlvo: '—', contexto: ex('nota'), pedido: ex('revisar') }
})
