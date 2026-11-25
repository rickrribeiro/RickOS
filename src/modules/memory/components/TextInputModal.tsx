import React, { useState } from 'react'
import { pickFile } from '../../../api/files'
import { Modal, errMsg } from './ui'
import { t, getLocale } from '../../../i18n'

/**
 * Entrada inteligente: colar texto livre / vários conhecimentos / importar Markdown.
 * A IA organiza em memórias atômicas e manda tudo para o Inbox (nada é salvo direto).
 */
export function TextInputModal({ onClose, onStarted }: { onClose: () => void; onStarted: () => void }): React.ReactElement {
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState('')

  async function run(fn: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    setErr('')
    try {
      await fn()
      onStarted()
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  async function loadFile(): Promise<void> {
    const f = await pickFile('.md,.markdown,.txt,text/markdown,text/plain')
    if (!f) return
    if (f.size > 200_000) return setErr(t('memory.arquivoGrandeDemaisMax200'))
    setText(await f.text())
    setInfo(t('memory.arquivoCarregado', { name: f.name }))
  }

  const lines = text.split('\n').filter((l) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(l)).length

  return (
    <Modal title={t('memory.contarSobreMim')} onClose={onClose}>
      <p className="mem-sub" style={{ margin: '8px 0' }}>
        {t('memory.escrevaLivrementeColeVariosConhecimentos')} <strong>{t('memory.inbox')}</strong> {t('memory.paraVoceRevisar')}
      </p>
      <textarea
        autoFocus
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={30000}
        placeholder={t('memory.exSouEngenheiroDeSoftware')}
        style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
      />
      <div className="mem-row mem-muted" style={{ justifyContent: 'space-between' }}>
        <span>{info || `${text.length.toLocaleString(getLocale())} / 30.000`}</span>
        <button className="btn btn-secondary btn-sm" onClick={loadFile}>
          {t('memory.carregarMdTxt')}
        </button>
      </div>
      {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}
      <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={onClose}>
          {t('memory.cancelar')}
        </button>
        {lines > 0 && (
          <button
            className="btn btn-secondary"
            disabled={busy}
            title={t('memory.semIaCadaItemDe')}
            onClick={() => run(() => window.api.memory.importMarkdown(text, false))}
          >
            {t('memory.umaSugestaoPorLinhaSem', { lines })}
          </button>
        )}
        <button className="btn btn-primary" disabled={busy || text.trim().length < 10} onClick={() => run(() => window.api.memory.extractText(text))}>
          {busy ? t('memory.enviando') : t('memory.organizarComIa')}
        </button>
      </div>
    </Modal>
  )
}
