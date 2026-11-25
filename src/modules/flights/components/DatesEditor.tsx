import React from 'react'
import type { DateWindow, DateWindowMode, TripDates } from '../../../../shared/flights'
import { t as tr } from '../../../i18n'

export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const MODES: { id: DateWindowMode; label: string }[] = [
  { id: 'range', label: tr('flights.intervalo') },
  { id: 'exact', label: tr('flights.dataExata') },
  { id: 'flex', label: tr('flights.dataDias') },
  { id: 'month', label: tr('flights.mesInteiro') }
]

function blank(mode: DateWindowMode): DateWindow {
  const t = todayStr()
  if (mode === 'month') return { mode, month: t.slice(0, 7) }
  if (mode === 'range') return { mode, from: '', to: '' }
  if (mode === 'flex') return { mode, date: '', flexDays: 3 }
  return { mode, date: '' }
}

function WindowRow(props: { w: DateWindow; onChange: (w: DateWindow) => void; onRemove?: () => void; min: string }): React.ReactElement {
  const { w, onChange, min } = props
  return (
    <div className="fm-window">
      <select value={w.mode} onChange={(e) => onChange(blank(e.target.value as DateWindowMode))} aria-label={tr('flights.tipoDeJanela')}>
        {MODES.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      {w.mode === 'range' && (
        <>
          <input type="date" min={min} value={w.from ?? ''} onChange={(e) => onChange({ ...w, from: e.target.value, to: w.to && w.to < e.target.value ? e.target.value : w.to })} aria-label={tr('flights.de')} />
          <span className="fm-small">{tr('flights.ate')}</span>
          <input type="date" min={w.from || min} value={w.to ?? ''} onChange={(e) => onChange({ ...w, to: e.target.value })} aria-label={tr('flights.ate4')} />
        </>
      )}
      {(w.mode === 'exact' || w.mode === 'flex') && <input type="date" min={min} value={w.date ?? ''} onChange={(e) => onChange({ ...w, date: e.target.value })} aria-label={tr('flights.data')} />}
      {w.mode === 'flex' && (
        <label className="fm-row fm-small" style={{ gap: 4 }}>
          ±<input type="number" min={0} max={15} value={w.flexDays ?? 3} onChange={(e) => onChange({ ...w, flexDays: Number(e.target.value) })} /> {tr('flights.dias')}
        </label>
      )}
      {w.mode === 'month' && <input type="month" min={min.slice(0, 7)} value={w.month ?? ''} onChange={(e) => onChange({ ...w, month: e.target.value })} aria-label={tr('flights.mes')} />}
      {props.onRemove && (
        <button className="fm-x" onClick={props.onRemove} type="button" aria-label={tr('flights.removerJanela')}>
          ✕
        </button>
      )}
    </div>
  )
}

function WindowList(props: { list: DateWindow[]; onChange: (l: DateWindow[]) => void; min: string; multi: boolean; addLabel: string }): React.ReactElement {
  const list = props.list.length ? props.list : [blank('range')]
  return (
    <div>
      {list.map((w, i) => (
        <WindowRow
          key={i}
          w={w}
          min={props.min}
          onChange={(nw) => props.onChange(list.map((x, j) => (j === i ? nw : x)))}
          onRemove={list.length > 1 ? () => props.onChange(list.filter((_, j) => j !== i)) : undefined}
        />
      ))}
      {props.multi && list.length < 6 && (
        <button className="fm-linkbtn" type="button" onClick={() => props.onChange([...list, blank('range')])}>
          + {props.addLabel}
        </button>
      )}
    </div>
  )
}

export function DatesEditor(props: { value: TripDates; onChange: (v: TripDates) => void; advanced: boolean }): React.ReactElement {
  const { value: d, onChange } = props
  const min = todayStr()
  const useReturnWindows = d.returnWindows.length > 0
  return (
    <div>
      <div className="fm-row" style={{ marginBottom: 8 }}>
        <div className="fm-seg" role="radiogroup" aria-label={tr('flights.tipoDeViagem')}>
          <button type="button" className={d.tripType === 'oneway' ? 'active' : ''} onClick={() => onChange({ ...d, tripType: 'oneway' })}>
            {tr('flights.soIda')}
          </button>
          <button type="button" className={d.tripType === 'roundtrip' ? 'active' : ''} onClick={() => onChange({ ...d, tripType: 'roundtrip', minStayDays: d.minStayDays ?? 7, maxStayDays: d.maxStayDays ?? 14 })}>
            {tr('flights.idaEVolta')}
          </button>
        </div>
      </div>
      <span className="fm-label">{tr('flights.ida')}</span>
      <WindowList list={d.windows} onChange={(windows) => onChange({ ...d, windows })} min={min} multi={props.advanced} addLabel="outra janela de ida" />
      {d.tripType === 'roundtrip' && (
        <div style={{ marginTop: 8 }}>
          <div className="fm-row">
            <span className="fm-label" style={{ margin: 0 }}>
              {tr('flights.volta2')}
            </span>
            <div className="fm-seg">
              <button type="button" className={!useReturnWindows ? 'active' : ''} onClick={() => onChange({ ...d, returnWindows: [] })}>
                {tr('flights.pelaDuracao')}
              </button>
              <button type="button" className={useReturnWindows ? 'active' : ''} onClick={() => onChange({ ...d, returnWindows: [blank('range')] })}>
                {tr('flights.janelaDeVolta')}
              </button>
            </div>
          </div>
          {useReturnWindows && (
            <div style={{ marginTop: 6 }}>
              <WindowList list={d.returnWindows} onChange={(returnWindows) => onChange({ ...d, returnWindows })} min={min} multi={props.advanced} addLabel="outra janela de volta" />
            </div>
          )}
          <div className="fm-row" style={{ marginTop: 6 }}>
            <label className="fm-row fm-small" style={{ gap: 4 }}>
              {tr('flights.duracaoDe')}
              <input type="number" min={0} max={365} style={{ width: 64 }} value={d.minStayDays ?? ''} onChange={(e) => onChange({ ...d, minStayDays: e.target.value === '' ? null : Number(e.target.value) })} />
              {tr('flights.a')}
              <input type="number" min={0} max={365} style={{ width: 64 }} value={d.maxStayDays ?? ''} onChange={(e) => onChange({ ...d, maxStayDays: e.target.value === '' ? null : Number(e.target.value) })} />
              {tr('flights.dias')}
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
