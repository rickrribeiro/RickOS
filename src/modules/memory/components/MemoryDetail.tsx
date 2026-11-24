import React, { useCallback, useEffect, useState } from 'react'
import type { MemoryDetail, PersonalMemory, RelationKind } from '../../../../shared/memory'
import { LAYER_LABEL, ORIGIN_LABEL, RELATION_KINDS, RELATION_LABEL, RELIABILITY_LABEL, SENSITIVITY_LABEL, STABILITY_LABEL, STATUS_LABEL } from '../../../../shared/memory'
import { useMemoryStore } from '../store/memoryStore'
import { MemoryEditor } from './MemoryEditor'
import { CategoryLabel, Modal, SensChip, StatusChip, TypeChip, errMsg, fmtDate, useMemoryRefresh } from './ui'

const CHANGE_LABEL: Record<string, string> = {
  create: 'Criada',
  update: 'Editada',
  confirm: 'Confirmada',
  pin: 'Fixada',
  unpin: 'Desafixada',
  'status:archived': 'Arquivada',
  'status:active': 'Restaurada',
  'status:outdated': 'Marcada como desatualizada',
  'status:superseded': 'Substituída',
  'status:expired': 'Expirou',
  'status:unconfirmed': 'Marcada como não confirmada'
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

  if (d === undefined) return <Modal title="Carregando…" onClose={onClose}>{null}</Modal>
  if (d === null)
    return (
      <Modal title="Memória não encontrada" onClose={onClose}>
        <p className="mem-sub">Ela pode ter sido excluída.</p>
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
          ✏️ Editar
        </button>
        {live && (
          <button className="btn btn-secondary btn-sm" onClick={() => act(() => window.api.memory.confirm(m.id))} title="Continua verdadeira">
            ✓ Confirmar
          </button>
        )}
        <button className="btn btn-secondary btn-sm" onClick={() => act(() => window.api.memory.pin(m.id, !m.pinned))}>
          {m.pinned ? 'Desafixar' : '📌 Fixar'}
        </button>
        {live ? (
          <>
            {m.status !== 'outdated' && (
              <button className="btn btn-secondary btn-sm" onClick={() => act(() => window.api.memory.setStatus(m.id, 'outdated'))}>
                Desatualizada
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => act(() => window.api.memory.setStatus(m.id, 'archived'))}>
              🗄 Arquivar
            </button>
          </>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => act(() => window.api.memory.setStatus(m.id, 'active'))}>
            ↩︎ Restaurar
          </button>
        )}
        <button className="btn btn-secondary btn-sm" onClick={() => setRelating(true)}>
          🔗 Relacionar
        </button>
        <button
          className="btn btn-danger btn-sm"
          style={{ marginLeft: 'auto' }}
          onClick={() => {
            if (window.confirm('Excluir DEFINITIVAMENTE? Some também o histórico, as evidências e as relações. Para guardar sem usar, prefira Arquivar.'))
              void window.api.memory.delete(m.id).then(onClose, (e) => setErr(errMsg(e)))
          }}
        >
          Excluir
        </button>
      </div>
      {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}

      <div className="mem-section">
        <h4>Rastreabilidade</h4>
        <dl className="mem-kv">
          <dt>Origem</dt>
          <dd>
            {ORIGIN_LABEL[m.origin] ?? m.origin}
            {m.originRef ? ` · ${m.originRef}` : ''}
          </dd>
          <dt>Confiabilidade</dt>
          <dd>{RELIABILITY_LABEL[m.reliability]}</dd>
          <dt>Confiança da extração</dt>
          <dd>{m.extractionConfidence == null ? '— (manual)' : `${Math.round(m.extractionConfidence * 100)}% · do modelo, não prova que é verdade`}</dd>
          <dt>Confirmada por você</dt>
          <dd>{m.confirmedAt ? fmtDate(m.confirmedAt, true) : 'não'}</dd>
          <dt>Importância</dt>
          <dd>{'★'.repeat(m.importance)}{'☆'.repeat(5 - m.importance)}</dd>
          <dt>Estabilidade</dt>
          <dd>{STABILITY_LABEL[m.stability]}</dd>
          <dt>Camada</dt>
          <dd>{LAYER_LABEL[m.layer]}</dd>
          <dt>Sensibilidade</dt>
          <dd>
            {SENSITIVITY_LABEL[m.sensitivity]}
            {m.effectiveSensitivity !== m.sensitivity ? ` (efetiva: ${SENSITIVITY_LABEL[m.effectiveSensitivity]}, pela categoria)` : ''}
          </dd>
          <dt>Escopo</dt>
          <dd>{m.scope}</dd>
          {m.occurredAt && (
            <>
              <dt>Aconteceu em</dt>
              <dd>{fmtDate(m.occurredAt)}</dd>
            </>
          )}
          {(m.validFrom || m.validUntil) && (
            <>
              <dt>Validade</dt>
              <dd>
                {fmtDate(m.validFrom)} → {fmtDate(m.validUntil)}
              </dd>
            </>
          )}
          <dt>Registrada / atualizada</dt>
          <dd>
            {fmtDate(m.createdAt, true)} · {fmtDate(m.updatedAt, true)} (v{m.version})
          </dd>
          <dt>Uso por IAs autorizadas</dt>
          <dd>{m.useCount ? `${m.useCount}× · última ${fmtDate(m.lastUsedAt, true)}` : 'nunca'}</dd>
          {m.supersededById && (
            <>
              <dt>Substituída por</dt>
              <dd>
                <button className="btn btn-secondary btn-sm" onClick={() => open(m.supersededById)}>
                  ver memória #{m.supersededById}
                </button>
              </dd>
            </>
          )}
        </dl>
      </div>

      <div className="mem-section">
        <h4>Evidências ({d.evidence.length})</h4>
        {d.evidence.length === 0 && <p className="mem-muted">Sem evidências registradas.</p>}
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
        <h4>Relações ({d.relations.length})</h4>
        {d.relations.length === 0 && <p className="mem-muted">Nenhuma.</p>}
        {d.relations.map((r) => (
          <div key={`${r.id}-${r.direction}`} className="mem-row" style={{ fontSize: 13, padding: '3px 0' }}>
            <span className={`mem-chip${r.kind === 'CONTRADICTS' ? ' danger' : ''}`}>{r.direction === 'out' ? RELATION_LABEL[r.kind] : `← ${RELATION_LABEL[r.kind]}`}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => open(r.otherId!)}>
              {r.otherTitle}
            </button>
            <button className="btn btn-secondary btn-sm" title="Remover relação" onClick={() => act(() => window.api.memory.removeRelation(r.id))}>
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="mem-section">
        <h4>Histórico ({d.revisions.length})</h4>
        {d.revisions.map((r) => (
          <div key={r.id} className="mem-rev">
            <strong>{CHANGE_LABEL[r.changeKind] ?? r.changeKind}</strong> · {fmtDate(r.createdAt, true)} · {r.actor === 'user' ? 'você' : r.actor === 'agent' ? 'IA' : 'sistema'}
            {r.reason ? ` · ${r.reason}` : ''}
            {r.snapshot?.content && r.snapshot.content !== m.content && <div className="mem-muted">antes: “{r.snapshot.content}”</div>}
            {r.snapshot?.status && r.changeKind.startsWith('status:') && <div className="mem-muted">status anterior: {STATUS_LABEL[r.snapshot.status]}</div>}
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
    <Modal title="Relacionar memória" onClose={onClose}>
      <p className="mem-sub">“{from.title}”</p>
      <div className="mem-toolbar">
        <select value={kind} onChange={(e) => setKind(e.target.value as RelationKind)}>
          {RELATION_KINDS.map((k) => (
            <option key={k} value={k}>
              {RELATION_LABEL[k]}
            </option>
          ))}
        </select>
        <input type="search" autoFocus placeholder="Buscar a outra memória…" value={q} onChange={(e) => setQ(e.target.value)} />
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
