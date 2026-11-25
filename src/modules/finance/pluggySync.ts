import { PluggySyncResult } from '../../types'
import { formatMoney } from './util'
import { t as tr } from '../../i18n'

/**
 * Pós-importação do Open Finance: pergunta antes de apagar pendentes que sumiram do banco
 * (canceladas ou substituídas pela versão lançada) e monta o resumo para a tela.
 */
export async function finishPluggySync(r: PluggySyncResult, prefix = ''): Promise<string> {
  let removed = 0
  const gone = r.vanishedPending
  if (gone.length) {
    const sample = gone
      .slice(0, 8)
      .map((t) => `• ${t.date.slice(5)} ${t.description ?? tr('finance.semDescricao')} ${formatMoney(t.amount, t.currency)}`)
      .join('\n')
    const more = gone.length > 8 ? `\n… e mais ${gone.length - 8}` : ''
    const ok = confirm(
      tr('finance.transacaoOesPendenteSNao', { count: gone.length, sample, more })
    )
    if (ok) {
      for (const t of gone) await window.api.transactions.delete(t.id)
      removed = gone.length
    }
  }
  const parts = [tr('finance.sync.importadas', { n: r.imported }), tr('finance.sync.atualizadas', { n: r.updated }), tr('finance.sync.jaExistiam', { n: r.skipped })]
  if (removed) parts.push(tr('finance.sync.pendentesRemovidas', { n: removed }))
  else if (gone.length) parts.push(tr('finance.sync.pendentesMantidas', { n: gone.length }))
  return prefix + parts.join(', ') + '.'
}
