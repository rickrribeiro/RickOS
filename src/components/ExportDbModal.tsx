import React, { useEffect, useState } from 'react'
import { ExportDbResult } from '../types'
import { openExternal } from '../api/createApi'
import { fmtNumber, t } from '../i18n'

/** Bytes → B, KB, MB ou GB (base 1024). */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${i === 0 ? v : fmtNumber(v, { maximumFractionDigits: v < 10 ? 2 : 1, minimumFractionDigits: v < 10 ? 2 : 1 })} ${units[i]}`
}

/** Export DB: escolher entre Google Drive, salvar no dispositivo ou cancelar. */
export function ExportDbModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const [accounts, setAccounts] = useState<string[] | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState<'drive' | 'device' | null>(null)
  const [result, setResult] = useState<ExportDbResult | null>(null)
  const [size, setSize] = useState<number | null>(null)

  useEffect(() => {
    window.api.app.dbSize().then(setSize).catch(() => setSize(null))
  }, [])

  useEffect(() => {
    window.api.google
      .accounts()
      .catch(() => [] as string[])
      .then((a) => {
        setAccounts(a)
        setEmail(a[0] ?? '')
      })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function run(target: 'drive' | 'device'): Promise<void> {
    setBusy(target)
    setResult(null)
    try {
      const r = target === 'drive' ? await window.api.app.exportDbToDrive(email) : await window.api.app.exportDbToDevice()
      if (r.ok) setResult(r)
      else if (r.error) setResult(r)
      // ok=false sem erro = o usuário cancelou o diálogo de salvar: continua no modal
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  const hasDrive = !!accounts?.length

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>💾 {t('export.title')}</h2>
        <p className="export-db-size">
          {t('export.dbSize')} <strong>{size == null ? '…' : formatBytes(size)}</strong>
        </p>

        {result?.ok ? (
          <>
            <p style={{ fontSize: 14 }}>✅ {result.message || t('export.done')}</p>
            <div className="modal-actions">
              {result.link && (
                <button className="btn btn-secondary" onClick={() => openExternal(result.link!)}>{t('export.openDrive')}</button>
              )}
              <button className="btn btn-primary" onClick={onClose}>{t('common.close')}</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
              {t('export.where')}
            </p>

            <div className="export-db-options">
              <div className="export-db-option">
                <button className="btn btn-primary" disabled={!hasDrive || !!busy} onClick={() => run('drive')}>
                  {busy === 'drive' ? t('export.sending') : '☁️ Google Drive'}
                </button>
                {accounts == null ? (
                  <span className="export-db-hint">{t('export.loadingAccounts')}</span>
                ) : hasDrive ? (
                  accounts.length > 1 ? (
                    <select value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!busy}>
                      {accounts.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  ) : (
                    <span className="export-db-hint">{accounts[0]}</span>
                  )
                ) : (
                  <span className="export-db-hint">{t('export.connectGoogle')}</span>
                )}
              </div>

              <div className="export-db-option">
                <button className="btn btn-primary" disabled={!!busy} onClick={() => run('device')}>
                  {busy === 'device' ? t('export.saving') : `📥 ${t('export.download')}`}
                </button>
                <span className="export-db-hint">{t('export.chooseFolder')}</span>
              </div>
            </div>

            {result?.error && (
              <p style={{ fontSize: 13, color: 'var(--danger)', marginTop: 12 }}>{t('export.failed', { error: result.error })}</p>
            )}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose} disabled={!!busy}>{t('common.cancel')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
