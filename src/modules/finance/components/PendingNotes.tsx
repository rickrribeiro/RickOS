import React, { useEffect, useRef, useState } from 'react'
import { t } from '../../../i18n'

const KEY = 'finance_pending_notes'

/**
 * Pendências financeiras: texto livre (não muda com o mês) para lembrar de coisas como
 * "fulano me deve R$ 50", "conferir se a compra X estornou", "pagar o IPVA". Salva sozinho.
 */
export function PendingNotes(): React.ReactElement {
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef('')

  useEffect(() => {
    window.api.settings
      .get(KEY)
      .then((v) => {
        setText(v ?? '')
        lastSaved.current = v ?? ''
      })
      .finally(() => setLoaded(true))
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  async function save(value: string): Promise<void> {
    if (value === lastSaved.current) return
    setStatus('saving')
    try {
      await window.api.settings.set(KEY, value)
      lastSaved.current = value
      setStatus('saved')
    } catch {
      setStatus('error')
    }
  }

  function onChange(v: string): void {
    setText(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(v), 800)
  }

  const lines = text.split('\n').filter((l) => l.trim()).length

  return (
    <div className="chart-section" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="chart-title" style={{ marginRight: 'auto' }}>
          {t('finance.pendenciasFinanceiras')}{lines > 0 ? ` · ${lines}` : ''}
        </div>
        <span style={{ fontSize: 11, color: status === 'error' ? 'var(--danger)' : 'var(--text-muted)' }}>
          {status === 'saving' ? t('finance.salvando') : status === 'saved' ? t('finance.salvo') : status === 'error' ? t('finance.erroAoSalvar') : ''}
        </span>
      </div>
      <textarea
        value={text}
        disabled={!loaded}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current)
          void save(text)
        }}
        placeholder={t('finance.coisasParaLembrarValemPara')}
        rows={Math.min(14, Math.max(4, text.split('\n').length + 1))}
        style={{ width: '100%', marginTop: 10, resize: 'vertical', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5, boxSizing: 'border-box' }}
      />
    </div>
  )
}
