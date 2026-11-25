import { definirChamada } from '../definicao'
import { RUNNER_EFFORT, RUNNER_MODEL } from '../padroes'

/**
 * Projetos → Roadmap: delegar vários itens do ROADMAP_RICKOS.md de uma vez. A TAREFA (lista
 * de itens) é montada em código (`tarefaRoadmap`); o template são as REGRAS (paralelo com
 * subagentes, um commit por item). As duas vão para o modal de delegação / Prompt Runner.
 * Usado em: src/modules/projects/lib/roadmap.ts (`buildRoadmapDelegation`).
 */
export interface ItemRoadmapDelegacao {
  node: { num: number | null; text: string; mark: string | null; version: string | null; priority: string | number | null }
  area: string | null
  feature: string | null
  parent: string | null
}

const label = (n: ItemRoadmapDelegacao['node']): string => (n.num != null ? `#${n.num}` : '(sem número)')

/** Lista de itens agrupada por área › feature, e o título da delegação. */
export function tarefaRoadmap(rows: ItemRoadmapDelegacao[]): { task: string; title: string } {
  const nums = rows.map((r) => label(r.node)).join(', ')
  const lines: string[] = [`Itens do roadmap (ROADMAP_RICKOS.md) a implementar — ${nums}:`]
  let group = ''
  for (const r of rows) {
    const g = [r.area, r.feature].filter(Boolean).join(' › ')
    if (g !== group) {
      lines.push('', g ? `**${g}**` : '**(sem área)**')
      group = g
    }
    const meta = [r.node.mark === '~' ? 'em andamento' : '', r.node.version ? `@${r.node.version}` : '', r.node.priority ? `!${r.node.priority}` : '']
      .filter(Boolean)
      .join(', ')
    lines.push(`- ${label(r.node)} ${r.node.text}${r.parent ? ` (parte de: ${r.parent})` : ''}${meta ? ` [${meta}]` : ''}`)
  }
  const title = rows.length === 1 ? `${label(rows[0].node)} ${rows[0].node.text}` : `Roadmap ${nums}`
  return { task: lines.join('\n'), title }
}

export const projetosDelegarRoadmap = definirChamada<{ quantidade: number }>({
  id: 'projetos.delegarRoadmap',
  modulo: 'projetos',
  tipo: 'texto',
  motor: 'claude-code',
  modelo: RUNNER_MODEL,
  effort: RUNNER_EFFORT,
  arquivo: 'projetos/delegarRoadmap.ts',
  usadoEm: 'src/modules/projects/lib/roadmap.ts → Prompt Runner',
  template: `Regras para executar estes {{quantidade}} itens (mantenha-as no prompt final):
- Trabalhe em PARALELO: use subagentes (ferramenta Agent) para os itens independentes; um item que depende de outro vai depois dele.
- UM COMMIT POR ITEM, nunca misture itens no mesmo commit. Os subagentes não commitam: você faz os commits um a um, adicionando só os arquivos daquele item (\`git add <arquivos>\`, nunca \`git add -A\`).
- Mensagem de commit no padrão do repositório, com o número do item numa linha do corpo: \`Roadmap-Item: 12\`.
- NÃO altere o ROADMAP_RICKOS.md: os itens já estão como em andamento e o usuário marca como concluído depois de validar.
- Item que não puder ser concluído: não commite pela metade; deixe-o como está e explique no fim.
- Não faça push. No fim, liste item → hash do commit.`,
  preparar: (p) => ({ quantidade: String(p.quantidade) }),
  exemplo: { quantidade: 1 }
})
