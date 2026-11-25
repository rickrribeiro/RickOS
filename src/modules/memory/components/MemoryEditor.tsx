import React, { useState } from 'react'
import type { MemoryInput, MemoryLayer, MemoryType, PersonalMemory, Sensitivity, Stability } from '../../../../shared/memory'
import { LAYER_LABEL, MEMORY_LAYERS, MEMORY_TYPES, SENSITIVITIES, SENSITIVITY_LABEL, STABILITIES, STABILITY_LABEL, TYPE_LABEL, defaultLayer } from '../../../../shared/memory'
import { useMemoryStore } from '../store/memoryStore'
import { Modal, errMsg } from './ui'
import { t as tr } from '../../../i18n'

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
    <Modal title={memory ? tr('memory.editarMemoria') : tr('memory.novaMemoria2')} onClose={onClose}>
      <p className="mem-muted" style={{ margin: '6px 0 10px' }}>
        {tr('memory.umaMemoriaUmaIdeiaEx')}
      </p>
      <div className="mem-form">
        <label className="full">
          {tr('memory.conteudo2')}
          <textarea autoFocus value={f.content} onChange={(e) => set('content', e.target.value)} maxLength={2000} placeholder={tr('memory.escrevaEm1Pessoa')} />
        </label>
        <label className="full">
          {tr('memory.tituloOpcional')}
          <input value={f.title ?? ''} onChange={(e) => set('title', e.target.value)} maxLength={140} placeholder={tr('memory.geradoDoConteudoSeVazio')} />
        </label>
        <label>
          {tr('memory.categoria')}
          <select value={f.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value ? Number(e.target.value) : null)}>
            <option value="">{tr('memory.semCategoria')}</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr('memory.tipo')}
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
          {tr('memory.camada')}
          <select value={f.layer} onChange={(e) => set('layer', e.target.value as MemoryLayer)}>
            {MEMORY_LAYERS.map((l) => (
              <option key={l} value={l}>
                {LAYER_LABEL[l]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr('memory.estabilidade')}
          <select value={f.stability} onChange={(e) => set('stability', e.target.value as Stability)}>
            {STABILITIES.map((s) => (
              <option key={s} value={s}>
                {STABILITY_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr('memory.importancia3')}{f.importance})
          <input type="range" min={1} max={5} value={f.importance} onChange={(e) => set('importance', Number(e.target.value))} />
        </label>
        <label>
          {tr('memory.sensibilidade')}
          <select value={f.sensitivity} onChange={(e) => set('sensitivity', e.target.value as Sensitivity)}>
            {SENSITIVITIES.map((s) => (
              <option key={s} value={s}>
                {SENSITIVITY_LABEL[s]}
              </option>
            ))}
          </select>
          {cat && cat.defaultSensitivity !== 'NORMAL' && <span className="mem-muted">{tr('memory.aCategoriaJaE', { p0: SENSITIVITY_LABEL[cat.defaultSensitivity].toLowerCase() })}</span>}
        </label>
        <label>
          {tr('memory.aconteceuEmOpcional')}
          <input type="date" value={f.occurredAt?.slice(0, 10) ?? ''} onChange={(e) => set('occurredAt', e.target.value || null)} />
        </label>
        <label>
          {tr('memory.validaAteOpcional')}
          <input type="date" value={f.validUntil?.slice(0, 10) ?? ''} onChange={(e) => set('validUntil', e.target.value || null)} />
        </label>
        <label>
          {tr('memory.tagsVirgula')}
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={tr('memory.exCoreiaCidades')} />
        </label>
        <label>
          {tr('memory.escopo')}
          <input value={f.scope ?? ''} onChange={(e) => set('scope', e.target.value)} placeholder={tr('memory.geralTrabalhoViagens')} />
        </label>
        <label className="full mem-switch" style={{ flexDirection: 'row' }}>
          <input type="checkbox" checked={!!f.pinned} onChange={(e) => set('pinned', e.target.checked)} />
          <span>
            {tr('memory.fixarComoEssencial')}
            <small>{tr('memory.memoriasFixadasSaoConsideradasCore')}</small>
          </span>
        </label>
      </div>
      {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          {tr('memory.cancelar')}
        </button>
        <button className="btn btn-primary" disabled={busy || !f.content.trim()} onClick={save}>
          {busy ? tr('memory.salvando') : tr('memory.salvar')}
        </button>
      </div>
    </Modal>
  )
}
