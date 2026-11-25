import React, { useEffect, useMemo, useState } from 'react'
import { Link } from '../../../types'
import { useLinkStore, normalizeUrl, parseTags } from '../store/linkStore'
import { timeAgo } from '../../../utils/dates'
import { t as tr, getLocale } from '../../../i18n'

/** Chip editor: click a chip to remove, type + Enter/comma to add. */
function TagEditor({ tags, setTags }: { tags: string[]; setTags: (t: string[]) => void }): React.ReactElement {
  const [draft, setDraft] = useState('')
  function add(): void {
    const t = draft.trim()
    if (t && !tags.includes(t)) setTags([...tags, t])
    setDraft('')
  }
  return (
    <div className="tag-input" style={{ flex: 1, minWidth: 180 }}>
      {tags.map((t) => (
        <span
          key={t}
          className="project-chip"
          style={{ cursor: 'pointer' }}
          onClick={() => setTags(tags.filter((x) => x !== t))}
          title={tr('misc.removerTag')}
        >
          {t} ✕
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ',') && (e.preventDefault(), add())}
        placeholder={tr('misc.tagEnter')}
        style={{ flex: 1, minWidth: 100, border: 'none', background: 'transparent', padding: 4 }}
      />
    </div>
  )
}

function LinkEditor({ link, onClose }: { link: Link; onClose: () => void }): React.ReactElement {
  const { update } = useLinkStore()
  const [title, setTitle] = useState(link.title)
  const [url, setUrl] = useState(link.url)
  const [tags, setTags] = useState<string[]>(parseTags(link.tags))

  async function save(): Promise<void> {
    if (!title.trim() || !url.trim()) return
    await update(link.id, title.trim(), url.trim(), tags)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 380 }}>
        <h2>{tr('misc.editarLink')}</h2>
        <div className="editor-field">
          <label>{tr('misc.titulo')}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="editor-field">
          <label>{tr('misc.url')}</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="editor-field">
          <label>{tr('misc.tags')}</label>
          <TagEditor tags={tags} setTags={setTags} />
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>{tr('misc.cancelar')}</button>
          <button className="btn btn-primary btn-sm" onClick={save}>{tr('misc.salvar')}</button>
        </div>
      </div>
    </div>
  )
}

export function LinksPage(): React.ReactElement {
  const { links, refresh, create, remove, setChecked, markOpened } = useLinkStore()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [newTags, setNewTags] = useState<string[]>([])
  const [tagFilter, setTagFilter] = useState<string>('all')
  const [editing, setEditing] = useState<Link | null>(null)

  useEffect(() => {
    refresh()
  }, [])

  const allTags = useMemo(
    () => Array.from(new Set(links.flatMap((l) => parseTags(l.tags)))).sort((a, b) => a.localeCompare(b)),
    [links]
  )

  const visible = tagFilter === 'all' ? links : links.filter((l) => parseTags(l.tags).includes(tagFilter))
  const checkedCount = links.filter((l) => l.checked === 1).length
  const tagCount = tagFilter === 'all' ? 0 : links.filter((l) => parseTags(l.tags).includes(tagFilter)).length

  async function handleAdd(): Promise<void> {
    if (!title.trim() || !url.trim()) return
    await create(title.trim(), url.trim(), newTags)
    setTitle('')
    setUrl('')
    setNewTags([])
  }

  function open(l: Link): void {
    window.api.app.openExternal(normalizeUrl(l.url))
    markOpened(l.id)
  }

  function openAllChecked(): void {
    links.filter((l) => l.checked === 1).forEach(open)
  }

  function openByTag(): void {
    if (tagFilter === 'all') return
    links.filter((l) => parseTags(l.tags).includes(tagFilter)).forEach(open)
  }

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{tr('misc.links')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {tr('misc.linksMarcados', { count: links.length, checkedCount })}
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAllChecked} disabled={checkedCount === 0}>
          {tr('misc.abrirMarcados', { checkedCount })}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tr('misc.tag')}</span>
        <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
          <option value="all">{tr('misc.todas')}</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          className="btn btn-secondary btn-sm"
          onClick={openByTag}
          disabled={tagFilter === 'all' || tagCount === 0}
          title={tr('misc.abrirTodosOsLinksDesta')}
        >
          {tr('misc.abrirPorTag', { tagCount })}
        </button>
      </div>

      <div className="quick-add-row" style={{ flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder={tr('misc.titulo')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ flex: 1, minWidth: 140 }}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <input
          type="text"
          placeholder={tr('misc.urlExGithubCom')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{ flex: 1, minWidth: 140 }}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <TagEditor tags={newTags} setTags={setNewTags} />
        <button className="btn btn-primary" onClick={handleAdd}>
          {tr('misc.adicionar')}
        </button>
      </div>

      <div className="list-stack">
        {visible.length === 0 && (
          <div className="empty-hint">{links.length === 0 ? tr('misc.nenhumLinkAdicioneAcima') : tr('misc.nenhumLinkComEssaTag')}</div>
        )}
        {visible.map((l) => {
          const tags = parseTags(l.tags)
          return (
            <div key={l.id} className="list-row">
              <input
                type="checkbox"
                checked={l.checked === 1}
                onChange={(e) => setChecked(l.id, e.target.checked)}
                title={tr('misc.incluirEmAbrirMarcados')}
              />
              <button className="link-title" onClick={() => open(l)} title={tr('misc.abrir', { url: l.url })}>
                {l.title}
              </button>
              {tags.map((t) => (
                <span
                  key={t}
                  className="project-chip"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setTagFilter(t)}
                  title={tr('misc.filtrarPor', { t })}
                >
                  {t}
                </span>
              ))}
              <span className="link-url">{l.url}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }} title={l.lastOpenedAt ? tr('misc.abertoEm', { p0: new Date(l.lastOpenedAt).toLocaleString(getLocale()) }) : tr('misc.nuncaAbertoPorAqui')}>
                {l.lastOpenedAt ? tr('misc.abertoHa', { p0: timeAgo(l.lastOpenedAt) }) : tr('misc.nuncaAberto')}
              </span>
              <div className="list-row-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => open(l)}>{tr('misc.abrir2')}</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(l)}>{tr('misc.editar')}</button>
                <button className="btn btn-danger btn-sm" onClick={() => remove(l.id)}>✕</button>
              </div>
            </div>
          )
        })}
      </div>

      {editing && <LinkEditor link={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
