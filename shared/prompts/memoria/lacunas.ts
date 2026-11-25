import { definirChamada, ex } from '../definicao'
import { MEM_FAST } from '../padroes'
import { REGRAS_SEGURANCA_MEMORIA } from './regras'

/**
 * Memória Pessoal → "Lacunas": o que vale perguntar ao usuário para melhorar as funcionalidades.
 * Usado em: server/memory/cognitive.ts (`detectGaps`).
 */
export const memoriaLacunas = definirChamada<{
  /** Cobertura por categoria, uma por linha. */
  cobertura: string
  /** Funcionalidades que consomem memória, uma por linha. */
  funcionalidades: string
  memorias: string
  /** Uma por linha; vazio = nenhuma. */
  abertas: string
  dispensadas: string
  /** Máximo de sugestões (vai no system prompt). */
  max: number
}>({
  id: 'memoria.lacunas',
  modulo: 'memoria',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: MEM_FAST,
  effort: null,
  arquivo: 'memoria/lacunas.ts',
  usadoEm: 'server/memory/cognitive.ts (detectGaps)',
  sistema: `Você identifica LACUNAS relevantes no conhecimento pessoal do usuário.
${REGRAS_SEGURANCA_MEMORIA}
- Só lacunas que melhorariam de verdade alguma funcionalidade listada ou objetivos conhecidos. Nada aleatório, nada para "encher" o perfil.
- Não pergunte sobre saúde, finanças detalhadas, sexualidade, religião, política ou terceiros, a menos que já exista contexto do usuário nisso — e mesmo assim marque sensitivity PRIVATE.
- Perguntas curtas, abertas, naturais.
- Máximo {{max}} lacunas. Zero é válido.
Formato: {"gaps":[{"topic":"curto","category":"slug","why":"por que ajudaria","beneficiaries":["funcionalidade"],"priority":1-3,"sensitivity":"NORMAL|PRIVATE","question":"pergunta"}]}`,
  template: `Cobertura atual por categoria:\n{{cobertura}}

Funcionalidades que usariam memória:\n{{funcionalidades}}

<memorias>\n{{memorias}}\n</memorias>

Lacunas já abertas (não repita):\n{{abertas}}
Lacunas dispensadas/respondidas (não repita):\n{{dispensadas}}`,
  preparar: (p) => ({
    cobertura: String(p.cobertura),
    funcionalidades: String(p.funcionalidades),
    memorias: String(p.memorias),
    abertas: String(p.abertas || '(nenhuma)'),
    dispensadas: String(p.dispensadas || '(nenhuma)'),
    max: String(p.max)
  }),
  exemplo: { cobertura: `- ${ex('categoria')}: ${ex('n')} ativas`, funcionalidades: `- ${ex('funcionalidade')}`, memorias: `- [${ex('categoria')}] ${ex('memória')}`, abertas: '', dispensadas: '', max: 5 }
})
