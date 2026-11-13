import React, { useCallback, useEffect, useState } from 'react'
import type { AiConversation, ConvChanges } from '../../../../../shared/aiConversations'

interface Props {
  conv: AiConversation
  onClose: () => void
  /** Avisa a página quantos arquivos mudaram (badge do botão). */
  onCount: (n: number) => void
}

const STATUS_LABEL: Record<string, string> = { M: 'modificado', A: 'novo', D: 'apagado', R: 'renomeado', C: 'copiado', '??': 'novo', U: 'conflito' }

function DiffView({ diff }: { diff: string }): React.ReactElement {
  if (!diff) return <div className="cv-ch-nodiff">(sem diff)</div>
  return (
    <pre className="cv-diff cv-ch-diff">
      {diff.split('\n').map((l, i) => {
        const cls = l.startsWith('@@') ? 'cv-diff-hunk' : l.startsWith('+') ? 'cv-diff-add' : l.startsWith('-') ? 'cv-diff-del' : ''
        return (
          <div key={i} className={cls}>
            {l || ' '}
          </div>
        )
      })}
    </pre>
  )
}

/** Arquivos alterados na pasta da conversa: diff, descartar, commit e PR. */
export function ChangesPanel({ conv, onClose, onCount }: Props): React.ReactElement {
  const [data, setData] = useState<ConvChanges | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string> | null>(null) // null = todos
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [info, setInfo] = useState('')

  const load = useCallback(async () => {
    try {
      const d = await window.api.conv.changes(conv.id)
      setData(d)
      setError('')
      onCount(d.files.length)
      setSelected((sel) => (sel ? new Set([...sel].filter((p) => d.files.some((f) => f.path === p))) : null))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [conv.id, onCount])

  useEffect(() => {
    load()
  }, [load, conv.running])

  const isSel = (p: string): boolean => (selected ? selected.has(p) : true)
  const toggleSel = (p: string): void => {
    const base = selected ?? new Set(data?.files.map((f) => f.path) ?? [])
    const next = new Set(base)
    if (next.has(p)) next.delete(p)
    else next.add(p)
    setSelected(next)
  }
  const chosen = data?.files.filter((f) => isSel(f.path)).map((f) => f.path) ?? []

  async function act(label: string, fn: () => Promise<void>): Promise<void> {
    setBusy(label)
    setError('')
    setInfo('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const suggest = (): Promise<void> =>
    act('suggest', async () => {
      setMessage(await window.api.conv.suggestCommit(conv.id))
    })

  const doCommit = (): Promise<void> =>
    act('commit', async () => {
      const all = chosen.length === data?.files.length
      const hash = await window.api.conv.commit(conv.id, message, all ? null : chosen)
      setMessage('')
      setSelected(null)
      setInfo(`✓ Commit ${hash}`)
      await load()
    })

  const discard = (p: string): Promise<void> =>
    act(`discard:${p}`, async () => {
      if (!window.confirm(`Descartar as mudanças em ${p}? Não dá para desfazer.`)) return
      await window.api.conv.discard(conv.id, p)
      await load()
    })

  const pr = (): Promise<void> =>
    act('pr', async () => {
      const url = await window.api.conv.pr(conv.id)
      setInfo(url ? `🔀 PR: ${url}` : 'PR aberto.')
      if (url) window.api.app.openExternal(url)
      await load()
    })

  const files = data?.files ?? []
  const canPr = !!data?.hasRemote && (conv.useWorktree || (!!data.branch && !!data.baseRef && data.branch !== data.baseRef))
  return (
    <aside className="cv-changes">
      <div className="cv-ch-head">
        <strong>📝 Mudanças</strong>
        {data?.branch && <span className="cv-chip">🌿 {data.branch}</span>}
        <button className="cv-link" onClick={load} title="Atualizar">
          ↻
        </button>
        <button className="cv-link" style={{ marginLeft: 'auto', fontSize: 16 }} onClick={onClose} title="Fechar">
          ✕
        </button>
      </div>
      {error && <div className="cv-ch-error">{error}</div>}
      {info && <div className="cv-ch-info">{info}</div>}
      {data && !data.isRepo && <div className="empty-hint" style={{ padding: 16, fontSize: 12.5 }}>A pasta desta conversa não é um repositório git.</div>}
      {data?.isRepo && files.length === 0 && (
        <div className="empty-hint" style={{ padding: 16, fontSize: 12.5 }}>
          Nenhuma mudança pendente.
          {data.unpushed > 0 && <> {data.unpushed} commit(s) ainda não enviados.</>}
        </div>
      )}
      <div className="cv-ch-files">
        {files.map((f) => (
          <div key={f.path} className="cv-ch-file">
            <div className="cv-ch-row">
              <input type="checkbox" checked={isSel(f.path)} onChange={() => toggleSel(f.path)} title="Incluir no commit" />
              <button
                className="cv-ch-name"
                onClick={() =>
                  setOpen((o) => {
                    const n = new Set(o)
                    if (n.has(f.path)) n.delete(f.path)
                    else n.add(f.path)
                    return n
                  })
                }
                title={STATUS_LABEL[f.status] ?? f.status}
              >
                <span className={`cv-ch-st cv-ch-st-${f.status === '??' ? 'A' : f.status}`}>{f.status === '??' ? 'A' : f.status}</span>
                <span className="cv-ch-path">{f.path}</span>
              </button>
              <span className="cv-ch-num">
                {f.additions > 0 && <span className="add">+{f.additions}</span>} {f.deletions > 0 && <span className="del">−{f.deletions}</span>}
              </span>
              <button className="cv-link" disabled={!!busy || conv.running} onClick={() => discard(f.path)} title="Descartar mudanças deste arquivo">
                ↺
              </button>
            </div>
            {open.has(f.path) && <DiffView diff={f.diff} />}
          </div>
        ))}
      </div>
      {data?.isRepo && (files.length > 0 || canPr) && (
        <div className="cv-ch-commit">
          {files.length > 0 && (
            <>
              <textarea rows={3} placeholder="Mensagem do commit…" value={message} onChange={(e) => setMessage(e.target.value)} />
              <div className="cv-actions">
                <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={suggest} title="O Claude (Haiku) escreve a mensagem no estilo dos commits do repositório">
                  {busy === 'suggest' ? 'Gerando…' : '✨ Sugerir'}
                </button>
                <button className="btn btn-primary btn-sm" disabled={!!busy || !message.trim() || chosen.length === 0} onClick={doCommit}>
                  {busy === 'commit' ? 'Commitando…' : `✓ Commit (${chosen.length})`}
                </button>
              </div>
            </>
          )}
          {canPr && (
            <button className="btn btn-secondary btn-sm" disabled={!!busy || files.length > 0} onClick={pr} title={files.length ? 'Faça o commit antes' : 'Envia a branch e abre o PR com gh'}>
              {busy === 'pr' ? 'Abrindo PR…' : `🔀 Push + PR${data.baseRef ? ` → ${data.baseRef}` : ''}`}
            </button>
          )}
        </div>
      )}
    </aside>
  )
}
