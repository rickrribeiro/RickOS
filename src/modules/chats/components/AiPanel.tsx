import React, { useEffect, useState } from 'react'
import type { AiStyle, AiSuggestion, AiSummary, ChatMessage, ChatSummary, ChatTemplate } from '../../../../shared/chats'
import { AI_STYLE_LABELS } from '../../../../shared/chats'
import { ConfirmSend } from './ChatView'
import { t as tr } from '../../../i18n'

const LANGS = [
  { v: '', l: tr('chats.lang.conversa') },
  { v: 'português do Brasil', l: tr('chats.lang.pt') },
  { v: 'inglês', l: tr('chats.lang.en') },
  { v: 'espanhol', l: tr('chats.lang.es') },
  { v: 'francês', l: tr('chats.lang.fr') },
  { v: 'italiano', l: tr('chats.lang.it') }
]

interface Card extends AiSuggestion {
  key: string
  text: string
  busy?: boolean
  error?: string | null
}

/**
 * Sugestões de resposta e resumo com IA. SÓ as mensagens selecionadas vão para a IA;
 * enviar é sempre uma ação explícita com confirmação.
 */
export function AiPanel({
  chat,
  mode,
  messages,
  canSend,
  onClose,
  onUse,
  onSend
}: {
  chat: ChatSummary
  mode: 'suggest' | 'summary'
  messages: ChatMessage[]
  canSend: boolean
  onClose: () => void
  onUse: (text: string) => void
  onSend: (text: string, replyToId: string | null) => Promise<boolean>
}): React.ReactElement {
  const [style, setStyle] = useState<AiStyle>('natural')
  const [perMessage, setPerMessage] = useState(messages.filter((m) => !m.isMine).length > 1)
  const [lang, setLang] = useState('')
  const [notes, setNotes] = useState(false)
  const [extra, setExtra] = useState('')
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [templates, setTemplates] = useState<ChatTemplate[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [summary, setSummary] = useState<AiSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Card | null>(null)
  const [sendingKey, setSendingKey] = useState<string | null>(null)
  const [sent, setSent] = useState<string[]>([])

  useEffect(() => {
    void window.api.chats.templates().then(setTemplates)
  }, [])

  const ids = messages.map((m) => m.id)
  const byId = new Map(messages.map((m) => [m.id, m]))

  async function generate(): Promise<void> {
    setBusy(true)
    setError(null)
    setCards([])
    try {
      const r = await window.api.chats.aiSuggest({
        chatId: chat.id,
        messageIds: ids,
        mode: perMessage ? 'per_message' : 'single',
        style,
        language: lang || null,
        includePersonNotes: notes,
        extraInstruction: extra || null,
        templateId
      })
      if (r.error) setError(r.error)
      setCards(r.suggestions.map((s, i) => ({ ...s, key: `${s.messageId ?? 'all'}-${i}`, text: s.reply })))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function regenerate(card: Card): Promise<void> {
    setCards((cs) => cs.map((c) => (c.key === card.key ? { ...c, busy: true, error: null } : c)))
    const only = card.messageId ? [card.messageId] : ids
    const r = await window.api.chats.aiSuggest({
      chatId: chat.id,
      messageIds: only,
      mode: card.messageId ? 'per_message' : 'single',
      style,
      language: lang || null,
      includePersonNotes: notes,
      extraInstruction: [extra, 'Dê uma alternativa diferente da anterior.'].filter(Boolean).join(' '),
      templateId
    })
    setCards((cs) =>
      cs.map((c) => {
        if (c.key !== card.key) return c
        const s = r.suggestions[0]
        if (r.error || !s) return { ...c, busy: false, error: r.error ?? tr('chats.semSugestao') }
        return { ...c, ...s, key: c.key, text: s.reply, busy: false }
      })
    )
  }

  async function summarize(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      setSummary(await window.api.chats.aiSummarize(chat.id, ids, notes))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function doSend(card: Card): Promise<void> {
    setSendingKey(card.key)
    const ok = await onSend(card.text, perMessage ? card.messageId : null)
    setSendingKey(null)
    setConfirm(null)
    if (ok) setSent((s) => [...s, card.key])
  }

  return (
    <div className="chats-ai">
      <div className="chats-ai-head">
        <b>{mode === 'suggest' ? tr('chats.sugestoesDeResposta') : tr('chats.resumo')}</b>
        <span style={{ color: 'var(--text-muted)' }}>
          {tr('chats.mensagensSelecionadas', { count: messages.length })}{tr('chats.soElasVaoParaA')}
        </span>
        <span style={{ flex: 1 }} />
        <button className="chats-x" onClick={onClose} title={tr('chats.fecharEsc')} aria-label={tr('chats.fechar')}>✕</button>
      </div>

      {mode === 'suggest' ? (
        <div className="chats-row" style={{ marginBottom: 8 }}>
          <select value={style} onChange={(e) => setStyle(e.target.value as AiStyle)} aria-label={tr('chats.estilo')}>
            {(Object.keys(AI_STYLE_LABELS) as AiStyle[]).map((s) => (
              <option key={s} value={s}>{AI_STYLE_LABELS[s]}</option>
            ))}
          </select>
          <select value={perMessage ? 'per' : 'one'} onChange={(e) => setPerMessage(e.target.value === 'per')} aria-label={tr('chats.modo')}>
            <option value="per">{tr('chats.umaPorMensagem')}</option>
            <option value="one">{tr('chats.umaParaOConjunto')}</option>
          </select>
          <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={tr('chats.idioma')}>
            {LANGS.map((l) => (
              <option key={l.v} value={l.v}>{l.l}</option>
            ))}
          </select>
          {templates.length > 0 && (
            <select value={templateId ?? ''} onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : null)} aria-label={tr('chats.modelo')}>
              <option value="">{tr('chats.semModelo')}</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>⚡ {t.title}</option>
              ))}
            </select>
          )}
          <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={tr('chats.instrucaoExtraExRecusarCom')} style={{ flex: 1, minWidth: 160 }} />
          {chat.contactId && (
            <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }} title={tr('chats.enviaTambemAsNotasContexto')}>
              <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} /> {tr('chats.incluirNotasDaPessoa')}
            </label>
          )}
          <button className="btn btn-primary btn-sm" disabled={busy || !ids.length} onClick={() => void generate()}>{busy ? tr('chats.gerando') : cards.length ? tr('chats.gerarDeNovo') : tr('chats.gerar')}</button>
        </div>
      ) : (
        <div className="chats-row" style={{ marginBottom: 8 }}>
          {chat.contactId && (
            <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} /> {tr('chats.incluirNotasDaPessoa')}
            </label>
          )}
          <button className="btn btn-primary btn-sm" disabled={busy || !ids.length} onClick={() => void summarize()}>{busy ? tr('chats.resumindo') : summary ? tr('chats.resumirDeNovo') : tr('chats.resumir')}</button>
        </div>
      )}

      {error && <div className="chats-msg err" style={{ marginTop: 0 }}>{error}</div>}

      {summary && (
        <div className="chats-ai-card">
          <div className="chats-ai-reason" style={{ marginBottom: 6 }}>
            {tr('chats.resumoDeMensagens', { count: summary.messageCount })}{tr('chats.eUmTrechoNaoNecessariamente')}
          </div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{summary.text}</div>
          <div className="chats-ai-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard?.writeText(summary.text)}>{tr('chats.copiar')}</button>
            <button className="btn btn-secondary btn-sm" onClick={() => void window.api.chats.setNotes(chat.id, [chat.notes, summary.text].filter(Boolean).join('\n\n'))}>{tr('chats.salvarNasNotasDaConversa')}</button>
          </div>
        </div>
      )}

      {cards.map((c) => {
        const quoted = c.messageId ? byId.get(c.messageId) : null
        const done = sent.includes(c.key)
        return (
          <div className="chats-ai-card" key={c.key} style={done ? { opacity: 0.55 } : undefined}>
            {quoted && <div className="chats-ai-quote">↩ {quoted.senderName}: {quoted.text}</div>}
            {c.needsReply === false && <div className="chats-ai-reason">{tr('chats.aIaAchaQueEsta')}</div>}
            <textarea rows={Math.min(8, Math.max(2, Math.ceil(c.text.length / 60)))} value={c.text} onChange={(e) => setCards((cs) => cs.map((x) => (x.key === c.key ? { ...x, text: e.target.value } : x)))} />
            {c.error && <div className="chats-msg err">{c.error}</div>}
            <div className="chats-ai-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => onUse(c.text)} title={tr('chats.colocaOTextoNoCampo')}>{tr('chats.usarNoCampo')}</button>
              <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard?.writeText(c.text)}>{tr('chats.copiar')}</button>
              <button className="btn btn-secondary btn-sm" disabled={c.busy} onClick={() => void regenerate(c)}>{c.busy ? '…' : tr('chats.regenerar')}</button>
              <button className="btn btn-primary btn-sm" disabled={!canSend || !c.text.trim() || done} onClick={() => setConfirm(c)}>{done ? tr('chats.enviada') : tr('chats.enviar')}</button>
              {c.priority && c.priority !== 'normal' && (
                <button className="chats-linkbtn" onClick={() => void window.api.chats.setPriority([chat.id], c.priority)} title={tr('chats.aplicarAPrioridadeSugeridaPela')}>{tr('chats.prioridadeSugerida')} {c.priority}</button>
              )}
              {c.reason && <span className="chats-ai-reason">{c.reason}</span>}
            </div>
          </div>
        )
      })}

      {confirm && <ConfirmSend chat={chat} text={confirm.text} busy={sendingKey === confirm.key} onCancel={() => setConfirm(null)} onConfirm={() => void doSend(confirm)} />}
    </div>
  )
}
