import { definirChamada, ex } from '../definicao'
import { ALT_CODEX, CLAUDE_MODEL } from '../padroes'
import type { ProjetoDelegacao } from './delegacao'

/**
 * Projetos → "📝 Montar prompt": o Claude lê o repositório (só leitura) e ESCREVE o prompt
 * para outro agente executar a tarefa. Nada é executado; o prompt vai para o Prompt Runner.
 * Usado em: server/services/delegation.ts (`draftDelegationPrompt`).
 */
export const projetosMontarDelegacao = definirChamada<{ projeto: ProjetoDelegacao; tarefa: string; instrucoes: string | null; pasta: string | null }>({
  id: 'projetos.montarDelegacao',
  modulo: 'projetos',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: CLAUDE_MODEL,
  effort: null,
  alternativas: ALT_CODEX,
  arquivo: 'projetos/montarPromptDelegacao.ts',
  usadoEm: 'server/services/delegation.ts',
  template: `[rickos:delegacao-prompt] Você vai PREPARAR um prompt para outro agente (Claude Code) executar uma tarefa no projeto "{{projeto}}". NÃO execute a tarefa e NÃO altere nenhum arquivo: só leia o que precisar.

TAREFA:
{{tarefa}}
{{instrucoes}}
Contexto do projeto:
{{descricao}}{{linhaDeChegada}}{{escopo}}{{ondeParei}}{{pasta}}
Como trabalhar:
1. {{primeiroPasso}} Seja objetivo: não precisa ler tudo.
2. Escreva o prompt final para o agente executor, em pt-BR, contendo:
   - **Objetivo**: o que deve ficar pronto (critério de pronto verificável).
   - **Contexto**: arquivos/módulos relevantes que você encontrou (com caminhos), convenções do repo a seguir.
   - **Passos sugeridos**: um plano curto.
   - **Restrições**: o que não mexer; fazer a menor mudança que resolva; rodar typecheck/testes se existirem; commits pequenos; não fazer push.
   - **Dúvidas em aberto**: o que ficou ambíguo (o executor deve perguntar antes de decidir).
   IMPORTANTE: o executor vai rodar numa cópia do repositório (git worktree) em OUTRA pasta. Use SEMPRE caminhos relativos à raiz do repositório (ex.: \`src/app.ts\`), nunca o caminho absoluto desta pasta, e não mande ele trocar de diretório.
3. Responda APENAS com o prompt final em Markdown, sem introdução nem comentários seus.`,
  preparar: (a) => {
    const { projeto: p, tarefa: task, instrucoes: instructions, pasta: cwd } = a
    return {
      projeto: String(p.name),
      tarefa: String(task),
      instrucoes: String(instructions?.trim() ? `\nInstruções do usuário:\n${instructions.trim()}\n` : ''),
      descricao: String(p.description ? `- Descrição: ${p.description}\n` : ''),
      linhaDeChegada: String(p.finishLine ? `- Linha de chegada: ${p.finishLine}\n` : ''),
      escopo: String(p.scope ? `- Escopo atual: ${p.scope}\n` : ''),
      ondeParei: String(p.whereLeftOff ? `- Onde parei: ${p.whereLeftOff}\n` : ''),
      pasta: String(cwd ? `- Você está na pasta do repositório: ${cwd}\n` : '- Não há pasta local do projeto: baseie-se só no contexto acima.\n'),
      primeiroPasso: String(cwd ? 'Dê uma olhada rápida no repositório (CLAUDE.md/README, estrutura, arquivos ligados à tarefa) para entender onde a mudança entra.' : 'Pense no que a tarefa exige.')
    }
  },
  exemplo: { projeto: { name: ex('projeto'), description: ex('descrição'), finishLine: ex('linha de chegada'), scope: null, whereLeftOff: ex('onde parei') }, tarefa: ex('tarefa'), instrucoes: ex('instruções'), pasta: ex('pasta do repositório') }
})
