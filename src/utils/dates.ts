import { t } from '../i18n'


/** Format a Date as YYYY-MM-DD using LOCAL time (not UTC) */
export function localDateStr(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Start of a local calendar day as UTC ISO string (for DB queries) */
export function localDayStartISO(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toISOString()
}

/** End of a local calendar day as UTC ISO string (for DB queries) */
export function localDayEndISO(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59.999`).toISOString()
}

/** Short relative age like "agora", "3h", "2d", "5sem" (no idioma atual) from an ISO timestamp. */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (isNaN(then)) return ''
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (sec < 60) return t('time.now')
  const min = Math.floor(sec / 60)
  if (min < 60) return t('time.short.min', { n: min })
  const h = Math.floor(min / 60)
  if (h < 24) return t('time.short.h', { n: h })
  const d = Math.floor(h / 24)
  if (d < 7) return t('time.short.d', { n: d })
  const w = Math.floor(d / 7)
  if (w < 5) return t('time.short.w', { n: w })
  const mo = Math.floor(d / 30)
  return t('time.short.mo', { n: mo })
}
