import { definirChamada, ex } from '../definicao'
import { ALT_CODEX, CLAUDE_MODEL } from '../padroes'

/**
 * Assistente → executa o texto da caixa do Assistente (digitado ou vindo de uma ação rápida).
 * Com projeto selecionado, o servidor põe o "CONTEXTO DO PROJETO" (projetos/contextoProjeto.ts) antes.
 * Usado em: src/modules/jarvis/pages/JarvisPage.tsx → ai:start.
 */
export const assistenteLivre = definirChamada<{ pedido: string }>({
  id: 'assistente.livre',
  modulo: 'assistente',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: CLAUDE_MODEL,
  effort: null,
  alternativas: ALT_CODEX,
  arquivo: 'assistente/livre.ts',
  usadoEm: 'src/modules/jarvis/pages/JarvisPage.tsx',
  template: '{{pedido}}',
  preparar: (p) => ({ pedido: p.pedido }),
  exemplo: { pedido: ex('seu pedido') }
})
