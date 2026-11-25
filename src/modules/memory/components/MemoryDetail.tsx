import React, { useCallback, useEffect, useState } from 'react'
import type { MemoryDetail, PersonalMemory, RelationKind } from '../../../../shared/memory'
import { LAYER_LABEL, ORIGIN_LABEL, RELATION_KINDS, RELATION_LABEL, RELIABILITY_LABEL, SENSITIVITY_LABEL, STABILITY_LABEL, STATUS_LABEL } from '../../../../shared/memory'
import { useMemoryStore } from '../store/memoryStore'
import { MemoryEditor } from './MemoryEditor'
import { CategoryLabel, Modal, SensChip, StatusChip, TypeChip, errMsg, fmtDate, useMemoryRefresh } from './ui'
import { t as tr } from '../../../i18n'

const CHANGE_LABEL: Record<string, string> = {
  create: tr('memory.criada'),
  update: tr('memory.editada'),
  confirm: tr('memory.confirmada'),
  pin: tr('memory.fixada'),
  unpin: tr('memory.desafixada'),
  'status:archived': tr('memory.arquivada'),
  'status:active': tr('memory.restaurada'),
  'status:outdated': tr('memory.marcadaComoDesatualizada'),
  'status:superseded': tr('memory.substituida'),
  'status:expired': tr('memory.expirou'),
  'status:unconfirmed': tr('memory.marcadaComoNaoConfirmada')
}

export function MemoryDetailModal({ id, onClose }: { id: number; onClose: () => void }): React.ReactElement {
  const cats = useMemoryStore((s) => s.categories)
  const open = useMemoryStore((s) => s.open)
  const [d, setD] = useState<MemoryDetail | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [err, setErr] = useState('')
  const [relating, setRelating] = useState(false)

  const load = useCallback(() => {
    window.api.memory.get(id).then(setD).catch((e) => setErr(errMsg(e)))
  }, [id])
  useEffect(load, [load])
  useMemoryRefresh(load)

  async function act(fn: () => Promise<unknown>): Promise<void> {
    setErr('')
    try {
      await fn()
      load()
    } catch (e) {
      setErr(errMsg(e))
    }
  }

  if (d === undefined) return <Modal title={tr('memory.carregando')} onClose={onClose}>{null}</Modal>
  if (d === null)
    return (
      <Modal title={tr('memory.memoriaNaoEncontrada')} onClose={onClose}>
        <p className="mem-sub">{tr('memory.elaPodeTerSidoExcluida')}</p>
      </Modal>
    )
  const m = d.memory
  const live = m.status === 'active' || m.status === 'unconfirmed' || m.status === 'outdated'

  return (
    <Modal title={<>{m.pinned && '📌 '}{m.title}</>} onClose={onClose} wide>
      <div className="mem-meta" style={{ marginTop: 8 }}>
        <CategoryLabel cats={cats} id={m.categoryId} />
        <TypeChip type={m.type} />
        <StatusChip status={m.status} />
        <SensChip s={m.effectiveSensitivity} />
        {m.tags.map((t) => (
          <span key={t} className="mem-chip tag">
            #{t}
          </span>
        ))}
      </div>
      <p style={{ fontSize: 15, lineHeight: 1.55, margin: '12px 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.content}</p>

      <div className="mem-sug-actions">
        <button className="btn btn-primary btn-sm" onClick={() => setEditing(true)}>
          {tr('memory.editar')}
        </button>
        {live && (
          <button className="btn btn-secondary btn-sm" onClick={() => act(() => window.api.memory.confirm(m.id))} title={tr('memory.continuaVerdadeira')}>
            {tr('memory.confirmar')}
          </button>
        )}
        <button className="btn btn-secondary btn-sm" onClick={() => act(() => window.api.memory.pin(m.id, !m.pinned))}>
          {m.pinned ? tr('memory.desafixar') : tr('memory.fixar')}
        </button>
        {live ? (
          <>
            {m.status !== 'outdated' && (
              <button className="btn btn-secondary btn-sm" onClick={() => act(() => window.api.memory.setStatus(m.id, 'outdated'))}>
                {tr('memory.desatualizada')}
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => act(() => window.api.memory.setStatus(m.id, 'archived'))}>
              {tr('memory.arquivar2')}
            </button>
          </>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => act(() => window.api.memory.setStatus(m.id, 'active'))}>
            {tr('memory.restaurar2')}
          </button>
        )}
        <button className="btn btn-secondary btn-sm" onClick={() => setRelating(true)}>
          {tr('memory.relacionar')}
        </button>
        <button
          className="btn btn-danger btn-sm"
          style={{ marginLeft: 'auto' }}
          onClick={() => {
            if (window.confirm(tr('memory.excluirDefinitivamenteSomeTambemO')))
              void window.api.memory.delete(m.id).then(onClose, (e) => setErr(errMsg(e)))
          }}
        >
          {tr('memory.excluir')}
        </button>
      </div>
      {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}

      <div className="mem-section">
        <h4>{tr('memory.rastreabilidade')}</h4>
        <dl className="mem-kv">
          <dt>{tr('memory.origem')}</dt>
          <dd>
            {ORIGIN_LABEL[m.origin] ?? m.origin}
            {m.originRef ? ` · ${m.originRef}` : ''}
          </dd>
          <dt>{tr('memory.confiabilidade')}</dt>
          <dd>{RELIABILITY_LABEL[m.reliability]}</dd>
          <dt>{tr('memory.confiancaDaExtracao')}</dt>
          <dd>{m.extractionConfidence == null ? tr('memory.manual') : tr('memory.doModeloNaoProvaQue', { p0: Math.round(m.extractionConfidence * 100) })}</dd>
          <dt>{tr('memory.confirmadaPorVoce')}</dt>
          <dd>{m.confirmedAt ? fmtDate(m.confirmedAt, true) : tr('memory.nao')}</dd>
          <dt>{tr('memory.importancia')}</dt>
          <dd>{'★'.repeat(m.importance)}{'☆'.repeat(5 - m.importance)}</dd>
          <dt>{tr('memory.estabilidade')}</dt>
          <dd>{STABILITY_LABEL[m.stability]}</dd>
          <dt>{tr('memory.camada')}</dt>
          <dd>{LAYER_LABEL[m.layer]}</dd>
          <dt>{tr('memory.sensibilidade')}</dt>
          <dd>
            {SENSITIVITY_LABEL[m.sensitivity]}
            {m.effectiveSensitivity !== m.sensitivity ? tr('memory.efetivaPelaCategoria', { p0: SENSITIVITY_LABEL[m.effectiveSensitivity] }) : ''}
          </dd>
          <dt>{tr('memory.escopo')}</dt>
          <dd>{m.scope}</dd>
          {m.occurredAt && (
            <>
              <dt>{tr('memory.aconteceuEm')}</dt>
              <dd>{fmtDate(m.occurredAt)}</dd>
            </>
          )}
          {(m.validFrom || m.validUntil) && (
            <>
              <dt>{tr('memory.validade')}</dt>
              <dd>
                {fmtDate(m.validFrom)} → {fmtDate(m.validUntil)}
              </dd>
            </>
          )}
          <dt>{tr('memory.registradaAtualizada')}</dt>
          <dd>
            {tr('memory.v', { p0: fmtDate(m.createdAt, true), p1: fmtDate(m.updatedAt, true), version: m.version })}
          </dd>
          <dt>{tr('memory.usoPorIasAutorizadas')}</dt>
          <dd>{m.useCount ? tr('memory.ultima', { useCount: m.useCount, p1: fmtDate(m.lastUsedAt, true) }) : tr('memory.nunca')}</dd>
          {m.supersededById && (
            <>
              <dt>{tr('memory.substituidaPor')}</dt>
              <dd>
                <button className="btn btn-secondary btn-sm" onClick={() => open(m.supersededById)}>
                  {tr('memory.verMemoria', { supersededById: m.supersededById })}
                </button>
              </dd>
            </>
          )}
        </dl>
      </div>

      <div className="mem-section">
        <h4>{tr('memory.evidencias', { count: d.evidence.length })}</h4>
        {d.evidence.length === 0 && <p className="mem-muted">{tr('memory.semEvidenciasRegistradas')}</p>}
        {d.evidence.map((e) => (
          <div key={e.id} className="mem-ev">
            “{e.excerpt}”
            <div className="mem-muted">
              {e.sourceKind}
              {e.sourceRef ? ` · ${e.sourceRef}` : ''} · {fmtDate(e.createdAt)}
            </div>
          </div>
        ))}
      </div>

      <div className="mem-section">
        <h4>{tr('memory.relacoes', { count: d.relations.length })}</h4>
        {d.relations.length === 0 && <p className="mem-muted">{tr('memory.nenhuma')}</p>}
        {d.relations.map((r) => (
          <div key={`${r.id}-${r.direction}`} className="mem-row" style={{ fontSize: 13, padding: '3px 0' }}>
            <span className={`mem-chip${r.kind === 'CONTRADICTS' ? ' danger' : ''}`}>{r.direction === 'out' ? RELATION_LABEL[r.kind] : `← ${RELATION_LABEL[r.kind]}`}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => open(r.otherId!)}>
              {r.otherTitle}
            </button>
            <button className="btn btn-secondary btn-sm" title={tr('memory.removerRelacao')} onClick={() => act(() => window.api.memory.removeRelation(r.id))}>
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="mem-section">
        <h4>{tr('memory.historico', { count: d.revisions.length })}</h4>
        {d.revisions.map((r) => (
          <div key={r.id} className="mem-rev">
            <strong>{CHANGE_LABEL[r.changeKind] ?? r.changeKind}</strong> · {fmtDate(r.createdAt, true)} · {r.actor === 'user' ? tr('memory.voce') : r.actor === 'agent' ? tr('memory.ia') : tr('memory.sistema')}
            {r.reason ? ` · ${r.reason}` : ''}
            {r.snapshot?.content && r.snapshot.content !== m.content && <div className="mem-muted">{tr('memory.antes', { content: r.snapshot.content })}</div>}
            {r.snapshot?.status && r.changeKind.startsWith('status:') && <div className="mem-muted">{tr('memory.statusAnterior')} {STATUS_LABEL[r.snapshot.status]}</div>}
          </div>
        ))}
      </div>

      {editing && <MemoryEditor memory={m} onClose={() => setEditing(false)} onSaved={load} />}
      {relating && <RelationPicker from={m} onClose={() => setRelating(false)} onDone={load} />}
    </Modal>
  )
}

function RelationPicker({ from, onClose, onDone }: { from: PersonalMemory; onClose: () => void; onDone: () => void }): React.ReactElement {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<RelationKind>('RELATED_TO')
  const [items, setItems] = useState<PersonalMemory[]>([])
  const [err, setErr] = useState('')
  useEffect(() => {
    const t = setTimeout(() => {
      window.api.memory.list({ q, limit: 20 }).then((p) => setItems(p.items.filter((m) => m.id !== from.id)))
    }, 200)
    return () => clearTimeout(t)
  }, [q, from.id])
  return (
    <Modal title={tr('memory.relacionarMemoria')} onClose={onClose}>
      <p className="mem-sub">“{from.title}”</p>
      <div className="mem-toolbar">
        <select value={kind} onChange={(e) => setKind(e.target.value as RelationKind)}>
          {RELATION_KINDS.map((k) => (
            <option key={k} value={k}>
              {RELATION_LABEL[k]}
            </option>
          ))}
        </select>
        <input type="search" autoFocus placeholder={tr('memory.buscarAOutraMemoria')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}
      <div className="mem-list">
        {items.map((m) => (
          <button
            key={m.id}
            className="mem-card"
            onClick={() =>
              window.api.memory.addRelation(from.id, m.id, kind).then(
                () => {
                  onDone()
                  onClose()
                },
                (e) => setErr(errMsg(e))
              )
            }
          >
            <div className="mem-card-title">{m.title}</div>
          </button>
        ))}
      </div>
    </Modal>
  )
}
