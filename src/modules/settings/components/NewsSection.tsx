import React, { useEffect, useState } from 'react'

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
    setMsg({ ok: true, text: cfg.hasGeminiKey ? 'Chave salva (criptografada) ✓' : 'Chave removida.' })
  }

  return (
    <div className="chart-section" style={{ maxWidth: 560, marginTop: 16 }}>
      <div className="chart-title">
        📰 Resumo de Notícias (Gemini){' '}
        {hasKey && <span style={{ color: 'var(--success)', fontSize: 12 }}>● configurado</span>}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 12px' }}>
        O card <strong>Resumo de Notícias</strong> do Dashboard busca as manchetes do dia anterior no Google
        Notícias e resume com o <code>gemini-2.5-flash</code>. Gere uma chave em{' '}
        <strong>aistudio.google.com → Get API key</strong>. Fica criptografada no banco do servidor.
      </p>
      <div className="editor-field">
        <label>
          Chave de API do Google Gemini{' '}
          {hasKey && <span style={{ color: 'var(--success)', textTransform: 'none' }}>· salva</span>}
        </label>
        <input
          type="password"
          autoComplete="off"
          placeholder={hasKey ? '•••••• (deixe em branco para manter)' : 'AIza…'}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" disabled={!key.trim()} onClick={() => void save(key)}>
          Salvar chave
        </button>
        {hasKey && (
          <button className="btn btn-danger btn-sm" onClick={() => void save('')}>
            Remover chave
          </button>
        )}
      </div>
      {msg && (
        <div style={{ fontSize: 12, color: msg.ok ? 'var(--success)' : 'var(--danger)', marginTop: 8 }}>{msg.text}</div>
      )}
    </div>
  )
}
