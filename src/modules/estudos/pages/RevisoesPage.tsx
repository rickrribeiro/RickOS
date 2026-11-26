import React, { useEffect, useState } from 'react'
import { useUIStore } from '../../../store/uiStore'
import type { CategoryRow, LibraryTopic, Rating, ReviewItem } from '../../../../shared/estudos'
import { clozeHide, clozeReveal, matchesAnswer } from '../../../../shared/estudos'
import { ReviewHeatmap } from '../components/ReviewHeatmap'
import { t as tr } from '../../../i18n'

const RATINGS: { key: Rating; label: string; cls: string }[] = [
  { key: 'again', label: tr('estudos.again'), cls: 'btn-danger' },
  { key: 'hard', label: tr('estudos.hard'), cls: 'btn-secondary' },
  { key: 'good', label: tr('estudos.good'), cls: 'btn-primary' },
  { key: 'easy', label: tr('estudos.easy'), cls: 'btn-secondary' }
]

const FILTER_KEY = 'rickos:studyReviewFilter'

interface Filter {
  topicId: string
  categoryId: string
  language: string
}

function loadFilter(): Filter {
  try {
    const v = JSON.parse(localStorage.getItem(FILTER_KEY) || 'null')
    if (v && typeof v === 'object') return { topicId: String(v.topicId ?? ''), categoryId: String(v.categoryId ?? ''), language: String(v.language ?? '') }
  } catch { /* sem storage */ }
  return { topicId: '', categoryId: '', language: '' }
}

/**
 * Fila diária encerrável. Cada item é UMA direção do cartão (agenda independente). A nota
 * dada vai para o servidor, que agenda com o mesmo SM-2 de antes. Zero chamadas de IA.
 */
export function RevisoesPage(): React.ReactElement {
  const { setPage } = useUIStore()
  const [items, setItems] = useState<ReviewItem[]>([])
  const [info, setInfo] = useState({ newLeft: 0, newPerDay: 20, dueTotal: 0 })
  const [filter, setFilter] = useState<Filter>(loadFilter)
  const [topics, setTopics] = useState<LibraryTopic[]>([])
  const [cats, setCats] = useState<CategoryRow[]>([])
  const [revealed, setRevealed] = useState(false)
  const [answer, setAnswer] = useState('')
  const [showReading, setShowReading] = useState(false)
  const [ended, setEnded] = useState(false)
  const [done, setDone] = useState<Record<Rating, number>>({ again: 0, hard: 0, good: 0, easy: 0 })
  const [busy, setBusy] = useState(false)

  async function load(): Promise<void> {
    const q = await window.api.estudos.queue({
      topicIds: filter.topicId ? [Number(filter.topicId)] : null,
      categoryId: filter.categoryId === 'none' ? 'none' : filter.categoryId ? Number(filter.categoryId) : null,
      language: filter.language || null
    })
    setItems(q.items)
    setInfo({ newLeft: q.newLeft, newPerDay: q.newPerDay, dueTotal: q.dueTotal })
  }

  useEffect(() => {
    Promise.all([window.api.estudos.library(), window.api.estudos.categories()]).then(([l, c]) => {
      setTopics(l)
      setCats(c)
    })
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(filter))
    } catch { /* sem storage */ }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  const item = ended ? undefined : items[0]

  useEffect(() => {
    setRevealed(false)
    setAnswer('')
    setShowReading(!!item && item.readingMode === 'visible')
  }, [item?.state.id])

  async function rate(r: Rating): Promise<void> {
    if (!item || busy) return
    setBusy(true)
    try {
      await window.api.estudos.review(item.state.id, r)
      setDone((d) => ({ ...d, [r]: d[r] + 1 }))
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function suspend(): Promise<void> {
    if (!item) return
    await window.api.estudos.setStateSuspended(item.state.id, true)
    await load()
  }

  async function setNewPerDay(): Promise<void> {
    const v = window.prompt(tr('est.novosPorDiaPergunta'), String(info.newPerDay))
    if (v == null) return
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) return
    await window.api.estudos.setNewPerDay(n)
    await load()
  }

  const languages = [...new Set(topics.filter((x) => x.targetLanguage).map((x) => x.targetLanguage!))].sort()
  // arquivados só aparecem no filtro: escolher um deles inclui na revisão deste momento
  const reviewed = done.again + done.hard + done.good + done.easy

  // ── O que mostrar em cada direção ──
  let stimulus = ''
  let reveal = ''
  let accepted: string[] = []
  let dirLabel = ''
  if (item) {
    const c = item.card
    const lang = item.topicKind === 'language'
    if (c.cardType === 'cloze') {
      stimulus = clozeHide(c.front)
      reveal = clozeReveal(c.front)
      accepted = [...c.front.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1])
      dirLabel = tr('est.formatoLacuna')
    } else if (item.state.direction === 'forward') {
      stimulus = c.front
      reveal = c.back
      accepted = [c.back]
      dirLabel = lang ? tr('est.reconhecimento') : tr('est.frenteVerso')
    } else {
      stimulus = c.back
      reveal = c.front
      accepted = [c.front, ...c.variants]
      dirLabel = lang ? tr('est.producao') : tr('est.versoFrente')
    }
  }
  const typedMatches = !!answer.trim() && matchesAnswer(answer, accepted)
  const targetLang = item && item.topicKind === 'language' ? item.card.language || item.targetLanguage || undefined : undefined
  const stimulusIsTarget = item ? item.card.cardType === 'cloze' || item.state.direction === 'forward' : false

  return (
    <div className="module-page">
      <div className="module-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setPage('estudos')}>←</button>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>{tr('estudos.revisoes')}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {tr('est.filaResumo', { count: items.length, novos: info.newLeft, limite: info.newPerDay })}{' '}
              <button className="link-btn" onClick={setNewPerDay}>{tr('est.alterarLimite')}</button>
            </p>
          </div>
        </div>
        {!ended && items.length > 0 && <button className="btn btn-secondary btn-sm" onClick={() => setEnded(true)}>{tr('est.encerrarHoje')}</button>}
      </div>

      <div className="study-time">
        <select value={filter.topicId} onChange={(e) => setFilter({ ...filter, topicId: e.target.value })}>
          <option value="">{tr('est.topicosDaFila')}</option>
          {topics.filter((x) => x.cards > 0).map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
              {x.group === 'antigos' ? ` (${tr('est.grupo.antigos')})` : ''}
            </option>
          ))}
        </select>
        <select value={filter.categoryId} onChange={(e) => setFilter({ ...filter, categoryId: e.target.value })}>
          <option value="">{tr('est.todasCategorias')}</option>
          <option value="none">{tr('estudos.semCategoria')}</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {languages.length > 0 && (
          <select value={filter.language} onChange={(e) => setFilter({ ...filter, language: e.target.value })}>
            <option value="">{tr('est.todosIdiomas')}</option>
            {languages.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        )}
      </div>

      {!item ? (
        <div className="chart-section" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40 }}>{ended ? '🌙' : '🎉'}</div>
          <div style={{ marginTop: 8, color: 'var(--text-secondary)' }}>
            {ended ? tr('est.sessaoEncerrada', { count: reviewed, restantes: items.length }) : tr('estudos.nadaParaRevisarAgoraVolte')}
          </div>
          {reviewed > 0 && (
            <div className="study-hint">
              {tr('est.resumoSessao', { again: done.again, hard: done.hard, good: done.good, easy: done.easy })}
            </div>
          )}
          {ended && items.length > 0 && (
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => setEnded(false)}>{tr('est.continuarRevisando')}</button>
          )}
        </div>
      ) : (
        <div className="flashcard">
          <div className="flashcard-topic">
            {item.topicName} · {dirLabel}
            {item.isNew ? ` · ${tr('est.novo')}` : ''}
            {item.card.categoryName ? ` · ${item.card.categoryName}` : ''}
          </div>
          <div className="flashcard-face" lang={stimulusIsTarget ? targetLang : undefined}>{stimulus}</div>
          {item.card.reading && stimulusIsTarget && (showReading || revealed) && <div className="flashcard-reading">{item.card.reading}</div>}
          {item.card.reading && stimulusIsTarget && !showReading && !revealed && (
            <button className="link-btn" onClick={() => setShowReading(true)}>{tr('est.mostrarLeitura')}</button>
          )}
          {!revealed && (
            <input
              className="test-answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setRevealed(true)}
              placeholder={tr('est.respostaOpcional')}
              lang={!stimulusIsTarget ? targetLang : undefined}
            />
          )}
          {revealed ? (
            <>
              <hr className="flashcard-sep" />
              <div className="flashcard-face flashcard-back" lang={!stimulusIsTarget ? targetLang : undefined}>{reveal}</div>
              {item.card.reading && !stimulusIsTarget && <div className="flashcard-reading">{item.card.reading}</div>}
              {answer.trim() && (
                <div className={`answer-check ${typedMatches ? 'ok' : ''}`}>
                  {typedMatches ? tr('est.bateuComAceita') : tr('est.compareVoceMesmo', { resposta: answer })}
                </div>
              )}
              {item.state.direction === 'reverse' && item.card.variants.length > 0 && (
                <div className="flashcard-extra">
                  <strong>{tr('est.tambemAceito')}</strong> {item.card.variants.join(' · ')}
                </div>
              )}
              {item.card.example && (
                <div className="flashcard-extra">
                  <strong>{tr('est.exemplo')}:</strong> {item.card.example}
                </div>
              )}
              {item.card.drill && (
                <div className="flashcard-extra drill">
                  <strong>{tr('est.agoraTente')}</strong> {item.card.drill}
                </div>
              )}
              <div className="srs-buttons">
                {RATINGS.map((r) => (
                  <button key={r.key} className={`btn btn-sm ${r.cls}`} disabled={busy} onClick={() => rate(r.key)}>
                    {r.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setRevealed(true)}>
              {tr('estudos.mostrarResposta')}
            </button>
          )}
          <div className="flashcard-foot">
            <button className="link-btn" onClick={suspend}>{tr('est.suspenderDirecao')}</button>
          </div>
        </div>
      )}

      <ReviewHeatmap />
    </div>
  )
}
