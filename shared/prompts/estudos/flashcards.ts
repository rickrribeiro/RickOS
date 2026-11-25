/**
 * Estudos → "Gerar flashcards" de uma anotação (JSON [{front, back}]).
 * Usado em: src/modules/estudos/components/FlashcardPanel.tsx. Modelo: `claude_model`.
 */
export function promptFlashcards(p: { anotacao: string }): string {
  return `A partir da anotação em Markdown abaixo, crie flashcards de estudo (pergunta/resposta) concisos e úteis para memorização.

Responda APENAS com um JSON válido (sem markdown, sem texto fora do JSON), um array no formato:
[{ "front": "pergunta", "back": "resposta" }]

Regras:
- COBERTURA COMPLETA guiada pelo CONTEÚDO (não pelo tamanho do texto): gere UM flashcard para CADA termo, conceito, definição, comando, fato ou passo distinto que apareça na anotação. Percorra a nota inteira, seção por seção.
- Notas curtas/resumidas de termos costumam ter MUITOS itens em pouco texto — gere um cartão por termo mesmo assim. Notas longas e explicativas podem ter menos conceitos — não invente cartões redundantes só para encher.
- Sem mínimo nem máximo artificial: a quantidade certa é "quantos conceitos distintos existem". Não resuma nem selecione só alguns; não repita.
- Frente = pergunta/estímulo claro; verso = resposta objetiva.

Anotação:
"""
${p.anotacao}
"""`
}
