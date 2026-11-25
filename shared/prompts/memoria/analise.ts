import { definirChamada, ex } from '../definicao'
import { ALT_CODEX, MEM_MAIN } from '../padroes'
import { REGRAS_SEGURANCA_MEMORIA } from './regras'
import { FORMATO_SUGESTOES_MEMORIA } from './extracao'

/**
 * Memória Pessoal → "Analisar minhas memórias" (manual) e consolidação periódica:
 * merges, padrões (LEARNING/INFERENCE), contradições, obsoletas.
 * Usado em: server/memory/agent.ts (`analyzeMemories`).
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

export const memoriaAnalise = definirChamada<{ categorias: string; memorias: string; rejeitadas: string; max: number }>({
  id: 'memoria.analise',
  modulo: 'memoria',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: MEM_MAIN,
  effort: null,
  alternativas: ALT_CODEX,
  arquivo: 'memoria/analise.ts',
  usadoEm: 'server/memory/agent.ts (analisar e consolidar)',
  sistema: SISTEMA_ANALISE_MEMORIA,
  template: `Categorias permitidas:\n{{categorias}}\n\n<memorias>\n{{memorias}}\n</memorias>\n\n<rejeitadas>\n{{rejeitadas}}\n</rejeitadas>\n\nProponha no máximo {{max}} sugestões.`,
  preparar: (p) => ({
    categorias: String(p.categorias),
    memorias: String(p.memorias),
    rejeitadas: String(p.rejeitadas),
    max: String(p.max)
  }),
  exemplo: { categorias: ex('categorias permitidas'), memorias: `#1 [${ex('categoria')} · FACT] ${ex('memória')}`, rejeitadas: ex('sugestões rejeitadas'), max: 10 }
})
