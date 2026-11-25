/**
 * Pacote padrão: os emojis de sempre. É também o fallback de todos os outros
 * pacotes — ícone que faltar num pacote vem daqui. Por isso toda chave nova de
 * ícone nasce neste arquivo (o tipo IconKey sai dele).
 *
 * As chaves descrevem o significado (`folder`, `calendar`), não a página, para
 * que um pacote (XP, iOS…) possa mapear cada uma para a imagem certa.
 */
export const DEFAULT_ICONS = {
  // avulsos
  home: '🏠',
  jarvis: '🧞',
  settings: '⚙️',
  links: '🔗',
  // Time Tracker
  timetracker: '⏱',
  timeline: '⏱',
  calendar: '📅',
  tasks: '📋',
  tags: '🏷',
  stats: '📊',
  // Organização
  organization: '🗂',
  inbox: '📥',
  todo: '✅',
  braindump: '🧠',
  goals: '🎯',
  habits: '🔥',
  automations: '⚡',
  memory: '🧬',
  // Social
  social: '👥',
  people: '🤝',
  chats: '💬',
  // Estudos
  studies: '🎓',
  'studies-dashboard': '🎓',
  reviews: '🔁',
  // Finanças
  finance: '💰',
  'finance-dashboard': '💰',
  transactions: '💸',
  categories: '🏷️',
  'finance-rules': '🪄',
  investments: '📈',
  reports: '🧾',
  // Projetos
  projects: '📁',
  'projects-list': '🗂',
  issues: '📌',
  worktrees: '🌿',
  // Viagens
  travel: '✈️',
  destinations: '🗺',
  stays: '🏨',
  flights: '🔔',
  itinerary: '🧭',
  // IA
  ai: '🤖',
  skills: '🧩',
  agents: '🤝',
  runner: '▶️',
  history: '🕐'
} as const

export type IconKey = keyof typeof DEFAULT_ICONS
