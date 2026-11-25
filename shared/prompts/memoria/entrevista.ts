import { definirChamada, ex } from '../definicao'
import { MEM_FAST } from '../padroes'
import { REGRAS_SEGURANCA_MEMORIA } from './regras'

/**
 * Memória Pessoal → entrevista "Me conheça melhor": uma pergunta por vez + extração da última resposta.
 * Usado em: server/memory/cognitive.ts (`interviewStep`).
 */
export const memoriaEntrevista = definirChamada<{
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
  /** Máximo de sugestões (vai no system prompt). */
  max: number
}>({
  id: 'memoria.entrevista',
  modulo: 'memoria',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: MEM_FAST,
  effort: null,
  arquivo: 'memoria/entrevista.ts',
  usadoEm: 'server/memory/cognitive.ts (interviewStep)',
  sistema: `Você conduz uma conversa leve e natural ("Me conheça melhor") para entender melhor o usuário.
${REGRAS_SEGURANCA_MEMORIA}
- Uma pergunta por vez, curta, aberta, contextualizada no que ele já contou. Pode ser complementar à resposta anterior.
- Nunca repita perguntas já feitas nem pergunte o que <memorias> já responde.
- Se a resposta for ambígua, peça esclarecimento.
- Não force temas sensíveis (saúde, finanças, relacionamentos, religião, política). Se o usuário pular, mude de assunto.
- Extraia da ÚLTIMA resposta apenas conhecimentos duradouros (máx. {{max}}), com evidence = trecho literal da resposta. explicit=true só para o que ele disse.
- Se o tema se esgotou, next_question = null.
Formato: {"suggestions":[{"op":"CREATE|UPDATE","title":"","content":"","category":"slug","type":"FACT|PREFERENCE|GOAL|CONSTRAINT|HABIT|INSTRUCTION|EXPERIENCE|LEARNING|INFERENCE","tags":[],"importance":1-5,"stability":"permanent|stable|evolving|transient","sensitivity":"NORMAL|PRIVATE|RESTRICTED","explicit":true,"confidence":0-1,"rationale":"","benefit":"","evidence":"","targetIds":[]}],"next_question":"…"|null,"why":"por que essa pergunta"}`,
  template: `Tema: {{tema}}{{categoria}}
Categorias permitidas: {{categoriasPermitidas}}

<memorias>\n{{memorias}}\n</memorias>

Perguntas já feitas (não repita):\n{{perguntasFeitas}}

<respostas>\n{{respostas}}\n</respostas>
{{instrucao}}`,
  preparar: (p) => ({
    tema: String(p.tema),
    categoria: String(p.categoria),
    categoriasPermitidas: String(p.categoriasPermitidas),
    memorias: String(p.memorias || '(nada ainda)'),
    perguntasFeitas: String(p.perguntasFeitas || '(nenhuma)'),
    respostas: String(p.respostas),
    instrucao: String(!p.respondeu ? (p.temTurnos ? 'O usuário pulou a última pergunta. Faça outra, de outro ângulo.' : 'Faça a primeira pergunta.') : 'Analise a última resposta e faça a próxima pergunta.'),
    max: String(p.max)
  }),
  exemplo: { tema: ex('tema'), categoria: '', categoriasPermitidas: ex('categorias'), memorias: '', perguntasFeitas: '', respostas: `P: ${ex('pergunta')}\nR: ${ex('resposta')}`, respondeu: true, temTurnos: true, max: 5 }
})
