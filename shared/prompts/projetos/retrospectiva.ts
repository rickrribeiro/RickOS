import { definirChamada, ex } from '../definicao'
import { CLAUDE_MODEL } from '../padroes'
import { EX_PROJETO } from '../exemplos'

/**
 * Projetos → ritual de encerramento: RETROSPECTIVA do projeto concluído.
 * Usado em: src/modules/projects/components/ClosingRitualModal.tsx (via `runText`).
 * `contexto`: `promptResumoProjeto` (./resumoProjeto.ts).
 */
export const projetosRetrospectiva = definirChamada<{ foiBem: string; aprendi: string; fariaDiferente: string; contexto: string }>({
  id: 'projetos.retrospectiva',
  modulo: 'projetos',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: CLAUDE_MODEL,
  effort: null,
  arquivo: 'projetos/retrospectiva.ts',
  usadoEm: 'src/modules/projects/components/ClosingRitualModal.tsx',
  template: `Estou concluindo este projeto. Escreva uma RETROSPECTIVA curta em Markdown com: "O que foi entregue", "O que funcionou", "O que aprendi", "O que faria diferente" e "Números" (horas, duração). Seja específico usando o contexto, sem inventar fatos.\n\nMinhas notas:\n- Foi bem: {{foiBem}}\n- Aprendi: {{aprendi}}\n- Faria diferente: {{fariaDiferente}}\n\nContexto:\n{{contexto}}`,
  preparar: (p) => ({ foiBem: p.foiBem || '(sem notas)', aprendi: p.aprendi || '(sem notas)', fariaDiferente: p.fariaDiferente || '(sem notas)', contexto: p.contexto }),
  exemplo: { foiBem: ex('foi bem'), aprendi: ex('aprendi'), fariaDiferente: ex('faria diferente'), contexto: EX_PROJETO }
})
