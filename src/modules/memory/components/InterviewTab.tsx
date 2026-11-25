import React, { useEffect, useRef, useState } from 'react'
import type { Interview } from '../api'
import { useMemoryStore } from '../store/memoryStore'
import { errMsg, fmtDate } from './ui'
import { t as tr } from '../../../i18n'

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
          <h3>{tr('memory.meConhecaMelhor')}</h3>
          <p className="mem-sub">
            {tr('memory.umaConversaLeveAIa')}
          </p>
          <div className="mem-seg" style={{ margin: '10px 0' }}>
            {PRESETS.map((p) => (
              <button key={p} className={topic === p ? 'active' : ''} onClick={() => setTopic(p)}>
                {p.replace('Conheça melhor ', '')}
              </button>
            ))}
          </div>
          <div className="mem-toolbar">
            <input style={{ flex: 1, minWidth: 200 }} placeholder={tr('memory.ouEscrevaUmTema')} value={topic} onChange={(e) => setTopic(e.target.value)} aria-label={tr('memory.tema')} />
            <select value={catId} onChange={(e) => setCatId(e.target.value ? Number(e.target.value) : '')} aria-label={tr('memory.categoria')}>
              <option value="">{tr('memory.qualquerCategoria')}</option>
              {categories
                .filter((c) => !c.archivedAt)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
            </select>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => window.api.memory.startInterview(topic, catId || null))}>
              {busy ? tr('memory.pensando') : tr('memory.comecar')}
            </button>
          </div>
          {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}
        </div>
        {history.length > 0 && (
          <div className="mem-panel">
            <h3>{tr('memory.conversasAnteriores')}</h3>
            {history.map((h) => (
              <button key={h.id} className="mem-cat" style={{ width: '100%' }} onClick={() => setIv(h)}>
                {h.topic}
                <span className="n">
                  {tr('memory.resp', { count: h.turns.filter((t) => t.answer).length, p1: fmtDate(h.createdAt) })}
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
              {tr('memory.sugestaoOesInbox', { proposed, pending })}
            </button>
          )}
          {iv.status === 'open' ? (
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(() => window.api.memory.endInterview(iv.id))}>
              {tr('memory.encerrar')}
            </button>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={() => setIv(null)}>
              {tr('memory.novaConversa')}
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
              {t.proposed != null && <small>{t.proposed ? tr('memory.sugestaoOesParaRevisar', { proposed: t.proposed }) : tr('memory.nadaNovoParaGuardar')}</small>}
            </div>
          )}
          {t.skipped && <div className="mem-bubble me skip">{tr('memory.pulou')}</div>}
        </React.Fragment>
      ))}
      {busy && (
        <div className="mem-bubble ai">
          <span className="mem-spin" style={{ display: 'inline-block' }} />
        </div>
      )}
      {iv.status === 'ended' && <p className="mem-muted">{tr('memory.conversaEncerradaReviseAsSugestoes')}</p>}
      {iv.status === 'open' && !waiting && !busy && (
        // a IA falhou depois de uma resposta (ou a conversa foi reaberta): pede a próxima pergunta
        <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => run(() => window.api.memory.skipInterview(iv.id))}>
          {tr('memory.continuarConversa')}
        </button>
      )}
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
            placeholder={tr('memory.suaResposta')}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && answer.trim()) void run(() => window.api.memory.answerInterview(iv.id, answer))
            }}
            aria-label={tr('memory.resposta')}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !answer.trim()}>
            {tr('memory.responder')}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(() => window.api.memory.skipInterview(iv.id))}>
            {tr('memory.pular')}
          </button>
        </form>
      )}
      {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}
      <div ref={endRef} />
    </div>
  )
}
