import React, { useEffect, useState } from 'react'
import type { CardOut, CategoryRow, CardType, TopicRow } from '../../../../shared/estudos'
import type { StudyNode } from '../../../types'
import { t } from '../../../i18n'

/**
 * Criar/editar cartão. Idioma-alvo do tópico, categoria do cartão, formato (frente/verso ou
 * lacuna) e direção da prática são coisas diferentes. Nada aqui chama IA.
 */
export function CardEditor({
  topic,
  nodes,
  nodeId,
  card,
  onClose,
  onSaved
}: {
  topic: TopicRow
  nodes: StudyNode[]
  nodeId: number | null
  card: CardOut | null
  onClose: () => void
  onSaved: () => void
}): React.ReactElement {
  const isLang = topic.kind === 'language'
  const [cats, setCats] = useState<CategoryRow[]>([])
  const [cardType, setCardType] = useState<CardType>((card?.cardType as CardType) ?? 'basic')
  const [front, setFront] = useState(card?.front ?? '')
  const [back, setBack] = useState(card?.back ?? '')
  const [categoryId, setCategoryId] = useState<number | null>(card?.categoryId ?? null)
  const [node, setNode] = useState<number | null>(card ? card.nodeId : nodeId)
  const [example, setExample] = useState(card?.example ?? '')
  const [reading, setReading] = useState(card?.reading ?? '')
  const [variants, setVariants] = useState((card?.variants ?? []).join('\n'))
  const [drill, setDrill] = useState(card?.drill ?? '')
  const [language, setLanguage] = useState(card?.language ?? '')
  const hasReverse = card ? card.states.some((s) => s.direction === 'reverse' && !s.suspended) : isLang
  const [reverse, setReverse] = useState(hasReverse)
  const [newCat, setNewCat] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    window.api.estudos.categories().then(setCats)
  }, [])

  async function addCategory(): Promise<void> {
    if (!newCat.trim()) return
    try {
      const c = await window.api.estudos.createCategory(newCat)
      setCats([...cats, c])
      setCategoryId(c.id)
      setNewCat('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function save(keepOpen = false): Promise<void> {
    setError('')
    const input = {
      topicId: topic.id,
      nodeId: node,
      front,
      back,
      cardType,
      categoryId,
      language: language.trim() || null,
      example: example || null,
      reading: reading || null,
      variants: variants.split('\n').map((v) => v.trim()).filter(Boolean),
      drill: drill || null,
      reverse: cardType === 'cloze' ? false : reverse
    }
    try {
      if (card) await window.api.estudos.updateCard(card.id, input)
      else await window.api.estudos.createCard(input)
      onSaved()
      if (keepOpen && !card) {
        setFront('')
        setBack('')
        setExample('')
        setReading('')
        setVariants('')
        setDrill('')
      } else onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const frontLabel = cardType === 'cloze' ? t('est.fraseComLacuna') : isLang ? t('est.frenteIdioma') : t('estudos.frentePergunta')
  const backLabel = cardType === 'cloze' ? t('est.tradOpcional') : isLang ? t('est.versoIdioma') : t('estudos.versoResposta')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal study-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{card ? t('est.editarCartao') : t('est.novoCartao')}</h2>
        <div className="editor-row">
          <div className="editor-field">
            <label>{t('est.formato')}</label>
            <select value={cardType} onChange={(e) => setCardType(e.target.value as CardType)}>
              <option value="basic">{t('est.formatoBasico')}</option>
              <option value="cloze">{t('est.formatoLacuna')}</option>
            </select>
          </div>
          <div className="editor-field">
            <label>{t('est.categoria')}</label>
            <select value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{t('estudos.semCategoria')}</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="study-inline-add">
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder={t('est.novaCategoria')} onKeyDown={(e) => e.key === 'Enter' && addCategory()} />
          <button className="btn btn-secondary btn-sm" onClick={addCategory} disabled={!newCat.trim()}>＋</button>
        </div>
        <div className="editor-field">
          <label>{frontLabel}</label>
          <textarea rows={2} value={front} onChange={(e) => setFront(e.target.value)} autoFocus lang={isLang ? topic.targetLanguage ?? undefined : undefined} placeholder={cardType === 'cloze' ? t('est.lacunaDica') : ''} />
        </div>
        <div className="editor-field">
          <label>{backLabel}</label>
          <textarea rows={2} value={back} onChange={(e) => setBack(e.target.value)} />
        </div>
        {isLang && (
          <div className="editor-field">
            <label>{t('est.leituraTransliteracao')}</label>
            <input value={reading} onChange={(e) => setReading(e.target.value)} placeholder="Míngtiān jǐ diǎn jiànmiàn?" />
          </div>
        )}
        <div className="editor-field">
          <label>{t('est.exemplo')}</label>
          <textarea rows={2} value={example} onChange={(e) => setExample(e.target.value)} />
        </div>
        {cardType === 'basic' && (
          <label className="study-check">
            <input type="checkbox" checked={reverse} onChange={(e) => setReverse(e.target.checked)} />
            {isLang ? t('est.praticarProducao') : t('est.praticarReverso')}
          </label>
        )}
        {cardType === 'basic' && reverse && (
          <div className="editor-field">
            <label>{t('est.variantes')}</label>
            <textarea rows={2} value={variants} onChange={(e) => setVariants(e.target.value)} placeholder={t('est.variantesDica')} />
          </div>
        )}
        <div className="editor-field">
          <label>{t('est.exercicioContextual')}</label>
          <input value={drill} onChange={(e) => setDrill(e.target.value)} placeholder={t('est.exercicioContextualDica')} />
        </div>
        <div className="editor-row">
          <div className="editor-field">
            <label>{t('estudos.item')}</label>
            <select value={node ?? ''} onChange={(e) => setNode(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{t('estudos.visaoGeralTopico')}</option>
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>{n.title}</option>
              ))}
            </select>
          </div>
          {isLang && (
            <div className="editor-field">
              <label>{t('est.idiomaCartao')}</label>
              <input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder={topic.targetLanguage ?? ''} />
            </div>
          )}
        </div>
        {error && <div className="study-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>{t('estudos.cancelar')}</button>
          {!card && <button className="btn btn-secondary btn-sm" onClick={() => save(true)}>{t('est.salvarEOutro')}</button>}
          <button className="btn btn-primary btn-sm" onClick={() => save()}>{t('estudos.salvar')}</button>
        </div>
      </div>
    </div>
  )
}

/** Gerenciar categorias: criar, renomear, apagar (os cartões ficam sem categoria). */
export function CategoryManager({ onClose }: { onClose: () => void }): React.ReactElement {
  const [cats, setCats] = useState<CategoryRow[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const load = (): Promise<void> => window.api.estudos.categories().then(setCats)
  useEffect(() => {
    load()
  }, [])
  async function act(fn: () => Promise<unknown>): Promise<void> {
    setError('')
    try {
      await fn()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal study-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('est.categorias')}</h2>
        <div className="list-stack">
          {cats.map((c) => (
            <div key={c.id} className="list-row">
              <input
                defaultValue={c.name}
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.name && act(() => window.api.estudos.renameCategory(c.id, e.target.value))}
              />
              <span className="project-chip">🃏 {c.cards}</span>
              <button className="btn btn-danger btn-sm" onClick={() => window.confirm(t('est.apagarCategoria', { nome: c.name })) && act(() => window.api.estudos.deleteCategory(c.id))}>✕</button>
            </div>
          ))}
        </div>
        <div className="study-inline-add">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('est.novaCategoria')} />
          <button className="btn btn-secondary btn-sm" disabled={!name.trim()} onClick={() => act(() => window.api.estudos.createCategory(name)).then(() => setName(''))}>＋</button>
        </div>
        {error && <div className="study-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-primary btn-sm" onClick={onClose}>{t('estudos.fechar')}</button>
        </div>
      </div>
    </div>
  )
}
