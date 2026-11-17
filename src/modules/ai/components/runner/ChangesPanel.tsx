import React, { useCallback, useEffect, useState } from 'react'
import type { AiConversation, ConvChanges, ConvFileDiff } from '../../../../../shared/aiConversations'

interface Props {
  conv: AiConversation
  onClose: () => void
  /** Avisa a página quantos arquivos mudaram (badge do botão). */
  onCount: (n: number) => void
}

const STATUS_LABEL: Record<string, string> = { M: 'modificado', A: 'novo', D: 'apagado', R: 'renomeado', C: 'copiado', '??': 'novo', U: 'conflito' }

/** Diff de um arquivo, carregado ao abrir (cada arquivo com o seu próprio limite). */
function FileDiff({ convId, path, version, repo }: { convId: string; path: string; version: number; repo: string | null }): React.ReactElement {
  const [d, setD] = useState<ConvFileDiff | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    setD(null)
    setError('')
    window.api.conv
      .fileDiff(convId, path, repo)
      .then((r) => alive && setD(r))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [convId, path, version, repo])
  if (error) return <div className="cv-ch-nodiff">{error}</div>
  if (!d) return <div className="cv-ch-nodiff">Carregando diff…</div>
  if (d.binary) return <div className="cv-ch-nodiff">(arquivo binário)</div>
  return (
    <>
      <DiffView diff={d.diff} />
      {d.truncated && <div className="cv-ch-nodiff">… diff muito grande: mostrando só o começo.</div>}
    </>
  )
}

function DiffView({ diff }: { diff: string }): React.ReactElement {
  if (!diff) return <div className="cv-ch-nodiff">(sem diferenças de conteúdo)</div>
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

/** Arquivos alterados na pasta da conversa: diff, descartar, commit e PR (por repositório em workspace). */
export function ChangesPanel({ conv, onClose, onCount }: Props): React.ReactElement {
  const [data, setData] = useState<ConvChanges | null>(null)
  const [error, setError] = useState('')
  // muda a cada recarga da lista: os diffs abertos são buscados de novo
  const [version, setVersion] = useState(0)

  const load = useCallback(async () => {
    try {
      const d = await window.api.conv.changes(conv.id)
      setData(d)
      setVersion((v) => v + 1)
      setError('')
      onCount(d.isRepo ? d.files.length : (d.repos ?? []).reduce((n, r) => n + r.changes.files.length, 0))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [conv.id, onCount])

  useEffect(() => {
    load()
  }, [load, conv.running])

  // workspace: mostra os repos com mudança, commits a enviar ou numa branch própria (worktree)
  const repos = (data?.repos ?? []).filter(
    (r) => r.changes.files.length > 0 || r.changes.unpushed > 0 || (!!r.changes.baseRef && r.changes.branch !== r.changes.baseRef)
  )
  return (
    <aside className={`cv-changes${data && !data.isRepo && data.repos?.length ? ' cv-changes-multi' : ''}`}>
      <div className="cv-ch-head">
        <strong>📝 Mudanças</strong>
        {data?.isRepo && data.branch && <span className="cv-chip">🌿 {data.branch}</span>}
        {data && !data.isRepo && !!data.repos?.length && <span className="cv-chip">📦 {data.repos.length} repos</span>}
        <button className="cv-link" onClick={load} title="Atualizar">
          ↻
        </button>
        <button className="cv-link" style={{ marginLeft: 'auto', fontSize: 16 }} onClick={onClose} title="Fechar">
          ✕
        </button>
      </div>
      {error && <div className="cv-ch-error">{error}</div>}
      {data && !data.isRepo && !data.repos?.length && (
        <div className="empty-hint" style={{ padding: 16, fontSize: 12.5 }}>A pasta desta conversa não é um repositório git.</div>
      )}
      {data?.isRepo && <RepoChanges conv={conv} data={data} repo={null} version={version} reload={load} />}
      {data && !data.isRepo && !!data.repos?.length && repos.length === 0 && (
        <div className="empty-hint" style={{ padding: 16, fontSize: 12.5 }}>Nenhuma mudança pendente em {data.repos.map((r) => r.name).join(', ')}.</div>
      )}
      {repos.map((r) => (
        <section key={r.rel} className="cv-ch-repo">
          <div className="cv-ch-repo-head">
            <strong>📦 {r.name}</strong>
            {r.changes.branch && <span className="cv-chip">🌿 {r.changes.branch}</span>}
            <span className="cv-ch-repo-count">{r.changes.files.length ? `${r.changes.files.length} arquivo(s)` : r.changes.unpushed ? `${r.changes.unpushed} a enviar` : ''}</span>
          </div>
          <RepoChanges conv={conv} data={r.changes} repo={r.rel} version={version} reload={load} />
        </section>
      ))}
    </aside>
  )
}

/** Lista de arquivos + commit + PR de UM repositório (`repo` = subpasta no workspace; null = a própria pasta). */
function RepoChanges({
  conv,
  data,
  repo,
  version,
  reload
}: {
  conv: AiConversation
  data: ConvChanges
  repo: string | null
  version: number
  reload: () => Promise<void>
}): React.ReactElement {
  const [error, setError] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string> | null>(null) // null = todos
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [info, setInfo] = useState('')

  // arquivos que sumiram da lista saem da seleção
  useEffect(() => {
    setSelected((sel) => (sel ? new Set([...sel].filter((p) => data.files.some((f) => f.path === p))) : null))
  }, [data])

  const isSel = (p: string): boolean => (selected ? selected.has(p) : true)
  const toggleSel = (p: string): void => {
    const base = selected ?? new Set(data.files.map((f) => f.path))
    const next = new Set(base)
    if (next.has(p)) next.delete(p)
    else next.add(p)
    setSelected(next)
  }
  const chosen = data.files.filter((f) => isSel(f.path)).map((f) => f.path)

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
      setMessage(await window.api.conv.suggestCommit(conv.id, repo))
    })

  const doCommit = (): Promise<void> =>
    act('commit', async () => {
      const all = chosen.length === data.files.length
      const hash = await window.api.conv.commit(conv.id, message, all ? null : chosen, repo)
      setMessage('')
      setSelected(null)
      setInfo(`✓ Commit ${hash}`)
      await reload()
    })

  const discard = (p: string): Promise<void> =>
    act(`discard:${p}`, async () => {
      if (!window.confirm(`Descartar as mudanças em ${repo ? `${repo}/` : ''}${p}? Não dá para desfazer.`)) return
      await window.api.conv.discard(conv.id, p, repo)
      await reload()
    })

  const pr = (): Promise<void> =>
    act('pr', async () => {
      const url = await window.api.conv.pr(conv.id, repo)
      setInfo(url ? `🔀 PR: ${url}` : 'PR aberto.')
      if (url) window.api.app.openExternal(url)
      await reload()
    })

  const files = data.files
  // no workspace, repo sem mudanças nem commits a enviar não tem o que virar PR
  const canPr =
    data.hasRemote &&
    (conv.useWorktree || (!!data.branch && !!data.baseRef && data.branch !== data.baseRef)) &&
    (!repo || files.length > 0 || data.unpushed > 0)
  return (
    <>
      {error && <div className="cv-ch-error">{error}</div>}
      {info && <div className="cv-ch-info">{info}</div>}
      {files.length === 0 && (
        <div className="empty-hint" style={{ padding: repo ? '6px 16px' : 16, fontSize: 12.5 }}>
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
            {open.has(f.path) &&
              (f.binary ? <div className="cv-ch-nodiff">(arquivo binário)</div> : <FileDiff convId={conv.id} path={f.path} version={version} repo={repo} />)}
          </div>
        ))}
      </div>
      {(files.length > 0 || canPr) && (
        <div className="cv-ch-commit">
          {files.length > 0 && (
            <>
              <textarea rows={3} placeholder={`Mensagem do commit${repo ? ` (${repo})` : ''}…`} value={message} onChange={(e) => setMessage(e.target.value)} />
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
    </>
  )
}
