import React, { useCallback, useEffect, useState } from 'react'
import type { MemoryCategory, MemoryFilter, MemoryPage, MemoryStatus, MemoryType, Sensitivity } from '../../../../shared/memory'
import { MEMORY_STATUSES, MEMORY_TYPES, SENSITIVITIES, SENSITIVITY_LABEL, STATUS_LABEL, TYPE_LABEL } from '../../../../shared/memory'
import { useMemoryStore } from '../store/memoryStore'
import { Empty, MemoryCard, Modal, errMsg, useMemoryRefresh } from './ui'
import { t as tr } from '../../../i18n'

const PAGE = 60

export function MemoriesTab({ onNew }: { onNew: () => void }): React.ReactElement {
  const { categories, categoryFilter, goCategory, open } = useMemoryStore()
  const [q, setQ] = useState('')
  const [type, setType] = useState<MemoryType | ''>('')
  const [status, setStatus] = useState<MemoryStatus | 'live' | 'all'>('live')
  const [sens, setSens] = useState<Sensitivity | ''>('')
  const [tag, setTag] = useState('')
  const [pinned, setPinned] = useState(false)
  const [sort, setSort] = useState<NonNullable<MemoryFilter['sort']>>('recent')
  const [page, setPage] = useState<MemoryPage>({ items: [], total: 0 })
  const [limit, setLimit] = useState(PAGE)
  const [managing, setManaging] = useState(false)

  const load = useCallback(() => {
    void window.api.memory
      .list({ q, categoryId: categoryFilter, type: type || null, status: status === 'live' ? null : status, sensitivity: sens || null, tag: tag || null, pinned, sort, limit })
      .then(setPage)
  }, [q, categoryFilter, type, status, sens, tag, pinned, sort, limit])
  useEffect(() => {
    const t = setTimeout(load, q ? 200 : 0)
    return () => clearTimeout(t)
  }, [load, q])
  useMemoryRefresh(load)

  const visible = categories.filter((c) => !c.archivedAt)
  const filtered = !!(q || type || sens || tag || pinned || status !== 'live')

  return (
    <div className="mem-layout">
      <nav className="mem-cats" aria-label={tr('memory.categorias')}>
        <button className={`mem-cat${categoryFilter == null ? ' active' : ''}`} onClick={() => goCategory(null)}>
          {tr('memory.todas')}
        </button>
        {visible.map((c) => (
          <button key={c.id} className={`mem-cat${categoryFilter === c.id ? ' active' : ''}`} onClick={() => goCategory(c.id)}>
            <span>{c.icon}</span>
            <span>{c.name}</span>
            <span className="n">{c.memoryCount || ''}</span>
          </button>
        ))}
        <button className="mem-cat" onClick={() => setManaging(true)} style={{ color: 'var(--accent)' }}>
          {tr('memory.gerenciarCategorias')}
        </button>
      </nav>

      <div>
        <div className="mem-toolbar">
          <input type="search" placeholder={tr('memory.buscarNoConteudoTituloOu')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tr('memory.buscarMemorias')} />
          <select value={type} onChange={(e) => setType(e.target.value as MemoryType | '')} aria-label={tr('memory.tipo')}>
            <option value="">{tr('memory.todosOsTipos')}</option>
            {MEMORY_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as MemoryStatus | 'live' | 'all')} aria-label={tr('memory.status')}>
            <option value="live">{tr('memory.emUso')}</option>
            {MEMORY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
            <option value="all">{tr('memory.todas2')}</option>
          </select>
          <select value={sens} onChange={(e) => setSens(e.target.value as Sensitivity | '')} aria-label={tr('memory.sensibilidade')}>
            <option value="">{tr('memory.qualquerSensibilidade')}</option>
            {SENSITIVITIES.map((s) => (
              <option key={s} value={s}>
                {SENSITIVITY_LABEL[s]}
              </option>
            ))}
          </select>
          <input style={{ width: 110 }} placeholder={tr('memory.tag')} value={tag} onChange={(e) => setTag(e.target.value.replace(/^#/, ''))} aria-label={tr('memory.tag2')} />
          <select value={sort} onChange={(e) => setSort(e.target.value as NonNullable<MemoryFilter['sort']>)} aria-label={tr('memory.ordenar')}>
            <option value="recent">{tr('memory.recentes')}</option>
            <option value="importance">{tr('memory.importancia')}</option>
            <option value="used">{tr('memory.maisUsadas')}</option>
            <option value="title">{tr('memory.aZ')}</option>
          </select>
          <label className="mem-row mem-sub" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> {tr('memory.fixadas')}
          </label>
        </div>
        <p className="mem-muted" style={{ margin: '0 0 8px' }}>
          {tr('memory.memoriaS', { total: page.total })}{filtered ? tr('memory.comEstesFiltros') : ''}
        </p>
        {page.items.length === 0 ? (
          filtered || categoryFilter != null ? (
            <Empty icon="🔎" title={tr('memory.nadaEncontrado')}>
              {tr('memory.ajusteABuscaOuOs')}
            </Empty>
          ) : (
            <Empty icon="🌱" title={tr('memory.nenhumaMemoriaAinda')}>
              {tr('memory.crieUmaColeUmTexto')}
              <div style={{ marginTop: 10 }}>
                <button className="btn btn-primary btn-sm" onClick={onNew}>
                  {tr('memory.novaMemoria')}
                </button>
              </div>
            </Empty>
          )
        ) : (
          <div className="mem-list">
            {page.items.map((m) => (
              <MemoryCard key={m.id} m={m} cats={categories} onOpen={open} />
            ))}
            {page.total > page.items.length && (
              <button className="btn btn-secondary btn-sm" onClick={() => setLimit((l) => l + PAGE)}>
                {tr('memory.carregarMais', { p0: page.total - page.items.length })}
              </button>
            )}
          </div>
        )}
      </div>
      {managing && <CategoryManager onClose={() => setManaging(false)} />}
    </div>
  )
}

function CategoryManager({ onClose }: { onClose: () => void }): React.ReactElement {
  const { categories, loadCategories } = useMemoryStore()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('')
  const [err, setErr] = useState('')
  const run = (fn: () => Promise<unknown>): void => {
    setErr('')
    fn().then(loadCategories, (e) => setErr(errMsg(e)))
  }
  const move = (c: MemoryCategory, dir: -1 | 1): void => {
    const ids = categories.map((x) => x.id)
    const i = ids.indexOf(c.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    run(() => window.api.memory.reorderCategories(ids))
  }
  return (
    <Modal title={tr('memory.categorias')} onClose={onClose}>
      <p className="mem-muted">{tr('memory.crieDominiosNovosSemMexer')}</p>
      <div className="mem-toolbar">
        <input style={{ width: 60 }} placeholder="🎵" value={icon} onChange={(e) => setIcon(e.target.value)} aria-label={tr('memory.icone')} />
        <input style={{ flex: 1 }} placeholder={tr('memory.novaCategoria')} value={name} onChange={(e) => setName(e.target.value)} aria-label={tr('memory.nome')} />
        <button
          className="btn btn-primary btn-sm"
          disabled={!name.trim()}
          onClick={() =>
            run(async () => {
              await window.api.memory.createCategory({ name, icon: icon || '•' })
              setName('')
              setIcon('')
            })
          }
        >
          {tr('memory.criar')}
        </button>
      </div>
      {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}
      <div className="mem-list">
        {categories.map((c, i) => (
          <div key={c.id} className="mem-row" style={{ opacity: c.archivedAt ? 0.55 : 1, fontSize: 13, borderBottom: '1px solid var(--border)', padding: '4px 0' }}>
            <span style={{ width: 24 }}>{c.icon}</span>
            <input
              defaultValue={c.name}
              style={{ flex: 1, minWidth: 120 }}
              onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && run(() => window.api.memory.updateCategory(c.id, { name: e.target.value }))}
              aria-label={tr('memory.nomeDe', { name: c.name })}
            />
            <select value={c.defaultSensitivity} onChange={(e) => run(() => window.api.memory.updateCategory(c.id, { defaultSensitivity: e.target.value as Sensitivity }))} aria-label={tr('memory.sensibilidadePadrao')}>
              {SENSITIVITIES.map((s) => (
                <option key={s} value={s}>
                  {SENSITIVITY_LABEL[s]}
                </option>
              ))}
            </select>
            <span className="mem-muted">{c.memoryCount ?? 0}</span>
            <button className="btn btn-secondary btn-sm" disabled={i === 0} onClick={() => move(c, -1)} aria-label={tr('memory.subir')}>
              ↑
            </button>
            <button className="btn btn-secondary btn-sm" disabled={i === categories.length - 1} onClick={() => move(c, 1)} aria-label={tr('memory.descer')}>
              ↓
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => run(() => window.api.memory.updateCategory(c.id, { archived: !c.archivedAt }))}>
              {c.archivedAt ? tr('memory.restaurar') : tr('memory.arquivar')}
            </button>
          </div>
        ))}
      </div>
    </Modal>
  )
}
