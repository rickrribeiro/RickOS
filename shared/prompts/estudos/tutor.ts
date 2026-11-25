import { definirChamada, ex } from '../definicao'
import { ALT_CLAUDE, CODEX_MODEL } from '../padroes'

/**
 * Estudos → botões do "Tutor" no editor de anotações (explicar, resumir, exercícios…).
 * O texto de cada botão entra em `{{instrucao}}`.
 * Usado em: src/modules/estudos/components/NoteEditor.tsx.
 */
export type AcaoTutor = 'simple' | 'summary' | 'exercise' | 'gaps' | 'socratic' | 'recall'

export const INSTRUCOES_TUTOR: Record<AcaoTutor, string> = {
  simple: 'Explique o conteúdo abaixo de forma simples, como se eu tivesse 12 anos, com analogias.',
  summary: 'Resuma o conteúdo abaixo em no máximo 5 bullets objetivos.',
  exercise: 'Crie 2 a 3 exercícios práticos (com a resposta ao final) sobre o conteúdo abaixo.',
  gaps: 'Aponte lacunas e pontos que eu deveria estudar a seguir a partir do conteúdo abaixo.',
  socratic: 'Aja como um tutor socrático. NÃO dê respostas nem explicações: apenas faça de 4 a 6 perguntas graduais (da mais básica à mais profunda) que me levem a raciocinar e descobrir sozinho o conteúdo abaixo. Numere as perguntas.',
  recall: 'Gere de 4 a 6 prompts de RECALL ATIVO a partir do conteúdo abaixo — perguntas abertas do tipo "explique sem olhar", "descreva com suas palavras", "reconstrua o raciocínio". Não inclua as respostas. Foque nos conceitos mais importantes para memória de longo prazo.'
}

export const estudosTutor = definirChamada<{ acao: AcaoTutor; conteudo: string }>({
  id: 'estudos.tutor',
  modulo: 'estudos',
  tipo: 'executa',
  motor: 'codex',
  modelo: CODEX_MODEL,
  effort: null,
  alternativas: ALT_CLAUDE,
  arquivo: 'estudos/tutor.ts',
  usadoEm: 'src/modules/estudos/components/NoteEditor.tsx',
  template: '{{instrucao}}\n\nConteúdo (Markdown):\n"""\n{{conteudo}}\n"""',
  preparar: (p) => ({ instrucao: INSTRUCOES_TUTOR[p.acao] ?? INSTRUCOES_TUTOR.simple, conteudo: p.conteudo }),
  exemplo: { acao: 'simple', conteudo: ex('anotação') }
})
