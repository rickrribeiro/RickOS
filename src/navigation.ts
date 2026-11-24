import { Page } from './types'

/** Sidebar: grupos (módulos) e páginas. Cada grupo pode ser ocultado em Configurações → Módulos. */
export interface NavItem {
  id: Page
  label: string
  icon: string
}

export interface NavGroup {
  label: string
  groupIcon?: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  { label: '', items: [{ id: 'home', label: 'Dashboard', icon: '🏠' }] },
  {
    label: 'Time Tracker',
    groupIcon: '⏱',
    items: [
      { id: 'timeline', label: 'Timeline', icon: '⏱' },
      { id: 'calendar', label: 'Calendar', icon: '📅' },
      { id: 'tasks', label: 'Tasks', icon: '📋' },
      { id: 'tags', label: 'Tags', icon: '🏷' },
      { id: 'dashboard', label: 'Stats', icon: '📊' }
    ]
  },
  {
    label: 'Organização',
    groupIcon: '🗂',
    items: [
      { id: 'inbox', label: 'Inbox', icon: '📥' },
      { id: 'todo', label: 'TODO', icon: '✅' },
      { id: 'braindump', label: 'Brain Dump', icon: '🧠' },
      { id: 'goals', label: 'Metas', icon: '🎯' },
      { id: 'habits', label: 'Hábitos', icon: '🔥' },
      { id: 'automations', label: 'Automações', icon: '⚡' },
      { id: 'memory', label: 'Memória Pessoal', icon: '🧬' }
    ]
  },
  {
    label: 'Social',
    groupIcon: '👥',
    items: [
      { id: 'crm', label: 'Pessoas', icon: '🤝' },
      { id: 'chats', label: 'Chats', icon: '💬' }
    ]
  },
  {
    label: 'Estudos',
    groupIcon: '🎓',
    items: [
      { id: 'estudos', label: 'Dashboard', icon: '🎓' },
      { id: 'estudos-review', label: 'Revisões', icon: '🔁' }
    ]
  },
   {
    label: 'Finanças',
    groupIcon: '💰',
    items: [
      { id: 'finance-dashboard', label: 'Dashboard', icon: '💰' },
      { id: 'transactions', label: 'Transações', icon: '💸' },
      { id: 'budget', label: 'Categorias', icon: '🏷️' },
      { id: 'investments', label: 'Investimentos', icon: '📈' },
      { id: 'reports', label: 'Relatórios', icon: '🧾' }
    ]
  },
  {
    label: 'Projetos',
    groupIcon: '📁',
    items: [
      { id: 'projects', label: 'Projetos', icon: '🗂' },
      { id: 'issues', label: 'Issues (Kanban)', icon: '📌' },
      { id: 'worktrees', label: 'Worktrees & Branches', icon: '🌿' }
    ]
  },
  
  {
    label: 'Viagens',
    groupIcon: '✈️',
    items: [
      { id: 'destinations', label: 'Destinos', icon: '🗺' },
      { id: 'stays', label: 'Hospedagens', icon: '🏨' },
      { id: 'trip-monitoring', label: 'Passagens', icon: '🔔' },
      { id: 'itinerary', label: 'Roteiro', icon: '🧭' }
    ]
  },
  {
    label: 'IA',
    groupIcon: '🤖',
    items: [
      { id: 'ai', label: 'Assistente', icon: '🤖' },
      { id: 'ai-skills', label: 'Skills', icon: '🧩' },
      { id: 'ai-agents', label: 'Agentes', icon: '🤝' },
      { id: 'ai-runner', label: 'Prompt Runner', icon: '▶️' },
      { id: 'ai-history', label: 'Histórico', icon: '🕐' }
    ]
  },
  { label: '', items: [{ id: 'jarvis', label: 'Jarvis', icon: '🧞' }] },
  { label: '', items: [{ id: 'settings', label: 'Configurações', icon: '⚙️' }] },
  { label: '', items: [{ id: 'links', label: 'Links', icon: '🔗' }] }
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
