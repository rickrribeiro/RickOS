import React, { useEffect } from 'react'
import { useConvStore, useRunnerAttention } from '../../store/convStore'
import { t } from '../../../../i18n'

/**
 * Mantém a lista de conversas do Prompt Runner atualizada no app inteiro (SSE), para
 * marcar respostas não lidas mesmo com você em outra página.
 */
export function RunnerWatcher(): null {
  useEffect(() => {
    const st = useConvStore.getState()
    st.listen()
    st.refresh().catch(() => {
      // servidor fora / sem token: a página tenta de novo ao abrir
    })
  }, [])
  return null
}

/** Contador no menu: pedidos esperando você (🤚) ou respostas não lidas. */
export function RunnerNavBadge({ compact = false }: { compact?: boolean }): React.ReactElement | null {
  const { unseen, pending } = useRunnerAttention()
  if (!unseen && !pending) return null
  const title = [pending ? t('ai.attention.pending', { n: pending }) : '', unseen ? t('ai.attention.unseen', { n: unseen }) : ''].filter(Boolean).join(' · ')
  if (compact) return <span className={`runner-nav-dot ${pending ? 'attn' : ''}`} title={title} />
  return (
    <span className={`runner-nav-badge ${pending ? 'attn' : ''}`} title={title}>
      {pending ? `🤚 ${pending}` : unseen}
    </span>
  )
}
