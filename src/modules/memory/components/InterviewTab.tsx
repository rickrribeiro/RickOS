import React, { useEffect, useRef, useState } from 'react'
import type { Interview } from '../api'
import { useMemoryStore } from '../store/memoryStore'
import { errMsg, fmtDate } from './ui'

const PRESETS = [
  'Conheça melhor minhas preferências de viagem',
  'Conheça melhor meus objetivos profissionais',
  'Conheça melhor minha rotina ideal',
  'Conheça melhor meus valores',
  'Conheça melhor meus hábitos',
  'Descubra informações importantes que ainda não sabe sobre mim'
]

/** "Me conheça melhor": conversa curta; cada resposta vira sugestões revisáveis no Inbox. */
export function InterviewTab(): React.ReactElement {
  const { categories, setTab, pending } = useMemoryStore()
  const [iv, setIv] = useState<Interview | null>(null)
  const [history, setHistory] = useState<Interview[]>([])
  const [topic, setTopic] = useState('')
  const [catId, setCatId] = useState<number | ''>('')
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void window.api.memory.interviews().then((list) => {
      setHistory(list)
      const openIv = list.find((x) => x.status === 'open')
      if (openIv) setIv(openIv)
    })
  }, [])
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [iv?.turns.length])

  async function run(fn: () => Promise<Interview>): Promise<void> {
    setBusy(true)
    setErr('')
    try {
      const r = await fn()
      setIv(r)
      setAnswer('')
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const last = iv?.turns[iv.turns.length - 1]
  const waiting = iv?.status === 'open' && last && !last.answer && !last.skipped
  const proposed = iv?.turns.reduce((s, t) => s + (t.proposed ?? 0), 0) ?? 0

  if (!iv)
    return (
      <div className="mem-chat">
        <div className="mem-panel">
          <h3>💬 Me conheça melhor</h3>
          <p className="mem-sub">
            Uma conversa leve: a IA pergunta, você responde do jeito que quiser, pode pular qualquer pergunta e parar quando quiser. O que valer a pena guardar vira
            sugestão no Inbox — nada é salvo sem você aprovar. Temas sensíveis nunca são forçados.
          </p>
          <div className="mem-seg" style={{ margin: '10px 0' }}>
            {PRESETS.map((p) => (
              <button key={p} className={topic === p ? 'active' : ''} onClick={() => setTopic(p)}>
                {p.replace('Conheça melhor ', '')}
              </button>
            ))}
          </div>
          <div className="mem-toolbar">
            <input style={{ flex: 1, minWidth: 200 }} placeholder="Ou escreva um tema…" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Tema" />
            <select value={catId} onChange={(e) => setCatId(e.target.value ? Number(e.target.value) : '')} aria-label="Categoria">
              <option value="">Qualquer categoria</option>
              {categories
                .filter((c) => !c.archivedAt)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
            </select>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => window.api.memory.startInterview(topic, catId || null))}>
              {busy ? 'Pensando…' : 'Começar'}
            </button>
          </div>
          {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}
        </div>
        {history.length > 0 && (
          <div className="mem-panel">
            <h3>Conversas anteriores</h3>
            {history.map((h) => (
              <button key={h.id} className="mem-cat" style={{ width: '100%' }} onClick={() => setIv(h)}>
                {h.topic}
                <span className="n">
                  {h.turns.filter((t) => t.answer).length} resp. · {fmtDate(h.createdAt)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    )

  return (
    <div className="mem-chat">
      <div className="mem-row" style={{ justifyContent: 'space-between' }}>
        <strong>{iv.topic}</strong>
        <span className="mem-actions">
          {proposed > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={() => setTab('inbox')}>
              📥 {proposed} sugestão(ões) · Inbox ({pending})
            </button>
          )}
          {iv.status === 'open' ? (
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(() => window.api.memory.endInterview(iv.id))}>
              Encerrar
            </button>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={() => setIv(null)}>
              Nova conversa
            </button>
          )}
        </span>
      </div>
      {iv.turns.map((t, i) => (
        <React.Fragment key={i}>
          <div className="mem-bubble ai">
            {t.question}
            {t.why && <small>{t.why}</small>}
          </div>
          {t.answer && (
            <div className="mem-bubble me">
              {t.answer}
              {t.proposed != null && <small>{t.proposed ? `${t.proposed} sugestão(ões) para revisar` : 'nada novo para guardar'}</small>}
            </div>
          )}
          {t.skipped && <div className="mem-bubble me skip">pulou</div>}
        </React.Fragment>
      ))}
      {busy && (
        <div className="mem-bubble ai">
          <span className="mem-spin" style={{ display: 'inline-block' }} />
        </div>
      )}
      {iv.status === 'ended' && <p className="mem-muted">Conversa encerrada. Revise as sugestões no Inbox.</p>}
      {waiting && (
        <form
          className="mem-toolbar"
          onSubmit={(e) => {
            e.preventDefault()
            if (answer.trim()) void run(() => window.api.memory.answerInterview(iv.id, answer))
          }}
        >
          <textarea
            autoFocus
            rows={2}
            style={{ flex: '1 1 260px', resize: 'vertical', fontFamily: 'inherit' }}
            placeholder="Sua resposta…"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && answer.trim()) void run(() => window.api.memory.answerInterview(iv.id, answer))
            }}
            aria-label="Resposta"
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !answer.trim()}>
            Responder
          </button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(() => window.api.memory.skipInterview(iv.id))}>
            Pular
          </button>
        </form>
      )}
      {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}
      <div ref={endRef} />
    </div>
  )
}
