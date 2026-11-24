import React, { useState } from 'react'
import type { MemoryInput, MemoryLayer, MemoryType, PersonalMemory, Sensitivity, Stability } from '../../../../shared/memory'
import { LAYER_LABEL, MEMORY_LAYERS, MEMORY_TYPES, SENSITIVITIES, SENSITIVITY_LABEL, STABILITIES, STABILITY_LABEL, TYPE_LABEL, defaultLayer } from '../../../../shared/memory'
import { useMemoryStore } from '../store/memoryStore'
import { Modal, errMsg } from './ui'

/** Criação/edição manual. Memória manual nasce confirmada e "declarada por mim". */
export function MemoryEditor({ memory, onClose, onSaved }: { memory?: PersonalMemory; onClose: () => void; onSaved?: (m: PersonalMemory) => void }): React.ReactElement {
  const cats = useMemoryStore((s) => s.categories).filter((c) => !c.archivedAt || c.id === memory?.categoryId)
  const [f, setF] = useState<Required<Pick<MemoryInput, 'content'>> & MemoryInput>({
    title: memory?.title ?? '',
    content: memory?.content ?? '',
    categoryId: memory?.categoryId ?? null,
    type: memory?.type ?? 'FACT',
    layer: memory?.layer ?? 'semantic',
    tags: memory?.tags ?? [],
    importance: memory?.importance ?? 3,
    stability: memory?.stability ?? 'stable',
    sensitivity: memory?.sensitivity ?? 'NORMAL',
    pinned: memory?.pinned ?? false,
    occurredAt: memory?.occurredAt ?? null,
    validUntil: memory?.validUntil ?? null,
    scope: memory?.scope ?? 'geral'
  })
  const [tags, setTags] = useState((memory?.tags ?? []).join(', '))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof MemoryInput>(k: K, v: MemoryInput[K]): void => setF((p) => ({ ...p, [k]: v }))
  const cat = cats.find((c) => c.id === f.categoryId)

  async function save(): Promise<void> {
    setBusy(true)
    setErr('')
    try {
      const input: MemoryInput = { ...f, tags: tags.split(',').map((t) => t.trim()).filter(Boolean), occurredAt: f.occurredAt || null, validUntil: f.validUntil || null }
      const m = memory ? await window.api.memory.update(memory.id, input, memory.version) : await window.api.memory.create(input)
      onSaved?.(m)
      onClose()
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={memory ? 'Editar memória' : 'Nova memória'} onClose={onClose}>
      <p className="mem-muted" style={{ margin: '6px 0 10px' }}>
        Uma memória = uma ideia. Ex.: “Seoul é minha cidade favorita.”, “Prefiro hospedagens econômicas.”
      </p>
      <div className="mem-form">
        <label className="full">
          Conteúdo *
          <textarea autoFocus value={f.content} onChange={(e) => set('content', e.target.value)} maxLength={2000} placeholder="Escreva em 1ª pessoa…" />
        </label>
        <label className="full">
          Título (opcional)
          <input value={f.title ?? ''} onChange={(e) => set('title', e.target.value)} maxLength={140} placeholder="Gerado do conteúdo se vazio" />
        </label>
        <label>
          Categoria
          <select value={f.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value ? Number(e.target.value) : null)}>
            <option value="">Sem categoria</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select
            value={f.type}
            onChange={(e) => {
              const t = e.target.value as MemoryType
              setF((p) => ({ ...p, type: t, layer: defaultLayer(t) }))
            }}
          >
            {MEMORY_TYPES.filter((t) => t !== 'INFERENCE' || f.type === 'INFERENCE').map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Camada
          <select value={f.layer} onChange={(e) => set('layer', e.target.value as MemoryLayer)}>
            {MEMORY_LAYERS.map((l) => (
              <option key={l} value={l}>
                {LAYER_LABEL[l]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Estabilidade
          <select value={f.stability} onChange={(e) => set('stability', e.target.value as Stability)}>
            {STABILITIES.map((s) => (
              <option key={s} value={s}>
                {STABILITY_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Importância ({f.importance})
          <input type="range" min={1} max={5} value={f.importance} onChange={(e) => set('importance', Number(e.target.value))} />
        </label>
        <label>
          Sensibilidade
          <select value={f.sensitivity} onChange={(e) => set('sensitivity', e.target.value as Sensitivity)}>
            {SENSITIVITIES.map((s) => (
              <option key={s} value={s}>
                {SENSITIVITY_LABEL[s]}
              </option>
            ))}
          </select>
          {cat && cat.defaultSensitivity !== 'NORMAL' && <span className="mem-muted">A categoria já é {SENSITIVITY_LABEL[cat.defaultSensitivity].toLowerCase()}.</span>}
        </label>
        <label>
          Aconteceu em (opcional)
          <input type="date" value={f.occurredAt?.slice(0, 10) ?? ''} onChange={(e) => set('occurredAt', e.target.value || null)} />
        </label>
        <label>
          Válida até (opcional)
          <input type="date" value={f.validUntil?.slice(0, 10) ?? ''} onChange={(e) => set('validUntil', e.target.value || null)} />
        </label>
        <label>
          Tags (vírgula)
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ex.: coreia, cidades" />
        </label>
        <label>
          Escopo
          <input value={f.scope ?? ''} onChange={(e) => set('scope', e.target.value)} placeholder="geral, trabalho, viagens…" />
        </label>
        <label className="full mem-switch" style={{ flexDirection: 'row' }}>
          <input type="checkbox" checked={!!f.pinned} onChange={(e) => set('pinned', e.target.checked)} />
          <span>
            📌 Fixar como essencial
            <small>Memórias fixadas são consideradas “core” — mas só chegam a funcionalidades autorizadas para a categoria delas.</small>
          </span>
        </label>
      </div>
      {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={busy || !f.content.trim()} onClick={save}>
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </Modal>
  )
}
