import React, { useEffect, useState } from 'react'
import { NAV_GROUPS, groupKey, isToggleable } from '../../../navigation'
import { useModuleStore } from '../../../store/moduleStore'

const TOGGLEABLE = NAV_GROUPS.filter(isToggleable)

/** Configurações → Módulos: liga/desliga grupos da sidebar. */
export function ModulesSection(): React.ReactElement {
  const hidden = useModuleStore((s) => s.hidden)
  const [open, setOpen] = useState(false)
  const active = TOGGLEABLE.filter((g) => !hidden.includes(groupKey(g))).length
  const hiddenPages = TOGGLEABLE.filter((g) => g.label && !hidden.includes(groupKey(g)))
    .flatMap((g) => g.items)
    .filter((i) => hidden.includes(i.id)).length

  return (
    <div className="chart-section" style={{ maxWidth: 560 }}>
      <div className="chart-title">🧩 Módulos</div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 10px' }}>
        {active} de {TOGGLEABLE.length} ativos{hiddenPages > 0 && ` · ${hiddenPages} página${hiddenPages > 1 ? 's' : ''} oculta${hiddenPages > 1 ? 's' : ''}`}. Módulos desativados somem da barra lateral (os dados continuam salvos).
      </p>
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>Escolher módulos</button>
      {open && <ModulesModal onClose={() => setOpen(false)} />}
    </div>
  )
}

function ModulesModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const { hidden, setHidden } = useModuleStore()
  const [draft, setDraft] = useState<string[]>(hidden)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function toggle(key: string): void {
    setDraft((d) => (d.includes(key) ? d.filter((k) => k !== key) : [...d, key]))
  }

  async function save(): Promise<void> {
    await setHidden(draft)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>🧩 Módulos</h2>
        <div className="modules-list">
          {TOGGLEABLE.map((g) => {
            const key = groupKey(g)
            const on = !draft.includes(key)
            const icon = g.groupIcon ?? g.items[0].icon
            const name = g.label || g.items[0].label
            const visible = g.items.filter((i) => !draft.includes(i.id)).length
            const partial = on && g.label && visible < g.items.length
            const isOpen = !!expanded[key]
            return (
              <div key={key} className="modules-group">
                <div className={`modules-row${on ? '' : ' off'}`}>
                  <label className="modules-main">
                    <input type="checkbox" checked={on} onChange={() => toggle(key)} />
                    <span className="modules-icon">{icon}</span>
                    <span className="modules-name">
                      {name}
                      {partial && <span className="modules-count"> {visible}/{g.items.length}</span>}
                    </span>
                    {g.label && (
                      <span className="modules-pages">
                        {g.items.filter((i) => !draft.includes(i.id)).map((i) => i.label).join(' · ') || 'nenhuma página'}
                      </span>
                    )}
                  </label>
                  {g.label && g.items.length > 1 && (
                    <button
                      type="button"
                      className="modules-expand"
                      onClick={() => setExpanded((e) => ({ ...e, [key]: !e[key] }))}
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? 'Recolher' : 'Expandir'} páginas de ${name}`}
                      title={isOpen ? 'Recolher páginas' : 'Escolher páginas'}
                    >
                      <svg className={`modules-chevron${isOpen ? ' open' : ''}`} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                        <path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                </div>
                {isOpen && (
                  <div className={`modules-sub${on ? '' : ' off'}`}>
                    {g.items.map((i) => {
                      const pageOn = !draft.includes(i.id)
                      return (
                        <label key={i.id} className={`modules-subrow${pageOn ? '' : ' off'}`}>
                          <input type="checkbox" checked={pageOn} disabled={!on} onChange={() => toggle(i.id)} />
                          <span className="modules-icon">{i.icon}</span>
                          <span>{i.label}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setDraft([])}>Ativar todos</button>
          <span style={{ flex: 1 }} />
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
  )
}
