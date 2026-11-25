import { REGRAS_SEGURANCA_MEMORIA } from './regras'

/**
 * Memória Pessoal → entrevista "Me conheça melhor": uma pergunta por vez + extração da última resposta.
 * Usado em: server/memory/cognitive.ts (`interviewStep`). Modelo: `memory_ai_model_fast`.
 */
export const sistemaEntrevistaMemoria = (max: number): string => `Você conduz uma conversa leve e natural ("Me conheça melhor") para entender melhor o usuário.
${REGRAS_SEGURANCA_MEMORIA}
- Uma pergunta por vez, curta, aberta, contextualizada no que ele já contou. Pode ser complementar à resposta anterior.
- Nunca repita perguntas já feitas nem pergunte o que <memorias> já responde.
- Se a resposta for ambígua, peça esclarecimento.
- Não force temas sensíveis (saúde, finanças, relacionamentos, religião, política). Se o usuário pular, mude de assunto.
- Extraia da ÚLTIMA resposta apenas conhecimentos duradouros (máx. ${max}), com evidence = trecho literal da resposta. explicit=true só para o que ele disse.
- Se o tema se esgotou, next_question = null.
Formato: {"suggestions":[{"op":"CREATE|UPDATE","title":"","content":"","category":"slug","type":"FACT|PREFERENCE|GOAL|CONSTRAINT|HABIT|INSTRUCTION|EXPERIENCE|LEARNING|INFERENCE","tags":[],"importance":1-5,"stability":"permanent|stable|evolving|transient","sensitivity":"NORMAL|PRIVATE|RESTRICTED","explicit":true,"confidence":0-1,"rationale":"","benefit":"","evidence":"","targetIds":[]}],"next_question":"…"|null,"why":"por que essa pergunta"}`

export function promptEntrevistaMemoria(p: {
  tema: string
  /** " (categoria x)" ou ''. */
  categoria: string
  categoriasPermitidas: string
  /** Uma por linha; vazio = nada ainda. */
  memorias: string
  perguntasFeitas: string
  /** Últimos turnos `P: …\nR: …`. */
  respostas: string
  /** false = pulou a última pergunta (ou é a primeira). */
  respondeu: boolean
  temTurnos: boolean
}): string {
  return `Tema: ${p.tema}${p.categoria}
Categorias permitidas: ${p.categoriasPermitidas}

<memorias>\n${p.memorias || '(nada ainda)'}\n</memorias>

Perguntas já feitas (não repita):\n${p.perguntasFeitas || '(nenhuma)'}

<respostas>\n${p.respostas}\n</respostas>
${!p.respondeu ? (p.temTurnos ? 'O usuário pulou a última pergunta. Faça outra, de outro ângulo.' : 'Faça a primeira pergunta.') : 'Analise a última resposta e faça a próxima pergunta.'}`
}
