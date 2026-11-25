import { Page } from './types'
import { IconKey } from './icons/packs'

/** Sidebar: grupos (módulos) e páginas. Cada grupo pode ser ocultado em Configurações → Módulos. */
export interface NavItem {
  id: Page
  label: string
  /** chave do pacote de ícones (src/icons/packs/default.ts) */
  icon: IconKey
}

export interface NavGroup {
  label: string
  groupIcon?: IconKey
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  { label: '', items: [{ id: 'home', label: 'Dashboard', icon: 'home' }] },
  {
    label: 'Time Tracker',
    groupIcon: 'timetracker',
    items: [
      { id: 'timeline', label: 'Timeline', icon: 'timeline' },
      { id: 'calendar', label: 'Calendar', icon: 'calendar' },
      { id: 'tasks', label: 'Tasks', icon: 'tasks' },
      { id: 'tags', label: 'Tags', icon: 'tags' },
      { id: 'dashboard', label: 'Stats', icon: 'stats' }
    ]
  },
  {
    label: 'Organização',
    groupIcon: 'organization',
    items: [
      { id: 'inbox', label: 'Inbox', icon: 'inbox' },
      { id: 'todo', label: 'TODO', icon: 'todo' },
      { id: 'braindump', label: 'Brain Dump', icon: 'braindump' },
      { id: 'goals', label: 'Metas', icon: 'goals' },
      { id: 'habits', label: 'Hábitos', icon: 'habits' },
      { id: 'automations', label: 'Automações', icon: 'automations' },
      { id: 'memory', label: 'Memória Pessoal', icon: 'memory' }
    ]
  },
  {
    label: 'Social',
    groupIcon: 'social',
    items: [
      { id: 'crm', label: 'Pessoas', icon: 'people' },
      { id: 'chats', label: 'Chats', icon: 'chats' }
    ]
  },
  {
    label: 'Estudos',
    groupIcon: 'studies',
    items: [
      { id: 'estudos', label: 'Dashboard', icon: 'studies-dashboard' },
      { id: 'estudos-review', label: 'Revisões', icon: 'reviews' }
    ]
  },
   {
    label: 'Finanças',
    groupIcon: 'finance',
    items: [
      { id: 'finance-dashboard', label: 'Dashboard', icon: 'finance-dashboard' },
      { id: 'transactions', label: 'Transações', icon: 'transactions' },
      { id: 'budget', label: 'Categorias', icon: 'categories' },
      { id: 'finance-rules', label: 'Regras', icon: 'finance-rules' },
      { id: 'investments', label: 'Investimentos', icon: 'investments' },
      { id: 'reports', label: 'Relatórios', icon: 'reports' }
    ]
  },
  {
    label: 'Projetos',
    groupIcon: 'projects',
    items: [
      { id: 'projects', label: 'Projetos', icon: 'projects-list' },
      { id: 'issues', label: 'Issues (Kanban)', icon: 'issues' },
      { id: 'worktrees', label: 'Worktrees & Branches', icon: 'worktrees' }
    ]
  },
  
  {
    label: 'Viagens',
    groupIcon: 'travel',
    items: [
      { id: 'destinations', label: 'Destinos', icon: 'destinations' },
      { id: 'stays', label: 'Hospedagens', icon: 'stays' },
      { id: 'trip-monitoring', label: 'Passagens', icon: 'flights' },
      { id: 'itinerary', label: 'Roteiro', icon: 'itinerary' }
    ]
  },
  {
    label: 'IA',
    groupIcon: 'ai',
    items: [
      { id: 'ai-skills', label: 'Skills', icon: 'skills' },
      { id: 'ai-agents', label: 'Agentes', icon: 'agents' },
      { id: 'ai-runner', label: 'Prompt Runner', icon: 'runner' },
      { id: 'ai-history', label: 'Histórico', icon: 'history' }
    ]
  },
  { label: '', items: [{ id: 'jarvis', label: 'Jarvis', icon: 'jarvis' }] },
  { label: '', items: [{ id: 'settings', label: 'Configurações', icon: 'settings' }] },
  { label: '', items: [{ id: 'links', label: 'Links', icon: 'links' }] }
]

/** Chave estável do grupo (o rótulo, ou o id da página para itens soltos). */
export function groupKey(g: NavGroup): string {
  return g.label || g.items[0].id
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
  return groups.find((g) => g.label && g.items.some((i) => i.id === page))
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
