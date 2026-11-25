import type { ProjetoDelegacao } from './delegacao'

/**
 * Projetos → "📝 Montar prompt": o Claude lê o repositório (só leitura) e ESCREVE o prompt
 * para outro agente executar a tarefa. Nada é executado; o prompt vai para o Prompt Runner.
 * Usado em: server/services/delegation.ts (`draftDelegationPrompt`). Modelo: `claude_model`.
 */
export function promptMontarDelegacao(a: {
  projeto: ProjetoDelegacao
  tarefa: string
  instrucoes: string | null
  /** Pasta local do repositório, se existir. */
  pasta: string | null
}): string {
  const { projeto: p, tarefa: task, instrucoes: instructions, pasta: cwd } = a
  return `[rickos:delegacao-prompt] Você vai PREPARAR um prompt para outro agente (Claude Code) executar uma tarefa no projeto "${p.name}". NÃO execute a tarefa e NÃO altere nenhum arquivo: só leia o que precisar.

TAREFA:
${task}
${instructions?.trim() ? `\nInstruções do usuário:\n${instructions.trim()}\n` : ''}
Contexto do projeto:
${p.description ? `- Descrição: ${p.description}\n` : ''}${p.finishLine ? `- Linha de chegada: ${p.finishLine}\n` : ''}${p.scope ? `- Escopo atual: ${p.scope}\n` : ''}${p.whereLeftOff ? `- Onde parei: ${p.whereLeftOff}\n` : ''}${cwd ? `- Você está na pasta do repositório: ${cwd}\n` : '- Não há pasta local do projeto: baseie-se só no contexto acima.\n'}
Como trabalhar:
1. ${cwd ? 'Dê uma olhada rápida no repositório (CLAUDE.md/README, estrutura, arquivos ligados à tarefa) para entender onde a mudança entra.' : 'Pense no que a tarefa exige.'} Seja objetivo: não precisa ler tudo.
2. Escreva o prompt final para o agente executor, em pt-BR, contendo:
   - **Objetivo**: o que deve ficar pronto (critério de pronto verificável).
   - **Contexto**: arquivos/módulos relevantes que você encontrou (com caminhos), convenções do repo a seguir.
   - **Passos sugeridos**: um plano curto.
   - **Restrições**: o que não mexer; fazer a menor mudança que resolva; rodar typecheck/testes se existirem; commits pequenos; não fazer push.
   - **Dúvidas em aberto**: o que ficou ambíguo (o executor deve perguntar antes de decidir).
   IMPORTANTE: o executor vai rodar numa cópia do repositório (git worktree) em OUTRA pasta. Use SEMPRE caminhos relativos à raiz do repositório (ex.: \`src/app.ts\`), nunca o caminho absoluto desta pasta, e não mande ele trocar de diretório.
3. Responda APENAS com o prompt final em Markdown, sem introdução nem comentários seus.`
}
