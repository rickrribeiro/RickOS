import { definirChamada, ex } from '../definicao'
import { BLOCOS_SECAO, C_PACOTE, INSTRUCOES_COMUNS } from './pedagogia/textos'
import type { Secao } from './pedagogia/schemas'
import { PERFIL_AULA } from './perfis'
import { REGRAS_D_E } from './pacoteNo'
import { prepararTutor, type ParamsTutor } from './masterclass'

/**
 * Estudos → "Gerar de novo" UMA seção do material do nó (mesmos blocos do pacote C).
 * Saída: SCHEMA_SECAO(secao). Usado em: server/estudos/tutor.ts.
 */
export const estudosSecaoNo = definirChamada<ParamsTutor & { secao: Secao }>({
  id: 'estudos.secaoNo',
  modulo: 'estudos',
  tipo: 'executa',
  motor: 'codex',
  modelo: PERFIL_AULA.modelo,
  effort: PERFIL_AULA.effort,
  arquivo: 'estudos/secaoNo.ts + estudos/pedagogia/textos.ts',
  usadoEm: 'server/estudos/tutor.ts',
  sistema: INSTRUCOES_COMUNS,
  template: `## Instrução pedagógica (C — material do nó, uma seção)
${C_PACOTE}

${REGRAS_D_E}

## Seção pedida
{{bloco}}

## Pedido
{{pedido}}

## Contexto enviado pelo app
{{contexto}}

## Contrato de saída
JSON com a única chave {{secao}}.`,
  preparar: (p) => ({ ...prepararTutor(p), secao: p.secao, bloco: BLOCOS_SECAO[p.secao] ?? p.secao }),
  exemplo: { idioma: 'pt-BR', idiomaAlvo: '—', contexto: ex('contexto do nó'), pedido: ex('gerar de novo'), secao: 'resumo' }
})
