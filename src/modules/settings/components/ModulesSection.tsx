import React, { useEffect, useState } from 'react'
import { NAV_GROUPS, groupKey, groupLabel, isToggleable, itemLabel } from '../../../navigation'
import { t } from '../../../i18n'
import { useModuleStore } from '../../../store/moduleStore'
import { Icon } from '../../../icons/Icon'

const TOGGLEABLE = NAV_GROUPS.filter(isToggleable)

/** Configurações → Módulos: liga/desliga grupos da sidebar. */
export function ModulesSection(): React.ReactElement {
  const hidden = useModuleStore((s) => s.hidden)
  const [open, setOpen] = useState(false)
  const active = TOGGLEABLE.filter((g) => !hidden.includes(groupKey(g))).length
  const hiddenPages = TOGGLEABLE.filter((g) => g.key && !hidden.includes(groupKey(g)))
    .flatMap((g) => g.items)
    .filter((i) => hidden.includes(i.id)).length

  return (
    <div className="chart-section" style={{ maxWidth: 560 }}>
      <div className="chart-title">🧩 {t('settings.modules.title')}</div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 10px' }}>
        {t('settings.modules.activeCount', { active, total: TOGGLEABLE.length })}
        {hiddenPages > 0 && ` · ${t('settings.modules.hiddenPages', { count: hiddenPages })}`}. {t('settings.modules.hint')}
      </p>
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>{t('settings.modules.choose')}</button>
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
        <h2>🧩 {t('settings.modules.title')}</h2>
        <div className="modules-list">
          {TOGGLEABLE.map((g) => {
            const key = groupKey(g)
            const on = !draft.includes(key)
            const icon = g.groupIcon ?? g.items[0].icon
            const name = groupLabel(g) || itemLabel(g.items[0])
            const visible = g.items.filter((i) => !draft.includes(i.id)).length
            const partial = on && g.key && visible < g.items.length
            const isOpen = !!expanded[key]
            return (
              <div key={key} className="modules-group">
                <div className={`modules-row${on ? '' : ' off'}`}>
                  <label className="modules-main">
                    <input type="checkbox" checked={on} onChange={() => toggle(key)} />
                    <span className="modules-icon"><Icon name={icon} /></span>
                    <span className="modules-name">
                      {name}
                      {partial && <span className="modules-count"> {visible}/{g.items.length}</span>}
                    </span>
                    {g.key && (
                      <span className="modules-pages">
                        {g.items.filter((i) => !draft.includes(i.id)).map(itemLabel).join(' · ') || t('settings.modules.noPages')}
                      </span>
                    )}
                  </label>
                  {g.key && g.items.length > 1 && (
                    <button
                      type="button"
                      className="modules-expand"
                      onClick={() => setExpanded((e) => ({ ...e, [key]: !e[key] }))}
                      aria-expanded={isOpen}
                      aria-label={t(isOpen ? 'settings.modules.collapsePagesOf' : 'settings.modules.expandPagesOf', { module: name })}
                      title={t(isOpen ? 'settings.modules.collapsePages' : 'settings.modules.choosePages')}
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
                          <span className="modules-icon"><Icon name={i.icon} /></span>
                          <span>{itemLabel(i)}</span>
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
          <button className="btn btn-secondary btn-sm" onClick={() => setDraft([])}>{t('settings.modules.enableAll')}</button>
          <span style={{ flex: 1 }} />
          <button className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={save}>{t('common.save')}</button>
        </div>
      </div>
    </div>
  )
}
