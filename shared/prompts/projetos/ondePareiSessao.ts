import { ALT_CODEX } from '../padroes'
import { definirChamada, ex } from '../definicao'

/**
 * Projetos → hook do Claude Code (fim de sessão no terminal): resume a sessão num
 * "Onde parei" + próximo passo do projeto.
 * Usado em: server/services/claudeHook.ts (`summarize`).
 */
export const projetosOndePareiSessao = definirChamada<{ projeto: string; branch: string; pedidos: string; respostas: string; commits: string; naoCommitados: string }>({
  id: 'projetos.ondePareiSessao',
  modulo: 'projetos',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: { setting: 'projects_hook_model', padrao: 'haiku' },
  effort: null,
  alternativas: ALT_CODEX,
  arquivo: 'projetos/ondePareiSessao.ts',
  usadoEm: 'server/services/claudeHook.ts',
  template: `[rickos:onde-parei] Resuma esta sessão de programação com o Claude Code no projeto "{{projeto}}" para eu retomar depois.
Responda APENAS com JSON: {"whereLeftOff": "2-4 frases em primeira pessoa: o que foi feito, o estado atual, o detalhe que eu esqueceria", "nextStep": "a próxima ação concreta, curta (ou null)"}

Branch: {{branch}}
Pedidos que fiz (em ordem):
{{pedidos}}

Últimas respostas do Claude:
{{respostas}}

Commits durante a sessão:
{{commits}}
Arquivos não commitados: {{naoCommitados}}`,
  preparar: (p) => ({ projeto: p.projeto, branch: p.branch, pedidos: p.pedidos, respostas: p.respostas, commits: p.commits || '(nenhum)', naoCommitados: p.naoCommitados || '(nenhum)' }),
  exemplo: { projeto: ex('projeto'), branch: ex('branch'), pedidos: `1. ${ex('pedido')}`, respostas: `- ${ex('resposta do Claude')}`, commits: ex('commits'), naoCommitados: ex('arquivos') }
})
