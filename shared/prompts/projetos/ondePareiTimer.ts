import { definirChamada, ex } from '../definicao'
import { ALT_CODEX, CLAUDE_MODEL } from '../padroes'
import { EX_PROJETO } from '../exemplos'

/**
 * Projetos → "Onde parei" ao parar o timer numa tarefa do projeto (rascunho com IA).
 * Usado em: src/modules/projects/components/SaveContextModal.tsx (via `runText`).
 * `contexto`: `promptResumoProjeto` (./resumoProjeto.ts).
 */
export const projetosOndePareiTimer = definirChamada<{ minutos: number; tarefa: string; contexto: string }>({
  id: 'projetos.ondePareiTimer',
  modulo: 'projetos',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: CLAUDE_MODEL,
  effort: null,
  alternativas: ALT_CODEX,
  arquivo: 'projetos/ondePareiTimer.ts',
  usadoEm: 'src/modules/projects/components/SaveContextModal.tsx',
  template: `Acabei uma sessão de {{minutos}} min em "{{tarefa}}". Escreva um "ONDE PAREI" de 2-3 frases, em primeira pessoa, para eu retomar rápido amanhã (o que estava fazendo, estado atual, detalhe que eu esqueceria). Use os commits e o histórico recentes. Só o texto.\n\n{{contexto}}`,
  preparar: (p) => ({ minutos: String(p.minutos), tarefa: p.tarefa, contexto: p.contexto }),
  exemplo: { minutos: 45, tarefa: ex('tarefa do timer'), contexto: EX_PROJETO }
})
