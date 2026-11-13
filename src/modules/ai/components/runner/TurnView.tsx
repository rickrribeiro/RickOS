import React, { useState } from 'react'
import type { AiPromptResponse, AiTurn } from '../../../../../shared/aiConversations'
import { renderMarkdown } from '../../../estudos/markdown'
import { ToolBlock } from './ToolBlock'

export function fmtTokens(n: number): string {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`
  return String(n)
}

export function fmtCost(usd: number): string {
  if (!usd) return '$0'
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`
}

function fmtDuration(ms: number | null): string {
  if (!ms) return ''
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}min${s % 60 ? ` ${s % 60}s` : ''}`
}

const STATUS_LABEL: Record<string, string> = {
  cancelled: '⏹ Interrompido',
  interrupted: '⚠️ Interrompido (o servidor reiniciou)',
  error: '⚠️ Erro'
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // sem permissão de área de transferência
  }
}

interface Props {
  turn: AiTurn
  onRespond: (requestId: string, r: AiPromptResponse) => Promise<void>
  /** Reenviar o mesmo prompt (turno com erro/interrompido). */
  onRetry?: (prompt: string) => void
}

export function TurnView({ turn, onRespond, onRetry }: Props): React.ReactElement {
  const [copied, setCopied] = useState(false)
  const running = turn.status === 'running'
  const answer = turn.blocks
    .filter((b) => b.type === 'text')
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('\n\n')
  const lastIsLiveText = (() => {
    const last = turn.blocks[turn.blocks.length - 1]
    return !!last && (last.type === 'text' || last.type === 'thinking') && !!last.live
  })()
  const waiting = turn.blocks.some((b) => b.type === 'tool' && b.permission?.status === 'pending')

  return (
    <div className="cv-turn">
      <div className="cv-user">
        <div className="cv-user-bubble">
          {turn.attachments?.length > 0 && (
            <div className="cv-user-imgs">
              {turn.attachments.map((src, i) =>
                src ? <img key={i} src={src} alt="" /> : <span key={i} className="cv-chip">🖼️</span>
              )}
            </div>
          )}
          {turn.prompt}
        </div>
      </div>
      <div className="cv-assistant">
        {turn.blocks.map((b, i) => {
          if (b.type === 'text') return <div key={i} className="cv-text">{renderMarkdown(b.text)}</div>
          if (b.type === 'thinking')
            return (
              <details key={i} className="cv-thinking" open={!!b.live}>
                <summary>💭 Pensamento</summary>
                <div className="cv-thinking-body">{b.text}</div>
              </details>
            )
          if (b.type === 'notice') return <div key={i} className="cv-notice">{b.text}</div>
          return <ToolBlock key={b.id} block={b} onRespond={onRespond} />
        })}
        {running && !lastIsLiveText && !waiting && (
          <div className="cv-working">
            <span className="active-task-dot" style={{ width: 7, height: 7 }} /> trabalhando…
          </div>
        )}
        {STATUS_LABEL[turn.status] && (
          <div className={`cv-status cv-status-${turn.status}`}>
            {STATUS_LABEL[turn.status]}
            {turn.error ? `: ${turn.error}` : ''}
            {onRetry && turn.status !== 'cancelled' && (
              <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={() => onRetry(turn.prompt)}>
                ↻ Tentar de novo
              </button>
            )}
          </div>
        )}
        {!running && (
          <div className="cv-meta">
            {turn.contextTokens > 0 && <span title="Tamanho do contexto ao fim deste turno">📚 {fmtTokens(turn.contextTokens)}</span>}
            {turn.outputTokens > 0 && <span title="Tokens gerados">✍️ {fmtTokens(turn.outputTokens)}</span>}
            {turn.costUsd > 0 && <span title="Custo estimado deste turno">{fmtCost(turn.costUsd)}</span>}
            {turn.durationMs ? <span>⏱ {fmtDuration(turn.durationMs)}</span> : null}
            {answer.trim() && (
              <button
                className="cv-link"
                onClick={() => {
                  copy(answer)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
              >
                {copied ? '✓ copiado' : '📋 copiar'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Barra de ocupação da janela de contexto. */
export function ContextMeter({ used, window: win, onCompact }: { used: number; window: number; onCompact?: () => void }): React.ReactElement {
  const pct = win > 0 ? Math.min(100, (used / win) * 100) : 0
  const level = pct >= 85 ? 'danger' : pct >= 70 ? 'warn' : 'ok'
  return (
    <div className={`cv-ctx cv-ctx-${level}`} title={`Contexto: ${used.toLocaleString('pt-BR')} de ${win.toLocaleString('pt-BR')} tokens`}>
      <div className="cv-ctx-bar">
        <div className="cv-ctx-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="cv-ctx-label">
        {used ? `${fmtTokens(used)} / ${fmtTokens(win)}` : `— / ${fmtTokens(win)}`}
      </span>
      {onCompact && pct >= 60 && (
        <button className="cv-link" onClick={onCompact} title="Resume a conversa para liberar contexto (/compact)">
          🗜️ compactar
        </button>
      )}
    </div>
  )
}
