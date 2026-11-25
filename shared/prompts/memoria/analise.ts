import { REGRAS_SEGURANCA_MEMORIA } from './regras'
import { FORMATO_SUGESTOES_MEMORIA } from './extracao'

/**
 * Memória Pessoal → "Analisar minhas memórias" (manual) e consolidação periódica:
 * merges, padrões (LEARNING/INFERENCE), contradições, obsoletas.
 * Usado em: server/memory/agent.ts (`analyzeMemories`). Modelo: `memory_ai_model`.
 */
export const REGRAS_ANALISE_MEMORIA = `Analise as memórias e proponha APENAS o que melhora a qualidade:
- MERGE: memórias redundantes/semelhantes → uma memória consolidada (targetIds = as originais). As originais não são apagadas, ficam como "substituídas".
- CREATE com type LEARNING ou INFERENCE (explicit=false): padrão comportamental que várias memórias sustentam (targetIds = as que sustentam). É hipótese, não fato.
- RESOLVE: contradição real (targetIds = as conflitantes). Não trate como contradição preferências que dependem de contexto, escopo ou período; nesses casos não sugira nada.
- UPDATE: memória que ficou incompleta/ambígua diante de outra.
- ARCHIVE: só para memória claramente obsoleta pelas próprias memórias.
- ASK: confirmação de objetivo antigo ou informação ambígua importante.
Nunca reescreva memórias confirmadas sem motivo claro. Menos é mais: zero sugestões é uma resposta válida.`

export const SISTEMA_ANALISE_MEMORIA = `Você é o Memory Agent do rickOS revisando a memória pessoal do usuário.\n${REGRAS_SEGURANCA_MEMORIA}\n${REGRAS_ANALISE_MEMORIA}\n${FORMATO_SUGESTOES_MEMORIA}\nNo campo "evidence" cite o(s) #id que sustentam a sugestão.`

export function promptAnaliseMemoria(p: { categorias: string; memorias: string; rejeitadas: string; max: number }): string {
  return `Categorias permitidas:\n${p.categorias}\n\n<memorias>\n${p.memorias}\n</memorias>\n\n<rejeitadas>\n${p.rejeitadas}\n</rejeitadas>\n\nProponha no máximo ${p.max} sugestões.`
}
