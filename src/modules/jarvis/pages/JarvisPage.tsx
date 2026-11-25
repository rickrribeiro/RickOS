import React, { useEffect, useRef, useState } from 'react'
import { useTodoStore } from '../../todo/store/todoStore'
import { useHabitStore } from '../../habits/store/habitStore'
import { useCalendarStore } from '../../calendar/store/calendarStore'
import { useTripStore } from '../../travel/store/tripStore'
import { localDateStr, localDayStartISO, localDayEndISO } from '../../../utils/dates'
import type { ConsumerBlock } from '../../memory/api'
import { t as tr } from '../../../i18n'

interface QuickAction {
  key: string
  label: string
  /** `mem` = bloco da Memória Pessoal (integração aprovada); vazio quando nada é relevante. */
  build: (ctx: Ctx, mem: string) => string
  /** Só ações aprovadas na matriz de integração consultam a memória (docs/memoria/integracoes.md). */
  memory?: (ctx: Ctx) => Promise<ConsumerBlock>
}

interface Ctx {
  todos: ReturnType<typeof useTodoStore.getState>['todos']
  habitNames: string[]
  events: ReturnType<typeof useCalendarStore.getState>['upcoming']
  nextTrip: ReturnType<typeof useTripStore.getState>['trips'][number] | undefined
  weekHours: string
}

const RUN_KEY = 'rickos:assistantRun'

const withMemory = (prompt: string, mem: string): string => (mem ? `${prompt}\n\n${mem}` : prompt)

const list = (items: string[]): string => items.map((t) => `- ${t}`).join('\n') || '(nenhum)'

function fmtHours(minutes: number): string {
  return tr('ai.hM', { p0: Math.floor(minutes / 60), p1: minutes % 60 })
}

const ACTIONS: QuickAction[] = [
  {
    key: 'prioritize',
    label: tr('ai.priorizarTarefas'),
    build: (c) =>
      `Você é meu assistente de produtividade. Priorize as tarefas abaixo (mais importante primeiro), explicando brevemente o porquê:\n\n${list(
        c.todos.filter((t) => t.status !== 'done' && t.status !== 'inbox').map((t) => t.title)
      )}`
  },
  {
    key: 'inbox',
    label: tr('ai.revisarInbox'),
    build: (c) =>
      `Revise minha inbox e sugira, para cada item, se vira tarefa, projeto, viagem ou financeiro, e a próxima ação:\n\n${list(
        c.todos.filter((t) => t.status === 'inbox').map((t) => t.title)
      )}`
  },
  {
    key: 'week',
    label: tr('ai.planejarASemana'),
    memory: (c) =>
      window.api.memory.ctxWeekPlan(
        [...c.todos.filter((t) => t.status !== 'done' && t.status !== 'inbox').map((t) => t.title), ...c.habitNames].join(' ').slice(0, 1500)
      ),
    build: (c, mem) =>
      withMemory(
        `Monte um plano de semana equilibrado a partir de:\n\nTarefas abertas:\n${list(
        c.todos.filter((t) => t.status !== 'done' && t.status !== 'inbox').map((t) => t.title)
      )}\n\nHábitos:\n${list(c.habitNames)}\n\nReuniões:\n${list(
        c.events.map((e) => `${e.title} (${e.startTime.slice(0, 16).replace('T', ' ')})`)
      )}`,
        mem
      )
  },
  {
    key: 'trip',
    label: tr('ai.roteiroDeViagem'),
    memory: (c) => window.api.memory.ctxTripItinerary(c.nextTrip?.destination ?? ''),
    build: (c, mem) =>
      withMemory(
        c.nextTrip
          ? `Crie um roteiro para uma viagem a ${c.nextTrip.destination}${c.nextTrip.startDate ? ` (a partir de ${c.nextTrip.startDate})` : ''}.`
          : 'Sugira um destino de viagem para mim.',
        mem
      )
  },
  {
    key: 'weekly',
    label: tr('ai.resumoSemanal'),
    build: (c) =>
      `Faça um resumo da minha semana e sugira ajustes para a próxima.\n\nHoras trabalhadas: ${c.weekHours}\n\nTarefas concluídas:\n${list(
        c.todos.filter((t) => t.status === 'done').map((t) => t.title)
      )}\n\nTarefas em aberto:\n${list(
        c.todos.filter((t) => t.status !== 'done' && t.status !== 'inbox').map((t) => t.title)
      )}\n\nHábitos monitorados:\n${list(c.habitNames)}`
  },
  {
    key: 'trip-checklist',
    label: tr('ai.checklistDeViagem'),
    build: (c) =>
      c.nextTrip
        ? `Monte um checklist completo de preparação para a viagem a ${c.nextTrip.destination}${
            c.nextTrip.startDate ? ` (${c.nextTrip.startDate}${c.nextTrip.endDate ? ` a ${c.nextTrip.endDate}` : ''})` : ''
          }: documentos, bagagem, saúde/seguro, finanças/câmbio e itens específicos do destino.`
        : 'Monte um checklist genérico de preparação de viagem internacional (documentos, bagagem, saúde, finanças).'
  }
]

export function JarvisPage(): React.ReactElement {
  const { todos, refresh: rT } = useTodoStore()
  const { habits, refresh: rH } = useHabitStore()
  const { upcoming, refresh: rC } = useCalendarStore()
  const { trips, refresh: rTr } = useTripStore()

  const [prompt, setPrompt] = useState('')
  const [output, setOutput] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [model, setModel] = useState('')
  const [permission, setPermission] = useState<'allowlist' | 'execute'>(
    () => (localStorage.getItem('ai_permission') === 'execute' ? 'execute' : 'allowlist')
  )
  const [weekMinutes, setWeekMinutes] = useState(0)
  const [runId, setRunId] = useState<string | null>(null)
  // current run id readable inside the stable onChunk/onDone listeners
  const runIdRef = useRef<string | null>(null)

  useEffect(() => {
    rT()
    rH()
    rC()
    rTr()
    window.api.settings.get('claude_model').then((m) => setModel(m ?? ''))

    const now = new Date()
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    window.api.stats
      .daily(localDayStartISO(localDateStr(monday)), localDayEndISO(localDateStr(now)))
      .then((rows) => setWeekMinutes(rows.reduce((s, r) => s + r.totalMinutes, 0)))

    // Restore the last prompt/output and reconnect to a run still owned by main
    // (background runs survive navigating away from this page).
    try {
      const saved = JSON.parse(localStorage.getItem(RUN_KEY) || 'null')
      if (saved) {
        if (typeof saved.prompt === 'string') setPrompt(saved.prompt)
        if (typeof saved.output === 'string') setOutput(saved.output)
        if (typeof saved.runId === 'string') {
          runIdRef.current = saved.runId
          setRunId(saved.runId)
          setRunning(true)
          window.api.ai.getRun(saved.runId).then((r) => {
            if (!r) {
              runIdRef.current = null
              setRunId(null)
              setRunning(false)
            } else if (r.status === 'running') {
              setRunning(true)
              setOutput(r.output)
            } else {
              runIdRef.current = null
              setRunId(null)
              setRunning(false)
              setOutput(r.output)
              setError(r.error ?? '')
            }
          })
        }
      }
    } catch {
      // ignore corrupt state
    }

    // Stream tokens / finalize by matching the current run id.
    const offChunk = window.api.ai.onChunk((rid, text) => {
      if (rid && rid === runIdRef.current) setOutput((o) => o + text)
    })
    const offDone = window.api.ai.onDone(({ runId: rid, ok, output: out, error: err }) => {
      if (rid !== runIdRef.current) return
      runIdRef.current = null
      setRunId(null)
      setRunning(false)
      setOutput(out)
      setError(ok ? '' : err ?? '')
    })
    return () => {
      offChunk()
      offDone()
    }
  }, [])

  // persist prompt/output/runId so returning to the page restores/reconnects
  useEffect(() => {
    localStorage.setItem(RUN_KEY, JSON.stringify({ prompt, output, runId }))
  }, [prompt, output, runId])

  function changeModel(m: string): void {
    setModel(m)
    window.api.settings.set('claude_model', m)
  }

  const ctx: Ctx = {
    todos,
    habitNames: habits.map((h) => h.name),
    events: upcoming,
    nextTrip: trips[0],
    weekHours: fmtHours(weekMinutes)
  }

  async function run(text: string): Promise<void> {
    if (!text.trim()) return
    // replace any in-flight run (lets a new quick-action overwrite the current one)
    const prev = runIdRef.current
    if (prev) {
      runIdRef.current = null
      try {
        await window.api.ai.cancel(prev)
      } catch {
        // ignore
      }
    }
    setError('')
    setOutput('')
    setRunning(true)
    try {
      // main owns the run → it keeps going (and streams) even if we leave the page.
      // save:false → don't clutter the Prompt Runner history with assistant runs.
      const rid = await window.api.ai.start({ prompt: text, model, save: false, permission, source: 'assistente' })
      runIdRef.current = rid
      setRunId(rid)
    } catch (e) {
      runIdRef.current = null
      setRunId(null)
      setRunning(false)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function cancel(): Promise<void> {
    if (runIdRef.current) await window.api.ai.cancel(runIdRef.current)
  }

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{tr('ai.jarvis')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {tr('ai.assistentePessoalUsaOClaude')}
          </p>
        </div>
      </div>

      <div className="suggested-row" style={{ marginBottom: 12 }}>
        {ACTIONS.map((a) => (
          <button
            key={a.key}
            className="btn btn-secondary btn-sm"
            title={tr('ai.preencheOPromptAbaixoNao')}
            onClick={async () => {
              // memória é opcional: se falhar, o atalho funciona como antes
              const mem = a.memory ? await a.memory(ctx).then((m) => m.block, () => '') : ''
              setPrompt(a.build(ctx, mem))
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>
        {tr('ai.cliqueNumAtalhoParaPreencher')} <strong>{tr('ai.executar')}</strong>.
      </p>

      <textarea
        rows={4}
        placeholder={tr('ai.pergunteAlgoOuEditeO')}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        style={{ width: '100%', resize: 'vertical' }}
      />
      <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        {running ? (
          <button className="btn btn-danger" onClick={cancel}>{tr('ai.cancelar2')}</button>
        ) : (
          <button className="btn btn-primary" disabled={!prompt.trim()} onClick={() => run(prompt)}>
            {tr('ai.executar')}
          </button>
        )}
        <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tr('ai.modelo2')}</label>
        <select value={model} onChange={(e) => changeModel(e.target.value)}>
          <option value="">{tr('ai.padrao')}</option>
          <option value="sonnet">{tr('ai.sonnet')}</option>
          <option value="opus">{tr('ai.opus')}</option>
          <option value="haiku">{tr('ai.haiku')}</option>
        </select>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }} title={tr('ai.soLiberadasUsaApenasA')}>🛡️</label>
        <select
          value={permission}
          disabled={running}
          onChange={(e) => {
            const v = e.target.value as 'allowlist' | 'execute'
            setPermission(v)
            localStorage.setItem('ai_permission', v)
          }}
        >
          <option value="allowlist">{tr('ai.soLiberadas')}</option>
          <option value="execute">{tr('ai.executarTudo')}</option>
        </select>
      </div>

      {error && (
        <div className="chart-section" style={{ marginTop: 12, borderColor: 'var(--danger)' }}>
          <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>
        </div>
      )}

      {(output || running) && (
        <div className="chart-section" style={{ marginTop: 12 }}>
          <div className="chart-title">{tr('ai.resposta')}{running ? tr('ai.executando') : ''}</div>
          <pre className="ai-output">{output || '…'}</pre>
        </div>
      )}
    </div>
  )
}
