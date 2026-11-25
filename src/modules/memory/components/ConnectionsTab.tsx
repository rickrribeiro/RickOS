import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { PersonalMemory, RelationKind } from '../../../../shared/memory'
import { RELATION_LABEL } from '../../../../shared/memory'
import { useMemoryStore } from '../store/memoryStore'
import { Empty, useMemoryRefresh } from './ui'
import { t } from '../../../i18n'

interface Rel {
  id: number
  fromId: number
  toId: number
  kind: RelationKind
}

/**
 * Conexões: lista de memórias conectadas + grafo local (a memória escolhida e as vizinhas).
 * Grafo pequeno de propósito: legível e rápido com qualquer quantidade de memórias.
 */
export function ConnectionsTab(): React.ReactElement {
  const { categories, open } = useMemoryStore()
  const [mems, setMems] = useState<PersonalMemory[]>([])
  const [rels, setRels] = useState<Rel[]>([])
  const [catId, setCatId] = useState<number | ''>('')
  const [focus, setFocus] = useState<number | null>(null)
  const [only, setOnly] = useState<'' | 'consolidated' | 'conflicts'>('')

  const load = useCallback(() => {
    void window.api.memory.graph().then((g) => {
      setMems(g.memories)
      setRels(g.relations)
    })
  }, [])
  useEffect(load, [load])
  useMemoryRefresh(load)

  const byId = useMemo(() => new Map(mems.map((m) => [m.id, m])), [mems])
  const degree = useMemo(() => {
    const d = new Map<number, number>()
    for (const r of rels) {
      d.set(r.fromId, (d.get(r.fromId) ?? 0) + 1)
      d.set(r.toId, (d.get(r.toId) ?? 0) + 1)
    }
    return d
  }, [rels])
  const consolidated = new Set(rels.filter((r) => r.kind === 'DERIVED_FROM' || r.kind === 'SUPERSEDES').map((r) => r.fromId))
  const conflicted = new Set(rels.filter((r) => r.kind === 'CONTRADICTS').flatMap((r) => [r.fromId, r.toId]))
  const connected = mems
    .filter((m) => degree.has(m.id))
    .filter((m) => !catId || m.categoryId === catId)
    .filter((m) => (only === 'consolidated' ? consolidated.has(m.id) : only === 'conflicts' ? conflicted.has(m.id) : true))
    .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
  const center = focus ?? connected[0]?.id ?? null
  const neigh = rels.filter((r) => r.fromId === center || r.toId === center)

  const W = 560
  const H = 380
  const cx = W / 2
  const cy = H / 2
  const R = 140
  const nodes = neigh.map((r, i) => {
    const other = r.fromId === center ? r.toId : r.fromId
    const a = (i / Math.max(1, neigh.length)) * Math.PI * 2 - Math.PI / 2
    return { r, other, x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R }
  })
  const short = (s: string): string => (s.length > 26 ? `${s.slice(0, 24)}…` : s)

  if (!rels.length)
    return (
      <Empty icon="🕸" title={t('memory.nenhumaConexaoAinda')}>
        {t('memory.conexoesNascemDeConsolidacoesAprovadas')}
      </Empty>
    )

  return (
    <div className="mem-two">
      <div className="mem-panel" style={{ padding: 8 }}>
        {center != null && byId.get(center) ? (
          <svg className="mem-graph" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('memory.conexoesDe', { title: byId.get(center)!.title })}>
            {nodes.map((n) => (
              <line key={`l${n.r.id}`} x1={cx} y1={cy} x2={n.x} y2={n.y} className={n.r.kind}>
                <title>{RELATION_LABEL[n.r.kind]}</title>
              </line>
            ))}
            {nodes.map((n) => (
              <g key={`n${n.r.id}`} className="node" transform={`translate(${n.x},${n.y})`} onClick={() => setFocus(n.other)} tabIndex={0} role="button" aria-label={byId.get(n.other)?.title}>
                <circle r={9} />
                <text y={22} textAnchor="middle">
                  {short(byId.get(n.other)?.title ?? `#${n.other}`)}
                </text>
              </g>
            ))}
            <g className="node center" transform={`translate(${cx},${cy})`} onClick={() => open(center)} tabIndex={0} role="button">
              <circle r={13} />
              <text y={30} textAnchor="middle" style={{ fontWeight: 700, fill: 'var(--text-primary)' }}>
                {short(byId.get(center)!.title)}
              </text>
            </g>
          </svg>
        ) : (
          <p className="mem-muted">{t('memory.escolhaUmaMemoria')}</p>
        )}
        <div className="mem-meta" style={{ padding: '0 6px 6px' }}>
          {(['RELATED_TO', 'SUPPORTS', 'DERIVED_FROM', 'SUPERSEDES', 'CONTRADICTS', 'PART_OF'] as RelationKind[]).map((k) => (
            <span key={k} className={`mem-chip${k === 'CONTRADICTS' ? ' danger' : k === 'SUPERSEDES' ? ' warn' : k === 'DERIVED_FROM' || k === 'SUPPORTS' ? ' ok' : ''}`}>
              {RELATION_LABEL[k]}
            </span>
          ))}
        </div>
        {center != null && (
          <div style={{ padding: '0 6px 6px' }}>
            {neigh.map((r) => {
              const other = r.fromId === center ? r.toId : r.fromId
              return (
                <div key={r.id} className="mem-row" style={{ fontSize: 13, padding: '2px 0' }}>
                  <span className="mem-chip">{r.fromId === center ? RELATION_LABEL[r.kind] : `← ${RELATION_LABEL[r.kind]}`}</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => open(other)}>
                    {byId.get(other)?.title ?? `#${other}`}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <div className="mem-panel">
        <div className="mem-toolbar">
          <select value={catId} onChange={(e) => setCatId(e.target.value ? Number(e.target.value) : '')} aria-label={t('memory.categoria')}>
            <option value="">{t('memory.todasAsCategorias')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
          <div className="mem-seg">
            {[
              ['', t('memory.todas2')],
              ['consolidated', t('memory.consolidadas')],
              ['conflicts', t('memory.conflitos')]
            ].map(([k, l]) => (
              <button key={k} className={only === k ? 'active' : ''} onClick={() => setOnly(k as typeof only)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {connected.length === 0 && <p className="mem-muted">{t('memory.nadaComEssesFiltros')}</p>}
        {connected.slice(0, 200).map((m) => (
          <button key={m.id} className={`mem-cat${m.id === center ? ' active' : ''}`} style={{ width: '100%' }} onClick={() => setFocus(m.id)}>
            {consolidated.has(m.id) ? '🧩' : conflicted.has(m.id) ? '⚡' : '•'} {m.title}
            <span className="n">{degree.get(m.id)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
