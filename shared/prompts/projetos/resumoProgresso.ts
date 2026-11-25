/**
 * Projetos → "Resumo de progresso" (semana/mês) a partir de commits, PRs e issues via `gh`.
 * Usado em: src/modules/projects/components/ProgressModal.tsx. Modelo: `claude_model`.
 */
export type PeriodoProgresso = 'week' | 'month' | 'lastMonth'

export function promptResumoProgresso(p: { periodo: PeriodoProgresso | string; repos: string[] }): string {
  const periodDesc =
    p.periodo === 'week' ? 'os últimos 7 dias' : p.periodo === 'month' ? 'o mês atual' : 'o mês passado'
  return `Você é meu assistente de engenharia. Gere um RESUMO DE PROGRESSO em Markdown cobrindo ${periodDesc}, com base nos meus commits, PRs e issues.

Use a ferramenta gh (GitHub CLI) para coletar os dados destes repositórios: ${p.repos.join(', ')}.
Sugestões de comandos: \`gh search commits --author=@me --repo=<repo> --created=<intervalo>\`, \`gh pr list\`, \`gh issue list --repo=<repo> --state=all\`. Descubra o intervalo de datas de ${periodDesc}.

Estruture o resumo em Markdown:
1. **Visão geral** (2-3 linhas: ritmo e destaques).
2. **Por repositório**: principais commits/PRs e issues abertas/fechadas.
3. **O que ficou pendente** e uma sugestão de foco.
Seja factual — use apenas o que o gh retornar. Se um repositório não existir ou o gh falhar, apenas mencione e siga.`
}
