import React, { useEffect, useState } from 'react'
import { useUIStore } from '../../../store/uiStore'
import { DailyStandup } from '../components/DailyStandup'
import { WeeklyReview } from '../components/WeeklyReview'
import { ProjectHomeBlocks } from '../../projects/components/ProjectHomeBlocks'
import { LostWorkCard } from '../../projects/components/LostWorkCard'
import { HomeChatsWidget } from '../../chats/components/HomeChatsWidget'
import { NewsCard } from '../../news/NewsCard'
import '../../projects/worktrees.css'
import { useTaskStore } from '../../timetracker/store/taskStore'
import { useTodoStore } from '../../todo/store/todoStore'
import { useHabitStore } from '../../habits/store/habitStore'
import { useGithubStore } from '../../projects/store/githubStore'
import { useCalendarStore } from '../../calendar/store/calendarStore'
import { UpcomingMeetings, fmtEventTime } from '../../calendar/components/UpcomingMeetings'
import { useFinanceStore } from '../../finance/store/financeStore'
import { useTripStore, daysUntil } from '../../travel/store/tripStore'
import { formatMoney, sumByCurrency } from '../../finance/util'
import { priorityDef } from '../../todo/constants'
import { localDateStr, localDayStartISO, localDayEndISO } from '../../../utils/dates'
import type { MonitorSummary } from '../../../../shared/flights'
import { formatMoney as formatFlightMoney } from '../../../../shared/flights'
import { t as tr } from '../../../i18n'

function fmtHours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}m`
}

export function HomePage(): React.ReactElement {
  const { setPage } = useUIStore()
  const { activeTask, refreshActive } = useTaskStore()
  const { todos, refresh: refreshTodos } = useTodoStore()
  const { habits, isDone, refresh: refreshHabits } = useHabitStore()
  const { issues, refresh: refreshIssues } = useGithubStore()
  const { upcoming, refresh: refreshEvents } = useCalendarStore()
  const { transactions, refresh: refreshFinance } = useFinanceStore()
  const { trips, refresh: refreshTrips } = useTripStore()
  const [flightMonitors, setFlightMonitors] = React.useState<MonitorSummary[]>([])
  React.useEffect(() => {
    window.api.flightMon.list().then(setFlightMonitors).catch(() => setFlightMonitors([]))
  }, [])
  const [weekMinutes, setWeekMinutes] = useState(0)

  useEffect(() => {
    refreshActive()
    refreshTodos()
    refreshHabits()
    refreshIssues()
    refreshEvents()
    refreshFinance()
    refreshTrips()

    const now = new Date()
    const monday = new Date(now)
    const day = (now.getDay() + 6) % 7 // 0 = Monday
    monday.setDate(now.getDate() - day)
    const start = localDayStartISO(localDateStr(monday))
    const end = localDayEndISO(localDateStr(now))
    window.api.stats.daily(start, end).then((rows) => {
      setWeekMinutes(rows.reduce((sum, r) => sum + r.totalMinutes, 0))
    })
  }, [])

  // recorrente já feita fica com a data da próxima vez: só conta quando essa data chegar (igual à página TODO)
  const today = localDateStr(new Date())
  const openTodos = todos
    .filter((t) => t.status !== 'done' && t.status !== 'inbox')
    .filter((t) => !(t.recurrence && t.dueDate && t.dueDate.slice(0, 10) > today))
    .sort((a, b) => b.priority - a.priority)
  const inboxCount = todos.filter((t) => t.status === 'inbox').length
  const pendingHabits = habits.filter((h) => !isDone(h.id))
  const habitsDone = habits.length - pendingHabits.length
  const openIssues = issues.filter((i) => i.state === 'open').length

  const monthExpenses = sumByCurrency(transactions.filter((t) => t.type === 'expense'))
  const expensesLabel = Object.keys(monthExpenses).length
    ? Object.entries(monthExpenses).map(([c, v]) => formatMoney(v, c)).join(' · ')
    : formatMoney(0)

  const nextTrip = trips[0]
  // menor preço ELEGÍVEL dos monitores de passagem ligados à viagem
  const nextTripWatch = nextTrip
    ? flightMonitors
        .filter((m) => m.tripId === nextTrip.id && m.minPrice)
        .sort((a, b) => a.minPrice!.amountMinor - b.minPrice!.amountMinor)[0]
    : undefined
  const tripDays = nextTrip ? daysUntil(nextTrip.startDate) : null

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>{tr('home.hoje')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{localDateStr(new Date())}</p>
        </div>
      </div>

      <button className="braindump-cta" onClick={() => setPage('braindump')}>
        <span className="braindump-cta-icon">🧠</span>
        <span className="braindump-cta-text">
          <strong>{tr('home.despejarMinhaCabeca')}</strong>
          <span>{tr('home.escrevaTudoQueEstaPensando')}</span>
        </span>
        <span className="braindump-cta-arrow">→</span>
      </button>

      <DailyStandup />
      <WeeklyReview />

      {/* ── Projetos: em foco, foco de hoje, onde parei, decisões ── */}
      <ProjectHomeBlocks />

      {/* ── Hoje ── */}
      <div className="dash-section">
        <div className="chart-section">
          <div className="chart-title">{tr('home.agora')}</div>
          {activeTask ? (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="active-task-dot" />
              <span style={{ fontWeight: 600 }}>{activeTask.title}</span>
              {activeTask.tagName && (
                <span className="active-task-tag" style={{ background: activeTask.tagColor ?? '#6366f1' }}>
                  {activeTask.tagName}
                </span>
              )}
            </div>
          ) : (
            <div className="empty-hint" style={{ padding: 12 }}>{tr('home.nenhumaTarefaAtiva')}</div>
          )}
          {upcoming[0] && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
              {tr('home.proximaReuniao')} <strong>{upcoming[0].title}</strong> — {fmtEventTime(upcoming[0].startTime)}
            </div>
          )}
        </div>

        <div className="chart-section">
          <div className="chart-title">{tr('home.topTarefas')}</div>
          <div className="list-stack" style={{ marginTop: 8 }}>
            {openTodos.slice(0, 3).map((t) => (
              <div key={t.id} className="list-row">
                <span className="priority-dot" style={{ background: priorityDef(t.priority).color }} />
                <span className="list-row-title">{t.title}</span>
              </div>
            ))}
            {openTodos.length === 0 && <div className="empty-hint">{tr('home.nadaPendente')}</div>}
          </div>
        </div>

        <div className="chart-section">
          <div className="chart-title">{tr('home.habitosPendentes')}</div>
          <div className="list-stack" style={{ marginTop: 8 }}>
            {pendingHabits.map((h) => (
              <div key={h.id} className="list-row">
                <span className="list-row-title">{h.name}</span>
              </div>
            ))}
            {habits.length > 0 && pendingHabits.length === 0 && (
              <div className="empty-hint">{tr('home.todosConcluidos')}</div>
            )}
            {habits.length === 0 && <div className="empty-hint">{tr('home.nenhumHabitoCadastrado')}</div>}
          </div>
        </div>
      </div>

      {/* ── Próximas reuniões ── */}
      <div style={{ marginTop: 12 }}>
        <UpcomingMeetings />
      </div>

      {/* ── Central de Mensagens (opcional) ── */}
      <HomeChatsWidget />

      {/* ── Branches com trabalho não entregue ── */}
      <LostWorkCard />

      {/* ── Esta semana ── */}
      <h3 className="dash-heading">{tr('home.estaSemana')}</h3>
      <div className="cards-grid">
        <div className="stat-card">
          <div className="stat-card-label">{tr('home.horasTrabalhadas')}</div>
          <div className="stat-card-value">{fmtHours(weekMinutes)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">{tr('home.tarefasAbertas')}</div>
          <div className="stat-card-value">{openTodos.length}</div>
          <div className="stat-card-sub">{inboxCount} {tr('home.naInboxPProcessar')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">{tr('home.habitosHoje')}</div>
          <div className="stat-card-value">
            {habitsDone}/{habits.length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">{tr('home.issuesGithubAbertas')}</div>
          <div className="stat-card-value">{openIssues}</div>
          {issues.length === 0 && <div className="stat-card-sub">{tr('home.sincronizeEmProjetos')}</div>}
        </div>
        <div className="stat-card">
          <div className="stat-card-label">{tr('home.gastosDoMes')}</div>
          <div className="stat-card-value" style={{ fontSize: 16, color: 'var(--danger)' }}>{expensesLabel}</div>
          {transactions.length === 0 && <div className="stat-card-sub">{tr('home.semTransacoesNoMes')}</div>}
        </div>
      </div>

      {/* ── Próxima viagem ── */}
      <h3 className="dash-heading">{tr('home.proximaViagem')}</h3>
      <div className="cards-grid">
        {nextTrip ? (
          <div className="stat-card">
            <div className="stat-card-label">
              {nextTrip.origin ? `${nextTrip.origin} → ` : ''}{nextTrip.destination}
            </div>
            <div className="stat-card-value" style={{ fontSize: 16 }}>
              {tripDays != null && tripDays >= 0 ? tr('home.faltamD', { tripDays }) : nextTrip.status}
            </div>
            <div className="stat-card-sub">
              {nextTripWatch
                ? tr('home.menorPrecoEncontrado', { p0: formatFlightMoney(nextTripWatch.minPrice) })
                : nextTrip.budget != null
                  ? tr('home.orcamento', { p0: formatMoney(nextTrip.budget, nextTrip.currency) })
                  : tr('home.semPrecoMonitorado')}
            </div>
          </div>
        ) : (
          <div className="empty-hint">{tr('home.nenhumaViagemPlanejadaCrieEm')}</div>
        )}
      </div>

      {/* ── Resumo de Notícias (Google News + Gemini) ── */}
      <NewsCard />
    </div>
  )
}
