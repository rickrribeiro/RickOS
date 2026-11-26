import React, { useEffect, useState } from 'react'
import type { MaterialView, RunRow } from '../../../../shared/estudos'
import { useStudyStore } from '../store/studyStore'
import { renderMarkdown } from '../markdown'
import { EditorialSuggestions, SubtopicSuggestions } from './Suggestions'
import { IaDiagnostico } from './IaSettings'
import { t, fmtDateTime } from '../../../i18n'

const SECOES = ['explicacao', 'resumo', 'exercicios', 'socraticas', 'revisaoAtiva', 'revisaoEditorial', 'subtopicos', 'cartoes'] as const
type Secao = (typeof SECOES)[number]

interface Itens<T> {
  itens: T[]
  vazio: string | null
}

const newKey = (): string => (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)

/**
 * Material do nó (prompt C): UM clique gera todas as seções; depois, abrir seção, revelar
 * resposta e navegar só leem o que está salvo (zero chamadas). "Gerar de novo" age numa seção ou
 * no conjunto. Editar a nota marca o material como anterior à edição, sem apagá-lo.
 */
export function MaterialPanel({ onOpenLesson, onOpenCards }: { onOpenLesson: () => void; onOpenCards: () => void }): React.ReactElement {
  const { activeTopicId, selectedNodeId, nodes, topicMeta } = useStudyStore()
  const [view, setView] = useState<MaterialView | null>(null)
  const [runs, setRuns] = useState<RunRow[]>([])
  const [sec, setSec] = useState<Secao>('explicacao')
  const [vocab, setVocab] = useState('')
  const [error, setError] = useState('')
  // estados de leitura (locais, zero chamadas)
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const [socIdx, setSocIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Set<string>>(new Set())

  async function load(): Promise<void> {
    if (activeTopicId == null) return
    const [v, r] = await Promise.all([window.api.estudos.material(activeTopicId, selectedNodeId), window.api.estudos.iaRuns({ topicId: activeTopicId, limit: 30 })])
    setView(v)
    setRuns(r.filter((x) => (x.nodeId ?? null) === (selectedNodeId ?? null) && ['pacote', 'secao', 'revisao', 'subtopicos'].includes(x.operation)))
  }

  useEffect(() => {
    setShown({})
    setSocIdx(0)
    setAnswers({})
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTopicId, selectedNodeId])

  useEffect(() => {
    const off1 = window.api.estudos.onIa((e) => e.topicId === activeTopicId && (e.nodeId ?? null) === (selectedNodeId ?? null) && load())
    const off2 = window.api.estudos.onUpdated((p) => ['notes', 'suggestions', 'nodes', 'cards'].includes(p.kind) && load())
    return () => {
      off1()
      off2()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTopicId, selectedNodeId])

  async function act(fn: () => Promise<unknown>): Promise<void> {
    setError('')
    try {
      await fn()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (activeTopicId == null || !view) return <div className="empty-hint">…</div>
  const running = runs.find((r) => r.status === 'running') ?? null
  const lastFailed = runs.find((r) => r.status !== 'running')
  const failed = lastFailed && ['error', 'invalid', 'timeout'].includes(lastFailed.status) ? lastFailed : null
  const byKey = new Map(view.sections.map((s) => [s.section, s]))
  const cur = byKey.get(sec)
  const data = cur ? (JSON.parse(cur.content) as Record<string, unknown>) : null
  const vazio = (data?.vazio as string | null) ?? null
  const isLang = topicMeta?.kind === 'language'
  const nodeId = selectedNodeId

  async function saveQuestion(key: string, kind: 'recall' | 'exercise' | 'socratic', prompt: string, reference: string | null, hint: string | null): Promise<void> {
    await window.api.estudos.saveItemAsQuestion(activeTopicId!, nodeId, kind, prompt, reference, hint)
    setSaved(new Set([...saved, key]))
  }

  async function feedbackSocratica(pergunta: string, resposta: string): Promise<void> {
    // pedir feedback livre é uma ação explícita nova (1 chamada, na aula do item)
    const { lesson } = await window.api.estudos.openLesson(activeTopicId!, nodeId)
    await window.api.estudos.sendTurn(lesson.id, `${t('est.feedbackPrefixo')}\n${t('est.perguntaRotulo')} ${pergunta}\n${t('est.minhaRespostaRotulo')} ${resposta}`, newKey())
    onOpenLesson()
  }

  return (
    <div className="material-panel">
      <div className="material-toolbar">
        <button className="btn btn-primary btn-sm" disabled={!!running} onClick={() => act(() => window.api.estudos.prepareNode(activeTopicId, nodeId, { vocabulario: vocab.split('\n').map((v) => v.trim()).filter(Boolean) }))}>
          {view.sections.length ? t('est.gerarTudoDeNovo') : t('est.prepararMaterial')}
        </button>
        {running && (
          <span className="study-hint">
            {t('est.gerandoMaterial', { op: t(`est.op.${running.operation}`) })} <button className="link-btn" onClick={() => act(() => window.api.estudos.iaCancel(running.id))}>{t('est.cancelar')}</button>
          </span>
        )}
      </div>
      {isLang && !view.sections.length && (
        <textarea rows={2} value={vocab} onChange={(e) => setVocab(e.target.value)} placeholder={t('est.vocabularioOpcional')} />
      )}
      <p className="study-hint">{t('est.materialUmaChamada')}</p>
      {failed && (
        <div className="study-error">
          {t(`est.run.${failed.status}` as 'est.run.error', { erro: failed.error ?? '' })}
          <IaDiagnostico />
        </div>
      )}
      {error && <div className="study-error">{error}</div>}

      {view.sections.length > 0 && (
        <>
          <div className="material-tabs">
            {SECOES.map((s) => {
              const m = byKey.get(s)
              const count = s === 'revisaoEditorial' ? view.suggestions.filter((x) => x.kind === 'editorial' && x.status === 'pending').length : s === 'subtopicos' ? view.suggestions.filter((x) => x.kind === 'subtopic' && x.status === 'pending').length : 0
              return (
                <button key={s} className={`study-tab ${sec === s ? 'active' : ''} ${m ? '' : 'missing'}`} onClick={() => setSec(s)}>
                  {t(`est.secao.${s}`)}
                  {count ? ` (${count})` : ''}
                </button>
              )
            })}
          </div>
          {cur ? (
            <div className="material-meta">
              {cur.stale && <span className="project-chip warn">{t('est.materialAnterior')}</span>}
              <span className="study-hint">{t('est.geradoEm', { data: fmtDateTime(cur.createdAt, { dateStyle: 'short', timeStyle: 'short' }), modelo: cur.model ?? '?', effort: cur.effort ?? '?' })}</span>
              <button className="link-btn" disabled={!!running} onClick={() => act(() => window.api.estudos.regenerateSection(activeTopicId, nodeId, sec))}>{t('est.gerarSecaoDeNovo')}</button>
            </div>
          ) : (
            <div className="study-hint">
              {t('est.secaoSemMaterial')}{' '}
              <button className="link-btn" disabled={!!running} onClick={() => act(() => window.api.estudos.regenerateSection(activeTopicId, nodeId, sec))}>{t('est.gerarSecao')}</button>
            </div>
          )}
          {vazio && <div className="study-hint">∅ {vazio}</div>}

          <div className="material-body">
            {data && (sec === 'explicacao' || sec === 'resumo') && <div className="md-preview-pane">{renderMarkdown(String(data.conteudo ?? ''))}</div>}

            {data && sec === 'exercicios' &&
              (data as unknown as Itens<{ enunciado: string; pista: string | null; solucao: string; criterios: string | null }>).itens.map((x, i) => {
                const k = `ex${i}`
                return (
                  <div key={k} className="material-item">
                    <div className="md-preview-pane">{renderMarkdown(x.enunciado)}</div>
                    <div className="ed-actions">
                      {x.pista && <button className="link-btn" onClick={() => setShown({ ...shown, [`${k}p`]: !shown[`${k}p`] })}>{t('est.verPista')}</button>}
                      <button className="link-btn" onClick={() => setShown({ ...shown, [`${k}s`]: !shown[`${k}s`] })}>{shown[`${k}s`] ? t('est.esconderSolucao') : t('est.verSolucao')}</button>
                      <button className="link-btn" disabled={saved.has(k)} onClick={() => saveQuestion(k, 'exercise', x.enunciado, [x.solucao, x.criterios].filter(Boolean).join('\n\n'), x.pista)}>
                        {saved.has(k) ? t('est.salvaEmPerguntas') : t('est.salvarEmPerguntas')}
                      </button>
                    </div>
                    {shown[`${k}p`] && x.pista && <div className="test-hint">💡 {x.pista}</div>}
                    {shown[`${k}s`] && (
                      <div className="md-preview-pane material-solution">
                        {renderMarkdown(x.solucao)}
                        {x.criterios && renderMarkdown(`**${t('est.criterios')}** ${x.criterios}`)}
                      </div>
                    )}
                  </div>
                )
              })}

            {data && sec === 'socraticas' && (() => {
              const itens = (data as unknown as Itens<{ pergunta: string; referencia: string | null }>).itens
              if (!itens.length) return null
              const i = Math.min(socIdx, itens.length - 1)
              const x = itens[i]
              const k = `so${i}`
              return (
                <div className="material-item">
                  <div className="study-hint">{t('est.socraticaN', { n: i + 1, total: itens.length })}</div>
                  <div className="flashcard-face">{x.pergunta}</div>
                  <textarea rows={3} value={answers[k] ?? ''} onChange={(e) => setAnswers({ ...answers, [k]: e.target.value })} placeholder={t('est.suaResposta')} />
                  <div className="ed-actions">
                    <button className="btn btn-secondary btn-sm" disabled={i === 0} onClick={() => setSocIdx(i - 1)}>←</button>
                    <button className="btn btn-secondary btn-sm" disabled={i >= itens.length - 1} onClick={() => setSocIdx(i + 1)}>{t('est.proximaPergunta')}</button>
                    {x.referencia && <button className="link-btn" onClick={() => setShown({ ...shown, [k]: !shown[k] })}>{t('est.verReferencia')}</button>}
                    <button className="btn btn-secondary btn-sm" disabled={!answers[k]?.trim()} onClick={() => feedbackSocratica(x.pergunta, answers[k])}>{t('est.pedirFeedback')}</button>
                    <button className="link-btn" disabled={saved.has(k)} onClick={() => saveQuestion(k, 'socratic', x.pergunta, x.referencia, null)}>{saved.has(k) ? t('est.salvaEmPerguntas') : t('est.salvarEmPerguntas')}</button>
                  </div>
                  {shown[k] && x.referencia && <div className="test-hint">{x.referencia}</div>}
                </div>
              )
            })()}

            {data && sec === 'revisaoAtiva' &&
              (data as unknown as Itens<{ pedido: string; referencia: string }>).itens.map((x, i) => {
                const k = `ra${i}`
                return (
                  <div key={k} className="material-item">
                    <div className="flashcard-face">{x.pedido}</div>
                    <textarea rows={2} value={answers[k] ?? ''} onChange={(e) => setAnswers({ ...answers, [k]: e.target.value })} placeholder={t('est.deMemoria')} />
                    <div className="ed-actions">
                      <button className="link-btn" disabled={!answers[k]?.trim() && !shown[k]} onClick={() => setShown({ ...shown, [k]: !shown[k] })}>{t('est.revelarReferencia')}</button>
                      <button className="link-btn" disabled={saved.has(k)} onClick={() => saveQuestion(k, 'recall', x.pedido, x.referencia, null)}>{saved.has(k) ? t('est.salvaEmPerguntas') : t('est.salvarEmPerguntas')}</button>
                    </div>
                    {shown[k] && <div className="md-preview-pane material-solution">{renderMarkdown(x.referencia)}</div>}
                  </div>
                )
              })}

            {sec === 'revisaoEditorial' && (
              <>
                <EditorialSuggestions items={view.suggestions} onChange={load} />
                {!view.suggestions.some((s) => s.kind === 'editorial' && s.status === 'pending') && data && <div className="study-hint">✓ {t('est.semPropostas')}</div>}
              </>
            )}

            {sec === 'subtopicos' && <SubtopicSuggestions items={view.suggestions} nodes={nodes} empty={data ? vazio ?? '' : null} onChange={load} />}

            {data && sec === 'cartoes' && (
              <div className="material-item">
                {t('est.cartoesCandidatos', { count: (data as unknown as Itens<unknown>).itens.length })}{' '}
                <button className="link-btn" onClick={onOpenCards}>{t('est.verSugeridos')}</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** Sob a nota: "Revisar minha anotação" (1 chamada, perfil editorial) + as propostas pendentes. */
export function NoteReview(): React.ReactElement | null {
  const { activeTopicId, selectedNodeId, note } = useStudyStore()
  const [view, setView] = useState<MaterialView | null>(null)
  const [running, setRunning] = useState<RunRow | null>(null)
  const [error, setError] = useState('')
  async function load(): Promise<void> {
    if (activeTopicId == null) return
    const [v, r] = await Promise.all([window.api.estudos.material(activeTopicId, selectedNodeId), window.api.estudos.iaRuns({ topicId: activeTopicId, limit: 20 })])
    setView(v)
    setRunning(r.find((x) => x.status === 'running' && (x.nodeId ?? null) === (selectedNodeId ?? null) && (x.operation === 'revisao' || x.operation === 'pacote')) ?? null)
    const last = r.find((x) => x.operation === 'revisao' && (x.nodeId ?? null) === (selectedNodeId ?? null))
    setError(last && ['error', 'invalid', 'timeout'].includes(last.status) ? t(`est.run.${last.status}` as 'est.run.error', { erro: last.error ?? '' }) : '')
  }
  useEffect(() => {
    load()
    const off1 = window.api.estudos.onIa((e) => e.topicId === activeTopicId && load())
    const off2 = window.api.estudos.onUpdated((p) => ['notes', 'suggestions'].includes(p.kind) && load())
    return () => {
      off1()
      off2()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTopicId, selectedNodeId])
  if (activeTopicId == null) return null
  const revisao = view?.sections.find((s) => s.section === 'revisaoEditorial')
  const pendentes = view?.suggestions.filter((s) => s.kind === 'editorial' && s.status === 'pending').length ?? 0
  return (
    <div className="note-review">
      <div className="ed-actions">
        <button
          className="btn btn-secondary btn-sm"
          disabled={!!running || !note?.content?.trim()}
          onClick={async () => {
            setError('')
            try {
              setRunning(await window.api.estudos.reviewNote(activeTopicId, selectedNodeId))
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e))
            }
          }}
        >
          {running ? t('est.revisando') : t('est.revisarNota')}
        </button>
        {revisao && !pendentes && <span className="study-hint">{revisao.stale ? t('est.revisaoAnterior') : t('est.semPropostas')}</span>}
      </div>
      {error && <div className="study-error">{error}</div>}
      {view && <EditorialSuggestions items={view.suggestions} onChange={load} />}
    </div>
  )
}
