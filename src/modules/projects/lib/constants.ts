import type { NextActionSize, Project, ProjectArea, ProjectOverview, ProjectStatus } from '../../../types'
import { t, getLocale, weekdayNames } from '../../../i18n'

/** Situação = onde o projeto está na minha atenção. Independe do estágio (maturidade). */
export const STATUSES: { key: ProjectStatus; label: string; icon: string; hint: string }[] = [
  { key: 'foco', label: t('projects.emFoco3'), icon: '🎯', hint: t('projects.poucosComProximaAcaoDefinida') },
  { key: 'fila', label: t('projects.fila'), icon: '⏭', hint: t('projects.decididoEntraEmFocoQuando') },
  { key: 'baixa', label: t('projects.baixaPrioridade'), icon: '🐢', hint: t('projects.emAndamentoMasSemO') },
  { key: 'incubadora', label: t('projects.incubadora'), icon: '🥚', hint: t('projects.ideiasEProjetosAindaNao') },
  { key: 'pausado', label: t('projects.pausado'), icon: '⏸', hint: t('projects.paradoDePropositoComMotivo') },
  { key: 'concluido', label: t('projects.concluido2'), icon: '🏁', hint: t('projects.cruzouALinhaDeChegada') },
  { key: 'encerrado', label: t('projects.encerrado'), icon: '🪦', hint: t('projects.abandonadoConscientementeComMotivoRegistrado') }
]
export const statusDef = (k: string): (typeof STATUSES)[number] => STATUSES.find((s) => s.key === k) ?? STATUSES[2]
export const statusLabel = (k: string): string => {
  const s = statusDef(k)
  return `${s.icon} ${s.label}`
}
export const isClosed = (p: Pick<Project, 'status'>): boolean => p.status === 'concluido' || p.status === 'encerrado'

/** Estágio = maturidade do produto. */
export const STAGES: { key: string; label: string }[] = [
  { key: '', label: t('projects.semEstagio') },
  { key: 'ideia', label: t('projects.ideia') },
  { key: 'validacao', label: t('projects.validacao') },
  { key: 'mvp', label: t('projects.mvp') },
  { key: 'lancado', label: t('projects.lancado') },
  { key: 'monetizando', label: t('projects.monetizando') },
  { key: 'manutencao', label: t('projects.manutencao') }
]
export const stageLabel = (k: string | null | undefined): string => STAGES.find((s) => s.key === (k ?? ''))?.label ?? k ?? ''

export const AREAS: { key: ProjectArea; label: string }[] = [
  { key: 'pessoal', label: t('projects.pessoal') },
  { key: 'profissional', label: t('projects.profissional') }
]
export const areaLabel = (k: string): string => AREAS.find((a) => a.key === k)?.label ?? k

export const PULSE: Record<ProjectOverview['pulse'], { label: string; color: string }> = {
  vivo: { label: 'vivo', color: 'var(--success, #22c55e)' },
  morno: { label: 'morno', color: 'var(--warning, #f59e0b)' },
  frio: { label: 'frio', color: '#60a5fa' },
  parado: { label: 'parado', color: 'var(--text-muted)' }
}

export const PRESET_COLORS = ['#6366f1', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4']

export const EVENT_LABEL: Record<string, string> = {
  status: t('projects.situacao2'),
  decisao: t('projects.decisao'),
  proxima_acao: t('projects.proximaAcao2'),
  acao_concluida: t('projects.acaoConcluida'),
  onde_parei: t('projects.ondeParei2'),
  bloqueio: t('projects.bloqueio'),
  ciclo: t('projects.ciclo'),
  marco: t('projects.marco'),
  revisao: t('projects.revisao'),
  nota: t('projects.nota'),
  sessao_claude: t('projects.sessaoClaude'),
  delegacao: t('projects.delegacao')
}

export function fmtMinutes(min: number): string {
  if (!min) return '0h'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? (m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`) : `${m}min`
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString(getLocale(), { day: '2-digit', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

export function daysBetween(fromIso: string, to: Date = new Date()): number {
  return Math.floor((to.getTime() - new Date(fromIso).getTime()) / 86400000)
}

export const FOCUS_LIMIT_KEY = 'projects_focus_limit'
export const TODAY_FOCUS_KEY = 'projects_today_focus'
export const LAST_REVIEW_KEY = 'projects_last_review'

/** Tamanho da próxima ação: cabe numa brecha de 15 min ou pede um bloco de foco. */
export const SIZES: { key: NextActionSize; icon: string; label: string }[] = [
  { key: 'rapida', icon: '⚡', label: t('projects.15Min') },
  { key: 'longa', icon: '🧠', label: t('projects.2H') }
]
export const sizeDef = (k: string | null | undefined): (typeof SIZES)[number] | null => SIZES.find((s) => s.key === k) ?? null

// dom..sáb no idioma atual: inicial, abreviado e por extenso
const WD_NARROW = weekdayNames('narrow')
const WD_SHORT = weekdayNames('short').map((s) => s.toLowerCase())
const WD_LONG = weekdayNames('long')
export const WEEKDAYS = WD_SHORT.map((label, i) => ({ short: WD_NARROW[i].toUpperCase(), label, long: WD_LONG[i] }))

export function parseWorkDays(raw: string | null | undefined): number[] {
  try {
    const v = JSON.parse(raw || '[]')
    return Array.isArray(v) ? v.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : []
  } catch {
    return []
  }
}
export const workDaysLabel = (raw: string | null | undefined): string => parseWorkDays(raw).map((d) => WEEKDAYS[d].label).join(', ')
export const isProjectDay = (p: Pick<Project, 'workDays'>, date: Date = new Date()): boolean => parseWorkDays(p.workDays).includes(date.getDay())
