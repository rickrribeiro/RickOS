import React, { useEffect, useRef, useState } from 'react'
import { useTaskStore } from '../../store/taskStore'
import { useTagStore } from '../../store/tagStore'
import { PomodoroWidget } from './PomodoroWidget'
import { useProjectStore } from '../../../projects/store/projectStore'
import { useUIStore } from '../../../../store/uiStore'
import { t as tr } from '../../../../i18n'

function formatDuration(startTime: string): string {
  const diff = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000)
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  const s = diff % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface StudyOption {
  id: number
  label: string
}

export function ActiveTask(): React.ReactElement {
  const { activeTask, startTask, stopActiveTask, switchTask } = useTaskStore()
  const { tags } = useTagStore()
  const [timer, setTimer] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newTagId, setNewTagId] = useState<number | null>(null)
  const [newSecondaryTagId, setNewSecondaryTagId] = useState<number | null>(null)
  const [newStudyNodeId, setNewStudyNodeId] = useState<number | null>(null)
  const [newProjectId, setNewProjectId] = useState<number | null>(null)
  const { projects, refresh: refreshProjects } = useProjectStore()
  const { openProject } = useUIStore()
  const openProjects = projects.filter((p) => p.status !== 'concluido' && p.status !== 'encerrado')
  const [studyOptions, setStudyOptions] = useState<StudyOption[]>([])
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  // Phone: the switch form is collapsed behind a "Trocar" button (CSS < 900px only).
  const [switchOpen, setSwitchOpen] = useState(false)

  // One option per study topic. The session still links to a node (tasks.studyNodeId): the
  // topic's first top-level node, so the time counts toward the topic like before.
  useEffect(() => {
    if (!projects.length) void refreshProjects()
    Promise.all([window.api.study.topics(), window.api.study.allNodes()]).then(([topics, nodes]) => {
      const rank = (n: { parentId: number | null; orderIndex: number; id: number }): [number, number, number] => [n.parentId == null ? 0 : 1, n.orderIndex, n.id]
      const before = (a: (typeof nodes)[number], b: (typeof nodes)[number]): boolean => {
        const ra = rank(a), rb = rank(b)
        return ra[0] !== rb[0] ? ra[0] < rb[0] : ra[1] !== rb[1] ? ra[1] < rb[1] : ra[2] < rb[2]
      }
      const firstNode = new Map<number, (typeof nodes)[number]>()
      for (const n of nodes) {
        const cur = firstNode.get(n.topicId)
        if (!cur || before(n, cur)) firstNode.set(n.topicId, n)
      }
      setStudyOptions(
        topics
          .filter((tp) => firstNode.has(tp.id))
          .map((tp) => ({ id: firstNode.get(tp.id)!.id, label: tp.name }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      )
    })
  }, [])

  useEffect(() => {
    if (activeTask) {
      const update = () => setTimer(formatDuration(activeTask.startTime))
      update()
      intervalRef.current = setInterval(update, 1000)
    } else {
      setTimer('')
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [activeTask])

  const handleStart = async () => {
    if (!newTitle.trim()) return
    await startTask(newTitle.trim(), newTagId, newSecondaryTagId, newStudyNodeId, newProjectId)
    setNewTitle('')
    setNewProjectId(null)
  }

  const handleSwitch = async () => {
    if (!newTitle.trim()) return
    await switchTask(newTitle.trim(), newTagId, newSecondaryTagId, newStudyNodeId, newProjectId)
    setNewTitle('')
    setNewProjectId(null)
    setSwitchOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (activeTask) handleSwitch()
      else handleStart()
    }
  }

  return (
    <div className={`active-task-bar ${switchOpen ? 'switch-open' : ''} ${activeTask ? 'has-active' : ''}`}>
      {activeTask ? (
        <>
          <div className="active-task-info">
            <div className="active-task-dot" />
            <span className="active-task-title">{activeTask.title}</span>
            {activeTask.studyTopicName && (
              <span className="active-task-tag" style={{ background: activeTask.studyTopicColor || '#6366f1' }} title={activeTask.studyNodeTitle || ''}>
                📖 {activeTask.studyTopicName}
              </span>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              {activeTask.projectName && (
                <button
                  className="active-task-tag"
                  style={{ background: activeTask.projectColor || '#6366f1', border: 'none', cursor: 'pointer' }}
                  title={tr('timetracker.abrirProjeto')}
                  onClick={() => activeTask.projectId && openProject(activeTask.projectId)}
                >
                  🗂 {activeTask.projectName}
                </button>
              )}
              {activeTask.tagName && (
                <span
                  className="active-task-tag"
                  style={{ background: activeTask.tagColor || '#6b7280' }}
                >
                  {activeTask.tagName}
                </span>
              )}
              {activeTask.secondaryTagName && (
                <span
                  className="active-task-tag"
                  style={{ background: activeTask.secondaryTagColor || '#6b7280', opacity: 0.8 }}
                >
                  {activeTask.secondaryTagName}
                </span>
              )}
            </div>
          </div>
          <div className="active-task-timer">{timer}</div>
          <button
            className="btn btn-secondary btn-sm mobile-switch-toggle"
            onClick={() => setSwitchOpen((v) => !v)}
            aria-expanded={switchOpen}
          >
            {switchOpen ? '✕' : tr('timetracker.trocar')}
          </button>
          <div className="active-task-controls">
            <div className="task-input-row">
              <input
                type="text"
                placeholder={tr('timetracker.switchTo')}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <select
                value={newTagId ?? ''}
                onChange={(e) => setNewTagId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">{tr('timetracker.tag1')}</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <select
                value={newSecondaryTagId ?? ''}
                onChange={(e) => setNewSecondaryTagId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">{tr('timetracker.tag2')}</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {studyOptions.length > 0 && (
                <select value={newStudyNodeId ?? ''} onChange={(e) => setNewStudyNodeId(e.target.value ? Number(e.target.value) : null)} title={tr('timetracker.vincularAUmEstudo')}>
                  <option value="">{tr('timetracker.estudo')}</option>
                  {studyOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              )}
              {openProjects.length > 0 && (
                <select value={newProjectId ?? ''} onChange={(e) => setNewProjectId(e.target.value ? Number(e.target.value) : null)} title={tr('timetracker.vincularAUmProjetoConta')} style={{ minWidth: 0, width: 120 }}>
                  <option value="">{tr('timetracker.projeto')}</option>
                  {openProjects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
              <button className="btn btn-primary" onClick={handleSwitch}>
                {tr('timetracker.switch')}
              </button>
            </div>
            <button className="btn btn-danger" onClick={stopActiveTask}>
              {tr('timetracker.stop')}
            </button>
          </div>
        </>
      ) : (
        <div className="task-input-row" style={{ flex: 1 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{tr('timetracker.noActiveTask')}</span>
          <input
            type="text"
            placeholder={tr('timetracker.whatAreYouWorkingOn')}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ flex: 1 }}
            autoFocus
          />
          <select
            value={newTagId ?? ''}
            onChange={(e) => setNewTagId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{tr('timetracker.tag1')}</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select
            value={newSecondaryTagId ?? ''}
            onChange={(e) => setNewSecondaryTagId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{tr('timetracker.tag2')}</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {studyOptions.length > 0 && (
            <select value={newStudyNodeId ?? ''} onChange={(e) => setNewStudyNodeId(e.target.value ? Number(e.target.value) : null)} title={tr('timetracker.vincularAUmEstudo')}>
              <option value="">{tr('timetracker.estudo')}</option>
              {studyOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          )}
          {openProjects.length > 0 && (
                <select value={newProjectId ?? ''} onChange={(e) => setNewProjectId(e.target.value ? Number(e.target.value) : null)} title={tr('timetracker.vincularAUmProjetoConta')} style={{ minWidth: 0, width: 120 }}>
                  <option value="">{tr('timetracker.projeto')}</option>
                  {openProjects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
          <button className="btn btn-primary" onClick={handleStart}>
            {tr('timetracker.start2')}
          </button>
        </div>
      )}
      <PomodoroWidget />
    </div>
  )
}
