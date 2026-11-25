import { definirChamada, ex } from '../definicao'
import { ALT_CLAUDE, CODEX_MODEL } from '../padroes'

/**
 * Estudos → "Lacunas do roadmap": pré-requisitos/tópicos que faltam no roadmap de um tópico.
 * Usado em: src/modules/estudos/components/GapsModal.tsx.
 * `roadmap`: árvore do roadmap como outline indentado.
 */
export const estudosLacunas = definirChamada<{ topico: string; roadmap: string }>({
  id: 'estudos.lacunas',
  modulo: 'estudos',
  tipo: 'executa',
  motor: 'codex',
  modelo: CODEX_MODEL,
  effort: null,
  alternativas: ALT_CLAUDE,
  arquivo: 'estudos/lacunasRoadmap.ts',
  usadoEm: 'src/modules/estudos/components/GapsModal.tsx',
  template: `Você é um mentor de estudos. Abaixo está o roadmap do tópico "{{topico}}".
Analise a sequência e aponte PRÉ-REQUISITOS ou tópicos importantes que estão FALTANDO (lacunas) para dominar o assunto — coisas que não aparecem no roadmap mas deveriam.

Responda APENAS com JSON válido (sem markdown), um array:
[{ "title": "item faltando", "reason": "por que é importante / onde encaixa" }]
Regras: 3 a 8 itens; títulos curtos e acionáveis; não repita itens que já estão no roadmap.

Roadmap atual:
{{roadmap}}`,
  preparar: (p) => ({ topico: p.topico, roadmap: p.roadmap }),
  exemplo: { topico: ex('tópico'), roadmap: ex('roadmap em tópicos') }
})
