import { definirChamada, ex } from '../definicao'
import { CODEX_MODEL } from '../padroes'

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
  arquivo: 'estudos/quiz.ts',
  usadoEm: 'src/modules/estudos/components/QuizModal.tsx',
  template: `Crie um quiz de múltipla escolha para testar meu conhecimento sobre "{{topico}}", com base APENAS no material abaixo.

Responda APENAS com JSON válido (sem markdown, sem texto fora do JSON), um array no formato:
[{ "question": "…", "options": ["a","b","c","d"], "answerIndex": 0 }]

Regras: 5 a 8 questões; 4 alternativas cada; uma única correta (answerIndex 0-based); perguntas claras e sem ambiguidade.

Material:
"""
{{material}}
"""`,
  preparar: (p) => ({ topico: p.topico, material: p.material }),
  exemplo: { topico: ex('tópico'), material: ex('anotações do tópico') }
})
