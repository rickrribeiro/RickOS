import React from 'react'
import { LOCALES, t, useLocaleStore } from '../../../i18n'

/** Idioma da interface: salvo no servidor, vale para desktop e web. */
export function LanguageSection(): React.ReactElement {
  const { locale, setLocale } = useLocaleStore()
  return (
    <div className="chart-section" style={{ maxWidth: 560 }}>
      <div className="chart-title">🌐 {t('settings.language.title')}</div>
      <div className="editor-field">
        <label>{t('settings.language.label')}</label>
        <div className="seg-toggle">
          {LOCALES.map((l) => (
            <button
              key={l.id}
              className={`seg-btn ${locale === l.id ? 'active' : ''}`}
              onClick={() => void setLocale(l.id)}
              aria-pressed={locale === l.id}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
