import { Page } from './types'
import { IconKey } from './icons/packs'
import { t, type MessageKey } from './i18n'

/** Sidebar: grupos (módulos) e páginas. Cada grupo pode ser ocultado em Configurações → Módulos. */
export interface NavItem {
  id: Page
  labelKey: MessageKey
  /** chave do pacote de ícones (src/icons/packs/default.ts) */
  icon: IconKey
}

export interface NavGroup {
  /** chave estável do módulo (é o antigo rótulo em pt: `hidden_modules` e abas salvas dependem dela); '' = item solto */
  key: string
  labelKey: MessageKey | null
  groupIcon?: IconKey
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  { key: '', labelKey: null, items: [{ id: 'home', labelKey: 'nav.page.home', icon: 'home' }] },
  {
    key: 'Time Tracker',
    labelKey: 'nav.group.timetracker',
    groupIcon: 'timetracker',
    items: [
      { id: 'timeline', labelKey: 'nav.page.timeline', icon: 'timeline' },
      { id: 'calendar', labelKey: 'nav.page.calendar', icon: 'calendar' },
      { id: 'tasks', labelKey: 'nav.page.tasks', icon: 'tasks' },
      { id: 'tags', labelKey: 'nav.page.tags', icon: 'tags' },
      { id: 'dashboard', labelKey: 'nav.page.dashboard', icon: 'stats' }
    ]
  },
  {
    key: 'Organização',
    labelKey: 'nav.group.organization',
    groupIcon: 'organization',
    items: [
      { id: 'inbox', labelKey: 'nav.page.inbox', icon: 'inbox' },
      { id: 'todo', labelKey: 'nav.page.todo', icon: 'todo' },
      { id: 'braindump', labelKey: 'nav.page.braindump', icon: 'braindump' },
      { id: 'goals', labelKey: 'nav.page.goals', icon: 'goals' },
      { id: 'habits', labelKey: 'nav.page.habits', icon: 'habits' },
      { id: 'automations', labelKey: 'nav.page.automations', icon: 'automations' },
      { id: 'memory', labelKey: 'nav.page.memory', icon: 'memory' }
    ]
  },
  {
    key: 'Social',
    labelKey: 'nav.group.social',
    groupIcon: 'social',
    items: [
      { id: 'crm', labelKey: 'nav.page.crm', icon: 'people' },
      { id: 'chats', labelKey: 'nav.page.chats', icon: 'chats' }
    ]
  },
  {
    key: 'Estudos',
    labelKey: 'nav.group.studies',
    groupIcon: 'studies',
    items: [
      { id: 'estudos', labelKey: 'nav.page.estudos', icon: 'studies-dashboard' },
      { id: 'estudos-review', labelKey: 'nav.page.estudos-review', icon: 'reviews' }
    ]
  },
   {
    key: 'Finanças',
    labelKey: 'nav.group.finance',
    groupIcon: 'finance',
    items: [
      { id: 'finance-dashboard', labelKey: 'nav.page.finance-dashboard', icon: 'finance-dashboard' },
      { id: 'transactions', labelKey: 'nav.page.transactions', icon: 'transactions' },
      { id: 'budget', labelKey: 'nav.page.budget', icon: 'categories' },
      { id: 'finance-rules', labelKey: 'nav.page.finance-rules', icon: 'finance-rules' },
      { id: 'investments', labelKey: 'nav.page.investments', icon: 'investments' },
      { id: 'reports', labelKey: 'nav.page.reports', icon: 'reports' }
    ]
  },
  {
    key: 'Projetos',
    labelKey: 'nav.group.projects',
    groupIcon: 'projects',
    items: [
      { id: 'projects', labelKey: 'nav.page.projects', icon: 'projects-list' },
      { id: 'issues', labelKey: 'nav.page.issues', icon: 'issues' },
      { id: 'worktrees', labelKey: 'nav.page.worktrees', icon: 'worktrees' }
    ]
  },
  
  {
    key: 'Viagens',
    labelKey: 'nav.group.travel',
    groupIcon: 'travel',
    items: [
      { id: 'destinations', labelKey: 'nav.page.destinations', icon: 'destinations' },
      { id: 'stays', labelKey: 'nav.page.stays', icon: 'stays' },
      { id: 'trip-monitoring', labelKey: 'nav.page.trip-monitoring', icon: 'flights' },
      { id: 'itinerary', labelKey: 'nav.page.itinerary', icon: 'itinerary' }
    ]
  },
  {
    key: 'IA',
    labelKey: 'nav.group.ai',
    groupIcon: 'ai',
    items: [
      { id: 'ai-skills', labelKey: 'nav.page.ai-skills', icon: 'skills' },
      { id: 'ai-agents', labelKey: 'nav.page.ai-agents', icon: 'agents' },
      { id: 'ai-runner', labelKey: 'nav.page.ai-runner', icon: 'runner' },
      { id: 'ai-history', labelKey: 'nav.page.ai-history', icon: 'history' }
    ]
  },
  { key: '', labelKey: null, items: [{ id: 'jarvis', labelKey: 'nav.page.jarvis', icon: 'jarvis' }] },
  { key: '', labelKey: null, items: [{ id: 'settings', labelKey: 'nav.page.settings', icon: 'settings' }] },
  { key: '', labelKey: null, items: [{ id: 'links', labelKey: 'nav.page.links', icon: 'links' }] }
]

/** Chave estável do grupo (a `key`, ou o id da página para itens soltos). */
export function groupKey(g: NavGroup): string {
  return g.key || g.items[0].id
}

/** Nome do módulo no idioma atual ('' para itens soltos). */
export function groupLabel(g: NavGroup): string {
  return g.labelKey ? t(g.labelKey) : ''
}

/** Nome da página no idioma atual. */
export function itemLabel(i: NavItem): string {
  return t(i.labelKey)
}

const LAST_TAB_KEY = 'rickos:lastTab:'

/** Última aba visitada de um grupo com abas (cai na primeira se não houver). */
export function lastTab(g: NavGroup): Page {
  try {
    const saved = localStorage.getItem(LAST_TAB_KEY + groupKey(g)) as Page | null
    if (saved && g.items.some((i) => i.id === saved)) return saved
  } catch {
    /* sem storage: usa a primeira */
  }
  return g.items[0].id
}

export function rememberTab(g: NavGroup, page: Page): void {
  try {
    localStorage.setItem(LAST_TAB_KEY + groupKey(g), page)
  } catch {
    /* ignora */
  }
}

/** Grupo rotulado (módulo) que contém a página — no modo abas, ele vira a barra de abas. */
export function tabGroupOf(page: Page, groups: NavGroup[] = NAV_GROUPS): NavGroup | undefined {
  return groups.find((g) => g.key && g.items.some((i) => i.id === page))
}

/**
 * Sidebar sem o que foi ocultado em Configurações → Módulos. `hidden` mistura chaves de
 * módulo (`groupKey`) e ids de página (submódulos); módulo sem nenhuma página visível some.
 */
export function visibleNavGroups(hidden: string[]): NavGroup[] {
  const out: NavGroup[] = []
  for (const g of NAV_GROUPS) {
    if (hidden.includes(groupKey(g))) continue
    const items = g.items.filter((i) => i.id === 'settings' || !hidden.includes(i.id))
    if (!items.length) continue
    out.push(items.length === g.items.length ? g : { ...g, items })
  }
  return out
}

/** Configurações nunca some (senão não dá para reativar nada). */
export function isToggleable(g: NavGroup): boolean {
  return !g.items.some((i) => i.id === 'settings')
}
