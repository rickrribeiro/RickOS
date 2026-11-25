import React from 'react'
import type { MonitorState, Verification } from '../../../../shared/flights'
import { VERIFICATION_LABEL } from '../../../../shared/flights'
import { t } from '../../../i18n'

export const STATE_LABEL: Record<MonitorState, string> = {
  active: t('flights.ativo'),
  paused: t('flights.pausado'),
  running: t('flights.buscando'),
  error: t('flights.erro'),
  needs_config: t('flights.aguardandoConfiguracao')
}

export function StateBadge(props: { state: MonitorState }): React.ReactElement {
  const cls = props.state === 'active' ? 'ok' : props.state === 'running' ? 'accent' : props.state === 'error' ? 'danger' : props.state === 'needs_config' ? 'warn' : ''
  return (
    <span className={`fm-pill ${cls}`}>
      <span className={`fm-dot ${props.state}`} /> {STATE_LABEL[props.state]}
    </span>
  )
}

export function VerificationBadge(props: { v: Verification; stale?: boolean }): React.ReactElement {
  const cls = props.v === 'live' ? 'ok' : props.v === 'cached' ? 'warn' : 'accent'
  return (
    <span className={`fm-pill ${cls}`} title={props.stale ? t('flights.cotacaoAntigaRevalide') : undefined}>
      {VERIFICATION_LABEL[props.v]}
      {props.stale ? t('flights.antigo') : ''}
    </span>
  )
}

/** "há 3 h", "em 2 d" — tempo relativo curto. */
export function rel(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diff = Date.parse(iso) - Date.now()
  const abs = Math.abs(diff)
  const fmt = abs < 3600_000 ? `${Math.max(1, Math.round(abs / 60000))} min` : abs < 86400_000 ? `${Math.round(abs / 3600_000)} h` : `${Math.round(abs / 86400_000)} d`
  return diff < 0 ? t('flights.rel.ago', { t: fmt }) : t('flights.rel.in', { t: fmt })
}

export function fmtLocal(local: string | null | undefined): string {
  if (!local) return '—'
  return `${local.slice(8, 10)}/${local.slice(5, 7)} ${local.slice(11, 16)}`
}
