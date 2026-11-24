import React, { useState } from 'react'
import { pickFile } from '../../../api/files'
import { Modal, errMsg } from './ui'

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
    if (f.size > 200_000) return setErr('Arquivo grande demais (máx. 200 KB).')
    setText(await f.text())
    setInfo(`Arquivo “${f.name}” carregado.`)
  }

  const lines = text.split('\n').filter((l) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(l)).length

  return (
    <Modal title="📝 Contar sobre mim" onClose={onClose}>
      <p className="mem-sub" style={{ margin: '8px 0' }}>
        Escreva livremente, cole vários conhecimentos ou carregue um Markdown. A IA separa em memórias pequenas e manda para o <strong>Inbox</strong> para você revisar.
      </p>
      <textarea
        autoFocus
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={30000}
        placeholder={'Ex.: Sou engenheiro de software e trabalho remotamente. Minha cidade favorita é Seoul. Prefiro hospedagens econômicas, mas com quarto privativo…'}
        style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
      />
      <div className="mem-row mem-muted" style={{ justifyContent: 'space-between' }}>
        <span>{info || `${text.length.toLocaleString('pt-BR')} / 30.000`}</span>
        <button className="btn btn-secondary btn-sm" onClick={loadFile}>
          📄 Carregar .md / .txt
        </button>
      </div>
      {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}
      <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        {lines > 0 && (
          <button
            className="btn btn-secondary"
            disabled={busy}
            title="Sem IA: cada item de lista vira uma sugestão"
            onClick={() => run(() => window.api.memory.importMarkdown(text, false))}
          >
            Uma sugestão por linha ({lines}) · sem IA
          </button>
        )}
        <button className="btn btn-primary" disabled={busy || text.trim().length < 10} onClick={() => run(() => window.api.memory.extractText(text))}>
          {busy ? 'Enviando…' : '✨ Organizar com IA'}
        </button>
      </div>
    </Modal>
  )
}
