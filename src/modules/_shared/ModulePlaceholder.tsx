import React from 'react'
import { t } from '../../i18n'

interface ModulePlaceholderProps {
  icon: string
  title: string
  subtitle?: string
  note?: string
}

/**
 * Skeleton page used by modules whose logic isn't implemented yet.
 * Keeps navigation working and the visual coherent with the rest of the app.
 */
export function ModulePlaceholder({
  icon,
  title,
  subtitle,
  note
}: ModulePlaceholderProps): React.ReactElement {
  return (
    <div style={{ padding: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h2>
          {subtitle && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{subtitle}</p>
          )}
        </div>
      </div>
      <div className="chart-section">
        <div className="chart-title">{t('misc.emBreve')}</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
          {note ||
            t('misc.fundacaoCriadaTabelaNoBanco')}
        </p>
      </div>
    </div>
  )
}
