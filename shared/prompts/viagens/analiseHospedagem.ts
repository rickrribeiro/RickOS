import { definirChamada, ex } from '../definicao'
import { ALT_CODEX, CLAUDE_MODEL } from '../padroes'

/**
 * Viagens → "Analisar com IA" os resultados do buscador de hospedagem: as 3 melhores opções.
 * Recebe Memória Pessoal (`stays.analysis`) no início do prompt.
 * Usado em: src/modules/travel-stays/pages/StayFinderPage.tsx.
 */
export const viagensHospedagem = definirChamada<{ memoria: string; observacoes: string; cidade: string; resultados: string }>({
  id: 'viagens.hospedagem',
  modulo: 'viagens',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: CLAUDE_MODEL,
  effort: null,
  alternativas: ALT_CODEX,
  arquivo: 'viagens/analiseHospedagem.ts',
  usadoEm: 'src/modules/travel-stays/pages/StayFinderPage.tsx',
  template: `{{memoria}}{{observacoes}}Resultados de hospedagem em {{cidade}}:\n{{resultados}}\n\nAnalise e explique em português quais são as 3 MELHORES opções para mim e por quê. Seja direto.`,
  preparar: (p) => {
    const notes = p.observacoes.trim() ? `Observações para esta busca:\n${p.observacoes.trim()}\n\n` : ''
    return {
      memoria: String(p.memoria ? `${p.memoria}\n\n` : ''),
      observacoes: String(notes),
      cidade: String(p.cidade),
      resultados: String(p.resultados)
    }
  },
  exemplo: { memoria: ex('bloco de Memória Pessoal'), observacoes: ex('observações'), cidade: ex('cidade'), resultados: `1. ${ex('hospedagem')}` }
})
