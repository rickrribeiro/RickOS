import { definirChamada, ex } from '../definicao'
import { ALT_CODEX, CLAUDE_MODEL } from '../padroes'
import { EX_PROJETO } from '../exemplos'

/**
 * Projetos → "Sugerir próxima ação" (3 opções de 25-90 min).
 * Usado em: src/modules/projects/components/NextActionModal.tsx (via `runJson`).
 * `contexto`: `promptResumoProjeto` (./resumoProjeto.ts).
 */
export const projetosProximaAcao = definirChamada<{ acaoConcluida: string | null; contexto: string }>({
  id: 'projetos.proximaAcao',
  modulo: 'projetos',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: CLAUDE_MODEL,
  effort: null,
  alternativas: ALT_CODEX,
  arquivo: 'projetos/proximaAcao.ts',
  usadoEm: 'src/modules/projects/components/NextActionModal.tsx',
  template: `{{acaoConcluida}} Sugira 3 opções de PRÓXIMA AÇÃO para este projeto: cada uma concreta, física, que caiba em uma sessão de 25-90 minutos e aproxime da linha de chegada. Formato: {"actions": ["...", "...", "..."]}\n\n{{contexto}}\n\nResponda APENAS com JSON válido, sem texto antes ou depois, sem cercas de código.`,
  preparar: (p) => ({ acaoConcluida: p.acaoConcluida != null ? `Acabei de concluir a ação: "${p.acaoConcluida}".` : '', contexto: p.contexto }),
  exemplo: { acaoConcluida: ex('ação concluída (só ao concluir)'), contexto: EX_PROJETO }
})
