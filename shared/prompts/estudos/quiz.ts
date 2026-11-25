/**
 * Estudos → "Quiz" de múltipla escolha com base nas anotações do tópico.
 * Usado em: src/modules/estudos/components/QuizModal.tsx. Modelo: `claude_model`.
 * `material`: anotações do tópico (já cortado em 12 mil caracteres).
 */
export function promptQuiz(p: { topico: string; material: string }): string {
  return `Crie um quiz de múltipla escolha para testar meu conhecimento sobre "${p.topico}", com base APENAS no material abaixo.

Responda APENAS com JSON válido (sem markdown, sem texto fora do JSON), um array no formato:
[{ "question": "…", "options": ["a","b","c","d"], "answerIndex": 0 }]

Regras: 5 a 8 questões; 4 alternativas cada; uma única correta (answerIndex 0-based); perguntas claras e sem ambiguidade.

Material:
"""
${p.material}
"""`
}
