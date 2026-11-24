import { PluggySyncResult } from '../../types'
import { formatMoney } from './util'

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
      .map((t) => `• ${t.date.slice(5)} ${t.description ?? '(sem descrição)'} ${formatMoney(t.amount, t.currency)}`)
      .join('\n')
    const more = gone.length > 8 ? `\n… e mais ${gone.length - 8}` : ''
    const ok = confirm(
      `${gone.length} transação(ões) pendente(s) não aparecem mais no banco (canceladas ou substituídas pela versão lançada):\n\n${sample}${more}\n\nRemover do app?`
    )
    if (ok) {
      for (const t of gone) await window.api.transactions.delete(t.id)
      removed = gone.length
    }
  }
  const parts = [`${r.imported} importadas`, `${r.updated} atualizadas`, `${r.skipped} já existiam`]
  if (removed) parts.push(`${removed} pendentes removidas`)
  else if (gone.length) parts.push(`${gone.length} pendentes sumidas mantidas`)
  return prefix + parts.join(', ') + '.'
}
