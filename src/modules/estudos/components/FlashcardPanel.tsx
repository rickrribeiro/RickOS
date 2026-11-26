import React, { useEffect, useRef, useState } from 'react'
import type { CardOut, CategoryRow } from '../../../../shared/estudos'
import { clozeHide } from '../../../../shared/estudos'
import { useStudyStore } from '../store/studyStore'
import { CardEditor, CategoryManager } from './CardEditor'
import { t, getLocale } from '../../../i18n'

/** Quando a direção vence (nextReviewAt = YYYY-MM-DD). */
function nextLabel(iso: string | null, isNew: boolean): string {
  if (isNew) return t('est.novo')
  if (!iso) return t('estudos.venceHoje')
  const day = iso.slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  if (day <= today) return t('estudos.venceHoje')
  const d = new Date(`${day}T12:00:00`)
  const diff = Math.round((d.getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000)
  return t('estudos.emD', { diff, label: d.toLocaleDateString(getLocale(), { day: '2-digit', month: '2-digit' }) })
}

/** JSON [{front, back}] tolerante (a IA às vezes cerca com ```). */
function extractCards(raw: string): { front: string; back: string }[] | null {
  if (!raw) return null
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const first = s.indexOf('[')
  const last = s.lastIndexOf(']')
  if (first >= 0 && last > first) s = s.slice(first, last + 1)
  try {
    const v = JSON.parse(s)
    if (!Array.isArray(v)) return null
    return v.map((c: Record<string, unknown>) => ({ front: String(c.front ?? '').trim(), back: String(c.back ?? '').trim() })).filter((c) => c.front && c.back)
  } catch {
    return null
  }
}

/**
 * Cartões do tópico: criar/editar sem IA, filtrar por nó/categoria, suspender por direção.
 * Cartões gerados pela IA ficam SUGERIDOS (fora do baralho ativo) até eu aprovar.
 */
export function FlashcardPanel(): React.ReactElement {
  const { selectedNodeId, note, activeTopicId, topicMeta, nodes } = useStudyStore()
  const [cards, setCards] = useState<CardOut[]>([])
  const [suggested, setSuggested] = useState<CardOut[]>([])
  const [cats, setCats] = useState<CategoryRow[]>([])
  const [catFilter, setCatFilter] = useState<string>('')
  const [onlyNode, setOnlyNode] = useState(true)
  const [editing, setEditing] = useState<CardOut | null | 'new'>(null)
  const [managing, setManaging] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const runIdRef = useRef<string | null>(null)

  async function load(): Promise<void> {
    if (activeTopicId == null) return
    const categoryId = catFilter === 'none' ? 'none' : catFilter ? Number(catFilter) : null
    const nodeId = onlyNode && selectedNodeId != null ? selectedNodeId : null
    const [c, s, k] = await Promise.all([
      window.api.estudos.cards({ topicId: activeTopicId, nodeId, categoryId }),
      window.api.estudos.cards({ topicId: activeTopicId, status: 'suggested' }),
      window.api.estudos.categories()
    ])
    setCards(c.filter((x) => x.status !== 'suggested'))
    setSuggested(s)
    setCats(k)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTopicId, selectedNodeId, catFilter, onlyNode])

  useEffect(() => {
    const off = window.api.estudos.onUpdated((p) => (p.kind === 'cards' || p.kind === 'categories') && load())
    const offDone = window.api.ai.onDone(async ({ runId: rid, ok, output, error }) => {
      if (rid !== runIdRef.current) return
      runIdRef.current = null
      setGenerating(false)
      if (!ok) return setGenError(error || t('estudos.falhaAoGerar'))
      const gen = extractCards(output)
      if (!gen || !gen.length) return setGenError(t('estudos.aIaNaoDevolveuFlashcards'))
      const { activeTopicId: tid, selectedNodeId: nid } = useStudyStore.getState()
      if (tid == null) return
      // persistidos como sugeridos: sobrevivem à navegação e não entram na fila até eu aprovar
      for (const c of gen) await window.api.estudos.createCard({ topicId: tid, nodeId: nid, front: c.front, back: c.back, status: 'suggested' })
      load()
    })
    return () => {
      off()
      offDone()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function generate(): Promise<void> {
    const content = note?.content?.trim()
    if (!content || generating) return
    setGenError('')
    setGenerating(true)
    try {
      runIdRef.current = await window.api.ai.start({ chamada: 'estudos.flashcards', params: { anotacao: content }, save: false, source: 'estudos' })
    } catch (e) {
      setGenerating(false)
      setGenError(e instanceof Error ? e.message : String(e))
    }
  }

  async function approveAll(): Promise<void> {
    for (const c of suggested) await window.api.estudos.setCardStatus(c.id, 'active')
    load()
  }

  if (!topicMeta) return <div className="empty-hint">…</div>
  const isLang = topicMeta.kind === 'language'
  const dirLabel = (d: string): string => (d === 'forward' ? (isLang ? t('est.reconhecimento') : t('est.frenteVerso')) : isLang ? t('est.producao') : t('est.versoFrente'))

  return (
    <div className="cards-panel">
      <div className="cards-toolbar">
        <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>{t('estudos.cartao')}</button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={generate}
          disabled={generating || !note?.content?.trim()}
          title={note?.content?.trim() ? t('estudos.gerarFlashcardsDaNotaSelecionada') : t('estudos.escrevaUmaAnotacaoPrimeiro')}
        >
          {generating ? t('estudos.gerando') : t('estudos.gerarDaNota')}
        </button>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="">{t('est.todasCategorias')}</option>
          <option value="none">{t('estudos.semCategoria')}</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {selectedNodeId != null && (
          <label className="study-check">
            <input type="checkbox" checked={onlyNode} onChange={(e) => setOnlyNode(e.target.checked)} />
            {t('est.soDesteItem')}
          </label>
        )}
        <button className="btn btn-secondary btn-sm" onClick={() => setManaging(true)}>{t('est.categorias')}</button>
      </div>
      {genError && <div className="study-error">{genError}</div>}

      {suggested.length > 0 && (
        <div className="chart-section suggested-box">
          <div className="chart-title" style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
            <span>{t('est.sugeridos', { count: suggested.length })}</span>
            <span style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-primary btn-sm" onClick={approveAll}>{t('est.aprovarTodos')}</button>
            </span>
          </div>
          <p className="study-hint">{t('est.sugeridosDica')}</p>
          <div className="list-stack">
            {suggested.map((c) => (
              <div key={c.id} className="list-row card-row suggested">
                <div className="card-row-text">
                  <div>{c.front}</div>
                  <div className="card-row-back">{c.back}</div>
                </div>
                <div className="list-row-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => window.api.estudos.setCardStatus(c.id, 'active').then(load)}>{t('est.aprovar')}</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditing(c)}>{t('estudos.editar')}</button>
                  <button className="btn btn-danger btn-sm" onClick={() => window.api.estudos.deleteCard(c.id).then(load)}>{t('est.recusar')}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="list-stack">
        {cards.length === 0 && <div className="empty-hint">{t('estudos.nenhumFlashcard')}</div>}
        {cards.map((c) => (
          <div key={c.id} className={`list-row card-row ${c.status === 'suspended' ? 'is-suspended' : ''}`}>
            <div className="card-row-text">
              <div lang={isLang ? topicMeta.targetLanguage ?? undefined : undefined}>{c.cardType === 'cloze' ? clozeHide(c.front) : c.front}</div>
              <div className="card-row-back">{c.back}</div>
              <div className="card-row-meta">
                {c.categoryName && <span className="project-chip">{c.categoryName}</span>}
                {c.cardType === 'cloze' && <span className="project-chip">{t('est.formatoLacuna')}</span>}
                {c.status === 'suspended' && <span className="project-chip">{t('est.suspenso')}</span>}
                {c.states.map((s) => (
                  <button
                    key={s.id}
                    className={`dir-chip ${s.suspended ? 'off' : ''}`}
                    title={s.suspended ? t('est.retomarDirecao') : t('est.suspenderDirecao')}
                    onClick={() => window.api.estudos.setStateSuspended(s.id, !s.suspended).then(load)}
                  >
                    {dirLabel(s.direction)} · {s.suspended ? t('est.suspenso') : nextLabel(s.nextReviewAt, s.lastReviewedAt == null)}
                  </button>
                ))}
              </div>
            </div>
            <div className="list-row-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(c)}>{t('estudos.editar')}</button>
              <button className="btn btn-secondary btn-sm" onClick={() => window.api.estudos.setCardStatus(c.id, c.status === 'suspended' ? 'active' : 'suspended').then(load)}>
                {c.status === 'suspended' ? t('est.reativar') : t('est.suspender')}
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => window.confirm(t('est.excluirCartao')) && window.api.estudos.deleteCard(c.id).then(load)}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <CardEditor topic={topicMeta} nodes={nodes} nodeId={selectedNodeId} card={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={load} />
      )}
      {managing && <CategoryManager onClose={() => { setManaging(false); load() }} />}
    </div>
  )
}
