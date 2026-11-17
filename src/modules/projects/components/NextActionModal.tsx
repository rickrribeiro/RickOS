import React, { useEffect, useState } from 'react'
import type { NextActionSize, Project, Todo } from '../../../types'
import { useProjectStore } from '../store/projectStore'
import { projectContext, runJson } from '../lib/ai'
import { SIZES } from '../lib/constants'

/**
 * Concluir a próxima ação fecha a tarefa dela e já pede a seguinte: uma tarefa aberta do projeto
 * ou uma nova (sugestões: próximo marco ou IA). Também serve para só definir a próxima ação.
 */
export function NextActionModal({ project, mode, onClose }: { project: Project; mode: 'complete' | 'set'; onClose: () => void }): React.ReactElement {
  const { completeNextAction, patch, overview, milestones } = useProjectStore()
  // choice: id da tarefa escolhida, 'new' (escrever uma nova) ou 'none' (sem próxima ação)
  const [choice, setChoice] = useState<number | 'new' | 'none'>('new')
  const [next, setNext] = useState(mode === 'set' ? project.nextAction ?? '' : '')
  const [size, setSize] = useState<NextActionSize | null>(mode === 'set' ? project.nextActionSize : null)
  const [todos, setTodos] = useState<Todo[]>([])
  const [aiIdeas, setAiIdeas] = useState<string[]>([])
  const [aiRunning, setAiRunning] = useState(false)
  const [error, setError] = useState('')
  const nextMs = milestones.find((m) => m.projectId === project.id && !m.doneAt)

  useEffect(() => {
    window.api.todos.getAll().then((all) => {
      const current = (project.nextAction ?? '').trim().toLowerCase()
      const isCurrent = (t: Todo): boolean =>
        project.nextActionTodoId != null ? t.id === project.nextActionTodoId : !!current && t.title.trim().toLowerCase() === current
      let open = all.filter((t) => t.projectId === project.id && t.status !== 'done' && t.status !== 'inbox')
      if (mode === 'complete') {
        // a tarefa da ação que está sendo concluída não é candidata à seguinte
        open = open.filter((t) => !isCurrent(t))
        if (open.length) setChoice(open[0].id)
      } else {
        const cur = open.find(isCurrent)
        if (cur) setChoice(cur.id)
      }
      setTodos(open)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  async function suggest(): Promise<void> {
    setAiRunning(true)
    setError('')
    try {
      const ctx = await projectContext(project, overview[project.id])
      const r = await runJson<{ actions: string[] }>(
        `${mode === 'complete' ? `Acabei de concluir a ação: "${project.nextAction}".` : ''} Sugira 3 opções de PRÓXIMA AÇÃO para este projeto: cada uma concreta, física, que caiba em uma sessão de 25-90 minutos e aproxime da linha de chegada. Formato: {"actions": ["...", "...", "..."]}\n\n${ctx}`
      )
      setAiIdeas((r.actions ?? []).slice(0, 3))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAiRunning(false)
    }
  }

  const picked = typeof choice === 'number' ? todos.find((t) => t.id === choice) ?? null : null
  const text = picked ? picked.title : choice === 'new' ? next.trim() : ''

  async function save(): Promise<void> {
    const todoId = picked?.id ?? null
    if (mode === 'complete') await completeNextAction(project.id, text || null, size, todoId)
    else await patch(project.id, { nextAction: text || null, nextActionSize: text ? size : null, nextActionTodoId: todoId })
    onClose()
  }

  function pickIdea(c: string): void {
    setChoice('new')
    setNext(c)
  }

  const chips = [...(nextMs ? [`Avançar marco: ${nextMs.title}`] : []), ...aiIdeas]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ph-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{mode === 'complete' ? '✅ Ação concluída! E agora?' : '👉 Próxima ação'}</h2>
        {mode === 'complete' && project.nextAction && <p className="ph-muted ph-strike">{project.nextAction}</p>}
        <label className="ph-label">Próxima ação de {project.name}</label>
        <select
          value={String(choice)}
          onChange={(e) => {
            const v = e.target.value
            setChoice(v === 'new' || v === 'none' ? v : Number(v))
          }}
          style={{ width: '100%' }}
        >
          {todos.length > 0 && (
            <optgroup label="Tarefas do projeto">
              {todos.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </optgroup>
          )}
          <option value="new">+ Nova tarefa…</option>
          <option value="none">— Nenhuma próxima ação</option>
        </select>
        {choice === 'new' && (
          <input
            autoFocus
            style={{ marginTop: 8 }}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="Nova tarefa: uma ação concreta"
          />
        )}
        <div className="ph-seg" style={{ marginTop: 8 }} role="group" aria-label="Tamanho">
          {SIZES.map((sz) => (
            <button key={sz.key} className={size === sz.key ? 'active' : ''} onClick={() => setSize(size === sz.key ? null : sz.key)}>
              {sz.icon} {sz.label}
            </button>
          ))}
        </div>
        {chips.length > 0 && (
          <div className="ph-chips">
            {chips.map((c) => (
              <button key={c} className="ph-chip" onClick={() => pickIdea(c)}>
                {c}
              </button>
            ))}
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={suggest} disabled={aiRunning}>
            {aiRunning ? 'Pensando…' : '✨ Sugerir com IA'}
          </button>
        </div>
        {error && <div className="ph-error">{error}</div>}
        {choice === 'new' && next.trim() && (
          <p className="ph-muted" style={{ marginTop: 8, fontSize: 12 }}>Vira uma tarefa nova em Tarefas do projeto.</p>
        )}
        {project.status === 'foco' && !text && <div className="ph-warn">Projetos em foco devem ter uma próxima ação — ele vai aparecer no radar.</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={save}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
