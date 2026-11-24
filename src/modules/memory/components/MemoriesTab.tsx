import React, { useCallback, useEffect, useState } from 'react'
import type { MemoryCategory, MemoryFilter, MemoryPage, MemoryStatus, MemoryType, Sensitivity } from '../../../../shared/memory'
import { MEMORY_STATUSES, MEMORY_TYPES, SENSITIVITIES, SENSITIVITY_LABEL, STATUS_LABEL, TYPE_LABEL } from '../../../../shared/memory'
import { useMemoryStore } from '../store/memoryStore'
import { Empty, MemoryCard, Modal, errMsg, useMemoryRefresh } from './ui'

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
      <nav className="mem-cats" aria-label="Categorias">
        <button className={`mem-cat${categoryFilter == null ? ' active' : ''}`} onClick={() => goCategory(null)}>
          🧬 Todas
        </button>
        {visible.map((c) => (
          <button key={c.id} className={`mem-cat${categoryFilter === c.id ? ' active' : ''}`} onClick={() => goCategory(c.id)}>
            <span>{c.icon}</span>
            <span>{c.name}</span>
            <span className="n">{c.memoryCount || ''}</span>
          </button>
        ))}
        <button className="mem-cat" onClick={() => setManaging(true)} style={{ color: 'var(--accent)' }}>
          ⚙︎ Gerenciar categorias
        </button>
      </nav>

      <div>
        <div className="mem-toolbar">
          <input type="search" placeholder="Buscar no conteúdo, título ou tags…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar memórias" />
          <select value={type} onChange={(e) => setType(e.target.value as MemoryType | '')} aria-label="Tipo">
            <option value="">Todos os tipos</option>
            {MEMORY_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as MemoryStatus | 'live' | 'all')} aria-label="Status">
            <option value="live">Em uso</option>
            {MEMORY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
            <option value="all">Todas</option>
          </select>
          <select value={sens} onChange={(e) => setSens(e.target.value as Sensitivity | '')} aria-label="Sensibilidade">
            <option value="">Qualquer sensibilidade</option>
            {SENSITIVITIES.map((s) => (
              <option key={s} value={s}>
                {SENSITIVITY_LABEL[s]}
              </option>
            ))}
          </select>
          <input style={{ width: 110 }} placeholder="#tag" value={tag} onChange={(e) => setTag(e.target.value.replace(/^#/, ''))} aria-label="Tag" />
          <select value={sort} onChange={(e) => setSort(e.target.value as NonNullable<MemoryFilter['sort']>)} aria-label="Ordenar">
            <option value="recent">Recentes</option>
            <option value="importance">Importância</option>
            <option value="used">Mais usadas</option>
            <option value="title">A–Z</option>
          </select>
          <label className="mem-row mem-sub" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> 📌 fixadas
          </label>
        </div>
        <p className="mem-muted" style={{ margin: '0 0 8px' }}>
          {page.total} memória(s){filtered ? ' com estes filtros' : ''}
        </p>
        {page.items.length === 0 ? (
          filtered || categoryFilter != null ? (
            <Empty icon="🔎" title="Nada encontrado">
              Ajuste a busca ou os filtros.
            </Empty>
          ) : (
            <Empty icon="🌱" title="Nenhuma memória ainda">
              Crie uma, cole um texto sobre você ou migre a Base de Conhecimento antiga (aba Inbox).
              <div style={{ marginTop: 10 }}>
                <button className="btn btn-primary btn-sm" onClick={onNew}>
                  + Nova memória
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
                Carregar mais ({page.total - page.items.length})
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
    <Modal title="Categorias" onClose={onClose}>
      <p className="mem-muted">Crie domínios novos sem mexer em código. Arquivar esconde a categoria; as memórias continuam lá.</p>
      <div className="mem-toolbar">
        <input style={{ width: 60 }} placeholder="🎵" value={icon} onChange={(e) => setIcon(e.target.value)} aria-label="Ícone" />
        <input style={{ flex: 1 }} placeholder="Nova categoria" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome" />
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
          Criar
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
              aria-label={`Nome de ${c.name}`}
            />
            <select value={c.defaultSensitivity} onChange={(e) => run(() => window.api.memory.updateCategory(c.id, { defaultSensitivity: e.target.value as Sensitivity }))} aria-label="Sensibilidade padrão">
              {SENSITIVITIES.map((s) => (
                <option key={s} value={s}>
                  {SENSITIVITY_LABEL[s]}
                </option>
              ))}
            </select>
            <span className="mem-muted">{c.memoryCount ?? 0}</span>
            <button className="btn btn-secondary btn-sm" disabled={i === 0} onClick={() => move(c, -1)} aria-label="Subir">
              ↑
            </button>
            <button className="btn btn-secondary btn-sm" disabled={i === categories.length - 1} onClick={() => move(c, 1)} aria-label="Descer">
              ↓
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => run(() => window.api.memory.updateCategory(c.id, { archived: !c.archivedAt }))}>
              {c.archivedAt ? 'Restaurar' : 'Arquivar'}
            </button>
          </div>
        ))}
      </div>
    </Modal>
  )
}
