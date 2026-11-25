import React, { useEffect, useState } from 'react'
import type { ChatFilter, ChatStateFilter } from '../../../../shared/chats'
import { networkInfo } from '../../../../shared/chats'
import { useChatsStore } from '../store/chatsStore'
import { Popover } from './ui'
import { t as tr } from '../../../i18n'

const STATE_CHIPS: { id: ChatStateFilter; label: string; count?: (c: NonNullable<ReturnType<typeof useChatsStore.getState>['counts']>) => number }[] = [
  { id: 'all', label: tr('chats.todas') },
  { id: 'needs_reply', label: tr('chats.precisoResponder'), count: (c) => c.needsReply },
  { id: 'unread', label: tr('chats.naoLidas3'), count: (c) => c.unreadChats },
  { id: 'mentions', label: tr('chats.mencoes'), count: (c) => c.mentionChats },
  { id: 'high', label: tr('chats.alta2'), count: (c) => c.high },
  { id: 'waiting', label: tr('chats.aguardando'), count: (c) => c.waiting },
  { id: 'reminders', label: tr('chats.lembretes') },
  { id: 'snoozed', label: tr('chats.adiadas'), count: (c) => c.snoozed },
  { id: 'resolved', label: tr('chats.resolvidas') },
  { id: 'none', label: tr('chats.semRespostaNecessaria') }
]

const isFiltered = (f: ChatFilter): boolean =>
  !!(
    (f.state && f.state !== 'all') ||
    f.networks?.length ||
    (f.type && f.type !== 'all') ||
    f.withinHours ||
    f.from ||
    f.to ||
    f.pendingOlderThanDays ||
    (f.person && f.person !== 'all') ||
    f.labelIds?.length ||
    f.personLabelIds?.length ||
    f.search
  )

export function ChatFilters(): React.ReactElement {
  const { filter, setFilter, counts, labels, presets, total, refreshPresets } = useChatsStore()
  const [q, setQ] = useState(filter.search ?? '')
  const [more, setMore] = useState(false)

  // busca com debounce (não consulta a cada tecla)
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filter.search ?? '') !== q) setFilter({ search: q })
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const nets = Object.entries(counts?.byNetwork ?? {}).sort((a, b) => b[1].chats - a[1].chats)
  const toggleNet = (n: string): void => {
    const cur = filter.networks ?? []
    setFilter({ networks: cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n] })
  }
  const toggleLabel = (key: 'labelIds' | 'personLabelIds', id: number): void => {
    const cur = filter[key] ?? []
    setFilter({ [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] })
  }
  const time = filter.withinHours ? String(filter.withinHours) : filter.from || filter.to ? 'custom' : ''

  async function savePreset(): Promise<void> {
    const name = window.prompt(tr('chats.nomeDoFiltroSalvo'))
    if (!name) return
    const { search: _s, ...f } = filter
    await window.api.chats.savePreset(name, f)
    await refreshPresets()
  }

  return (
    <div className="chats-filters">
      <div className="chats-search">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('chats.buscarNomeGrupoPreviaTag')} aria-label={tr('chats.buscarConversas')} />
        <Popover label="☰" title={tr('chats.filtrosSalvos')} className="btn btn-secondary btn-sm">
          {(close) => (
            <>
              {presets.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center' }}>
                  <button className="opt" style={{ flex: 1 }} onClick={() => (setFilter(p.filter, true), setQ(''), close())}>{p.name}</button>
                  {!p.builtin && (
                    <button className="chats-linkbtn" title={tr('chats.excluir')} onClick={() => void window.api.chats.deletePreset(p.id).then(refreshPresets)}>✕</button>
                  )}
                </div>
              ))}
              <div className="sep" />
              <button className="opt" onClick={() => (void savePreset(), close())}>{tr('chats.salvarFiltroAtual')}</button>
            </>
          )}
        </Popover>
      </div>

      <div className="chats-chips">
        {STATE_CHIPS.slice(0, more ? STATE_CHIPS.length : 6).map((s) => {
          const n = s.count && counts ? s.count(counts) : null
          return (
            <button key={s.id} className={`chats-chip ${(filter.state ?? 'all') === s.id ? 'on' : ''}`} onClick={() => setFilter({ state: s.id })}>
              {s.label}
              {n ? <span className="n">{n}</span> : null}
            </button>
          )
        })}
      </div>

      {nets.length > 1 && (
        <div className="chats-chips">
          {nets.map(([n, v]) => {
            const info = networkInfo(n)
            return (
              <button key={n} className={`chats-chip ${filter.networks?.includes(n) ? 'on' : ''}`} onClick={() => toggleNet(n)} title={tr('chats.conversasComNaoLidas', { chats: v.chats, unread: v.unread })}>
                {info.icon} {info.label}
                {v.unread ? <span className="n">{v.unread}</span> : null}
              </button>
            )
          })}
        </div>
      )}

      {more && (
        <>
          <div className="chats-more">
            <select value={filter.type ?? 'all'} onChange={(e) => setFilter({ type: e.target.value as ChatFilter['type'] })} aria-label={tr('chats.tipo')}>
              <option value="all">{tr('chats.individuaisEGrupos')}</option>
              <option value="single">{tr('chats.soIndividuais')}</option>
              <option value="group">{tr('chats.soGrupos')}</option>
            </select>
            <select
              value={time}
              onChange={(e) => {
                const v = e.target.value
                if (v === 'custom') setFilter({ withinHours: null, from: new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10) })
                else setFilter({ withinHours: v ? Number(v) : null, from: null, to: null })
              }}
              aria-label={tr('chats.periodo')}
            >
              <option value="">{tr('chats.qualquerData')}</option>
              <option value="24">{tr('chats.ultimas24Horas')}</option>
              <option value="168">{tr('chats.ultimos7Dias')}</option>
              <option value="720">{tr('chats.ultimos30Dias')}</option>
              <option value="custom">{tr('chats.periodoPersonalizado')}</option>
            </select>
            {time === 'custom' && (
              <>
                <input type="date" value={filter.from?.slice(0, 10) ?? ''} onChange={(e) => setFilter({ from: e.target.value || null })} aria-label={tr('chats.de')} />
                <input type="date" value={filter.to?.slice(0, 10) ?? ''} onChange={(e) => setFilter({ to: e.target.value ? `${e.target.value}T23:59:59` : null })} aria-label={tr('chats.ate2')} />
              </>
            )}
            <select value={filter.pendingOlderThanDays ?? ''} onChange={(e) => setFilter({ pendingOlderThanDays: e.target.value ? Number(e.target.value) : null })} aria-label={tr('chats.semRespostaHa')}>
              <option value="">{tr('chats.semRespostaHaQualquer')}</option>
              <option value="1">{tr('chats.1DiaSemResposta')}</option>
              <option value="3">{tr('chats.3DiasSemResposta')}</option>
              <option value="7">{tr('chats.7DiasSemResposta')}</option>
              <option value="30">{tr('chats.30DiasSemResposta')}</option>
            </select>
            <select value={filter.person ?? 'all'} onChange={(e) => setFilter({ person: e.target.value as ChatFilter['person'] })} aria-label={tr('chats.pessoa')}>
              <option value="all">{tr('chats.comOuSemPessoa')}</option>
              <option value="linked">{tr('chats.comPessoaVinculada')}</option>
              <option value="unlinked">{tr('chats.semPessoaVinculada2')}</option>
            </select>
            <select value={filter.sort ?? 'recent'} onChange={(e) => setFilter({ sort: e.target.value as ChatFilter['sort'] })} aria-label={tr('chats.ordenar')}>
              <option value="priority">{tr('chats.ordenarPrioridade')}</option>
              <option value="recent">{tr('chats.ordenarMaisRecentes')}</option>
              <option value="oldest_pending">{tr('chats.ordenarEsperandoHaMaisTempo')}</option>
            </select>
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={!!filter.includeArchived} onChange={(e) => setFilter({ includeArchived: e.target.checked })} /> {tr('chats.incluirArquivadasNoApp')}
            </label>
          </div>
          {labels.length > 0 && (
            <>
              <div className="chats-filter-meta">{tr('chats.tagsDaConversa')}</div>
              <div className="chats-chips">
                {labels.map((l) => (
                  <button key={l.id} className={`chats-chip ${filter.labelIds?.includes(l.id) ? 'on' : ''}`} onClick={() => toggleLabel('labelIds', l.id)}>
                    <span className="chats-color" style={{ background: l.color }} /> {l.name}
                  </button>
                ))}
              </div>
              <div className="chats-filter-meta">{tr('chats.tagsDaPessoa')}</div>
              <div className="chats-chips">
                {labels.map((l) => (
                  <button key={l.id} className={`chats-chip ${filter.personLabelIds?.includes(l.id) ? 'on' : ''}`} onClick={() => toggleLabel('personLabelIds', l.id)}>
                    <span className="chats-color" style={{ background: l.color }} /> {l.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div className="chats-filter-meta">
        <span>{tr('chats.nConversas', { count: total })}</span>
        <span style={{ display: 'flex', gap: 10 }}>
          <button className="chats-linkbtn" onClick={() => setMore((m) => !m)}>{more ? tr('chats.menosFiltros') : tr('chats.maisFiltros')}</button>
          {isFiltered(filter) && (
            <button className="chats-linkbtn" onClick={() => (setFilter({}, true), setQ(''))}>{tr('chats.limpar')}</button>
          )}
        </span>
      </div>
    </div>
  )
}
