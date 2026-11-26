import React, { useEffect, useState } from 'react'
import type { PlanRow, RunRow, TopicRow } from '../../../../shared/estudos'
import { renderMarkdown } from '../markdown'
import { IaDiagnostico } from './IaSettings'
import { t } from '../../../i18n'

interface Modulo {
  titulo: string
  perguntaCentral?: string
  conceitos?: string[]
  exemplo?: string
  atividade?: string
  perguntaDiagnostica?: string
  criterioAvanco?: string
  opcional?: boolean
  minutos?: number | null
  excluir?: boolean
}
interface Abertura {
  titulo: string
  situacao: string
  /** Desde estudos-pedagogia-2026-11-27; planos antigos não têm. */
  aula?: string
  primeiroPasso: string
  pergunta: string
}
interface Plano {
  perguntas: string[]
  suposicoes: string[]
  situacao: string
  jaSei: string
  restricoes?: string[]
  preferenciasEnsino?: string[]
  decisoesEmAberto?: string[]
  fundamentos: string[]
  demonstracaoFinal: string
  partes: { titulo: string; porque?: string; modulos: Modulo[]; excluir?: boolean }[]
  ordemJustificativa: string
  aprofundamentosOpcionais: string[]
  workshops: { titulo: string; entrega?: string; experimento?: string; excluir?: boolean }[]
  coberturaReversa: string
  aberturaPrimeiraAula?: Abertura
  aConferir: string[]
}

/** A abertura como vai aparecer na aula (mesma composição do servidor em textoAbertura). */
function aberturaMd(ab: Abertura): string {
  const aula = ab.aula?.trim() ?? ''
  const pergunta = ab.pergunta?.trim() ?? ''
  const perguntaJaNaAula = !!pergunta && aula.replace(/\s+/g, ' ').includes(pergunta.replace(/\s+/g, ' ').slice(0, 60))
  return [
    aula ? '' : ab.situacao,
    aula,
    ab.primeiroPasso && `**${t('est.primeiroPassoHojeCurto')}** ${ab.primeiroPasso}`,
    pergunta && !perguntaJaNaAula && `**${t('est.perguntaRotulo')}** ${pergunta}`
  ]
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Masterclass (prompt A): "quero estudar X para conseguir Y" → mapa completo editável → aprovar.
 * Gerar = 1 chamada (perfil plano). Abrir, editar, aprovar, descartar = zero chamadas.
 */
export function PlanPanel({ topic, onClose, onApproved }: { topic: TopicRow; onClose: () => void; onApproved: (lessonId: number | null) => void }): React.ReactElement {
  const [pedido, setPedido] = useState(topic.goal ? t('est.pedidoPadrao', { objetivo: topic.goal }) : '')
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [run, setRun] = useState<RunRow | null>(null)
  const [draft, setDraft] = useState<Plano | null>(null)
  const [dirty, setDirty] = useState(false)
  const [respostas, setRespostas] = useState<string[]>([])
  const [ctx, setCtx] = useState<{ chars: number; contexto: string } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // celular: uma coluna por vez (no desktop as duas ficam lado a lado)
  const [view, setView] = useState<'mapa' | 'aula'>('aula')

  const proposta = plans.find((p) => p.status === 'proposed') ?? null

  async function load(): Promise<void> {
    const [ps, runs] = await Promise.all([window.api.estudos.plans(topic.id), window.api.estudos.iaRuns({ topicId: topic.id, limit: 10 })])
    setPlans(ps)
    const last = runs.find((r) => r.operation === 'masterclass') ?? null
    setRun(last)
    const prop = ps.find((p) => p.status === 'proposed')
    if (prop && !dirty) {
      try {
        setDraft(JSON.parse(prop.content))
      } catch {
        setDraft(null)
      }
    }
  }

  useEffect(() => {
    load()
    window.api.estudos.masterclassContext(topic.id).then(setCtx)
    return window.api.estudos.onIa((e) => e.operation === 'masterclass' && e.topicId === topic.id && load())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.id])

  async function gerar(extra?: string): Promise<void> {
    setError('')
    const texto = [pedido.trim(), extra].filter(Boolean).join('\n\n')
    if (!texto) return
    try {
      setRun(await window.api.estudos.masterclass(topic.id, texto))
      setDirty(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function edit(fn: (p: Plano) => void): void {
    if (!draft) return
    const copy = JSON.parse(JSON.stringify(draft)) as Plano
    fn(copy)
    setDraft(copy)
    setDirty(true)
  }

  async function salvar(): Promise<void> {
    if (!proposta || !draft) return
    await window.api.estudos.editPlan(proposta.id, draft)
    setDirty(false)
    load()
  }

  async function aprovar(): Promise<void> {
    if (!proposta || !draft) return
    setBusy(true)
    try {
      const r = await window.api.estudos.approvePlan(proposta.id, draft)
      onApproved(r.lessonId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const running = run?.status === 'running'
  const pedidoForm = (
    <>
      <div className="editor-field">
        <label>{t('est.pedidoRotulo')}</label>
        <textarea
          rows={Math.min(14, Math.max(3, pedido.split('\n').length + 1))}
          value={pedido}
          onChange={(e) => setPedido(e.target.value)}
          placeholder={t('est.pedidoPlaceholder')}
        />
        <span className="study-hint">{t('est.pedidoDica')}</span>
      </div>
      {ctx && (
        <details className="privacy-note">
          <summary>{t('est.privacidadeResumo', { count: ctx.chars })}</summary>
          <p className="study-hint">{t('est.privacidadeExplica')}</p>
          <pre>{ctx.contexto}</pre>
        </details>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" disabled={running || !pedido.trim()} onClick={() => gerar()}>
          {running ? t('est.gerandoRoteiro') : proposta ? t('est.repensarRoteiro') : t('est.gerarRoteiro')}
        </button>
        {running && run && <button className="btn btn-secondary btn-sm" onClick={() => window.api.estudos.iaCancel(run.id)}>{t('est.cancelar')}</button>}
      </div>
    </>
  )
  const failed = run && ['error', 'invalid', 'timeout'].includes(run.status) && (!proposta || (proposta.runId ?? 0) < run.id)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal study-modal plan-modal ${draft && proposta ? 'has-draft' : ''}`} onClick={(e) => e.stopPropagation()}>
        <h2>{t('est.roteiroTitulo')}</h2>
        {draft && proposta ? (
          // com proposta na tela, o pedido recolhe: o espaço fica para o mapa e a aula
          <details className="plan-request" open={running}>
            <summary>
              <strong>{t('est.seuPedido')}</strong> <span className="study-hint">{proposta.request.replace(/\s+/g, ' ').slice(0, 140)}{proposta.request.length > 140 ? '…' : ''}</span>
            </summary>
            {pedidoForm}
          </details>
        ) : (
          pedidoForm
        )}
        {running && <p className="study-hint">{t('est.podeNavegar')}</p>}
        {failed && run && (
          <div className="study-error">
            {t(`est.run.${run.status}` as 'est.run.error', { erro: run.error ?? '' })}
            <IaDiagnostico />
          </div>
        )}
        {error && <div className="study-error">{error}</div>}

        {draft && proposta && (
          <div className="plan-view">
            {draft.perguntas?.length > 0 && (
              <details className="source-form plan-questions">
                <summary><strong>{t('est.perguntasDoTutor')}</strong> <span className="project-chip">{draft.perguntas.length}</span></summary>
                {draft.perguntas.map((q, i) => (
                  <div key={i} className="editor-field">
                    <label>{q}</label>
                    <input value={respostas[i] ?? ''} onChange={(e) => { const r = [...respostas]; r[i] = e.target.value; setRespostas(r) }} />
                  </div>
                ))}
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={running || respostas.every((r) => !r?.trim())}
                  onClick={() => gerar(draft.perguntas.map((q, i) => `P: ${q}\nR: ${respostas[i] ?? ''}`).join('\n'))}
                >
                  {t('est.responderERegerar')}
                </button>
              </details>
            )}
            <div className="plan-switch" role="tablist">
              <button role="tab" aria-selected={view === 'aula'} className={`study-tab ${view === 'aula' ? 'active' : ''}`} onClick={() => setView('aula')}>{t('est.primeiraAula')}</button>
              <button role="tab" aria-selected={view === 'mapa'} className={`study-tab ${view === 'mapa' ? 'active' : ''}`} onClick={() => setView('mapa')}>
                {t('est.mapaN', { count: draft.partes.reduce((n, p) => n + (p.excluir ? 0 : p.modulos.filter((m) => !m.excluir).length), 0) })}
              </button>
            </div>
            <div className="plan-preview">
              <section className={`plan-map ${view === 'mapa' ? 'pane-on' : 'pane-off'}`}>
                <div className="plan-brief">
                  <div><strong>{t('est.situacao')}</strong> {draft.situacao}</div>
                  {draft.jaSei && <div><strong>{t('est.jaSei')}</strong> {draft.jaSei}</div>}
                  {draft.restricoes?.length ? <div><strong>{t('est.restricoes')}</strong> {draft.restricoes.join(' · ')}</div> : null}
                  {draft.preferenciasEnsino?.length ? <div><strong>{t('est.preferencias')}</strong> {draft.preferenciasEnsino.join(' · ')}</div> : null}
                  {draft.decisoesEmAberto?.length ? <div><strong>{t('est.decisoesEmAberto')}</strong> {draft.decisoesEmAberto.join(' · ')}</div> : null}
                  {draft.suposicoes?.length > 0 && <div className="study-hint"><strong>{t('est.suposicoes')}</strong> {draft.suposicoes.join(' · ')}</div>}
                  <div><strong>{t('est.entregaFinal')}</strong> {draft.demonstracaoFinal}</div>
                </div>
                {draft.ordemJustificativa && <p className="study-hint">{draft.ordemJustificativa}</p>}
                {draft.partes.map((parte, pi) => (
                  <div key={pi} className={`plan-part ${parte.excluir ? 'excluded' : ''}`}>
                    <div className="plan-row">
                      <input className="plan-title" value={parte.titulo} onChange={(e) => edit((d) => (d.partes[pi].titulo = e.target.value))} aria-label={t('est.tituloParte')} />
                      <label className="study-check"><input type="checkbox" checked={!parte.excluir} onChange={(e) => edit((d) => (d.partes[pi].excluir = !e.target.checked))} />{t('est.incluir')}</label>
                    </div>
                    {parte.porque && <div className="study-hint">{parte.porque}</div>}
                    {parte.modulos.map((m, mi) => (
                      <details key={mi} className={`plan-module ${m.excluir ? 'excluded' : ''}`}>
                        <summary>
                          <span className="plan-module-title">{m.titulo}</span>
                          {m.opcional && <span className="project-chip">{t('est.opcional')}</span>}
                          {m.minutos ? <span className="project-chip">{t('est.min', { count: m.minutos })}</span> : null}
                          <label className="study-check" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={!m.excluir} onChange={(e) => edit((d) => (d.partes[pi].modulos[mi].excluir = !e.target.checked))} />
                            {t('est.incluir')}
                          </label>
                        </summary>
                        <div className="plan-details">
                          <input value={m.titulo} onChange={(e) => edit((d) => (d.partes[pi].modulos[mi].titulo = e.target.value))} aria-label={t('est.tituloModulo')} />
                          {m.perguntaCentral && <div><strong>{t('est.perguntaCentral')}</strong> {m.perguntaCentral}</div>}
                          {m.conceitos?.length ? <div><strong>{t('est.conceitos')}</strong> {m.conceitos.join(' · ')}</div> : null}
                          {m.exemplo && <div><strong>{t('est.exemplo')}:</strong> {m.exemplo}</div>}
                          {m.atividade && <div><strong>{t('est.atividade')}</strong> {m.atividade}</div>}
                          {m.criterioAvanco && <div><strong>{t('est.paraAvancar')}</strong> {m.criterioAvanco}</div>}
                        </div>
                      </details>
                    ))}
                  </div>
                ))}
                {draft.workshops?.length > 0 && (
                  <div className="plan-part">
                    <strong>{t('est.workshops')}</strong>
                    {draft.workshops.map((w, wi) => (
                      <div key={wi} className={`plan-module ${w.excluir ? 'excluded' : ''}`}>
                        <div className="plan-row">
                          <input value={w.titulo} onChange={(e) => edit((d) => (d.workshops[wi].titulo = e.target.value))} />
                          <label className="study-check"><input type="checkbox" checked={!w.excluir} onChange={(e) => edit((d) => (d.workshops[wi].excluir = !e.target.checked))} />{t('est.incluir')}</label>
                        </div>
                        <div className="plan-details">{w.entrega} {w.experimento && `· ${w.experimento}`}</div>
                      </div>
                    ))}
                  </div>
                )}
                {draft.aConferir?.length > 0 && <p className="study-hint"><strong>{t('est.aConferir')}</strong> {draft.aConferir.join(' · ')}</p>}
              </section>
              <section className={`plan-lesson ${view === 'aula' ? 'pane-on' : 'pane-off'}`}>
                {draft.aberturaPrimeiraAula ? (
                  <>
                    <div className="study-hint">{t('est.primeiraAulaDica')}</div>
                    <h3>{draft.aberturaPrimeiraAula.titulo}</h3>
                    <div className="md-preview-pane plan-lesson-body">{renderMarkdown(aberturaMd(draft.aberturaPrimeiraAula))}</div>
                  </>
                ) : (
                  <div className="study-hint">{t('est.semAbertura')}</div>
                )}
              </section>
            </div>
            <div className="modal-actions plan-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => window.api.estudos.discardPlan(proposta.id).then(() => { setDraft(null); load() })}>{t('est.descartarRoteiro')}</button>
              {dirty && <button className="btn btn-secondary btn-sm" onClick={salvar}>{t('est.salvarEdicoes')}</button>}
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={aprovar} title={t('est.aprovarDica')}>{t('est.aprovarEComecar')}</button>
            </div>
          </div>
        )}
        {!draft && (
          <div className="modal-actions">
            <button className="btn btn-secondary btn-sm" onClick={onClose}>{t('estudos.fechar')}</button>
          </div>
        )}
      </div>
    </div>
  )
}
