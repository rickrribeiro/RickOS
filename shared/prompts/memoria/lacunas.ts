import { REGRAS_SEGURANCA_MEMORIA } from './regras'

/**
 * Memória Pessoal → "Lacunas": o que vale perguntar ao usuário para melhorar as funcionalidades.
 * Usado em: server/memory/cognitive.ts (`detectGaps`). Modelo: `memory_ai_model_fast`.
 */
export const sistemaLacunasMemoria = (max: number): string => `Você identifica LACUNAS relevantes no conhecimento pessoal do usuário.
${REGRAS_SEGURANCA_MEMORIA}
- Só lacunas que melhorariam de verdade alguma funcionalidade listada ou objetivos conhecidos. Nada aleatório, nada para "encher" o perfil.
- Não pergunte sobre saúde, finanças detalhadas, sexualidade, religião, política ou terceiros, a menos que já exista contexto do usuário nisso — e mesmo assim marque sensitivity PRIVATE.
- Perguntas curtas, abertas, naturais.
- Máximo ${max} lacunas. Zero é válido.
Formato: {"gaps":[{"topic":"curto","category":"slug","why":"por que ajudaria","beneficiaries":["funcionalidade"],"priority":1-3,"sensitivity":"NORMAL|PRIVATE","question":"pergunta"}]}`

export function promptLacunasMemoria(p: {
  /** Cobertura por categoria, uma por linha. */
  cobertura: string
  /** Funcionalidades que consomem memória, uma por linha. */
  funcionalidades: string
  memorias: string
  /** Uma por linha; vazio = nenhuma. */
  abertas: string
  dispensadas: string
}): string {
  return `Cobertura atual por categoria:\n${p.cobertura}

Funcionalidades que usariam memória:\n${p.funcionalidades}

<memorias>\n${p.memorias}\n</memorias>

Lacunas já abertas (não repita):\n${p.abertas || '(nenhuma)'}
Lacunas dispensadas/respondidas (não repita):\n${p.dispensadas || '(nenhuma)'}`
}
