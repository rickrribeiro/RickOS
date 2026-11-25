/**
 * Projetos → hook do Claude Code (fim de sessão no terminal): resume a sessão num
 * "Onde parei" + próximo passo do projeto.
 * Usado em: server/services/claudeHook.ts (`summarize`). Modelo: `projects_hook_model` (padrão haiku).
 */
export function promptOndePareiSessao(p: {
  projeto: string
  branch: string
  /** Pedidos do usuário numerados, um por linha. */
  pedidos: string
  /** Últimas respostas do Claude, uma por linha (`- …`). */
  respostas: string
  commits: string
  /** Arquivos não commitados, separados por vírgula (vazio = nenhum). */
  naoCommitados: string
}): string {
  return `[rickos:onde-parei] Resuma esta sessão de programação com o Claude Code no projeto "${p.projeto}" para eu retomar depois.
Responda APENAS com JSON: {"whereLeftOff": "2-4 frases em primeira pessoa: o que foi feito, o estado atual, o detalhe que eu esqueceria", "nextStep": "a próxima ação concreta, curta (ou null)"}

Branch: ${p.branch}
Pedidos que fiz (em ordem):
${p.pedidos}

Últimas respostas do Claude:
${p.respostas}

Commits durante a sessão:
${p.commits || '(nenhum)'}
Arquivos não commitados: ${p.naoCommitados || '(nenhum)'}`
}
