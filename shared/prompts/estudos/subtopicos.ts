import { definirChamada, ex } from '../definicao'
import { E_SUBTOPICOS, INSTRUCOES_COMUNS } from './pedagogia/textos'
import { PERFIL_EDITORIAL } from './perfis'
import { prepararTutor, type ParamsTutor } from './masterclass'

/**
 * Estudos → "Sugerir subtópicos" pontual (prompt E). Saída: SCHEMA_SUBTOPICOS.
 * Usado em: server/estudos/tutor.ts.
 */
export const estudosSubtopicos = definirChamada<ParamsTutor>({
  id: 'estudos.subtopicos',
  modulo: 'estudos',
  tipo: 'executa',
  motor: 'codex',
  modelo: PERFIL_EDITORIAL.modelo,
  effort: PERFIL_EDITORIAL.effort,
  arquivo: 'estudos/subtopicos.ts + estudos/pedagogia/textos.ts',
  usadoEm: 'server/estudos/tutor.ts',
  sistema: INSTRUCOES_COMUNS,
  template: `## Instrução pedagógica (E — subtópicos)
${E_SUBTOPICOS}

## Contexto enviado pelo app (objetivo, mapa com IDs, notas selecionadas, recusas anteriores)
{{contexto}}

## Pedido (com a minha direção, se eu dei uma)
{{pedido}}

## Contrato de saída
JSON: subtopicos { itens: [{parentId, posicao, titulo, motivo, conexaoObjetivo, tipo, prerequisito}], vazio }. parentId é um ID que existe no mapa (ou null para raiz). Zero itens é uma resposta válida; nota longa não significa roteiro incompleto.`,
  preparar: prepararTutor,
  exemplo: { idioma: 'pt-BR', idiomaAlvo: '—', contexto: ex('mapa com IDs'), pedido: ex('sugerir; direção: foco em exemplos de games') }
})
