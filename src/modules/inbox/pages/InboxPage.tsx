import React, { useEffect, useState } from 'react'
import { Todo } from '../../../types'
import { useTodoStore } from '../../todo/store/todoStore'
import { useProjectStore } from '../../projects/store/projectStore'
import { TodoEditor } from '../../todo/components/TodoEditor'
import { OcrCapture } from '../components/OcrCapture'
import { timeAgo } from '../../../utils/dates'
import { runJson } from '../../projects/lib/ai'
import { isClosed } from '../../projects/lib/constants'
import { t as tr, getLocale } from '../../../i18n'

type SourceFilter = 'all' | 'ai' | 'manual'

export function InboxPage(): React.ReactElement {
  const { todos, refresh, create, setStatus, remove } = useTodoStore()
  const { projects, refresh: refreshProjects } = useProjectStore()
  const [aiSugg, setAiSugg] = useState<Record<number, number>>({})
  const [aiRunning, setAiRunning] = useState(false)
  const [aiError, setAiError] = useState('')
  const openProjects = projects.filter((p) => !isClosed(p))
  const projectOf = (id: number | null): (typeof projects)[number] | undefined => projects.find((p) => p.id === id)
  const [text, setText] = useState('')
  const [processing, setProcessing] = useState<Todo | null>(null)
  const [filter, setFilter] = useState<SourceFilter>('all')

  useEffect(() => {
    refresh()
    refreshProjects()
  }, [])

  const inboxItems = todos.filter((t) => t.status === 'inbox')
  const aiCount = inboxItems.filter((t) => t.aiGenerated === 1).length
  const items = inboxItems.filter((t) =>
    filter === 'all' ? true : filter === 'ai' ? t.aiGenerated === 1 : t.aiGenerated !== 1
  )

  /** IA sugere o projeto de cada item do inbox ainda sem projeto. */
  async function suggestProjects(): Promise<void> {
    const pending = inboxItems.filter((t) => t.projectId == null)
    if (!pending.length || !openProjects.length) return
    setAiRunning(true)
    setAiError('')
    try {
      const r = await runJson<{ items: { id: number; projectId: number | null }[] }>(
        `Classifique cada item do meu inbox no projeto mais provável, ou null se não for de nenhum projeto (compras, lembretes pessoais etc.). Seja conservador.
Projetos: ${openProjects.map((p) => `${p.id}=${p.name}${p.description ? ` (${p.description})` : ''}`).join('; ')}
Itens:
${pending.map((t) => `${t.id}: ${t.title}${t.notes ? ` — ${t.notes}` : ''}`).join('\n')}
Formato: {"items": [{"id": 1, "projectId": 2}]}`,
        'inbox'
      )
      const map: Record<number, number> = {}
      for (const it of r.items ?? []) if (it.projectId && projects.some((p) => p.id === it.projectId)) map[it.id] = it.projectId
      setAiSugg(map)
      if (!Object.keys(map).length) setAiError(tr('inbox.iaNaoEncontrouProjetos'))
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e))
    } finally {
      setAiRunning(false)
    }
  }

  async function acceptSuggestion(todoId: number): Promise<void> {
    const pid = aiSugg[todoId]
    if (!pid) return
    await window.api.projects.linkTodos([todoId], pid)
    const next = { ...aiSugg }
    delete next[todoId]
    setAiSugg(next)
    await refresh()
  }

  async function handleAdd(): Promise<void> {
    const v = text.trim()
    if (!v) return
    await create(v, 'inbox')
    setText('')
  }

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{tr('inbox.inbox')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {tr('inbox.captureAgoraProcesseDepoisAtalho')}
          </p>
        </div>
        <span className="inbox-count">{inboxItems.length}</span>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
        {(['all', 'ai', 'manual'] as SourceFilter[]).map((f) => (
          <button
            key={f}
            className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? tr('inbox.todos', { count: inboxItems.length }) : f === 'ai' ? tr('inbox.ia', { aiCount }) : tr('inbox.manual', { p0: inboxItems.length - aiCount })}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {inboxItems.some((t) => t.projectId == null) && (
          <button className="btn btn-secondary btn-sm" onClick={suggestProjects} disabled={aiRunning} title={tr('inbox.aIaSugereOProjeto')}>
            {aiRunning ? tr('inbox.classificando') : tr('inbox.sugerirProjetos')}
          </button>
        )}
        {Object.keys(aiSugg).length > 1 && (
          <button className="btn btn-primary btn-sm" onClick={async () => { for (const id of Object.keys(aiSugg)) await acceptSuggestion(Number(id)) }}>
            {tr('inbox.aceitarTodas', { count: Object.keys(aiSugg).length })}
          </button>
        )}
      </div>

      <div className="quick-add-row">
        <input
          type="text"
          placeholder={tr('inbox.oQueEstaNaSua')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          autoFocus
        />
        <button className="btn btn-primary" onClick={handleAdd}>
          {tr('inbox.capturar2')}
        </button>
      </div>

      {aiError && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>{aiError}</div>}

      <OcrCapture onCreated={refresh} />

      <div className="list-stack" style={{ marginTop: 12 }}>
        {items.length === 0 && <div className="empty-hint">{tr('inbox.inboxVazia')}</div>}
        {items.map((t) => (
          <div key={t.id} className="list-row">
            <span className="list-row-title">
              {t.aiGenerated === 1 && <span className="project-chip" title={tr('inbox.geradoPorIa')} style={{ marginRight: 6 }}>{tr('inbox.ia2')}</span>}
              {projectOf(t.projectId) && (
                <span className="project-chip" style={{ marginRight: 6, borderLeft: `3px solid ${projectOf(t.projectId)!.color}` }}>🗂 {projectOf(t.projectId)!.name}</span>
              )}
              {t.title}
              {aiSugg[t.id] && projectOf(aiSugg[t.id]) && (
                <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={() => acceptSuggestion(t.id)} title={tr('inbox.aceitarSugestaoDaIa')}>
                  ✨ {projectOf(aiSugg[t.id])!.name} ✓
                </button>
              )}
              {t.notes && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>📝 {t.notes}</span>}
              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }} title={tr('inbox.capturadoEm', { p0: new Date(t.createdAt).toLocaleString(getLocale()) })}>⏳ {timeAgo(t.createdAt)}</span>
            </span>
            <div className="list-row-actions">
              <button className="btn btn-primary btn-sm" onClick={() => setStatus(t.id, 'todo')}>
                {tr('inbox.todo')}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                style={{ color: '#10b981', borderColor: '#10b981' }}
                title={tr('inbox.moverParaTodoJaConcluido')}
                onClick={() => setStatus(t.id, 'done')}
              >
                {tr('inbox.feito')}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setProcessing(t)}>
                {tr('inbox.editar')}
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => remove(t.id)}>
                {tr('inbox.excluir')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {processing && <TodoEditor todo={processing} onClose={() => setProcessing(null)} />}
    </div>
  )
}
