import React, { useEffect, useMemo, useState } from 'react'
import { useUIStore } from '../../../store/uiStore'
import type { ContinueAction, LibraryGroup, LibraryTopic, TimeOption, TopicRow, TopicStatus } from '../../../../shared/estudos'
import type { StudyTopicHours } from '../../../types'
import { useStudyStore } from '../store/studyStore'
import { TopicEditor, TOPIC_STATUS_LABEL } from '../components/TopicEditor'
import { StudySearch } from '../components/StudySearch'
import { RepoPanel, SyncButton } from '../components/RepoPanel'
import { IaSettings } from '../components/IaSettings'
import { t as tr } from '../../../i18n'

const GROUPS: LibraryGroup[] = ['ativos', 'futuros', 'antigos']
const GROUP_KEY = 'rickos:studyGroup'
const MINUTES = [10, 25, 50]

function loadGroup(): LibraryGroup {
  try {
    const v = localStorage.getItem(GROUP_KEY)
    return v === 'futuros' || v === 'antigos' ? v : 'ativos'
  } catch {
    return 'ativos'
  }
}

/** Uma linha que explica por que o Continuar escolheu isto. */
function reasonText(c: ContinueAction): string {
  switch (c.reason) {
    case 'pinned':
      return tr('est.motivoFixado')
    case 'checkpoint':
      return c.whereStopped ? tr('est.motivoCheckpointFrase', { frase: c.whereStopped }) : tr('est.motivoCheckpoint')
    case 'plan':
      return tr('est.motivoRoteiro')
    case 'manual':
      return tr('est.motivoManual')
    case 'empty-topic':
      return tr('est.motivoVazio')
    default:
      return tr('est.motivoNada')
  }
}

/** Home de Estudos: Continuar → tempo disponível → testar → biblioteca. Nada aqui chama IA. */
export function EstudosDashboardPage(): React.ReactElement {
  const { setPage } = useUIStore()
  const { openAt, setActiveTopic } = useStudyStore()
  const [lib, setLib] = useState<LibraryTopic[]>([])
  const [cont, setCont] = useState<ContinueAction | null>(null)
  const [group, setGroup] = useState<LibraryGroup>(loadGroup)
  const [query, setQuery] = useState('')
  const [minutes, setMinutes] = useState<number | null>(null)
  const [timeFilter, setTimeFilter] = useState<{ category: string; language: string; topicId: string }>({ category: '', language: '', topicId: '' })
  const [time, setTime] = useState<{ fits: TimeOption[]; fallback: TimeOption[] } | null>(null)
  const [due, setDue] = useState(0)
  const [questions, setQuestions] = useState(0)
  const [hours, setHours] = useState<StudyTopicHours[]>([])
  const [editing, setEditing] = useState<TopicRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [futureName, setFutureName] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [repoOpen, setRepoOpen] = useState(false)
  const [iaOpen, setIaOpen] = useState(false)

  async function load(): Promise<void> {
    const [l, c, q, qs] = await Promise.all([
      window.api.estudos.library(),
      window.api.estudos.continue(),
      window.api.estudos.queue({}),
      window.api.estudos.questions({})
    ])
    setLib(l)
    setCont(c)
    setDue(q.items.length)
    setQuestions(qs.length)
  }

  useEffect(() => {
    load()
    window.api.tasks.studyHours().then(setHours)
    return window.api.estudos.onUpdated(() => load())
  }, [])

  useEffect(() => {
    if (minutes == null) return setTime(null)
    window.api.estudos
      .timeOptions(minutes, {
        category: timeFilter.category || null,
        language: timeFilter.language || null,
        topicId: timeFilter.topicId ? Number(timeFilter.topicId) : null
      })
      .then(setTime)
  }, [minutes, timeFilter, lib])

  function pickGroup(g: LibraryGroup): void {
    setGroup(g)
    try {
      localStorage.setItem(GROUP_KEY, g)
    } catch { /* sem storage */ }
  }

  async function openTopic(id: number): Promise<void> {
    await setActiveTopic(id)
    setPage('estudos-topic')
  }

  async function runContinue(): Promise<void> {
    if (!cont || cont.topicId == null) return setCreating(true)
    await openAt(cont.topicId, cont.nodeId, cont.target, cont.refId)
    setPage('estudos-topic')
  }

  async function startEmpty(target: 'note' | 'source' | 'roadmap'): Promise<void> {
    if (!cont?.topicId) return
    await openAt(cont.topicId, null, target === 'roadmap' ? 'note' : target, null)
    if (target === 'roadmap') useStudyStore.setState({ focus: { target: 'note', refId: -1 } }) // -1 = abrir o roteiro
    setPage('estudos-topic')
  }

  async function openOption(o: TimeOption): Promise<void> {
    if (o.kind === 'cards') return setPage('estudos-review')
    if (o.kind === 'questions') return setPage('estudos-test')
    if (o.topicId != null) {
      await openAt(o.topicId, o.nodeId, 'note', null)
      setPage('estudos-topic')
    }
  }

  async function addFuture(): Promise<void> {
    if (!futureName.trim()) return
    await window.api.estudos.createFuture(futureName)
    setFutureName('')
    pickGroup('futuros')
  }

  async function setStatus(tp: LibraryTopic, status: TopicStatus): Promise<void> {
    await window.api.estudos.setTopicStatus(tp.id, status)
  }

  async function importTopic(kind: 'json' | 'folder'): Promise<void> {
    const r = kind === 'json' ? await window.api.study.importJson() : await window.api.study.importFolder()
    if (r.ok) {
      if (r.topicId) await openTopic(r.topicId)
    } else if (r.error) {
      alert(tr('estudos.falhaAoImportar', { error: r.error }))
    }
  }

  const counts = useMemo(() => {
    const m: Record<LibraryGroup, number> = { ativos: 0, futuros: 0, antigos: 0 }
    for (const x of lib) m[x.group]++
    return m
  }, [lib])

  // buscar procura nos três grupos; sem busca, mostra o grupo escolhido
  const q = query.trim().toLowerCase()
  const shown = q ? lib.filter((x) => `${x.name} ${x.category ?? ''} ${x.goal ?? ''}`.toLowerCase().includes(q)) : lib.filter((x) => x.group === group)
  const categories = [...new Set(lib.filter((x) => x.group === 'ativos' && x.category).map((x) => x.category!))].sort()
  const languages = [...new Set(lib.filter((x) => x.group === 'ativos' && x.targetLanguage).map((x) => x.targetLanguage!))].sort()

  return (
    <div className="module-page study-home">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{tr('estudos.estudos')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{tr('est.subtituloHome')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setPage('estudos-review')}>{tr('estudos.revisoes2', { count: due })}</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setPage('estudos-test')}>{tr('est.testarContagem', { count: questions })}</button>
          <SyncButton onOpen={() => setRepoOpen(true)} />
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>{tr('estudos.topico')}</button>
        </div>
      </div>

      {/* 1. Continuar */}
      <div className="study-continue">
        <div className="study-continue-main">
          <button className="btn btn-primary study-continue-btn" onClick={runContinue}>
            {cont?.reason === 'nothing' ? tr('est.criarPrimeiro') : tr('est.continuar')}
          </button>
          <div className="study-continue-text">
            {cont?.topicName && (
              <strong>
                {cont.topicName}
                {cont.nodeTitle ? ` › ${cont.nodeTitle}` : ''}
              </strong>
            )}
            {cont && <span>{reasonText(cont)}</span>}
          </div>
        </div>
        {cont?.reason === 'empty-topic' && (
          <div className="study-continue-empty">
            <button className="btn btn-secondary btn-sm" onClick={() => startEmpty('note')}>{tr('est.comecarEscrevendo')}</button>
            <button className="btn btn-secondary btn-sm" onClick={() => startEmpty('source')}>{tr('est.importarMaterial')}</button>
            <button className="btn btn-secondary btn-sm" onClick={() => startEmpty('roadmap')}>{tr('est.criarRoteiro')}</button>
          </div>
        )}
      </div>

      {/* 2. Tenho N minutos */}
      <div className="study-time">
        <span className="study-time-label">{tr('est.tenho')}</span>
        {MINUTES.map((m) => (
          <button key={m} className={`btn btn-sm ${minutes === m ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMinutes(minutes === m ? null : m)}>
            {tr('est.minutos', { count: m })}
          </button>
        ))}
        {minutes != null && (
          <>
            <select value={timeFilter.topicId} onChange={(e) => setTimeFilter({ ...timeFilter, topicId: e.target.value })}>
              <option value="">{tr('est.todosTopicos')}</option>
              {lib.filter((x) => x.group === 'ativos').map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
            {categories.length > 0 && (
              <select value={timeFilter.category} onChange={(e) => setTimeFilter({ ...timeFilter, category: e.target.value })}>
                <option value="">{tr('est.todasCategorias')}</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
            {languages.length > 0 && (
              <select value={timeFilter.language} onChange={(e) => setTimeFilter({ ...timeFilter, language: e.target.value })}>
                <option value="">{tr('est.todosIdiomas')}</option>
                {languages.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
          </>
        )}
      </div>
      {time && (
        <div className="list-stack" style={{ marginBottom: 16 }}>
          {time.fits.map((o) => (
            <button key={`n${o.nodeId}`} className="list-row study-option" onClick={() => openOption(o)}>
              <span className="project-chip">{tr('est.min', { count: o.minutes ?? 0 })}</span>
              <span className="list-row-title">{o.title}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.topicName}</span>
            </button>
          ))}
          {!time.fits.length && <div className="empty-hint">{tr('est.nadaCabe')}</div>}
          {time.fallback.map((o) => (
            <button key={o.kind} className="list-row study-option" onClick={() => openOption(o)}>
              <span className="list-row-title">
                {o.kind === 'resume-note' && tr('est.retomarNota', { titulo: o.title })}
                {o.kind === 'cards' && tr('est.fazerCartoes', { count: o.count ?? 0 })}
                {o.kind === 'questions' && tr('est.responderPerguntas', { count: o.count ?? 0 })}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 3. Biblioteca */}
      <div className="study-lib-head">
        <div className="study-tabs" role="tablist">
          {GROUPS.map((g) => (
            <button key={g} role="tab" aria-selected={!q && group === g} className={`study-tab ${!q && group === g ? 'active' : ''}`} onClick={() => pickGroup(g)}>
              {tr(`est.grupo.${g}`)} <span className="study-tab-count">{counts[g]}</span>
            </button>
          ))}
        </div>
        <input className="study-lib-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('est.buscarNosTres')} />
      </div>

      {group === 'futuros' && !q && (
        <div className="study-future-add">
          <input value={futureName} onChange={(e) => setFutureName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addFuture()} placeholder={tr('est.futuroPlaceholder')} />
          <button className="btn btn-secondary btn-sm" onClick={addFuture} disabled={!futureName.trim()}>{tr('est.adicionarFuturo')}</button>
        </div>
      )}

      <div className="list-stack">
        {shown.length === 0 && <div className="empty-hint">{q ? tr('est.nenhumResultado') : tr(`est.vazio.${group}`)}</div>}
        {shown.map((tp) => {
          const pct = tp.nodesTotal ? Math.round((tp.nodesDone / tp.nodesTotal) * 100) : 0
          return (
            <div key={tp.id} className="list-row study-lib-row">
              <span className="priority-dot" style={{ background: tp.color }} />
              <button className="list-row-title" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => openTopic(tp.id)}>
                {tp.name}
                {tp.whereStopped && <span className="study-where">{tr('est.ondeParei', { frase: tp.whereStopped })}</span>}
              </button>
              {q && <span className="project-chip">{tr(`est.grupo.${tp.group}`)}</span>}
              {tp.kind === 'language' && tp.targetLanguage && <span className="project-chip">🗣 {tp.targetLanguage}</span>}
              {tp.category && <span className="project-chip">{tp.category}</span>}
              {tp.group === 'antigos' && <span className="project-chip">{TOPIC_STATUS_LABEL[tp.status]}</span>}
              {tp.nodesTotal > 0 && (
                <div className="bar-track study-lib-bar" title={tr('estudos.concluidos', { done: tp.nodesDone, total: tp.nodesTotal })}>
                  <div className="bar-fill" style={{ width: `${pct}%`, background: tp.color }} />
                </div>
              )}
              {tp.cards > 0 && <span className="project-chip" title={tr('estudos.flashcards')}>🃏 {tp.cards}{tp.due ? ` · ${tp.due}` : ''}</span>}
              <div className="list-row-actions">
                {tp.status !== 'studying' && <button className="btn btn-secondary btn-sm" onClick={() => setStatus(tp, 'studying')}>{tp.status === 'planned' ? tr('est.ativar') : tr('est.reativar')}</button>}
                {tp.status === 'studying' && <button className="btn btn-secondary btn-sm" onClick={() => setStatus(tp, 'paused')}>{tr('est.pausar')}</button>}
                {tp.status === 'studying' && <button className="btn btn-secondary btn-sm" onClick={() => setStatus(tp, 'completed')}>{tr('est.concluir')}</button>}
                {tp.group === 'antigos' && tp.kind === 'language' && (
                  <label className="study-check" title={tr('est.revisarArquivadoDica')}>
                    <input type="checkbox" checked={!!tp.reviewWhenArchived} onChange={(e) => window.api.estudos.updateTopic(tp.id, { reviewWhenArchived: e.target.checked })} />
                    {tr('est.revisarArquivado')}
                  </label>
                )}
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(tp)}>{tr('estudos.editar')}</button>
                <button className="btn btn-danger btn-sm" onClick={() => window.confirm(tr('estudos.excluirETodoOConteudo', { name: tp.name })) && window.api.study.deleteTopic(tp.id).then(load)}>✕</button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="study-home-footer">
        <button className="btn btn-secondary btn-sm" onClick={() => setShowSearch(!showSearch)}>{tr('est.buscarConteudo')}</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setIaOpen(true)}>{tr('est.iaBotao')}</button>
        <button className="btn btn-secondary btn-sm" onClick={() => importTopic('json')} title={tr('estudos.importarBackupJsonDeUm')}>{tr('estudos.json')}</button>
        <button className="btn btn-secondary btn-sm" onClick={() => importTopic('folder')} title={tr('estudos.importarPastaMarkdownObsidian')}>{tr('estudos.pasta')}</button>
      </div>
      {showSearch && <StudySearch />}

      {hours.length > 0 && (
        <>
          <h3 className="dash-heading">{tr('estudos.horasDeFocoPorTopico')}</h3>
          <div className="chart-section">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(() => {
                const max = Math.max(...hours.map((h) => h.minutes), 1)
                return hours.map((h) => (
                  <div key={h.topicId}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 2 }}>
                      <span>{h.topicName}</span>
                      <span>{Math.floor(h.minutes / 60)}{tr('estudos.hM', { p0: h.minutes % 60 })}</span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(h.minutes / max) * 100}%` }} />
                    </div>
                  </div>
                ))
              })()}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>{tr('estudos.vinculeUmaTarefaAUm')}</p>
          </div>
        </>
      )}

      {iaOpen && <IaSettings onClose={() => setIaOpen(false)} />}
      {repoOpen && <RepoPanel onClose={() => { setRepoOpen(false); load() }} />}
      {(creating || editing) && (
        <TopicEditor
          topic={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => load()}
        />
      )}
    </div>
  )
}
