import React, { useState } from 'react'
import { Trip } from '../../../types'
import { useTripStore, daysUntil, isUpcoming } from '../store/tripStore'
import { formatMoney } from '../../finance/util'
import { t as tr } from '../../../i18n'

export const TRIP_STATUS: Record<string, string> = {
  planned: tr('travel.status.planned'),
  booked: tr('travel.status.booked'),
  ongoing: tr('travel.status.ongoing'),
  done: tr('travel.status.done')
}
const CURRENCIES = ['BRL', 'JPY', 'USD', 'EUR']

interface FormState {
  origin: string
  destination: string
  startDate: string
  endDate: string
  budget: string
  currency: string
  status: string
}
const empty: FormState = { origin: '', destination: '', startDate: '', endDate: '', budget: '', currency: 'BRL', status: 'planned' }

interface Props {
  /** Destino aberto no momento: filtra nada, só pré-preenche o formulário e destaca as viagens dele. */
  selected: string | null
  onSelect: (destination: string) => void
}

/** Barra lateral interna de Destinos: lista de viagens + criar/editar. */
export function TripsSidebar({ selected, onSelect }: Props): React.ReactElement {
  const { trips, createTrip, updateTrip, removeTrip } = useTripStore()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Trip | null>(null)
  const [form, setForm] = useState<FormState>(empty)

  const upcoming = trips.filter(isUpcoming).sort(byStart)
  const past = trips.filter((t) => !isUpcoming(t)).sort((a, b) => byStart(b, a))

  function startCreate(): void {
    setEditing(null)
    setForm({ ...empty, destination: selected ?? '' })
    setShowForm(true)
  }
  function startEdit(t: Trip): void {
    setEditing(t)
    setForm({
      origin: t.origin ?? '',
      destination: t.destination,
      startDate: t.startDate ?? '',
      endDate: t.endDate ?? '',
      budget: t.budget != null ? String(t.budget) : '',
      currency: t.currency,
      status: t.status
    })
    setShowForm(true)
  }
  function close(): void {
    setShowForm(false)
    setEditing(null)
    setForm(empty)
  }

  async function submit(): Promise<void> {
    if (!form.destination.trim()) return
    const payload = {
      origin: form.origin.trim() || null,
      destination: form.destination.trim(),
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      budget: form.budget ? parseFloat(form.budget) : null,
      currency: form.currency,
      status: form.status
    }
    if (editing) await updateTrip({ ...editing, ...payload })
    else await createTrip(payload)
    close()
  }

  async function remove(t: Trip): Promise<void> {
    if (!confirm(tr('travel.excluirAViagemPara', { destination: t.destination }))) return
    await removeTrip(t.id)
  }

  function renderTrip(t: Trip): React.ReactElement {
    const dleft = daysUntil(t.startDate)
    const active = selected != null && t.destination.trim() === selected
    return (
      <div key={t.id} className={`travel-trip${active ? ' active' : ''}`}>
        <button className="travel-trip-main" onClick={() => onSelect(t.destination.trim())}>
          <div className="travel-trip-title">
            <span>{t.origin ? `${t.origin} → ` : ''}{t.destination}</span>
            <span className="project-chip">{TRIP_STATUS[t.status] ?? t.status}</span>
          </div>
          {(t.startDate || t.endDate) && (
            <div className="travel-muted">
              {t.startDate ?? '?'} — {t.endDate ?? '?'}
              {dleft != null && dleft >= 0 && <strong> {tr('travel.faltamD', { dleft })}</strong>}
            </div>
          )}
          {t.budget != null && <div className="travel-muted">{tr('travel.orcamento')} {formatMoney(t.budget, t.currency)}</div>}
        </button>
        <div className="travel-trip-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => startEdit(t)}>{tr('travel.editar')}</button>
          <button className="btn btn-danger btn-sm" onClick={() => remove(t)}>{tr('travel.excluir')}</button>
        </div>
      </div>
    )
  }

  return (
    <aside className="travel-sidebar">
      <div className="travel-section-head">
        <div className="chart-title">{tr('travel.viagens')} <span className="travel-muted">· {trips.length}</span></div>
        <button className="btn btn-primary btn-sm" onClick={startCreate}>{tr('travel.nova')}</button>
      </div>

      {showForm && (
        <div className="travel-form">
          <div className="travel-form-title">{editing ? tr('travel.editarViagem') : tr('travel.novaViagem')}</div>
          <input placeholder={tr('travel.destino')} value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
          <input placeholder={tr('travel.origem')} value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} />
          <div className="travel-form-row">
            <input type="date" title={tr('travel.ida')} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            <input type="date" title={tr('travel.volta')} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
          <div className="travel-form-row">
            <input type="number" placeholder={tr('travel.orcamento2')} value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {Object.entries(TRIP_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={close}>{tr('travel.cancelar')}</button>
            <button className="btn btn-primary btn-sm" onClick={submit}>{editing ? tr('travel.salvar') : tr('travel.criar')}</button>
          </div>
        </div>
      )}

      {trips.length === 0 && <div className="empty-hint">{tr('travel.nenhumaViagemAinda')}</div>}
      {upcoming.length > 0 && <div className="travel-group-label">{tr('travel.proximas')}</div>}
      {upcoming.map(renderTrip)}
      {past.length > 0 && <div className="travel-group-label">{tr('travel.anteriores')}</div>}
      {past.map(renderTrip)}
    </aside>
  )
}

/** Ordena por data de ida (sem data vai pro fim). */
export function byStart(a: Trip, b: Trip): number {
  return (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999')
}
