import React, { useState } from 'react'
import type { AiBlock, AiPromptResponse, AiQuestion } from '../../../../../shared/aiConversations'
import { renderMarkdown } from '../../../estudos/markdown'

type ToolBlockData = Extract<AiBlock, { type: 'tool' }>

interface Props {
  block: ToolBlockData
  /** Responde um pedido pendente (permissão, pergunta, plano). */
  onRespond: (requestId: string, r: AiPromptResponse) => Promise<void>
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v, null, 2))

/** Caminho curto para exibição (últimos segmentos). */
function shortPath(p: string): string {
  const parts = p.split('/').filter(Boolean)
  return parts.length > 3 ? '…/' + parts.slice(-3).join('/') : p
}

/** Ícone + resumo de uma linha de cada ferramenta conhecida. */
function summarize(b: ToolBlockData): { icon: string; label: string; detail?: string } {
  const i = b.input ?? {}
  switch (b.name) {
    case 'Bash':
      return { icon: '⌨️', label: str(i.description) || 'Bash', detail: str(i.command) }
    case 'Read':
      return { icon: '📄', label: `Ler ${shortPath(str(i.file_path))}` }
    case 'Edit':
    case 'MultiEdit':
      return { icon: '✏️', label: `Editar ${shortPath(str(i.file_path))}` }
    case 'Write':
      return { icon: '📝', label: `Escrever ${shortPath(str(i.file_path))}` }
    case 'NotebookEdit':
      return { icon: '📓', label: `Notebook ${shortPath(str(i.notebook_path))}` }
    case 'Grep':
      return { icon: '🔍', label: `Buscar “${str(i.pattern)}”`, detail: i.path ? shortPath(str(i.path)) : undefined }
    case 'Glob':
      return { icon: '🗂️', label: `Arquivos ${str(i.pattern)}` }
    case 'WebFetch':
      return { icon: '🌐', label: str(i.url) }
    case 'WebSearch':
      return { icon: '🌐', label: `Pesquisar “${str(i.query)}”` }
    case 'Task':
    case 'Agent':
      return { icon: '🤖', label: str(i.description) || 'Subagente' }
    case 'TodoWrite':
      return { icon: '✅', label: 'Lista de tarefas' }
    case 'ToolSearch':
      return { icon: '🧰', label: 'Carregar ferramentas' }
    case 'Skill':
      return { icon: '🧩', label: `Skill ${str(i.skill)}` }
    default:
      return { icon: '🔧', label: b.name }
  }
}

function Diff({ oldText, newText }: { oldText: string; newText: string }): React.ReactElement {
  const o = oldText.split('\n')
  const n = newText.split('\n')
  return (
    <pre className="cv-diff">
      {o.map((l, k) => (
        <div key={`o${k}`} className="cv-diff-del">- {l}</div>
      ))}
      {n.map((l, k) => (
        <div key={`n${k}`} className="cv-diff-add">+ {l}</div>
      ))}
    </pre>
  )
}

function ToolDetails({ b }: { b: ToolBlockData }): React.ReactElement {
  const i = b.input ?? {}
  if (b.name === 'Edit') return <Diff oldText={str(i.old_string)} newText={str(i.new_string)} />
  if (b.name === 'MultiEdit' && Array.isArray(i.edits)) {
    return (
      <>
        {(i.edits as Array<{ old_string?: string; new_string?: string }>).map((e, k) => (
          <Diff key={k} oldText={e.old_string ?? ''} newText={e.new_string ?? ''} />
        ))}
      </>
    )
  }
  if (b.name === 'Write') return <pre className="cv-pre">{str(i.content).slice(0, 6000)}</pre>
  if (b.name === 'Bash') return <pre className="cv-pre">$ {str(i.command)}</pre>
  if (b.name === 'TodoWrite' && Array.isArray(i.todos)) {
    return (
      <ul className="cv-todos">
        {(i.todos as Array<{ content?: string; status?: string }>).map((t, k) => (
          <li key={k} className={`cv-todo-${t.status ?? 'pending'}`}>
            {t.status === 'completed' ? '☑' : t.status === 'in_progress' ? '◐' : '☐'} {t.content}
          </li>
        ))}
      </ul>
    )
  }
  if (['Read', 'Glob', 'Grep', 'WebSearch', 'ToolSearch'].includes(b.name)) return <></>
  return <pre className="cv-pre">{JSON.stringify(i, null, 2)}</pre>
}

// ── Pergunta (AskUserQuestion) ────────────────────────────────────────────────

function QuestionCard({ block: b, onRespond }: Props): React.ReactElement {
  const questions = (Array.isArray(b.input.questions) ? b.input.questions : []) as AiQuestion[]
  const pending = b.permission?.status === 'pending'
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [other, setOther] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const toggle = (q: AiQuestion, label: string): void => {
    setPicked((p) => {
      const cur = p[q.question] ?? []
      if (q.multiSelect) return { ...p, [q.question]: cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label] }
      return { ...p, [q.question]: cur[0] === label ? [] : [label] }
    })
    if (!q.multiSelect) setOther((o) => ({ ...o, [q.question]: '' }))
  }

  const answerFor = (q: AiQuestion): string => {
    const free = (other[q.question] ?? '').trim()
    const chosen = picked[q.question] ?? []
    return [...chosen, ...(free ? [free] : [])].join(', ')
  }
  const complete = questions.every((q) => answerFor(q))

  async function submit(): Promise<void> {
    if (!b.permission || !complete) return
    setBusy(true)
    const answers: Record<string, string> = {}
    for (const q of questions) answers[q.question] = answerFor(q)
    try {
      await onRespond(b.permission.requestId, { kind: 'answer', answers })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`cv-card cv-question ${pending ? 'pending' : ''}`}>
      <div className="cv-card-head">❓ {pending ? 'Claude tem uma pergunta' : 'Pergunta do Claude'}</div>
      {questions.map((q) => (
        <div key={q.question} className="cv-q">
          {q.header && <span className="cv-q-header">{q.header}</span>}
          <div className="cv-q-text">{q.question}</div>
          {pending ? (
            <>
              <div className="cv-q-options">
                {q.options.map((o) => {
                  const on = (picked[q.question] ?? []).includes(o.label)
                  return (
                    <button key={o.label} type="button" className={`cv-q-opt ${on ? 'on' : ''}`} onClick={() => toggle(q, o.label)}>
                      <span className="cv-q-opt-mark">{q.multiSelect ? (on ? '☑' : '☐') : on ? '●' : '○'}</span>
                      <span>
                        <strong>{o.label}</strong>
                        {o.description && <span className="cv-q-opt-desc">{o.description}</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
              <input
                type="text"
                className="cv-q-other"
                placeholder="Outra resposta…"
                value={other[q.question] ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setOther((x) => ({ ...x, [q.question]: v }))
                  if (!q.multiSelect && v) setPicked((p) => ({ ...p, [q.question]: [] }))
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && complete) submit()
                }}
              />
            </>
          ) : (
            <div className="cv-q-answer">→ {b.answers?.[q.question] ?? b.permission?.note ?? '—'}</div>
          )}
        </div>
      ))}
      {pending && (
        <div className="cv-actions">
          <button className="btn btn-primary btn-sm" disabled={!complete || busy} onClick={submit}>
            Responder
          </button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={() => b.permission && onRespond(b.permission.requestId, { kind: 'deny', message: 'Prefiro não responder agora; siga com o seu melhor julgamento.' })}
          >
            Pular
          </button>
        </div>
      )}
    </div>
  )
}

// ── Plano (ExitPlanMode) ──────────────────────────────────────────────────────

function PlanCard({ block: b, onRespond }: Props): React.ReactElement {
  const pending = b.permission?.status === 'pending'
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (r: AiPromptResponse): Promise<void> => {
    if (!b.permission) return
    setBusy(true)
    try {
      await onRespond(b.permission.requestId, r)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={`cv-card cv-plan ${pending ? 'pending' : ''}`}>
      <div className="cv-card-head">📋 Plano {b.permission && !pending && <span className="cv-note">· {b.permission.note}</span>}</div>
      <div className="cv-plan-body">{renderMarkdown(str(b.input.plan))}</div>
      {pending && (
        <>
          <div className="cv-actions">
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run({ kind: 'approvePlan', mode: 'acceptEdits' })}>
              ✅ Aprovar e aceitar edições
            </button>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run({ kind: 'approvePlan', mode: 'default' })}>
              Aprovar (perguntar cada edição)
            </button>
          </div>
          <div className="cv-deny-row">
            <input type="text" placeholder="Ajustes no plano…" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run({ kind: 'deny', message: feedback.trim() || 'Continue planejando.' })}>
              Continuar planejando
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Ferramenta genérica (com aprovação de permissão) ─────────────────────────

export function ToolBlock({ block: b, onRespond }: Props): React.ReactElement | null {
  const [denying, setDenying] = useState(false)
  const [denyMsg, setDenyMsg] = useState('')
  const [busy, setBusy] = useState(false)

  if (b.name === 'AskUserQuestion') return <QuestionCard block={b} onRespond={onRespond} />
  if (b.name === 'ExitPlanMode') return <PlanCard block={b} onRespond={onRespond} />

  const s = summarize(b)
  const pending = b.permission?.status === 'pending'
  const hasDetails = !['Read', 'Glob', 'Grep', 'WebSearch', 'ToolSearch'].includes(b.name) || !!b.result
  const canAlways = !!b.permission?.suggestions?.length

  const respond = async (r: AiPromptResponse): Promise<void> => {
    if (!b.permission) return
    setBusy(true)
    try {
      await onRespond(b.permission.requestId, r)
    } finally {
      setBusy(false)
    }
  }

  const status = b.result === undefined ? (pending ? '' : '⋯') : b.isError ? '✗' : '✓'

  return (
    <div className={`cv-tool ${pending ? 'pending' : ''} ${b.isError ? 'error' : ''}`}>
      <details open={pending || b.name === 'TodoWrite' || b.name === 'Edit' || b.name === 'MultiEdit'}>
        <summary>
          <span className="cv-tool-icon">{s.icon}</span>
          <span className="cv-tool-label">{s.label}</span>
          {s.detail && b.name === 'Grep' && <span className="cv-tool-detail">{s.detail}</span>}
          {b.permission && !pending && b.permission.note && <span className={`cv-perm-note ${b.permission.status}`}>{b.permission.note}</span>}
          <span className={`cv-tool-status ${b.isError ? 'err' : ''}`}>{status}</span>
        </summary>
        {hasDetails && (
          <div className="cv-tool-body">
            <ToolDetails b={b} />
            {b.result !== undefined && b.result.trim() && <pre className={`cv-pre cv-result ${b.isError ? 'err' : ''}`}>{b.result}</pre>}
          </div>
        )}
      </details>
      {pending && (
        <div className="cv-perm">
          <div className="cv-perm-text">
            🤚 Claude quer usar <strong>{b.name}</strong>
            {b.permission?.blockedPath ? <> em <code className="md-code">{shortPath(b.permission.blockedPath)}</code></> : null}
          </div>
          <div className="cv-actions">
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => respond({ kind: 'allow' })}>
              Permitir
            </button>
            {canAlways && (
              <button
                className="btn btn-secondary btn-sm"
                disabled={busy}
                title="Salva a regra sugerida pelo Claude (como o “sempre permitir” do terminal)"
                onClick={() => respond({ kind: 'allow', always: true })}
              >
                Permitir sempre
              </button>
            )}
            <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => (denying ? respond({ kind: 'deny', message: denyMsg }) : setDenying(true))}>
              {denying ? 'Negar e enviar' : 'Negar'}
            </button>
          </div>
          {denying && (
            <div className="cv-deny-row">
              <input
                type="text"
                autoFocus
                placeholder="O que ele deve fazer em vez disso? (opcional)"
                value={denyMsg}
                onChange={(e) => setDenyMsg(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') respond({ kind: 'deny', message: denyMsg })
                  if (e.key === 'Escape') setDenying(false)
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
