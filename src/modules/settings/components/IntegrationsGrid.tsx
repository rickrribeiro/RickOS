import React, { useEffect, useState } from 'react'
import { t } from '../../../i18n'
import { clearSettingsRequest, pendingIntegration } from '../tabs'

export type IntegrationArea = 'trabalho' | 'financas' | 'comunicacao' | 'conteudo'
export type IntegrationTone = 'ok' | 'warn' | 'err' | 'off'

export interface IntegrationItem {
  id: string
  area: IntegrationArea
  icon: string
  name: string
  /** Serviço/provedor por trás (ex.: Beeper, Gemini). */
  provider: string
  status: { tone: IntegrationTone; text: string }
  /** Conteúdo do modal (o card de configuração). Ausente = `onOpen` (ex.: config fica no próprio módulo). */
  render?: () => React.ReactNode
  onOpen?: () => void
}

const AREAS: IntegrationArea[] = ['trabalho', 'financas', 'comunicacao', 'conteudo']

/** Configurações → Integrações: grade de serviços conectados, por área; cada um abre a config num modal. */
export function IntegrationsGrid({ items, onModalClose }: { items: IntegrationItem[]; onModalClose?: () => void }): React.ReactElement {
  const [open, setOpen] = useState<string | null>(pendingIntegration)
  useEffect(clearSettingsRequest, [])
  const current = items.find((i) => i.id === open && i.render)

  function close(): void {
    setOpen(null)
    onModalClose?.()
  }

  useEffect(() => {
    if (!current) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current])

  return (
    <div className="integ-areas">
      {AREAS.map((area) => {
        const list = items.filter((i) => i.area === area)
        if (!list.length) return null
        return (
          <section key={area}>
            <h3 className="integ-area-title">{t(`settings.integ.area.${area}`)}</h3>
            <div className="integ-grid">
              {list.map((i) => (
                <button key={i.id} className="integ-tile" onClick={() => (i.render ? setOpen(i.id) : i.onOpen?.())}>
                  <span className="integ-tile-icon">{i.icon}</span>
                  <span className="integ-tile-name">{i.name}</span>
                  <span className="integ-tile-provider">{i.provider}</span>
                  <span className={`integ-status ${i.status.tone}`}>
                    <span className="dot" />
                    {i.status.text}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )
      })}

      {current && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal integ-modal" onClick={(e) => e.stopPropagation()}>
            <div className="integ-modal-head">
              <span className="integ-tile-icon">{current.icon}</span>
              <div style={{ minWidth: 0 }}>
                <h2>{current.name}</h2>
                <span className={`integ-status ${current.status.tone}`}>
                  <span className="dot" />
                  {current.status.text}
                </span>
              </div>
              <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={close}>
                {t('settings.fechar')}
              </button>
            </div>
            <div className="integ-modal-body">{current.render?.()}</div>
          </div>
        </div>
      )}
    </div>
  )
}
