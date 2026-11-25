import React, { useEffect, useRef, useState } from 'react'
import { Contact } from '../../../types'
import { useContactStore } from '../store/contactStore'
import { ContactEditor } from '../components/ContactEditor'
import { BRAZIL, BRAZIL_STATES } from '../geo'
import { timeAgo, localDateStr } from '../../../utils/dates'
import { networkInfo } from '../../../../shared/chats'
import type { ChatLabel, PersonNetwork } from '../../../../shared/chats'
import { PersonNetworks } from '../../chats/components/PersonNetworks'
import { TagsModal, TagChip } from '../components/TagsModal'
import { parseQuery, matches, QUERY_HELP, QUERY_FIELDS, type FieldValues } from '../query'
import { t as tr, getLocale } from '../../../i18n'
import { promptRetomarContato } from '../../../../shared/prompts/crm/retomarContato'

/** Days until the next occurrence of a MM-DD / YYYY-MM-DD birthday, or null. */
function daysToBirthday(bday: string | null): number | null {
  if (!bday) return null
  const md = bday.slice(-5) // MM-DD
  const m = /^(\d{2})-(\d{2})$/.exec(md)
  if (!m) return null
  const now = new Date()
  let next = new Date(now.getFullYear(), Number(m[1]) - 1, Number(m[2]))
  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next = new Date(now.getFullYear() + 1, Number(m[1]) - 1, Number(m[2]))
  return Math.round((next.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000)
}

function SuggestModal({ contact, onClose }: { contact: Contact; onClose: () => void }): React.ReactElement {
  const [out, setOut] = useState('')
  const [running, setRunning] = useState(true)
  const runId = useRef<string | null>(null)
  useEffect(() => {
    const offChunk = window.api.ai.onChunk((rid, text) => {
      if (rid && rid === runId.current) setOut((o) => o + text)
    })
    const offDone = window.api.ai.onDone(({ runId: rid, ok, output, error }) => {
      if (rid !== runId.current) return
      runId.current = null
      setRunning(false)
      setOut(ok ? output : error || 'Falha.')
    })
    ;(async () => {
      const model = (await window.api.settings.get('claude_model')) ?? ''
      const prompt = promptRetomarContato({
        nome: contact.name,
        local: [contact.location, contact.state, contact.country].filter(Boolean).join(', '),
        interesses: contact.interests,
        ultimaConversa: contact.lastContactAt ? new Date(contact.lastContactAt).toLocaleDateString(getLocale()) : null,
        contexto: contact.context
      })
      runId.current = await window.api.ai.start({ prompt, model, save: false, source: 'crm' })
    })()
    return () => {
      offChunk()
      offDone()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 440, maxWidth: 600 }}>
        <h2>{tr('crm.mensagensPara')} {contact.name}</h2>
        <pre className="ai-output" style={{ maxHeight: 320 }}>{out || (running ? 'Pensando…' : '')}</pre>
        <div className="modal-actions">
          {!running && out && <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(out)}>{tr('crm.copiar')}</button>}
          <button className="btn btn-primary btn-sm" onClick={onClose}>{tr('crm.fechar')}</button>
        </div>
      </div>
    </div>
  )
}

export function CrmPage(): React.ReactElement {
  const { contacts, refresh, log, remove } = useContactStore()
  const [editing, setEditing] = useState<Contact | null>(null)
  const [creating, setCreating] = useState(false)
  const [suggest, setSuggest] = useState<Contact | null>(null)
  const [nameFilter, setNameFilter] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [stateFilter, setStateFilter] = useState('')

  // conversas vinculadas (Central de Mensagens): redes por pessoa e pendências
  const [nets, setNets] = useState<Record<number, PersonNetwork[]>>({})
  // tags das pessoas (catálogo compartilhado com a Central de Mensagens)
  const [labels, setLabels] = useState<ChatLabel[]>([])
  const [tagMap, setTagMap] = useState<Record<number, ChatLabel[]>>({})
  const [tagFilter, setTagFilter] = useState<number | ''>('')
  const [managingTags, setManagingTags] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  useEffect(() => {
    if (!showHelp) return
    const close = (): void => setShowHelp(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [showHelp])
  async function loadTags(): Promise<void> {
    const [ls, map] = await Promise.all([window.api.chats.labels(), window.api.chats.contactLabelMap()])
    setLabels(ls)
    setTagMap(map)
    if (tagFilter && !ls.some((l) => l.id === tagFilter)) setTagFilter('')
  }
  useEffect(() => {
    refresh()
    window.api.chats.contactNetworks().then(setNets).catch(() => setNets({}))
    loadTags().catch(() => undefined)
  }, [])

  function onCountryFilterChange(value: string): void {
    setCountryFilter(value)
    if (value !== BRAZIL) setStateFilter('') // estado só se aplica ao Brasil
  }

  // países distintos presentes nos contatos (para o filtro)
  const countries = Array.from(new Set(contacts.map((c) => c.country).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b))
  // estados distintos entre os contatos brasileiros (para o filtro por UF)
  const brStates = Array.from(new Set(contacts.filter((c) => c.country === BRAZIL).map((c) => c.state).filter(Boolean) as string[]))
    .sort((a, b) => a.localeCompare(b))
  const ufLabel = (uf: string): string => BRAZIL_STATES.find((s) => s.uf === uf)?.name ?? uf

  // busca por palavras-chave: cada palavra precisa aparecer em algum campo
  // (nome, cidade, estado/UF, país, interesses, contexto), sem diferenciar acentos
  const nameQuery = nameFilter.trim()
  const parsed = parseQuery(nameQuery)
  const fieldValues = (c: Contact): FieldValues => {
    const md = /(\d{2}-\d{2})$/.exec(c.birthday?.trim() ?? '')
    return {
      nome: [c.name],
      cidade: [c.location ?? ''],
      pais: [c.country ?? ''],
      estado: c.state ? [c.state, ufLabel(c.state)] : [],
      aniversario: c.birthday ? [md ? md[1] : c.birthday] : [],
      interesses: [c.interests ?? ''],
      contexto: [c.context ?? ''],
      tag: (tagMap[c.id] ?? []).map((t) => t.name),
      followup: [c.nextFollowUp ?? ''],
      prioridade: [c.priority ?? 'normal'],
      vip: c.vip ? ['sim'] : [],
      // rede=instagram, rede=@usuario ou rede=+5511… (o identificador da pessoa na rede)
      rede: (nets[c.id] ?? []).flatMap((n) => [networkInfo(n.network).label, n.handle ?? '', n.handle ? `@${n.handle.replace(/^@/, '')}` : '']).filter(Boolean),
      conversa: c.lastContactAt ? [c.lastContactAt.slice(0, 10)] : []
    }
  }
  const filtered = contacts.filter((c) => {
    if (parsed.terms.length && !matches(parsed, fieldValues(c))) return false
    if (countryFilter && c.country !== countryFilter) return false
    if (countryFilter === BRAZIL && stateFilter && c.state !== stateFilter) return false
    if (tagFilter && !(tagMap[c.id] ?? []).some((t) => t.id === tagFilter)) return false
    return true
  })

  const today = localDateStr(new Date())
  const needsAttention = (c: Contact): boolean => {
    if (c.nextFollowUp && c.nextFollowUp <= today) return true
    if (nets[c.id]?.some((n) => n.pending)) return true
    const bd = daysToBirthday(c.birthday)
    if (bd !== null && bd <= 7) return true
    if (c.lastContactAt) return Date.now() - new Date(c.lastContactAt).getTime() > 30 * 86400000
    return false
  }

  // sort: attention first, then oldest contact first
  const sorted = [...filtered].sort((a, b) => {
    const aa = needsAttention(a) ? 0 : 1
    const bb = needsAttention(b) ? 0 : 1
    if (aa !== bb) return aa - bb
    const at = a.lastContactAt ? new Date(a.lastContactAt).getTime() : 0
    const bt = b.lastContactAt ? new Date(b.lastContactAt).getTime() : 0
    return at - bt
  })
  const attentionCount = contacts.filter(needsAttention).length
  const isFiltering = !!(nameQuery || countryFilter || stateFilter || tagFilter)

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{tr('crm.pessoas')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {isFiltering ? tr('crm.deContatos', { count: filtered.length, count2: contacts.length }) : tr('crm.contatos', { count: contacts.length })} {tr('crm.precisamDeAtencao', { attentionCount })}
          </p>
          {parsed.unknown.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--warning)' }}>
              {tr('crm.campoDesconhecido')} {parsed.unknown.join(', ')} {tr('crm.ignoradoVejaO')}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div className="crm-search">
            <input
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder={tr('crm.buscarOuCidadeNull')}
              title={tr('crm.textoLivreOuExpressoesCampo')}
              style={{ minWidth: 180, flex: 1 }}
            />
            <button
              type="button"
              className="crm-help-btn"
              aria-label={tr('crm.ajudaDasExpressoesDeBusca')}
              aria-expanded={showHelp}
              onClick={(e) => {
                e.stopPropagation()
                setShowHelp((v) => !v)
              }}
            >
              {tr('crm.i')}
            </button>
            {showHelp && (
              <div className="crm-help-pop" onClick={(e) => e.stopPropagation()}>
                <strong>{tr('crm.buscaPorExpressoes')}</strong>
                <p>
                  {tr('crm.palavrasSoltasProcuramEmNome')}
                </p>
                <div className="crm-help-list">
                  {QUERY_HELP.map((h) => (
                    <button
                      key={h.expr}
                      type="button"
                      onClick={() => {
                        setNameFilter((q) => (q.trim() ? `${q.trim()} ${h.expr}` : h.expr))
                        setShowHelp(false)
                      }}
                    >
                      <code>{h.expr}</code>
                      <span>{h.desc}</span>
                    </button>
                  ))}
                </div>
                <p>
                  <code>=</code> {tr('crm.contem')} <code>!=</code> {tr('crm.naoContem')} <code>null</code> {tr('crm.vazioCampos', { QUERY_FIELDS })}
                </p>
              </div>
            )}
          </div>
          {countries.length > 0 && (
            <select value={countryFilter} onChange={(e) => onCountryFilterChange(e.target.value)} title={tr('crm.filtrarPorPais')}>
              <option value="">{tr('crm.todosOsPaises')}</option>
              {countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          {countryFilter === BRAZIL && brStates.length > 0 && (
            <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} title={tr('crm.filtrarPorEstado')}>
              <option value="">{tr('crm.todosOsEstados')}</option>
              {brStates.map((uf) => (
                <option key={uf} value={uf}>{uf} — {ufLabel(uf)}</option>
              ))}
            </select>
          )}
          {labels.length > 0 && (
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value ? Number(e.target.value) : '')} title={tr('crm.filtrarPorTag')}>
              <option value="">{tr('crm.todasAsTags')}</option>
              {labels.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => setManagingTags(true)}>{tr('crm.tags2')}</button>
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>{tr('crm.pessoa2')}</button>
        </div>
      </div>

      <div className="list-stack">
        {contacts.length === 0 && <div className="empty-hint">{tr('crm.nenhumaPessoaAdicioneQuemVoce')}</div>}
        {contacts.length > 0 && sorted.length === 0 && <div className="empty-hint">{tr('crm.nenhumContatoParaOsFiltros')}</div>}
        {sorted.map((c) => {
          const bd = daysToBirthday(c.birthday)
          const attention = needsAttention(c)
          return (
            <div key={c.id} className="list-row" style={{ alignItems: 'flex-start', borderLeft: attention ? '3px solid var(--warning, #f59e0b)' : '3px solid transparent' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="list-row-title">{c.vip ? '⭐ ' : ''}{c.name}</span>
                  {(tagMap[c.id] ?? []).map((t) => (
                    <TagChip key={t.id} tag={t} />
                  ))}
                  {c.priority === 'alta' && <span className="due-badge due-overdue">{tr('crm.prioridadeAlta')}</span>}
                  <PersonNetworks items={nets[c.id] ?? []} />
                  {c.location && <span className="project-chip">📍 {c.location}</span>}
                  {c.country && <span className="project-chip">🌎 {c.country}{c.state ? ` / ${c.state}` : ''}</span>}
                  {bd !== null && bd <= 7 && <span className="due-badge due-today">🎂 {bd === 0 ? tr('crm.hoje') : tr('crm.emD', { bd })}</span>}
                  {c.nextFollowUp && <span className={`due-badge ${c.nextFollowUp <= today ? 'due-overdue' : 'due-future'}`}>↩ {c.nextFollowUp}</span>}
                </div>
                {c.interests && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>💡 {c.interests}</div>}
                {c.context && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{c.context}</div>}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {c.lastContactAt ? tr('crm.ultimaConversaHa', { p0: timeAgo(c.lastContactAt) }) : tr('crm.semConversaRegistrada')}
                </div>
              </div>
              <div className="list-row-actions" style={{ flexShrink: 0 }}>
                <button className="btn btn-primary btn-sm" onClick={() => setSuggest(c)} title={tr('crm.sugerirMensagemComIa')}>{tr('crm.msg')}</button>
                <button className="btn btn-secondary btn-sm" onClick={() => log(c.id)} title={tr('crm.registrarQueConverseiHoje')}>{tr('crm.falei')}</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(c)}>{tr('crm.editar')}</button>
                <button className="btn btn-danger btn-sm" onClick={() => window.confirm(tr('crm.remover2', { name: c.name })) && remove(c.id)}>✕</button>
              </div>
            </div>
          )
        })}
      </div>

      {(creating || editing) && (
        <ContactEditor
          contact={editing}
          labels={labels}
          currentTags={editing ? tagMap[editing.id] ?? [] : []}
          onManageTags={() => setManagingTags(true)}
          networks={editing ? nets[editing.id] ?? [] : []}
          onClose={() => {
            setCreating(false)
            setEditing(null)
            void loadTags()
          }}
        />
      )}
      {managingTags && <TagsModal labels={labels} onChanged={loadTags} onClose={() => setManagingTags(false)} />}
      {suggest && <SuggestModal contact={suggest} onClose={() => setSuggest(null)} />}
    </div>
  )
}
