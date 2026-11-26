import { definirChamada, ex } from '../definicao'
import { ALT_CODEX, CLAUDE_MODEL } from '../padroes'

/**
 * Finanças → Regras → "Sugestões da IA": lê as descrições das transações (agrupadas) e sugere
 * regras palavra-chave → categoria. O servidor revalida tudo (categoria existe e é do tipo certo,
 * palavra aparece nas descrições, nada repetido/recusado) e o usuário aprova uma a uma.
 * Usado em: server/services/financeRuleSuggestions.ts.
 */
export const financasSugerirRegras = definirChamada<{
  periodo: string
  categorias: string
  transacoes: string
  regrasExistentes: string
  recusadas: string
}>({
  id: 'financas.sugerirRegras',
  modulo: 'financas',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: CLAUDE_MODEL,
  effort: null,
  alternativas: ALT_CODEX,
  arquivo: 'financas/sugerirRegras.ts',
  usadoEm: 'server/services/financeRuleSuggestions.ts',
  template: `Você ajuda a categorizar automaticamente transações bancárias. Uma REGRA é uma lista de palavras-chave + uma categoria: se a descrição da transação (em minúsculas, sem acentos) CONTÉM qualquer uma das palavras, ela recebe a categoria. Regras só mexem em transações sem categoria ou em "Outros".

Período analisado: {{periodo}}

Categorias disponíveis (use o nome EXATO e respeite o tipo — gasto só com categoria de gasto, receita só com de receita):
{{categorias}}

Transações, agrupadas por descrição (tipo · quantas vezes · descrição de exemplo → categoria atual):
<transacoes>
{{transacoes}}
</transacoes>

Regras que já existem (não repita):
{{regrasExistentes}}

Sugestões que o usuário já RECUSOU (não sugira de novo a mesma palavra para a mesma categoria):
{{recusadas}}

Tarefa: sugira regras que categorizem as transações "sem categoria" ou em "Outros". Use as transações já categorizadas como pista do que o usuário prefere (ex.: se "IFOOD" está em Alimentação, "IFD*" provavelmente também).
- Palavras-chave: trechos que APARECEM nas descrições, em minúsculas e sem acento, específicos o bastante para não pegar outra coisa (ex.: "uber", "ifood", "smart fit"). Nunca palavras genéricas como "pix", "compra", "pagamento", "transferencia", "debito", "cartao", "ltda", nomes de pessoas soltos ou números.
- Junte na mesma regra palavras do mesmo estabelecimento/serviço e da mesma categoria.
- Só sugira quando tiver confiança razoável na categoria. Na dúvida, não sugira.
- No máximo 25 regras.

Responda SÓ com JSON, sem texto antes ou depois:
{"regras":[{"palavras":["uber","99app"],"categoria":"Transporte","tipo":"gasto","motivo":"frase curta"}]}`,
  preparar: (p) => ({
    periodo: p.periodo,
    categorias: p.categorias,
    transacoes: p.transacoes,
    regrasExistentes: p.regrasExistentes || '(nenhuma)',
    recusadas: p.recusadas || '(nenhuma)'
  }),
  exemplo: {
    periodo: ex('mês ou todos os meses'),
    categorias: ex('gasto: Alimentação, Transporte… / receita: Salário…'),
    transacoes: ex('gasto · 4× · "UBER *TRIP" → sem categoria'),
    regrasExistentes: ex('ifood → Alimentação'),
    recusadas: ex('amazon → Lazer')
  }
})
