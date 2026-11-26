import React, { useEffect, useCallback, useState } from 'react'
import { useUIStore } from './store/uiStore'
import { useTaskStore } from './modules/timetracker/store/taskStore'
import { useTagStore } from './modules/timetracker/store/tagStore'
import { ActiveTask } from './modules/timetracker/components/ActiveTask/ActiveTask'
import { TimelinePage } from './modules/timetracker/pages/TimelinePage'
import { CalendarPage } from './modules/timetracker/pages/CalendarPage'
import { TagsPage } from './modules/timetracker/pages/TagsPage'
import { DashboardPage } from './modules/timetracker/pages/DashboardPage'
import { TasksListPage } from './modules/timetracker/pages/TasksListPage'
import { HomePage } from './modules/home/pages/HomePage'
import { InboxPage } from './modules/inbox/pages/InboxPage'
import { TodoPage } from './modules/todo/pages/TodoPage'
import { BrainDumpPage } from './modules/braindump/pages/BrainDumpPage'
import { GoalsPage } from './modules/goals/pages/GoalsPage'
import { AutomationsPage } from './modules/automations/pages/AutomationsPage'
import { CrmPage } from './modules/crm/pages/CrmPage'
import { ChatsPage } from './modules/chats/pages/ChatsPage'
import { StayFinderPage } from './modules/travel-stays/pages/StayFinderPage'
import { EstudosDashboardPage } from './modules/estudos/pages/EstudosDashboardPage'
import { TopicWorkspacePage } from './modules/estudos/pages/TopicWorkspacePage'
import { RevisoesPage } from './modules/estudos/pages/RevisoesPage'
import { TestarPage } from './modules/estudos/pages/TestarPage'
import { ProjectsPage } from './modules/projects/pages/ProjectsPage'
import { ProjectDetailPage } from './modules/projects/pages/ProjectDetailPage'
import { FlightsDashboardPage } from './modules/flights/pages/FlightsDashboardPage'
import { FlightMonitorPage } from './modules/flights/pages/FlightMonitorPage'
import { useFlightStore } from './modules/flights/store/flightStore'
import { SaveContextModal } from './modules/projects/components/SaveContextModal'
import { IssuesPage } from './modules/projects/pages/IssuesPage'
import { WorktreesPage } from './modules/projects/pages/WorktreesPage'
import { HabitsPage } from './modules/habits/pages/HabitsPage'
import { MemoryPage } from './modules/memory/pages/MemoryPage'
import { QuickCapture } from './modules/inbox/components/QuickCapture'
import {
  FinanceDashboardPage,
  TransactionsPage,
  BudgetPage,
  FinanceRulesPage,
  InvestmentsPage,
  ReportsPage
} from './modules/finance/pages'
import { DestinationsPage, ItineraryPage } from './modules/travel/pages'
import { SettingsPage } from './modules/settings/pages/SettingsPage'
import { LinksPage } from './modules/links/pages/LinksPage'
import { SkillsPage } from './modules/ai/pages/SkillsPage'
import { AgentsPage } from './modules/ai/pages/AgentsPage'
import { PromptRunnerPage } from './modules/ai/pages/PromptRunnerPage'
import { RunnerNavBadge, RunnerWatcher } from './modules/ai/components/runner/RunnerAttention'
import { HistoryPage } from './modules/ai/pages/HistoryPage'
import { JarvisPage } from './modules/jarvis/pages/JarvisPage'
import { Page } from './types'
import { AuthGate } from './components/AuthGate'
import { NotificationBell, UnreadDot } from './components/NotificationBell'
import { QUICK_NAV_KEYS, groupLabel, itemLabel, lastTab, quickNavTarget, rememberTab, tabGroupOf, visibleNavGroups } from './navigation'
import { t } from './i18n'
import { useModuleStore } from './store/moduleStore'
import { useNavStyleStore } from './store/navStyleStore'
import { Icon } from './icons/Icon'

const PAGES: Record<Page, React.ComponentType> = {
  timeline: TimelinePage,
  calendar: CalendarPage,
  tasks: TasksListPage,
  dashboard: DashboardPage,
  tags: TagsPage,
  home: HomePage,
  inbox: InboxPage,
  todo: TodoPage,
  braindump: BrainDumpPage,
  goals: GoalsPage,
  automations: AutomationsPage,
  crm: CrmPage,
  chats: ChatsPage,
  estudos: EstudosDashboardPage,
  'estudos-topic': TopicWorkspacePage,
  'estudos-review': RevisoesPage,
  'estudos-test': TestarPage,
  projects: ProjectsPage,
  project: ProjectDetailPage,
  issues: IssuesPage,
  worktrees: WorktreesPage,
  habits: HabitsPage,
  memory: MemoryPage,
  'finance-dashboard': FinanceDashboardPage,
  transactions: TransactionsPage,
  budget: BudgetPage,
  'finance-rules': FinanceRulesPage,
  investments: InvestmentsPage,
  reports: ReportsPage,
  stays: StayFinderPage,
  'trip-monitoring': FlightsDashboardPage,
  'flight-monitor': FlightMonitorPage,
  destinations: DestinationsPage,
  itinerary: ItineraryPage,
  'ai-skills': SkillsPage,
  'ai-agents': AgentsPage,
  'ai-runner': PromptRunnerPage,
  'ai-history': HistoryPage,
  jarvis: JarvisPage,
  settings: SettingsPage,
  links: LinksPage
}

const COLLAPSED_KEY = 'rickos:collapsedGroups'
const SIDEBAR_HIDDEN_KEY = 'rickos:sidebarHidden'
const EXPANDED_TABS_KEY = 'rickos:expandedTabGroups'

export default function App(): React.ReactElement {
  const { currentPage, setPage, selectedProjectId } = useUIStore()
  const hiddenModules = useModuleStore((st) => st.hidden)
  const navGroups = React.useMemo(() => visibleNavGroups(hiddenModules), [hiddenModules])
  const flightId = useFlightStore((st) => st.selectedId)
  const { refreshActive, stopActiveTask, activeTask } = useTaskStore()
  const { refreshTags } = useTagStore()

  // modo abas: módulos cujas subpáginas também aparecem na sidebar (seta ao lado do módulo)
  const [expandedTabs, setExpandedTabs] = React.useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(EXPANDED_TABS_KEY) || '{}')
    } catch {
      return {}
    }
  })
  const toggleTabGroup = useCallback((label: string) => {
    setExpandedTabs((prev) => {
      const next = { ...prev, [label]: !prev[label] }
      try {
        localStorage.setItem(EXPANDED_TABS_KEY, JSON.stringify(next))
      } catch {
        /* ignora */
      }
      return next
    })
  }, [])

  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '{}')
    } catch {
      return {}
    }
  })

  const toggleGroup = useCallback((label: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [label]: !prev[label] }
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const tabsMode = useNavStyleStore((st) => st.navStyle) === 'tabs'
  const labeledGroups = navGroups.filter((g) => g.key).map((g) => g.key)
  const tabGroup = tabsMode ? tabGroupOf(currentPage, navGroups) : undefined
  useEffect(() => {
    // última página de cada módulo (abas e atalho Ctrl+N), nos dois estilos de navegação
    const group = tabGroupOf(currentPage, navGroups)
    if (group) rememberTab(group, currentPage)
    // celular: traz a aba ativa para a área visível da barra rolável
    document.querySelector('.module-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [currentPage, navGroups])
  const allCollapsed = labeledGroups.every((l) => collapsed[l])

  const toggleAll = useCallback(() => {
    setCollapsed(() => {
      const next: Record<string, boolean> = {}
      // if everything is already collapsed, expand all; otherwise collapse all
      for (const l of labeledGroups) next[l] = !allCollapsed
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next))
      return next
    })
  }, [allCollapsed]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void useModuleStore.getState().load()
    refreshTags()
    refreshActive()
  }, [])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ctrl+Space = stop active task (ignore the Ctrl+Shift+Space quick-capture combo)
      if (e.ctrlKey && !e.shiftKey && e.code === 'Space') {
        e.preventDefault()
        if (activeTask) stopActiveTask()
      }
      // Ctrl+1…9/0 = N-ésimo módulo da sidebar (de novo no mesmo módulo: próxima página dele)
      if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && QUICK_NAV_KEYS.includes(e.key)) {
        const target = quickNavTarget(e.key, useUIStore.getState().currentPage, navGroups)
        if (target) {
          e.preventDefault()
          setPage(target)
        }
      }
    },
    [activeTask, stopActiveTask, setPage, navGroups]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // URL hash ⇄ current page: deep links, phone back button, screenshots.
  useEffect(() => {
    if (!PAGES[currentPage]) {
      setPage('timeline')
      return
    }
    const pid = useUIStore.getState().selectedProjectId
    const fid = useFlightStore.getState().selectedId
    const h =
      currentPage === 'project' && pid
        ? `#/project?id=${pid}`
        : currentPage === 'flight-monitor' && fid
          ? `#/flight-monitor?id=${fid}`
          : `#/${currentPage}`
    if (window.location.hash !== h) window.history.pushState(null, '', h)
  }, [currentPage, setPage, selectedProjectId, flightId])

  useEffect(() => {
    const onHash = (): void => {
      const p = window.location.hash.replace(/^#\/?/, '').split('?')[0] as Page
      const id = window.location.hash.match(/[?&]id=(\d+)/)
      if (p === 'project' && id && Number(id[1]) !== useUIStore.getState().selectedProjectId) {
        useUIStore.getState().openProject(Number(id[1]))
        return
      }
      if (p === 'flight-monitor' && id && Number(id[1]) !== useFlightStore.getState().selectedId) {
        useFlightStore.getState().open(Number(id[1]))
        if (useUIStore.getState().currentPage !== 'flight-monitor') setPage('flight-monitor')
        return
      }
      if (p && PAGES[p] && p !== useUIStore.getState().currentPage) setPage(p)
    }
    window.addEventListener('hashchange', onHash)
    window.addEventListener('popstate', onHash)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('popstate', onHash)
    }
  }, [setPage])

  // Mobile: the sidebar becomes a drawer (CSS < 900px); closes on navigation.
  const [navOpen, setNavOpen] = React.useState(false)
  useEffect(() => setNavOpen(false), [currentPage])

  // Desktop: sidebar can be hidden; a small arrow on the left edge brings it back.
  const [sidebarHidden, setSidebarHidden] = React.useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_HIDDEN_KEY) === '1'
    } catch {
      return false
    }
  })
  const toggleSidebar = (hidden: boolean) => {
    setSidebarHidden(hidden)
    try {
      localStorage.setItem(SIDEBAR_HIDDEN_KEY, hidden ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  const PageComponent = PAGES[currentPage] ?? TimelinePage

  return (
    <AuthGate>
    <div className={`app ${navOpen ? 'nav-open' : ''} ${sidebarHidden ? 'sidebar-hidden' : ''}`}>
      {sidebarHidden && (
        <button
          className="sidebar-reopen-btn"
          onClick={() => toggleSidebar(false)}
          title={t('shell.showSidebar')}
          aria-label={t('shell.showSidebar')}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <button className="mobile-menu-btn" onClick={() => setNavOpen((v) => !v)} aria-label={t('shell.openMenu')}>
        ☰
        <UnreadDot />
      </button>
      <div className="nav-scrim" onClick={() => setNavOpen(false)} />
      <nav className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon">🧭</span>
          <span className="logo-text">RickOS</span>
          <NotificationBell />
        </div>
        <div className="nav-list">
          {!tabsMode && (
          <button
            className="collapse-all-btn"
            onClick={toggleAll}
            title={t(allCollapsed ? 'shell.expandAllGroups' : 'shell.collapseAllGroups')}
          >
            {allCollapsed ? `⊞ ${t('shell.expandAll')}` : `⊟ ${t('shell.collapseAll')}`}
          </button>
          )}
          {navGroups.map((group, gi) => {
            if (tabsMode && group.key) {
              const expanded = !!expandedTabs[group.key]
              return (
                <div className="nav-group nav-group-tabbed" key={group.key}>
                  <div className="nav-module-row">
                    <button
                      className={`nav-btn nav-module-btn ${tabGroup === group ? 'active' : ''}`}
                      onClick={() => setPage(lastTab(group))}
                      title={group.items.map(itemLabel).join(' · ')}
                    >
                      <span className="nav-icon">{group.groupIcon && <Icon name={group.groupIcon} />}</span>
                      <span className="nav-label">{groupLabel(group)}</span>
                      {group.items.some((i) => i.id === 'ai-runner') && <RunnerNavBadge compact />}
                    </button>
                    <button
                      className="nav-module-toggle"
                      onClick={() => toggleTabGroup(group.key)}
                      aria-expanded={expanded}
                      aria-label={t(expanded ? 'shell.hidePagesOf' : 'shell.showPagesOf', { module: groupLabel(group) })}
                      title={t(expanded ? 'shell.hidePages' : 'shell.showPages')}
                    >
                      <svg className={`nav-module-chevron ${expanded ? 'open' : ''}`} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                        <path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                  {expanded && (
                    <ul className="nav-module-sub">
                      {group.items.map((item) => (
                        <li key={item.id}>
                          <button
                            className={`nav-btn ${currentPage === item.id ? 'active' : ''}`}
                            onClick={() => setPage(item.id)}
                          >
                            <span className="nav-label">{itemLabel(item)}</span>
                            {item.id === 'ai-runner' && <RunnerNavBadge />}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            }
            const collapsible = !!group.key
            const isCollapsed = collapsible && collapsed[group.key]
            return (
              <div className="nav-group" key={group.key || `g${gi}`}>
                {collapsible && (
                  <button
                    className="nav-group-label"
                    onClick={() => toggleGroup(group.key)}
                    aria-expanded={!isCollapsed}
                  >
                    <span className={`nav-group-chevron ${isCollapsed ? 'collapsed' : ''}`}>▾</span>
                    {group.groupIcon && <span className="nav-group-icon"><Icon name={group.groupIcon} /></span>}
                    <span>{groupLabel(group)}</span>
                    {isCollapsed && group.items.some((i) => i.id === 'ai-runner') && <RunnerNavBadge compact />}
                  </button>
                )}
                {!isCollapsed && (
                  <ul>
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <button
                          className={`nav-btn ${currentPage === item.id ? 'active' : ''}`}
                          onClick={() => setPage(item.id)}
                        >
                          {!group.key && <span className="nav-icon"><Icon name={item.icon} /></span>}
                          <span className="nav-label">{itemLabel(item)}</span>
                          {item.id === 'ai-runner' && <RunnerNavBadge />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
        <div className="sidebar-shortcuts">
          <div className="shortcut-hint">Ctrl+Space: {t('shell.shortcut.stop')}</div>
          <div className="shortcut-hint">Ctrl+Shift+Space: {t('shell.shortcut.capture')}</div>
          <div className="shortcut-hint">Ctrl+1-9: {t('shell.shortcut.navigate')}</div>
        </div>
        <div className="sidebar-footer">
          <button
            className="nav-btn export-btn hide-sidebar-btn"
            onClick={() => toggleSidebar(true)}
            title={t('shell.hideSidebar')}
            style={{ marginTop: '8px' }}
          >
            <span className="nav-icon">«</span>
            <span className="nav-label">{t('shell.hideSidebar')}</span>
          </button>
        </div>
      </nav>

      <main className="main-content">
        <ActiveTask />
        <div className="page-content">
          {tabGroup && (
            <div className="module-tabs" role="tablist" aria-label={groupLabel(tabGroup)}>
              {tabGroup.items.map((item) => (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={currentPage === item.id}
                  className={`module-tab ${currentPage === item.id ? 'active' : ''}`}
                  onClick={() => setPage(item.id)}
                >
                  <span className="module-tab-icon"><Icon name={item.icon} /></span>
                  {itemLabel(item)}
                  {item.id === 'ai-runner' && <RunnerNavBadge />}
                </button>
              ))}
            </div>
          )}
          <PageComponent />
        </div>
      </main>

      <QuickCapture />
      <RunnerWatcher />
      <SaveContextModal />
    </div>
    </AuthGate>
  )
}
