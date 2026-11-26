import React, { useEffect, useRef, useState } from 'react'
import type { ImportPreviewItem, SourceRow } from '../../../../shared/estudos'
import { useStudyStore } from '../store/studyStore'
import { renderMarkdown } from '../markdown'
import { t } from '../../../i18n'

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function pickTextFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.txt,.md,.markdown,text/plain,text/markdown'
    input.multiple = true
    input.style.display = 'none'
    let done = false
    const finish = (f: File[]): void => {
      if (done) return
      done = true
      input.remove()
      resolve(f)
    }
    input.onchange = () => finish([...(input.files ?? [])])
    input.addEventListener('cancel', () => finish([]))
    document.body.appendChild(input)
    input.click()
  })
}

interface PendingImport {
  items: (ImportPreviewItem & { content: string; hash: string; decision: 'create' | 'update' | 'skip' })[]
}

/**
 * Leitura: material de fora (texto colado, TXT/MD importado, link com página/trecho/timestamp).
 * Separado da nota autoral. A rolagem vira checkpoint ("onde parei" na fonte).
 */
export function SourcePanel({ autoAdd }: { autoAdd?: boolean }): React.ReactElement {
  const { activeTopicId, selectedNodeId, focus, clearFocus } = useStudyStore()
  const [sources, setSources] = useState<SourceRow[]>([])
  const [openId, setOpenId] = useState<number | null>(null)
  const [adding, setAdding] = useState<null | 'text' | 'link'>(autoAdd ? 'text' : null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [url, setUrl] = useState('')
  const [locator, setLocator] = useState('')
  const [pending, setPending] = useState<PendingImport | null>(null)
  const [error, setError] = useState('')
  const viewer = useRef<HTMLDivElement | null>(null)
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function load(): Promise<void> {
    if (activeTopicId == null) return
    const all = await window.api.estudos.sources(activeTopicId)
    // fontes do nó selecionado primeiro, depois as do tópico inteiro
    const list = all.filter((s) => s.nodeId === selectedNodeId || s.nodeId == null || selectedNodeId == null)
    setSources(list)
    // abre a fonte mais recente se nenhuma estiver aberta (abrir = só ler o que está salvo)
    setOpenId((cur) => (cur != null && list.some((s) => s.id === cur) ? cur : list[0]?.id ?? null))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTopicId, selectedNodeId])

  useEffect(() => {
    if (focus?.target === 'source') {
      if (focus.refId != null && focus.refId > 0) setOpenId(focus.refId)
      else setAdding('text')
      clearFocus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus])

  const open = sources.find((s) => s.id === openId) ?? null

  // restaura a rolagem salva ao abrir uma fonte
  useEffect(() => {
    if (!open || activeTopicId == null) return
    window.api.estudos.checkpoint(activeTopicId, open.nodeId, 'source', open.id).then((cp) => {
      try {
        const pos = cp?.position ? JSON.parse(cp.position) : null
        if (pos?.scroll != null && viewer.current) {
          const el = viewer.current
          requestAnimationFrame(() => (el.scrollTop = pos.scroll * (el.scrollHeight - el.clientHeight)))
        }
      } catch { /* posição antiga inválida */ }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId])

  function onScroll(): void {
    if (!open || activeTopicId == null || !viewer.current) return
    const el = viewer.current
    const ratio = el.scrollHeight > el.clientHeight ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 0
    if (scrollTimer.current) clearTimeout(scrollTimer.current)
    scrollTimer.current = setTimeout(() => {
      window.api.estudos.saveCheckpoint({ topicId: activeTopicId, nodeId: open.nodeId, target: 'source', refId: open.id, position: JSON.stringify({ scroll: Math.round(ratio * 1000) / 1000 }) })
    }, 700)
  }

  async function save(): Promise<void> {
    if (activeTopicId == null) return
    setError('')
    try {
      const s = await window.api.estudos.createSource({
        topicId: activeTopicId,
        nodeId: selectedNodeId,
        kind: adding === 'link' ? 'link' : 'text',
        title: title.trim() || (adding === 'link' ? url.trim() : content.trim().split('\n')[0].slice(0, 60)),
        content,
        url: adding === 'link' ? url : null,
        locator: locator || null
      })
      setAdding(null)
      setTitle('')
      setContent('')
      setUrl('')
      setLocator('')
      await load()
      setOpenId(s.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function startImport(): Promise<void> {
    if (activeTopicId == null) return
    const files = await pickTextFiles()
    if (!files.length) return
    const read = await Promise.all(
      files.map(async (f) => {
        const text = (await f.text()).replace(/\r\n/g, '\n')
        return { path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, content: text, hash: await sha256(text) }
      })
    )
    const preview = await window.api.estudos.previewImport(activeTopicId, read)
    setPending({
      items: preview.map((p, i) => ({ ...p, content: read[i].content, hash: read[i].hash, decision: p.status === 'new' ? 'create' : p.status === 'changed' ? 'update' : 'skip' }))
    })
  }

  async function applyImport(): Promise<void> {
    if (!pending || activeTopicId == null) return
    await window.api.estudos.applyImport(
      activeTopicId,
      selectedNodeId,
      pending.items.map((i) => ({ path: i.path, content: i.content, hash: i.hash, decision: i.decision, title: i.title }))
    )
    setPending(null)
    await load()
  }

  async function remove(s: SourceRow): Promise<void> {
    if (!window.confirm(t('est.excluirFonte', { titulo: s.title }))) return
    await window.api.estudos.deleteSource(s.id)
    if (openId === s.id) setOpenId(null)
    await load()
  }

  return (
    <div className="source-panel">
      <div className="source-toolbar">
        <select value={openId ?? ''} onChange={(e) => setOpenId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">{sources.length ? t('est.escolherFonte', { count: sources.length }) : t('est.semFontes')}</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.kind === 'link' ? '🔗 ' : s.kind === 'file' ? '📄 ' : '📝 '}
              {s.title}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={() => setAdding('text')}>{t('est.colarTexto')}</button>
        <button className="btn btn-secondary btn-sm" onClick={startImport}>{t('est.importarArquivo')}</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setAdding('link')}>{t('est.link')}</button>
      </div>

      {adding && (
        <div className="source-form">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('est.tituloOpcional')} />
          {adding === 'link' && <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" autoFocus />}
          <input value={locator} onChange={(e) => setLocator(e.target.value)} placeholder={t('est.localizadorPlaceholder')} />
          <textarea
            rows={adding === 'link' ? 3 : 8}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={adding === 'link' ? t('est.trechoOpcional') : t('est.colarAqui')}
            autoFocus={adding === 'text'}
          />
          {error && <div className="study-error">{error}</div>}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setAdding(null)}>{t('estudos.cancelar')}</button>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={adding === 'link' ? !url.trim() : !content.trim()}>{t('estudos.salvar')}</button>
          </div>
        </div>
      )}

      {pending && (
        <div className="source-form">
          <strong>{t('est.previaImportacao')}</strong>
          {pending.items.map((it, i) => (
            <div key={it.path} className="import-row">
              <span className={`import-status import-${it.status}`}>{t(`est.import.${it.status}`)}</span>
              <span className="import-path" title={it.path}>{it.path}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('est.caracteres', { count: it.chars })}</span>
              <select
                value={it.decision}
                onChange={(e) => {
                  const items = [...pending.items]
                  items[i] = { ...it, decision: e.target.value as 'create' | 'update' | 'skip' }
                  setPending({ items })
                }}
              >
                {it.status === 'new' && <option value="create">{t('est.importarComoFonte')}</option>}
                {it.status !== 'new' && <option value="update">{t('est.atualizarExistente')}</option>}
                <option value="skip">{t('est.ignorar')}</option>
              </select>
              <details className="import-preview">
                <summary>{t('est.verPrevia')}</summary>
                <pre>{it.content.slice(0, 1200)}</pre>
              </details>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setPending(null)}>{t('estudos.cancelar')}</button>
            <button className="btn btn-primary btn-sm" onClick={applyImport}>{t('est.importar')}</button>
          </div>
        </div>
      )}

      {open ? (
        <div className="source-viewer" ref={viewer} onScroll={onScroll}>
          <div className="source-head">
            <strong>{open.title}</strong>
            {open.locator && <span className="project-chip">📍 {open.locator}</span>}
            {open.url && (
              <a href={open.url} target="_blank" rel="noreferrer" onClick={(e) => { e.preventDefault(); window.api.app.openExternal(open.url!) }}>
                {t('est.abrirLink')}
              </a>
            )}
            <button className="btn btn-danger btn-sm" onClick={() => remove(open)} title={t('est.excluir')}>✕</button>
          </div>
          {open.content ? renderMarkdown(open.content) : <div className="empty-hint">{t('est.fonteSemTexto')}</div>}
        </div>
      ) : (
        !adding && !pending && <div className="empty-hint">{t('est.leituraVazia')}</div>
      )}
    </div>
  )
}
