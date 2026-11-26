import React, { useEffect, useState } from 'react'
import type { AdoptPreview, GitStatus, LibraryTopic, LinkPreview, SyncResult } from '../../../../shared/estudos'
import { t, fmtDateTime } from '../../../i18n'
import type { MessageKey } from '../../../i18n'

/** Texto da UI para o resultado do Sincronizar (o servidor manda a chave). */
export function syncMessage(r: SyncResult): string {
  const key = `est.${r.message}` as MessageKey
  return t(key, { detalhe: r.detail ?? '' })
}

/** Botão Sincronizar: manual, determinístico, sem IA. Mostra o último resultado. */
export function SyncButton({ onOpen }: { onOpen: () => void }): React.ReactElement | null {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const load = (): Promise<void> => window.api.estudos.gitStatus().then(setStatus)
  useEffect(() => {
    load()
    return window.api.estudos.onSync((p) => {
      setBusy(p.phase === 'running')
      if (p.phase === 'done') load()
    })
  }, [])
  if (!status) return null
  if (!status.linked) return <button className="btn btn-secondary btn-sm" onClick={onOpen}>{t('est.repoConectar')}</button>
  async function run(): Promise<void> {
    setBusy(true)
    try {
      await window.api.estudos.sync()
    } finally {
      setBusy(false)
      load()
    }
  }
  const last = status.last
  return (
    <span className="sync-wrap">
      <button className="btn btn-secondary btn-sm" onClick={run} disabled={busy} title={last ? syncMessage(last) : ''}>
        {busy ? t('est.sincronizando') : status.pending ? t('est.sincronizarPendente') : t('est.sincronizar')}
      </button>
      <button className="btn btn-secondary btn-sm" onClick={onOpen} title={t('est.repoTitulo')}>⚙</button>
      {last && !busy && <span className={`sync-status sync-${last.status}`}>{syncMessage(last)}</span>}
    </span>
  )
}

/** Vincular remoto/branch/pasta com prévia, importar acervo antigo e restaurar. */
export function RepoPanel({ onClose }: { onClose: () => void }): React.ReactElement {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [remote, setRemote] = useState('')
  const [branch, setBranch] = useState('main')
  const [folder, setFolder] = useState('rickos-estudos')
  const [preview, setPreview] = useState<LinkPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [lastSync, setLastSync] = useState<SyncResult | null>(null)
  // importação do acervo
  const [tree, setTree] = useState<string[] | null>(null)
  const [sub, setSub] = useState('.')
  const [topics, setTopics] = useState<LibraryTopic[]>([])
  const [topicId, setTopicId] = useState('')
  const [newTopic, setNewTopic] = useState('')
  const [mode, setMode] = useState<'note' | 'source'>('note')
  const [adopt, setAdopt] = useState<AdoptPreview | null>(null)
  const [decisions, setDecisions] = useState<Record<string, 'create' | 'update' | 'skip'>>({})

  const load = async (): Promise<void> => {
    const s = await window.api.estudos.gitStatus()
    setStatus(s)
    if (s.config) {
      setRemote(s.config.remote)
      setBranch(s.config.branch)
      setFolder(s.config.folder)
    }
    setLastSync(s.last)
  }
  useEffect(() => {
    load()
    window.api.estudos.library().then(setTopics)
  }, [])

  async function act<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setError('')
    setInfo('')
    setBusy(true)
    try {
      return await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return undefined
    } finally {
      setBusy(false)
    }
  }

  const doPreview = (): Promise<void> => act(async () => setPreview(await window.api.estudos.gitPreview({ remote, branch, folder }))).then(() => undefined)
  const doLink = (): Promise<void> =>
    act(async () => {
      if (!preview) return
      await window.api.estudos.gitLink({ remote: preview.remote, branch: preview.branch, folder: preview.folder, previewId: preview.previewId })
      setPreview(null)
      await load()
      setInfo(t('est.repoVinculado'))
    }).then(() => undefined)
  const doSync = (): Promise<void> =>
    act(async () => {
      const r = await window.api.estudos.sync()
      setLastSync(r)
      await load()
    }).then(() => undefined)
  const doRestore = (): Promise<void> =>
    act(async () => {
      if (!window.confirm(t('est.restaurarConfirma'))) return
      const r = await window.api.estudos.restoreFromRepo()
      setInfo(t('est.restaurado', { criados: r.created.length, pulados: r.skipped.length, anexos: r.attachments }))
    }).then(() => undefined)
  const loadTree = (): Promise<void> => act(async () => setTree(await window.api.estudos.gitTree())).then(() => undefined)
  const doAdoptPreview = (): Promise<void> =>
    act(async () => {
      const p = await window.api.estudos.adoptPreview(sub, topicId ? Number(topicId) : null)
      setAdopt(p)
      setDecisions(Object.fromEntries(p.recognized.map((f) => [f.path, f.status === 'new' ? 'create' : f.status === 'changed' ? 'update' : 'skip'])))
    }).then(() => undefined)
  const doAdopt = (): Promise<void> =>
    act(async () => {
      const r = await window.api.estudos.adoptApply({ subpath: sub, topicId: topicId ? Number(topicId) : null, newTopicName: newTopic || null, mode, decisions })
      setInfo(t('est.adotado', { criados: r.created, atualizados: r.updated, pulados: r.skipped, imagens: r.images }))
      setAdopt(null)
      window.api.estudos.library().then(setTopics)
    }).then(() => undefined)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal study-modal repo-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('est.repoTitulo')}</h2>
        <p className="study-hint">{t('est.repoExplica')}</p>

        {!status?.linked ? (
          <>
            <div className="editor-field">
              <label>{t('est.repoRemoto')}</label>
              <input value={remote} onChange={(e) => setRemote(e.target.value)} placeholder="git@github.com:voce/estudos.git" />
            </div>
            <div className="editor-row">
              <div className="editor-field">
                <label>{t('est.repoBranch')}</label>
                <input value={branch} onChange={(e) => setBranch(e.target.value)} />
              </div>
              <div className="editor-field">
                <label>{t('est.repoPasta')}</label>
                <input value={folder} onChange={(e) => setFolder(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-secondary btn-sm" disabled={busy || !remote.trim()} onClick={doPreview}>{busy ? t('est.aguarde') : t('est.repoPrevia')}</button>
            {preview && (
              <div className="source-form">
                <div>{preview.emptyRepo ? t('est.repoVazio') : preview.branchExists ? t('est.repoBranchExiste', { branch: preview.branch }) : t('est.repoBranchNova', { branch: preview.branch })}</div>
                <div>{t(`est.repoPasta.${preview.folderState}`, { pasta: preview.folder, count: preview.folderFiles })}</div>
                {preview.notesOutside > 0 && <div>{t('est.repoNotasFora', { count: preview.notesOutside })}</div>}
                {preview.topLevel.length > 0 && <div className="study-hint">{preview.topLevel.slice(0, 20).join(' · ')}</div>}
                {preview.folderState === 'occupied' ? (
                  <button className="btn btn-secondary btn-sm" onClick={() => { setFolder(preview.suggestion ?? `${folder}-2`); setPreview(null) }}>
                    {t('est.repoUsarOutra', { pasta: preview.suggestion ?? `${folder}-2` })}
                  </button>
                ) : (
                  <button className="btn btn-primary btn-sm" disabled={busy} onClick={doLink}>{t('est.repoVincular')}</button>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="repo-summary">
              <code>{status.config?.remote}</code> · <code>{status.config?.branch}</code> · <code>{status.config?.folder}/</code>
              {status.pending && <span className="project-chip warn">{t('est.envioPendenteChip')}</span>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={doSync}>{busy ? t('est.sincronizando') : t('est.sincronizar')}</button>
              <button className="btn btn-secondary btn-sm" disabled={busy} onClick={loadTree}>{t('est.importarAcervo')}</button>
              <button className="btn btn-secondary btn-sm" disabled={busy} onClick={doRestore}>{t('est.restaurar')}</button>
              <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(async () => { if (window.confirm(t('est.desvincularConfirma'))) { await window.api.estudos.gitUnlink(); await load() } })}>
                {t('est.desvincular')}
              </button>
            </div>
            {lastSync && (
              <div className={`sync-result sync-${lastSync.status}`}>
                <strong>{syncMessage(lastSync)}</strong> <span className="study-hint">{fmtDateTime(lastSync.at, { dateStyle: 'short', timeStyle: 'short' })}</span>
                {lastSync.keptExternal.length > 0 && <div className="study-hint">{t('est.mantidosExternos', { lista: lastSync.keptExternal.join(', ') })}</div>}
                {lastSync.conflicts.length > 0 && (
                  <div className="study-hint">{t('est.conflitos', { lista: lastSync.conflicts.join(', '), pasta: lastSync.divergenceDir ?? '' })}</div>
                )}
              </div>
            )}

            {tree && (
              <div className="source-form">
                <strong>{t('est.importarAcervo')}</strong>
                <div className="editor-row">
                  <div className="editor-field">
                    <label>{t('est.pastaDoAcervo')}</label>
                    <select value={sub} onChange={(e) => { setSub(e.target.value); setAdopt(null) }}>
                      {tree.map((p) => (
                        <option key={p} value={p}>{p === '.' ? t('est.raizRepo') : p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="editor-field">
                    <label>{t('est.destino')}</label>
                    <select value={topicId} onChange={(e) => { setTopicId(e.target.value); setAdopt(null) }}>
                      <option value="">{t('est.novoTopicoDestino')}</option>
                      {topics.map((x) => (
                        <option key={x.id} value={x.id}>{x.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {!topicId && <input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder={t('est.nomeNovoTopico')} />}
                <select value={mode} onChange={(e) => setMode(e.target.value as 'note' | 'source')}>
                  <option value="note">{t('est.importarComoNota')}</option>
                  <option value="source">{t('est.importarComoLeitura')}</option>
                </select>
                <button className="btn btn-secondary btn-sm" disabled={busy} onClick={doAdoptPreview}>{t('est.verPrevia')}</button>
                {adopt && (
                  <>
                    <div className="study-hint">
                      {t('est.adocaoResumo', { reconhecidos: adopt.recognized.length, ignorados: adopt.ignored.length, colisoes: adopt.collisions.length, faltando: adopt.missingLinks.length })}
                    </div>
                    {adopt.recognized.map((f) => (
                      <div key={f.path} className="import-row">
                        <span className={`import-status import-${f.status}`}>{t(`est.import.${f.status}`)}</span>
                        <span className="import-path" title={f.path}>{f.path}</span>
                        {f.images.length > 0 && <span className="project-chip">🖼 {f.images.length}</span>}
                        {f.missing.length > 0 && <span className="project-chip warn">⚠ {f.missing.length}</span>}
                        <select value={decisions[f.path] ?? 'skip'} onChange={(e) => setDecisions({ ...decisions, [f.path]: e.target.value as 'create' | 'update' | 'skip' })}>
                          {f.status === 'new' && <option value="create">{t('est.importar')}</option>}
                          {f.status !== 'new' && <option value="update">{t('est.atualizarExistente')}</option>}
                          <option value="skip">{t('est.ignorar')}</option>
                        </select>
                      </div>
                    ))}
                    {adopt.collisions.length > 0 && (
                      <details>
                        <summary>{t('est.colisoes', { count: adopt.collisions.length })}</summary>
                        {adopt.collisions.map((c) => (
                          <div key={c.path + c.reason} className="study-hint">{c.path} — {t(`est.colisao.${c.reason}`)}</div>
                        ))}
                      </details>
                    )}
                    {adopt.missingLinks.length > 0 && (
                      <details>
                        <summary>{t('est.linksFaltando', { count: adopt.missingLinks.length })}</summary>
                        {adopt.missingLinks.map((m) => (
                          <div key={m.path + m.link} className="study-hint">{m.path} → {m.link}</div>
                        ))}
                      </details>
                    )}
                    {adopt.ignored.length > 0 && (
                      <details>
                        <summary>{t('est.ignorados', { count: adopt.ignored.length })}</summary>
                        <div className="study-hint">{adopt.ignored.join(' · ')}</div>
                      </details>
                    )}
                    <p className="study-hint">{t('est.originaisIntactos')}</p>
                    <button className="btn btn-primary btn-sm" disabled={busy} onClick={doAdopt}>{t('est.importar')}</button>
                  </>
                )}
              </div>
            )}
          </>
        )}
        {error && <div className="study-error">{error}</div>}
        {info && <div className="study-hint">{info}</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>{t('estudos.fechar')}</button>
        </div>
      </div>
    </div>
  )
}
