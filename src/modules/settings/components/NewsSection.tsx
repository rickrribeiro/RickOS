import React, { useEffect, useState } from 'react'
import { t } from '../../../i18n'

/** Configurações → Resumo de Notícias: chave do Google Gemini (criptografada, nunca volta ao front). */
export function NewsSection(): React.ReactElement {
  const [hasKey, setHasKey] = useState(false)
  const [key, setKey] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    window.api.news.state().then((s) => setHasKey(s.config.hasGeminiKey)).catch(() => undefined)
  }, [])

  async function save(value: string): Promise<void> {
    const cfg = await window.api.news.setGeminiKey(value)
    setHasKey(cfg.hasGeminiKey)
    setKey('')
    setMsg({ ok: true, text: cfg.hasGeminiKey ? t('settings.chaveSalvaCriptografada') : t('settings.chaveRemovida') })
  }

  return (
    <div className="chart-section" style={{ maxWidth: 560, marginTop: 16 }}>
      <div className="chart-title">
        {t('settings.resumoDeNoticiasGemini')}{' '}
        {hasKey && <span style={{ color: 'var(--success)', fontSize: 12 }}>{t('settings.configurado')}</span>}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 12px' }}>
        {t('settings.oCard')} <strong>{t('settings.resumoDeNoticias')}</strong> {t('settings.doDashboardBuscaAsManchetes')} <code>gemini-2.5-flash</code>{t('settings.gereUmaChaveEm')}{' '}
        <strong>{t('settings.aistudioGoogleComGetApi')}</strong>{t('settings.ficaCriptografadaNoBancoDo')}
      </p>
      <div className="editor-field">
        <label>
          {t('settings.chaveDeApiDoGoogle')}{' '}
          {hasKey && <span style={{ color: 'var(--success)', textTransform: 'none' }}>{t('settings.salva')}</span>}
        </label>
        <input
          type="password"
          autoComplete="off"
          placeholder={hasKey ? t('settings.deixeEmBrancoParaManter') : t('settings.aiza')}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" disabled={!key.trim()} onClick={() => void save(key)}>
          {t('settings.salvarChave')}
        </button>
        {hasKey && (
          <button className="btn btn-danger btn-sm" onClick={() => void save('')}>
            {t('settings.removerChave')}
          </button>
        )}
      </div>
      {msg && (
        <div style={{ fontSize: 12, color: msg.ok ? 'var(--success)' : 'var(--danger)', marginTop: 8 }}>{msg.text}</div>
      )}
    </div>
  )
}
