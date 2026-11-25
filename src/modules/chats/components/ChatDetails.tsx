import React, { useEffect, useState } from 'react'
import type { ChatLabel, ChatPriority, ChatSummary, ContactChatLink, ContactSuggestion } from '../../../../shared/chats'
import { networkInfo } from '../../../../shared/chats'
import type { ContactLite } from '../api'
import { useChatsStore } from '../store/chatsStore'
import { LabelMenu, PriorityMenu, SnoozeMenu, StateMenu } from './actions'
import { LabelChips, StatePill } from './ui'
import { t as tr, getLocale } from '../../../i18n'

function LinkPersonModal({ chat, onClose }: { chat: ChatSummary; onClose: () => void }): React.ReactElement {
  const [contacts, setContacts] = useState<ContactLite[]>([])
  const [q, setQ] = useState('')
  useEffect(() => {
    void window.api.chats.contacts().then(setContacts)
  }, [])
  const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const list = contacts.filter((c) => !q || norm(c.name).includes(norm(q))).slice(0, 80)
  async function link(id: number): Promise<void> {
    await window.api.chats.link([chat.id], id)
    onClose()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440, width: '100%' }}>
        <h2>{tr('chats.vincularPessoa')}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tr('chats.no', { title: chat.title })} {networkInfo(chat.network).label}</p>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('chats.buscarEmPessoas')} style={{ width: '100%' }} />
        <div className="chats-pick-list">
          {list.map((c) => (
            <div key={c.id} className="chats-pick" onClick={() => void link(c.id)}>
              <span>{c.vip ? '⭐' : '👤'}</span>
              <span style={{ flex: 1 }}>{c.name}</span>
              {c.priority === 'alta' && <span className="chats-prio alta">{tr('chats.alta')}</span>}
            </div>
          ))}
          {list.length === 0 && <div className="chats-empty">{tr('chats.ninguemEncontrado')}</div>}
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>{tr('chats.cancelar')}</button>
        </div>
      </div>
    </div>
  )
}

export function ChatDetails({ chat }: { chat: ChatSummary }): React.ReactElement {
  const { refreshActive, open, setDetailOpen } = useChatsStore()
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([])
  const [others, setOthers] = useState<ContactChatLink[]>([])
  const [person, setPerson] = useState<ContactLite | null>(null)
  const [personLabels, setPersonLabels] = useState<ChatLabel[]>([])
  const [todos, setTodos] = useState<{ id: number; title: string; status: string; dueDate: string | null }[]>([])
  const [notes, setNotes] = useState(chat.notes ?? '')
  const [linking, setLinking] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function loadPerson(): Promise<void> {
    if (chat.contactId) {
      const all = await window.api.chats.contacts()
      setPerson(all.find((c) => c.id === chat.contactId) ?? null)
      setOthers((await window.api.chats.contactChats(chat.contactId)).filter((o) => o.chatId !== chat.id))
      setPersonLabels(await window.api.chats.contactLabels(chat.contactId))
      setSuggestions([])
    } else {
      setPerson(null)
      setOthers([])
      setPersonLabels([])
      setSuggestions(chat.type === 'single' ? await window.api.chats.suggestContacts(chat.id) : [])
    }
  }

  useEffect(() => {
    setNotes(chat.notes ?? '')
    setErr(null)
    void loadPerson()
    void window.api.chats.todos(chat.id).then(setTodos)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id, chat.contactId, chat.todoCount])

  async function act(fn: () => Promise<unknown>): Promise<void> {
    setErr(null)
    try {
      await fn()
      await refreshActive()
      await loadPerson()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  async function createPerson(): Promise<void> {
    const name = window.prompt(tr('chats.nomeDaPessoa'), chat.title)
    if (!name) return
    await act(() => window.api.chats.createContact(chat.id, name))
  }

  async function setPersonPrio(priority: ChatPriority, vip: boolean): Promise<void> {
    if (!chat.contactId) return
    await act(() => window.api.chats.setContactPriority(chat.contactId!, priority, vip))
  }

  const mentions = (chat.unreadMentions ?? 0) > 0 && !chat.mentionsReviewed

  return (
    <div>
      <div className="chats-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <b style={{ fontSize: 13 }}>{tr('chats.detalhes')}</b>
        <button className="btn btn-secondary btn-sm chats-detail-close" onClick={() => setDetailOpen(false)}>✕</button>
      </div>
      {err && <div className="chats-msg err" style={{ marginTop: 0, marginBottom: 10 }}>{err}</div>}

      <div className="chats-panel-section">
        <h4>{tr('chats.pessoa')}</h4>
        {chat.type === 'group' ? (
          <div className="chats-person" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {tr('chats.grupo2')}{chat.participantCount ?? '?'} {tr('chats.participantesGruposNaoViramPessoas')}
          </div>
        ) : chat.contactId && person ? (
          <div className="chats-person">
            <div className="chats-row" style={{ justifyContent: 'space-between' }}>
              <b>{person.vip ? '⭐ ' : ''}{person.name}</b>
              <button className="chats-linkbtn" onClick={() => void act(() => window.api.chats.link([chat.id], null))}>{tr('chats.desvincular')}</button>
            </div>
            <div className="chats-row" style={{ marginTop: 6 }}>
              <select value={person.priority ?? 'normal'} onChange={(e) => void setPersonPrio(e.target.value as ChatPriority, !!person.vip)} aria-label={tr('chats.prioridadeDaPessoa')}>
                <option value="alta">{tr('chats.pessoaPrioridadeAlta')}</option>
                <option value="normal">{tr('chats.pessoaNormal')}</option>
                <option value="baixa">{tr('chats.pessoaBaixa')}</option>
              </select>
              <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
                <input type="checkbox" checked={!!person.vip} onChange={(e) => void setPersonPrio((person.priority as ChatPriority) || 'normal', e.target.checked)} /> {tr('chats.vip')}
              </label>
            </div>
            <div className="chats-row" style={{ marginTop: 6 }}>
              <LabelChips labels={personLabels} max={6} />
              <LabelMenu ids={[chat.contactId]} entity="contact" current={personLabels} label={tr('chats.daPessoa')} className="chats-linkbtn" onChanged={() => void loadPerson()} />
            </div>
            {person.context && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, whiteSpace: 'pre-wrap' }}>{person.context}</div>}
            {person.interests && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>💡 {person.interests}</div>}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {person.lastContactAt ? tr('chats.ultimaConversa', { p0: new Date(person.lastContactAt).toLocaleDateString(getLocale()) }) : tr('chats.semConversaRegistrada')}
            </div>
            {others.length > 0 && (
              <div className="chats-person-nets">
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tr('chats.outrasConversasDestaPessoa')}</div>
                {others.map((o) => (
                  <div key={o.chatId} className="chats-person-net" onClick={() => void open(o.chatId)}>
                    <span>{networkInfo(o.network).icon}</span>
                    <span style={{ flex: 1 }}>{networkInfo(o.network).label} · {o.title}</span>
                    {o.replyState === 'needs_reply' && <span className="chats-state needs_reply">{tr('chats.responder2')}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="chats-row">
              <button className="btn btn-primary btn-sm" onClick={() => setLinking(true)}>{tr('chats.vincularPessoa2')}</button>
              <button className="btn btn-secondary btn-sm" onClick={() => void createPerson()}>{tr('chats.criarPessoa')}</button>
            </div>
            {suggestions.map((s) => (
              <div key={s.contactId} className="chats-suggest">
                <span>
                  {tr('chats.sera')} <b>{s.name}</b>? <span style={{ color: 'var(--text-muted)' }}>({s.reason})</span>
                </span>
                <button className="btn btn-secondary btn-sm" onClick={() => void act(() => window.api.chats.link([chat.id], s.contactId))}>{tr('chats.vincular2')}</button>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="chats-panel-section">
        <h4>{tr('chats.estado')}</h4>
        <div className="chats-row">
          <StatePill state={chat.replyState} source={chat.replyStateSource} />
          {chat.replyState === 'none' && <span className="chats-mini">{tr('chats.naoRequerResposta')}</span>}
          <StateMenu ids={[chat.id]} label={tr('chats.corrigir')} className="chats-linkbtn" />
        </div>
        {chat.replyReason && <div className="chats-mini" style={{ marginTop: 4, whiteSpace: 'normal' }}>{chat.replyReason}</div>}
        {mentions && (
          <div className="chats-row" style={{ marginTop: 6 }}>
            <span className={`chats-mention ${chat.mentionsEstimated ? 'est' : ''}`}>{chat.mentionsEstimated ? '~' : ''}@{chat.unreadMentions}</span>
            <button className="chats-linkbtn" onClick={() => void act(() => window.api.chats.reviewMentions([chat.id]))}>{tr('chats.marcarMencoesComoRevisadas')}</button>
          </div>
        )}
      </div>

      <div className="chats-panel-section">
        <h4>{tr('chats.prioridade')}</h4>
        <div className="chats-row">
          <span style={{ fontSize: 13 }}>{chat.priority ? chat.priority : tr('chats.automaticaSugerida', { suggestedPriority: chat.suggestedPriority })}</span>
          <PriorityMenu ids={[chat.id]} label={tr('chats.alterar')} className="chats-linkbtn" />
        </div>
      </div>

      <div className="chats-panel-section">
        <h4>{tr('chats.tagsDaConversa')}</h4>
        <div className="chats-row">
          <LabelChips labels={chat.labels} max={10} />
          <LabelMenu ids={[chat.id]} current={chat.labels} label={chat.labels.length ? tr('chats.editar') : tr('chats.tag')} className="chats-linkbtn" />
        </div>
      </div>

      <div className="chats-panel-section">
        <h4>{tr('chats.lembrete')}</h4>
        <div className="chats-row">
          {chat.snoozeUntil ? (
            <span style={{ fontSize: 13 }}>
              {chat.reminderDue ? tr('chats.venceu') : tr('chats.ate')}
              {new Date(chat.snoozeUntil).toLocaleString(getLocale(), { dateStyle: 'short', timeStyle: 'short' })}
              {chat.reminderNote ? ` — ${chat.reminderNote}` : ''}
            </span>
          ) : (
            <span className="chats-mini">{tr('chats.nenhum')}</span>
          )}
          <SnoozeMenu ids={[chat.id]} current={chat.snoozeUntil} label={chat.snoozeUntil ? tr('chats.alterar2') : tr('chats.lembrar')} className="chats-linkbtn" />
        </div>
      </div>

      <div className="chats-panel-section">
        <h4>{tr('chats.tarefas')}</h4>
        {todos.length === 0 && <span className="chats-mini">{tr('chats.nenhumaTarefaVinculada')}</span>}
        {todos.map((t) => (
          <div key={t.id} style={{ fontSize: 13, display: 'flex', gap: 6 }}>
            <span>{t.status === 'done' ? '✅' : '☐'}</span>
            <span style={{ flex: 1, textDecoration: t.status === 'done' ? 'line-through' : undefined }}>{t.title}</span>
            {t.dueDate && <span className="chats-mini">{t.dueDate}</span>}
          </div>
        ))}
      </div>

      <div className="chats-panel-section">
        <h4>{tr('chats.notasSoNoRickos')}</h4>
        <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (chat.notes ?? '') && void window.api.chats.setNotes(chat.id, notes)} placeholder={tr('chats.contextoCombinadosOQueFalta')} />
      </div>

      <div className="chats-panel-section">
        <h4>{tr('chats.informacoes')}</h4>
        <div className="chats-mini" style={{ whiteSpace: 'normal', lineHeight: 1.6 }}>
          {networkInfo(chat.network).label} · {chat.type === 'group' ? tr('chats.grupo3') : tr('chats.individual')}
          {chat.isMuted ? tr('chats.silenciada') : ''}
          <br />
          {tr('chats.naoLidas2')} {chat.unreadCount == null ? tr('chats.naoInformadoPeloProvedor') : chat.unreadCount}
          <br />
          {tr('chats.ultimaRecebida')} {chat.lastInboundAt ? new Date(chat.lastInboundAt).toLocaleString(getLocale()) : '—'}
          <br />
          {tr('chats.ultimaSua')} {chat.lastOutboundAt ? new Date(chat.lastOutboundAt).toLocaleString(getLocale()) : '—'}
          {chat.stale && (
            <>
              <br />{tr('chats.provedorContaInativo')}
            </>
          )}
        </div>
      </div>

      {linking && (
        <LinkPersonModal
          chat={chat}
          onClose={() => {
            setLinking(false)
            void refreshActive().then(loadPerson)
          }}
        />
      )}
    </div>
  )
}
