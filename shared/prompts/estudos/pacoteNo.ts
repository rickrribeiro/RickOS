import { definirChamada, ex } from '../definicao'
import { BLOCOS_SECAO, C_PACOTE, D_REVISAO, E_SUBTOPICOS, INSTRUCOES_COMUNS } from './pedagogia/textos'
import { SECOES } from './pedagogia/schemas'
import { PERFIL_AULA } from './perfis'
import { prepararTutor, type ParamsTutor } from './masterclass'

export const REGRAS_D_E = `### Regra D — revisão editorial da minha nota
${D_REVISAO}

### Regra E — novos subtópicos
${E_SUBTOPICOS}`

/**
 * Estudos → "Preparar material do nó": UMA geração com todas as seções (prompt C + D + E).
 * Saída: SCHEMA_PACOTE. Usado em: server/estudos/tutor.ts.
 */
export const estudosPacoteNo = definirChamada<ParamsTutor>({
  id: 'estudos.pacoteNo',
  modulo: 'estudos',
  tipo: 'executa',
  motor: 'codex',
  modelo: PERFIL_AULA.modelo,
  effort: PERFIL_AULA.effort,
  arquivo: 'estudos/pacoteNo.ts + estudos/pedagogia/textos.ts',
  usadoEm: 'server/estudos/tutor.ts',
  sistema: INSTRUCOES_COMUNS,
  template: `## Instrução pedagógica (C — material do nó)
${C_PACOTE}

${REGRAS_D_E}

## Seções (cada uma independente; vazia → itens [] e "vazio" com justificativa curta)
${SECOES.map((s) => `- ${BLOCOS_SECAO[s]}`).join('\n')}

## Pedido
{{pedido}}

## Contexto enviado pelo app
{{contexto}}

## Contrato de saída
JSON com exatamente estas chaves: ${SECOES.join(', ')}. Não gere o curso inteiro: só este nó.`,
  preparar: prepararTutor,
  exemplo: { idioma: 'pt-BR', idiomaAlvo: '—', contexto: ex('objetivo, nó, nota, tentativas'), pedido: ex('preparar material') }
})
