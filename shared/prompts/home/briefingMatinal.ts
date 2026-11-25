import { definirChamada, ex } from '../definicao'
import { CLAUDE_MODEL } from '../padroes'

/**
 * Home → "Briefing matinal": resumo, 3 prioridades e agenda do dia.
 * Usado em: src/modules/home/components/DailyStandup.tsx.
 * `contexto`: tarefas atrasadas/de hoje, flashcards, eventos, horas de ontem, projetos e foco do dia
 * (montado no componente).
 */
export const homeBriefing = definirChamada<{ contexto: string }>({
  id: 'home.briefing',
  modulo: 'home',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: CLAUDE_MODEL,
  effort: null,
  arquivo: 'home/briefingMatinal.ts',
  usadoEm: 'src/modules/home/components/DailyStandup.tsx',
  template: `Você é meu chefe de gabinete. Com base no contexto do meu dia abaixo, escreva um BRIEFING MATINAL curto e acionável em Markdown:
1. Um resumo executivo de 2-3 linhas (o que exige atenção hoje).
2. As 3 prioridades do dia (o que realmente importa) — use as próximas ações dos projetos EM FOCO e o "foco de hoje" se houver.
3. Uma agenda sugerida em blocos de tempo (time-boxed) para hoje, encaixando tarefas, revisões de flashcards e eventos.
4. Projetos esquecidos ou com alerta que pedem uma decisão rápida (1 linha cada, só se houver).
Seja direto e realista. Não invente compromissos que não estão no contexto.

Contexto:
{{contexto}}`,
  preparar: (p) => ({ contexto: p.contexto }),
  exemplo: { contexto: ex('tarefas, flashcards, eventos, horas de ontem, projetos e foco do dia') }
})
