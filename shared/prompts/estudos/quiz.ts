import { definirChamada, ex } from '../definicao'
import { ALT_CLAUDE, CODEX_MODEL } from '../padroes'

/**
 * Estudos → "Quiz" de múltipla escolha com base nas anotações do tópico.
 * Usado em: src/modules/estudos/components/QuizModal.tsx.
 * `material`: anotações do tópico (já cortado em 12 mil caracteres).
 */
export const estudosQuiz = definirChamada<{ topico: string; material: string }>({
  id: 'estudos.quiz',
  modulo: 'estudos',
  tipo: 'executa',
  motor: 'codex',
  modelo: CODEX_MODEL,
  effort: null,
  alternativas: ALT_CLAUDE,
  arquivo: 'estudos/quiz.ts',
  usadoEm: 'src/modules/estudos/components/QuizModal.tsx',
  template: `Crie um quiz de múltipla escolha para testar se eu APRENDI o conteúdo de "{{topico}}", com base APENAS no material abaixo (minhas anotações).

Responda APENAS com JSON válido (sem markdown, sem texto fora do JSON), um array no formato:
[{ "question": "…", "options": ["a","b","c","d"], "answerIndex": 0 }]

O que perguntar:
- Só sobre o CONTEÚDO estudado: conceitos, fatos, relações, causas e consequências, aplicação num caso, diferença entre ideias parecidas, vocabulário/estruturas (se for idioma).
- Prefira perguntas que exijam entender ou aplicar, não só reconhecer uma frase copiada da nota.
- As linhas "## …" são só os títulos das seções onde as anotações estão guardadas: use-as como contexto, NUNCA como assunto da pergunta.

Nunca pergunte:
- sobre a estrutura do material (título, nome ou ordem de seção, quantos itens há, formatação, o que "o texto/a nota/o material" diz ou menciona);
- sobre metadados (autor, data, fonte, nome do tópico);
- algo que não esteja no material ou que dependa de decorar a redação exata.

Regras: de 3 a 8 questões, conforme o material render (com pouco conteúdo, menos questões; nunca encha com perguntas fracas); 4 alternativas plausíveis do mesmo tipo, sem "todas/nenhuma das anteriores"; uma única correta (answerIndex 0-based, varie a posição); enunciado claro, autossuficiente e sem ambiguidade.

Material:
"""
{{material}}
"""`,
  preparar: (p) => ({ topico: p.topico, material: p.material }),
  exemplo: { topico: ex('tópico'), material: ex('anotações do tópico') }
})
