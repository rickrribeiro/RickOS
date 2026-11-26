import React, { useState } from 'react'
import type { StudyNode } from '../../../types'
import type { SuggestionRow } from '../../../../shared/estudos'
import { useStudyStore } from '../store/studyStore'
import { t } from '../../../i18n'

interface Editorial {
  trecho: string
  motivo: string
  tipo: 'acrescimo' | 'ajuste' | 'pergunta' | 'ressalva' | 'erro-factual'
  sugestao: string
  substituicao: string | null
}
interface Subtopico {
  parentId: number | null
  posicao: number | null
  titulo: string
  motivo: string
  conexaoObjetivo: string
  tipo: 'pre-requisito' | 'aprofundamento'
  prerequisito: string | null
}

const parse = <T,>(s: SuggestionRow): T => JSON.parse(s.payload) as T

/** Como a nota fica: só o entorno do trecho, antes → depois (mostrado ANTES de aplicar). */
function Diff({ note, p, text }: { note: string; p: Editorial; text: string }): React.ReactElement {
  const at = note.indexOf(p.trecho)
  if (at < 0) return <div className="study-hint">{t('est.trechoSumiu')}</div>
  const before = note.slice(Math.max(0, at - 80), at)
  const after = note.slice(at + p.trecho.length, at + p.trecho.length + 80)
  const replace = p.substituicao != null
  return (
    <div className="ed-diff">
      <span className="ed-ctx">…{before}</span>
      {replace ? (
        <>
          <del>{p.trecho}</del>
          <ins>{text}</ins>
        </>
      ) : (
        <>
          <span className="ed-anchor">{p.trecho}</span>
          <ins> {text}</ins>
        </>
      )}
      <span className="ed-ctx">{after}…</span>
    </div>
  )
}

/**
 * Propostas editoriais (prompt D) sobre a MINHA nota: cada uma com trecho-alvo, motivo e a menor
 * mudança. Aceitar / Editar / Recusar / Guardar como comentário. Nada entra no texto sem eu aprovar;
 * se o trecho mudou desde a geração, peço reconciliação em vez de adivinhar.
 */
export function EditorialSuggestions({ items, onChange }: { items: SuggestionRow[]; onChange: () => void }): React.ReactElement | null {
  const { note, noteDirty, refreshActive } = useStudyStore()
  const [editing, setEditing] = useState<Record<number, string>>({})
  const [reconcile, setReconcile] = useState<Record<number, { reason: string; anchor: string }>>({})
  const pending = items.filter((s) => s.kind === 'editorial' && s.status === 'pending')
  const comments = items.filter((s) => s.kind === 'editorial' && s.status === 'comment')
  if (!pending.length && !comments.length) return null
  const content = note?.content ?? ''

  async function accept(s: SuggestionRow, anchor?: string): Promise<void> {
    const p = parse<Editorial>(s)
    const text = editing[s.id] ?? (p.substituicao ?? p.sugestao)
    const r = await window.api.estudos.acceptEditorial(s.id, { text, anchor: anchor ?? null, replace: p.substituicao != null })
    if (!r.ok) {
      setReconcile({ ...reconcile, [s.id]: { reason: r.reason, anchor: anchor ?? '' } })
      return
    }
    await refreshActive()
    onChange()
  }

  return (
    <div className="ed-box">
      {pending.length > 0 && <div className="chart-title" style={{ fontSize: 13 }}>{t('est.propostasEditoriais', { count: pending.length })}</div>}
      {noteDirty && <div className="study-hint">{t('est.aguardeSalvar')}</div>}
      {pending.map((s) => {
        const p = parse<Editorial>(s)
        const text = editing[s.id] ?? (p.substituicao ?? p.sugestao)
        const rec = reconcile[s.id]
        return (
          <div key={s.id} className="ed-item">
            <div className="ed-head">
              <span className={`project-chip ed-${p.tipo}`}>{t(`est.ed.${p.tipo}`)}</span>
              <q className="ed-trecho">{p.trecho}</q>
            </div>
            <div className="study-hint">{p.motivo}</div>
            {p.tipo === 'pergunta' ? <div className="ed-question">❓ {p.sugestao}</div> : <Diff note={content} p={p} text={text} />}
            {editing[s.id] !== undefined && <textarea rows={2} value={editing[s.id]} onChange={(e) => setEditing({ ...editing, [s.id]: e.target.value })} />}
            {rec && (
              <div className="ed-reconcile">
                <div className="study-error">{rec.reason === 'ambiguous' ? t('est.trechoAmbiguo') : t('est.trechoMudou')}</div>
                <input value={rec.anchor} onChange={(e) => setReconcile({ ...reconcile, [s.id]: { ...rec, anchor: e.target.value } })} placeholder={t('est.novoTrechoAlvo')} />
                <button className="btn btn-secondary btn-sm" disabled={!rec.anchor.trim() || noteDirty} onClick={() => accept(s, rec.anchor)}>{t('est.aplicarNoTrecho')}</button>
              </div>
            )}
            <div className="ed-actions">
              {p.tipo !== 'pergunta' && <button className="btn btn-primary btn-sm" disabled={noteDirty} onClick={() => accept(s)}>{t('est.aceitar')}</button>}
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ ...editing, [s.id]: editing[s.id] ?? text })}>{t('estudos.editar')}</button>
              <button className="btn btn-secondary btn-sm" onClick={() => window.api.estudos.decideSuggestion(s.id, 'comment').then(onChange)}>{t('est.guardarComentario')}</button>
              <button className="btn btn-danger btn-sm" onClick={() => window.api.estudos.decideSuggestion(s.id, 'rejected').then(onChange)}>{t('est.recusar')}</button>
            </div>
          </div>
        )
      })}
      {comments.length > 0 && (
        <details className="ed-comments">
          <summary>{t('est.comentarios', { count: comments.length })}</summary>
          {comments.map((s) => {
            const p = parse<Editorial>(s)
            return (
              <div key={s.id} className="ed-item comment">
                <q className="ed-trecho">{p.trecho}</q> — {p.sugestao}
                <button className="link-btn" onClick={() => window.api.estudos.decideSuggestion(s.id, 'rejected').then(onChange)}>{t('est.removerComentario')}</button>
              </div>
            )
          })}
        </details>
      )}
    </div>
  )
}

/** Subtópicos sugeridos (prompt E): pai real, título, motivo e conexão; posso mudar o pai. */
export function SubtopicSuggestions({ items, nodes, empty, onChange }: { items: SuggestionRow[]; nodes: StudyNode[]; empty?: string | null; onChange: () => void }): React.ReactElement | null {
  const { refreshActive } = useStudyStore()
  const [parent, setParent] = useState<Record<number, string>>({})
  const [title, setTitle] = useState<Record<number, string>>({})
  const [error, setError] = useState('')
  const pending = items.filter((s) => s.kind === 'subtopic' && s.status === 'pending')
  if (!pending.length) return empty ? <div className="study-hint">✓ {t('est.semSubtopicos')} {empty}</div> : null
  return (
    <div className="ed-box">
      <div className="chart-title" style={{ fontSize: 13 }}>{t('est.subtopicosSugeridos', { count: pending.length })}</div>
      {pending.map((s) => {
        const p = parse<Subtopico>(s)
        const validParent = p.parentId != null && nodes.some((n) => n.id === p.parentId) ? String(p.parentId) : ''
        const chosen = parent[s.id] ?? validParent
        return (
          <div key={s.id} className="ed-item">
            <div className="ed-head">
              <span className="project-chip">{p.tipo === 'pre-requisito' ? t('est.preRequisito') : t('est.aprofundamento')}</span>
              <input value={title[s.id] ?? p.titulo} onChange={(e) => setTitle({ ...title, [s.id]: e.target.value })} />
            </div>
            <div className="study-hint">{p.motivo}</div>
            {p.conexaoObjetivo && <div className="study-hint">🎯 {p.conexaoObjetivo}</div>}
            {p.prerequisito && <div className="study-hint">⤷ {t('est.dependeDe', { item: p.prerequisito })}</div>}
            <div className="ed-actions">
              <label className="study-hint">{t('est.dentroDe')}</label>
              <select value={chosen} onChange={(e) => setParent({ ...parent, [s.id]: e.target.value })}>
                <option value="">{t('est.raizRoteiro')}</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.title}</option>
                ))}
              </select>
              <button
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  setError('')
                  try {
                    await window.api.estudos.acceptSubtopic(s.id, { parentId: chosen ? Number(chosen) : null, title: title[s.id] ?? p.titulo })
                    await refreshActive()
                    onChange()
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e))
                  }
                }}
              >
                {t('est.aprovar')}
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => window.api.estudos.decideSuggestion(s.id, 'rejected').then(onChange)}>{t('est.recusar')}</button>
            </div>
          </div>
        )
      })}
      {error && <div className="study-error">{error}</div>}
    </div>
  )
}
