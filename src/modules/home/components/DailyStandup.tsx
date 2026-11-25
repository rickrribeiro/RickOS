import React, { useEffect, useRef, useState } from 'react'
import { renderMarkdown } from '../../estudos/markdown'
import { localDateStr, localDayStartISO, localDayEndISO } from '../../../utils/dates'
import { projectsDigest } from '../../projects/components/ProjectsReviewPanel'
import { t as tr } from '../../../i18n'

const STATE_KEY = 'rickos:dailyStandup'

interface Saved {
  date: string
  output: string
}

function loadSaved(): Saved | null {
  try {
    const v = JSON.parse(localStorage.getItem(STATE_KEY) || 'null')
    if (v && typeof v.output === 'string') return v
  } catch {
    // ignore
  }
  return null
}

/** Morning briefing: gathers today's context (todos, due flashcards, events, yesterday's
 *  hours) and asks the local Claude for an executive summary + time-boxed schedule. */
export function DailyStandup(): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const runId = useRef<string | null>(null)
  const today = localDateStr(new Date())

  useEffect(() => {
    const saved = loadSaved()
    if (saved && saved.date === today) setOutput(saved.output)
    const offChunk = window.api.ai.onChunk((rid, text) => {
      if (rid && rid === runId.current) setOutput((o) => o + text)
    })
    const offDone = window.api.ai.onDone(({ runId: rid, ok, output: out, error: err }) => {
      if (rid !== runId.current) return
      runId.current = null
      setRunning(false)
      if (!ok) return setError(err || tr('home.falhaAoGerarOBriefing'))
      setOutput(out)
      localStorage.setItem(STATE_KEY, JSON.stringify({ date: today, output: out }))
    })
    return () => {
      offChunk()
      offDone()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function buildContext(): Promise<string> {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 86400000)
    const yStr = localDateStr(yesterday)
    const [todos, due, events, yStats, model, projects, todayFocus] = await Promise.all([
      window.api.todos.getAll(),
      window.api.study.due(now.toISOString()),
      window.api.calendar.range(localDayStartISO(today), localDayEndISO(today)),
      window.api.stats.daily(localDayStartISO(yStr), localDayEndISO(yStr)),
      window.api.settings.get('claude_model'),
      projectsDigest().catch(() => ''),
      window.api.settings.get('projects_today_focus')
    ])
    let focusToday = ''
    try {
      const f = JSON.parse(todayFocus || 'null') as { date: string; items: { text: string; done: boolean }[] } | null
      if (f && f.date === today) focusToday = f.items.map((i) => `- [${i.done ? 'x' : ' '}] ${i.text}`).join('\n')
    } catch {
      // ignore
    }
    const open = todos.filter((t) => t.status !== 'done' && t.status !== 'inbox')
    const overdue = open.filter((t) => t.dueDate && t.dueDate < today)
    const dueToday = open.filter((t) => t.dueDate === today)
    const fmtT = (t: { title: string; priority: number; dueDate: string | null }): string =>
      `- ${t.title}${t.dueDate ? ` (prazo ${t.dueDate})` : ''}${t.priority ? ` [P${t.priority}]` : ''}`
    const yMin = yStats.reduce((s, r) => s + r.totalMinutes, 0)
    const ctx = `Tarefas atrasadas:\n${overdue.map(fmtT).join('\n') || '(nenhuma)'}
\nTarefas para hoje:\n${dueToday.map(fmtT).join('\n') || '(nenhuma)'}
\nOutras tarefas abertas:\n${open.filter((t) => !t.dueDate).slice(0, 10).map(fmtT).join('\n') || '(nenhuma)'}
\nFlashcards para revisar hoje: ${due.length}
\nEventos de hoje:\n${events.map((e) => `- ${e.title} (${e.startTime.slice(11, 16)})`).join('\n') || '(nenhum)'}
\nHoras trabalhadas ontem: ${Math.floor(yMin / 60)}h ${yMin % 60}m
\nProjetos (situação, próxima ação, alertas):\n${projects || '(nenhum)'}
\nFoco de hoje escolhido:\n${focusToday || '(não escolhido)'}`
    return JSON.stringify({ model: model ?? '', ctx })
  }

  async function run(): Promise<void> {
    setError('')
    setOutput('')
    setRunning(true)
    setOpen(true)
    try {
      const { ctx } = JSON.parse(await buildContext()) as { ctx: string }
      runId.current = await window.api.ai.start({ chamada: 'home.briefing', params: { contexto: ctx }, save: false, source: 'home' })
    } catch (e) {
      setRunning(false)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="chart-section" style={{ marginBottom: 12 }}>
      <div className="chart-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{tr('home.briefingDoDia')}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {output && !running && <button className="btn btn-secondary btn-sm" onClick={() => setOpen((o) => !o)}>{open ? tr('home.ocultar') : tr('home.ver')}</button>}
          <button className="btn btn-primary btn-sm" onClick={run} disabled={running}>
            {running ? tr('home.gerando') : output ? tr('home.atualizar') : tr('home.gerarBriefing')}
          </button>
        </div>
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
      {open && (running || output) && (
        <div className="md-preview-pane" style={{ marginTop: 10, minHeight: 0 }}>
          {output ? renderMarkdown(output) : <div className="empty-hint">{tr('home.montandoSeuDia')}</div>}
        </div>
      )}
    </div>
  )
}
