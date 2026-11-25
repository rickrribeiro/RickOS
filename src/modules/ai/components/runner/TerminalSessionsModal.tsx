import React, { useEffect, useMemo, useState } from 'react'
import type { TerminalSession } from '../../../../../shared/aiConversations'
import { timeAgo } from '../../../../utils/dates'
import { t as tr } from '../../../../i18n'

interface Props {
  projectName: (id: number | null) => string | null
  onClose: () => void
  /** Importou (ou já existia): abre a conversa. */
  onOpen: (conversationId: string) => void
}

function folder(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean)
  return parts.slice(-2).join('/') || cwd
}

function account(configDir: string): string {
  const base = configDir.split('/').filter(Boolean).pop() ?? ''
  return base === '.claude' ? '' : base.replace(/^\.claude-?/, '')
}

/** Sessões recentes do Claude Code no terminal, para continuar aqui. */
export function TerminalSessionsModal({ projectName, onClose, onOpen }: Props): React.ReactElement {
  const [sessions, setSessions] = useState<TerminalSession[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    window.api.conv
      .terminalSessions()
      .then(setSessions)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!sessions) return []
    if (!t) return sessions
    return sessions.filter((s) => `${s.title} ${s.lastPrompt} ${s.cwd}`.toLowerCase().includes(t))
  }, [sessions, q])

  async function open(s: TerminalSession): Promise<void> {
    setBusy(s.sessionId)
    setError('')
    try {
      const c = await window.api.conv.importTerminal(s.sessionId, s.configDir)
      onOpen(c.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal cv-term-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{tr('ai.sessoesDoTerminal')}</h2>
        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 10px' }}>
          {tr('ai.conversasDoClaudeCodeNo')}
        </p>
        <input type="text" placeholder={tr('ai.filtrar')} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
        {error && <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 8 }}>{error}</div>}
        {!sessions && !error && <div className="empty-hint" style={{ padding: 24 }}>{tr('ai.lendoSessoes')}</div>}
        {sessions && filtered.length === 0 && <div className="empty-hint" style={{ padding: 24 }}>{tr('ai.nenhumaSessaoEncontrada')}</div>}
        <div className="cv-term-list">
          {filtered.map((s) => {
            const proj = projectName(s.projectId)
            const acc = account(s.configDir)
            return (
              <button key={s.sessionId} className="cv-term-row" disabled={!!busy} onClick={() => open(s)}>
                <div className="cv-term-title">
                  {s.title}
                  {s.conversationId && <span className="cv-chip">{tr('ai.jaAberta')}</span>}
                </div>
                {s.lastPrompt && s.lastPrompt !== s.title && <div className="cv-term-last">› {s.lastPrompt}</div>}
                <div className="cv-term-meta">
                  <span>📁 {proj ?? folder(s.cwd)}</span>
                  {acc && <span className="cv-chip">{acc}</span>}
                  <span>{timeAgo(s.updatedAt)}</span>
                  <span>{(s.sizeBytes / 1e6).toFixed(1)} {tr('ai.mb')}</span>
                  {busy === s.sessionId && <span>{tr('ai.abrindo')}</span>}
                </div>
              </button>
            )
          })}
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            {tr('ai.fechar')}
          </button>
        </div>
      </div>
    </div>
  )
}
