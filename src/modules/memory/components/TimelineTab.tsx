import React, { useCallback, useEffect, useState } from 'react'
import type { TimelineEvent } from '../api'
import { useMemoryStore } from '../store/memoryStore'
import { Empty, fmtDate, useMemoryRefresh } from './ui'
import { t } from '../../../i18n'

const KIND: Record<string, { label: string; cls: string }> = {
  create: { label: t('memory.registrada'), cls: 'k-create' },
  update: { label: t('memory.atualizada'), cls: 'k-update' },
  confirm: { label: t('memory.confirmada2'), cls: 'k-confirm' },
  'status:archived': { label: t('memory.arquivada2'), cls: 'k-archive' },
  'status:active': { label: t('memory.restaurada2'), cls: 'k-create' },
  'status:superseded': { label: t('memory.substituida2'), cls: 'k-superseded' },
  'status:outdated': { label: t('memory.marcadaComoDesatualizada2'), cls: 'k-outdated' },
  'status:expired': { label: t('memory.expirou2'), cls: 'k-expired' },
  'status:unconfirmed': { label: t('memory.naoConfirmada'), cls: 'k-outdated' }
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
        <select value={catId} onChange={(e) => setCatId(e.target.value ? Number(e.target.value) : '')} aria-label={t('memory.categoria')}>
          <option value="">{t('memory.todasAsCategorias')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        <div className="mem-seg" role="group" aria-label={t('memory.tipoDeEvento')}>
          {[
            ['', t('memory.tudo')],
            ['create', t('memory.registros')],
            ['confirm', t('memory.timeline.confirm')],
            ['update', t('memory.timeline.update')],
            ['status', t('memory.timeline.status')]
          ].map(([k, l]) => (
            <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <p className="mem-muted">
        {t('memory.quandoCadaConhecimentoFoiRegistrado')}
      </p>
      {list.length === 0 ? (
        <Empty icon="🕰" title={t('memory.nadaNaLinhaDoTempo')} />
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
                    {e.occurredAt && <span className="mem-chip accent" style={{ marginLeft: 6 }}>{t('memory.fatoDe')} {fmtDate(e.occurredAt)}</span>}
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
