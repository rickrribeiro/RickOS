import { definirChamada, ex } from '../definicao'
import { B_AULA, INSTRUCOES_COMUNS } from './pedagogia/textos'
import { PERFIL_AULA } from './perfis'
import { prepararTutor, type ParamsTutor } from './masterclass'

/**
 * Estudos → aula conversacional de um módulo, um turno por vez (prompt B). Saída: SCHEMA_AULA.
 * Usado em: server/estudos/tutor.ts.
 */
export const estudosAula = definirChamada<ParamsTutor>({
  id: 'estudos.aula',
  modulo: 'estudos',
  tipo: 'executa',
  motor: 'codex',
  modelo: PERFIL_AULA.modelo,
  effort: PERFIL_AULA.effort,
  arquivo: 'estudos/aula.ts + estudos/pedagogia/textos.ts',
  usadoEm: 'server/estudos/tutor.ts',
  sistema: INSTRUCOES_COMUNS,
  template: `## Instrução pedagógica (B — aula)
${B_AULA}

## Contexto da aula enviado pelo app (módulo, objetivo, turnos anteriores, minhas tentativas)
{{contexto}}

## Meu turno agora
{{pedido}}

## Contrato de saída
JSON: resposta (o seu turno, em Markdown), tipo, minhaResposta ({entendi, corrigir, proximaTentativa} quando eu respondi algo; senão null), hipoteses, perguntaAberta, pontoDeRetorno, fraseDeRetomada.`,
  preparar: prepararTutor,
  exemplo: { idioma: 'pt-BR', idiomaAlvo: '—', contexto: ex('módulo + turnos'), pedido: ex('minha mensagem') }
})
