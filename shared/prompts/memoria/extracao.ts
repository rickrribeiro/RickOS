import { REGRAS_SEGURANCA_MEMORIA } from './regras'

/**
 * Memória Pessoal → Memory Agent extraindo sugestões de um texto (texto livre, migração,
 * resposta de entrevista, eventos de outros módulos).
 * Usado em: server/memory/agent.ts (`extractFromText`). Modelo: `memory_ai_model(_fast)`.
 */

/** Formato de resposta das sugestões (também usado pela análise/consolidação). */
export const FORMATO_SUGESTOES_MEMORIA = `Formato de resposta:
{"suggestions":[{"op":"CREATE|UPDATE|MERGE|ARCHIVE|RESOLVE|ASK","title":"curto","content":"uma única ideia, em 1ª pessoa","category":"slug","type":"FACT|PREFERENCE|GOAL|CONSTRAINT|HABIT|INSTRUCTION|EXPERIENCE|LEARNING|INFERENCE","tags":["..."],"importance":1-5,"stability":"permanent|stable|evolving|transient","sensitivity":"NORMAL|PRIVATE|RESTRICTED","explicit":true|false,"confidence":0-1,"rationale":"por que vale lembrar","benefit":"onde ajuda no futuro","evidence":"trecho LITERAL do texto","targetIds":[ids de <memorias> afetadas],"occurredAt":"YYYY-MM-DD|null","validUntil":"YYYY-MM-DD|null","question":"só para ASK"}]}
Se nada no texto valer a pena, responda {"suggestions":[]} — isso é um resultado CORRETO e frequente.`

export const REGRAS_EXTRACAO_MEMORIA = `Como decidir:
- Memória atômica = UMA ideia. "Gosto de café e de anime" vira duas.
- Só conhecimento DURADOURO e útil no futuro sobre a pessoa. Ignore fatos triviais, tarefas, compromissos pontuais, estados passageiros ("hoje estou cansado") e informação operacional.
- Já existe em <memorias>? Não crie de novo. Se o texto ATUALIZA uma memória, use UPDATE com targetIds. Se CONTRADIZ, use RESOLVE com as duas (ou mais) memórias e proponha a resolução no content. Diferencie contradição real de preferência que depende do contexto ou de mudança natural no tempo.
- explicit=true só quando o usuário DISSE aquilo; dedução sua = explicit=false e type INFERENCE.
- Saúde, finanças, relacionamentos, dados de terceiros: sensitivity PRIVATE ou RESTRICTED. Na dúvida, não sugira.
- Use ASK quando faltar algo importante ou houver ambiguidade (máx. 2 perguntas).
- Não repita o que já foi rejeitado (lista em <rejeitadas>), salvo evidência nova clara.
- Use apenas os slugs de categoria listados.`

export const SISTEMA_EXTRACAO_MEMORIA = `Você é o Memory Agent do rickOS: identifica conhecimentos DURADOUROS sobre o usuário para a memória pessoal dele.\n${REGRAS_SEGURANCA_MEMORIA}\n${REGRAS_EXTRACAO_MEMORIA}\n${FORMATO_SUGESTOES_MEMORIA}`

export function promptExtracaoMemoria(p: {
  /** Contexto extra já sanitizado (ex.: a pergunta respondida numa entrevista); null = sem. */
  contexto: string | null
  categorias: string
  /** Memórias parecidas, uma por linha (`#id linha`); vazio = nenhuma. */
  memorias: string
  rejeitadas: string
  origem: string
  texto: string
  max: number
}): string {
  return `${p.contexto != null ? `Contexto: ${p.contexto}\n\n` : ''}Categorias permitidas:\n${p.categorias}

<memorias>
${p.memorias || '(nenhuma parecida)'}
</memorias>

<rejeitadas>
${p.rejeitadas}
</rejeitadas>

<texto origem="${p.origem}">
${p.texto}
</texto>

Proponha no máximo ${p.max} sugestões.`
}
