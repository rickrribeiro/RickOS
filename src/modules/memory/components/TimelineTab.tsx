import React, { useCallback, useEffect, useState } from 'react'
import type { TimelineEvent } from '../api'
import { useMemoryStore } from '../store/memoryStore'
import { Empty, fmtDate, useMemoryRefresh } from './ui'

const KIND: Record<string, { label: string; cls: string }> = {
  create: { label: 'registrada', cls: 'k-create' },
  update: { label: 'atualizada', cls: 'k-update' },
  confirm: { label: 'confirmada', cls: 'k-confirm' },
  'status:archived': { label: 'arquivada', cls: 'k-archive' },
  'status:active': { label: 'restaurada', cls: 'k-create' },
  'status:superseded': { label: 'substituída', cls: 'k-superseded' },
  'status:outdated': { label: 'marcada como desatualizada', cls: 'k-outdated' },
  'status:expired': { label: 'expirou', cls: 'k-expired' },
  'status:unconfirmed': { label: 'não confirmada', cls: 'k-outdated' }
}

/** Evolução do conhecimento registrado. Data de registro ≠ data do fato (mostrada à parte). */
export function TimelineTab(): React.ReactElement {
  const { categories, open } = useMemoryStore()
  const [catId, setCatId] = useState<number | ''>('')
  const [kind, setKind] = useState('')
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const load = useCallback(() => void window.api.memory.timeline({ categoryId: catId || null, limit: 500 }).then(setEvents), [catId])
  useEffect(load, [load])
  useMemoryRefresh(load)

  const list = kind ? events.filter((e) => (kind === 'status' ? e.kind.startsWith('status:') : e.kind === kind)) : events
  const days = new Map<string, TimelineEvent[]>()
  for (const e of list) {
    const d = e.at.slice(0, 10)
    days.set(d, [...(days.get(d) ?? []), e])
  }

  return (
    <div>
      <div className="mem-toolbar">
        <select value={catId} onChange={(e) => setCatId(e.target.value ? Number(e.target.value) : '')} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        <div className="mem-seg" role="group" aria-label="Tipo de evento">
          {[
            ['', 'Tudo'],
            ['create', 'Registros'],
            ['confirm', 'Confirmações'],
            ['update', 'Mudanças'],
            ['status', 'Substituições/arquivos']
          ].map(([k, l]) => (
            <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <p className="mem-muted">
        Quando cada conhecimento foi registrado, confirmado ou substituído aqui. Uma mudança no registro não significa necessariamente que você mudou.
      </p>
      {list.length === 0 ? (
        <Empty icon="🕰" title="Nada na linha do tempo ainda" />
      ) : (
        <div className="mem-tl">
          {[...days.entries()].map(([d, evs]) => (
            <React.Fragment key={d}>
              <div className="mem-tl-day">{fmtDate(d)}</div>
              {evs.map((e, i) => {
                const k = KIND[e.kind] ?? { label: e.kind, cls: '' }
                const cat = categories.find((c) => c.id === e.categoryId)
                return (
                  <div key={`${e.memoryId}-${i}`} className={`mem-tl-item ${k.cls}`}>
                    <button onClick={() => open(e.memoryId)}>{e.title}</button> <span className="mem-muted">{k.label}</span>
                    {cat && <span className="mem-chip" style={{ marginLeft: 6 }}>{cat.icon} {cat.name}</span>}
                    {e.occurredAt && <span className="mem-chip accent" style={{ marginLeft: 6 }}>fato de {fmtDate(e.occurredAt)}</span>}
                    {e.reason && <div className="mem-muted">{e.reason}</div>}
                  </div>
                )
              })}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
