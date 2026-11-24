import React, { useEffect, useRef, useState } from 'react'
import { renderMarkdown } from '../../estudos/markdown'
import { localDateStr, localDayStartISO, localDayEndISO } from '../../../utils/dates'
import { projectsDigest } from '../../projects/components/ProjectsReviewPanel'
import { LAST_REVIEW_KEY } from '../../projects/lib/constants'

/** Último relatório gerado (no servidor: desktop e celular veem o mesmo). */
const REPORT_KEY = 'weekly_review_report'
/** runId em andamento — se a página for trocada no meio, o resultado é recuperado ao voltar. */
const PENDING_KEY = 'weekly_review_pending'

interface Saved {
  generatedAt: string
  output: string
}

const DAY = 86400000

function fmtGenerated(iso: string): string {
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / DAY)
  const when = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return days <= 0 ? `hoje (${when})` : days === 1 ? `ontem (${when})` : `há ${days} dias (${when})`
}

/** Coleta o contexto da semana (inbox, TODOs zumbis, projetos, hábitos, finanças, horas,
 *  agenda) e devolve o prompt do relatório final. */
async function buildPrompt(): Promise<string> {
  const today = localDateStr(new Date())
  const month = today.slice(0, 7)
  const weekAgo = localDateStr(new Date(Date.now() - 6 * DAY))
  const nextWeek = localDateStr(new Date(Date.now() + 6 * DAY))
  const [todos, habits, entries, txs, budgets, events, stats, digest] = await Promise.all([
    window.api.todos.getAll(),
    window.api.habits.getAll(),
    window.api.habits.getEntriesRange(weekAgo, today),
    window.api.transactions.getAll(month),
    window.api.budgets.getForMonth(month),
    window.api.calendar.range(localDayStartISO(today), localDayEndISO(nextWeek)),
    window.api.stats.daily(localDayStartISO(weekAgo), localDayEndISO(today)),
    projectsDigest().catch(() => '')
  ])

  const inbox = todos.filter((t) => t.status === 'inbox')
  const open = todos.filter((t) => t.status !== 'done' && t.status !== 'inbox')
  const cutoff = Date.now() - 14 * DAY
  const zombies = open.filter((t) => new Date(t.createdAt).getTime() < cutoff)

  const done = new Set(entries.map((e) => `${e.habitId}|${e.date}`))
  const habitLines = habits
    .filter((h) => h.active === 1)
    .map((h) => {
      let n = 0
      for (let i = 0; i < 7; i++) if (done.has(`${h.id}|${localDateStr(new Date(Date.now() - i * DAY))}`)) n++
      return `- ${h.name}: ${n}/7`
    })

  const counted = txs.filter((t) => !t.ignoredReason && !t.investment)
  const expense = counted.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const income = counted.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const budget = budgets.reduce((s, b) => s + b.amount, 0)
  const minutes = stats.reduce((s, r) => s + r.totalMinutes, 0)
  const list = (xs: string[]): string => xs.join('\n') || '(nenhum)'

  return `Você é meu chefe de gabinete fazendo minha REVISÃO SEMANAL. Com base no contexto abaixo, escreva o RELATÓRIO FINAL em Markdown, direto e honesto, com estas seções (curtas, sem repetir o contexto):
## 🎯 3 focos da semana
## 📅 Plano por dia (seg-dom, realista, encaixando os eventos)
## 🗂 Projetos — uma decisão por projeto aberto (continuar / pausar com condição de retomada / retomar / focar / concluir / encerrar) e o porquê em 1 linha; no máximo 3 em foco; aponte os estagnados
## 📥 Inbox e TODOs zumbis — ação curta para cada (virar tarefa com prazo, fazer agora, reescrever menor, reagendar ou matar)
## 🔥 Hábitos — o que vai bem, o mais frágil e 1 ajuste
## 💰 Finanças — estou no caminho? 1-2 sugestões
Omita uma seção se não houver dados. Não invente compromissos que não estão no contexto.

Contexto (hoje é ${today}):
Horas trabalhadas nos últimos 7 dias: ${Math.floor(minutes / 60)}h ${minutes % 60}m

Projetos:
${digest || '(nenhum)'}

Inbox (${inbox.length}):
${list(inbox.map((t) => `- ${t.title}`))}

TODOs abertos há +14 dias (${zombies.length}):
${list(zombies.map((t) => `- ${t.title}`))}

Tarefas abertas (${open.length}, as 20 mais prioritárias):
${list([...open].sort((a, b) => b.priority - a.priority).slice(0, 20).map((t) => `- ${t.title}${t.dueDate ? ` (prazo ${t.dueDate})` : ''}`))}

Hábitos (últimos 7 dias):
${list(habitLines)}

Finanças do mês ${month}: receitas ${income.toFixed(0)} · gastos ${expense.toFixed(0)} · orçamento ${budget.toFixed(0)}

Eventos dos próximos 7 dias:
${list(events.map((e) => `- ${e.title} (${e.startTime.slice(0, 16).replace('T', ' ')})`))}`
}

/** Revisão semanal no dashboard: um botão gera o relatório final, que fica salvo até o próximo. */
export function WeeklyReview(): React.ReactElement {
  const [saved, setSaved] = useState<Saved | null>(null)
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [stream, setStream] = useState('')
  const [error, setError] = useState('')
  // Memória Pessoal (produtor aprovado `home.weekly_review`): só o que VOCÊ escrever aqui, por botão
  const [learnOpen, setLearnOpen] = useState(false)
  const [learned, setLearned] = useState('')
  const [learnMsg, setLearnMsg] = useState('')
  const runId = useRef<string | null>(null)

  async function persist(output: string): Promise<void> {
    const s: Saved = { generatedAt: new Date().toISOString(), output }
    setSaved(s)
    await window.api.settings.set(REPORT_KEY, JSON.stringify(s))
    await window.api.settings.set(PENDING_KEY, '')
    await window.api.settings.set(LAST_REVIEW_KEY, s.generatedAt)
  }

  useEffect(() => {
    let alive = true
    const offChunk = window.api.ai.onChunk((rid, text) => {
      if (rid && rid === runId.current) setStream((o) => o + text)
    })
    const offDone = window.api.ai.onDone(({ runId: rid, ok, output, error: err }) => {
      if (rid !== runId.current) return
      runId.current = null
      setRunning(false)
      setStream('')
      if (!ok) {
        setError(err || 'Falha ao gerar a revisão.')
        void window.api.settings.set(PENDING_KEY, '')
        return
      }
      void persist(output)
    })

    ;(async () => {
      const [raw, pending] = await Promise.all([window.api.settings.get(REPORT_KEY), window.api.settings.get(PENDING_KEY)])
      if (!alive) return
      try {
        const v = JSON.parse(raw || 'null') as Saved | null
        if (v && typeof v.output === 'string') setSaved(v)
      } catch {
        // ignora
      }
      // geração iniciada antes de sair da página: retoma ou recupera o resultado
      if (pending) {
        const run = await window.api.ai.getRun(pending).catch(() => null)
        if (!alive) return
        if (run?.status === 'running') {
          runId.current = pending
          setRunning(true)
          setOpen(true)
          setStream(run.output)
        } else if (run?.status === 'done' && run.output) {
          await persist(run.output)
          setOpen(true)
        } else {
          void window.api.settings.set(PENDING_KEY, '')
        }
      }
    })()

    return () => {
      alive = false
      offChunk()
      offDone()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function generate(): Promise<void> {
    setError('')
    setStream('')
    setRunning(true)
    setOpen(true)
    try {
      const [base, model, mem] = await Promise.all([
        buildPrompt(),
        window.api.settings.get('claude_model'),
        // consumer aprovado: objetivos/produtividade/aprendizados; opcional
        window.api.memory.ctxWeeklyReview().then((r) => r.block, () => '')
      ])
      const prompt = mem ? `${base}\n\n${mem}` : base
      const rid = await window.api.ai.start({ prompt, model: model ?? '', save: false, source: 'revisao' })
      runId.current = rid
      await window.api.settings.set(PENDING_KEY, rid)
    } catch (e) {
      setRunning(false)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const content = running ? stream : saved?.output ?? ''

  return (
    <div className="chart-section" style={{ marginBottom: 12 }}>
      <div className="chart-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>
          🗓️ Revisão semanal
          {saved && !running && (
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
              gerada {fmtGenerated(saved.generatedAt)}
            </span>
          )}
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {saved && !running && (
            <button className="btn btn-secondary btn-sm" onClick={() => setOpen((o) => !o)}>
              {open ? 'Ocultar' : 'Ver'}
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={generate} disabled={running}>
            {running ? 'Gerando…' : saved ? '↻ Gerar de novo' : '🗓️ Gerar revisão'}
          </button>
        </div>
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
      <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setLearnOpen((o) => !o)}>
        📝 {learnOpen ? 'Fechar' : 'O que aprendi nesta semana'}
      </button>
      {learnOpen && (
        <div style={{ marginTop: 8 }}>
          <textarea
            rows={3}
            value={learned}
            onChange={(e) => setLearned(e.target.value)}
            placeholder="Aprendizados, o que funcionou, o que quer mudar… A IA sugere memórias para você revisar no Inbox da Memória Pessoal."
            style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary btn-sm"
              disabled={learned.trim().length < 20}
              onClick={() =>
                window.api.memory.produceWeeklyReview(learned).then(
                  () => {
                    setLearned('')
                    setLearnMsg('Enviado — as sugestões aparecem no Inbox da Memória Pessoal em instantes.')
                  },
                  (e) => setLearnMsg(e instanceof Error ? e.message : String(e))
                )
              }
            >
              🧬 Sugerir memórias
            </button>
            {learnMsg && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{learnMsg}</span>}
          </div>
        </div>
      )}
      {open && (running || content) && (
        <div className="md-preview-pane" style={{ marginTop: 10, minHeight: 0 }}>
          {content ? renderMarkdown(content) : <div className="empty-hint">Revisando sua semana…</div>}
        </div>
      )}
    </div>
  )
}
