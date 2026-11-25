import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { ChatMessage, ChatSummary, ChatTemplate, MessagePage, OutgoingImageInput } from '../../../../shared/chats'
import { MAX_SEND_IMAGE_BYTES, networkInfo } from '../../../../shared/chats'
import { pickFile } from '../../../api/files'
import { authedUrl } from '../../../api/transport'
import { useChatsStore } from '../store/chatsStore'
import { PinButton, SnoozeMenu, StateMenu } from './actions'
import { AiPanel } from './AiPanel'
import { Avatar, Popover } from './ui'
import { t as tr, getLocale } from '../../../i18n'

let cfgCache: { markReadOnOpen: boolean } | null = null

type PendingImage = OutgoingImageInput & { url: string; size: number }

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

/** Lê a imagem colada/arrastada/escolhida. Nada sai do navegador até você clicar em Enviar. */
async function readImage(f: File): Promise<PendingImage> {
  if (!IMAGE_TYPES.includes(f.type)) throw new Error(tr('chats.formatoNaoSuportado'))
  if (f.size > MAX_SEND_IMAGE_BYTES) throw new Error(tr('chats.imagemGrandeDemais'))
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error(tr('chats.naoFoiPossivelLerImagem')))
    r.readAsDataURL(f)
  })
  const name = f.name && f.name !== 'image.png' ? f.name : `imagem-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
  return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: f.type, fileName: name, url: URL.createObjectURL(f), size: f.size }
}

const kb = (n: number): string => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const y = new Date()
  y.setDate(y.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return tr('chats.hoje')
  if (d.toDateString() === y.toDateString()) return tr('chats.ontem')
  return d.toLocaleDateString(getLocale(), { weekday: 'long', day: '2-digit', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

export function ConfirmSend({ chat, text, onCancel, onConfirm, busy }: { chat: ChatSummary; text: string; onCancel: () => void; onConfirm: () => void; busy?: boolean }): React.ReactElement {
  useEffect(() => {
    const k = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onCancel])
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, width: '100%' }}>
        <h2>{tr('chats.enviarMensagem')}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {tr('chats.para')} <b>{chat.contactName || chat.title}</b> {tr('chats.no2', { icon: networkInfo(chat.network).icon, label: networkInfo(chat.network).label })}
        </p>
        <div className="chats-bubble" style={{ maxWidth: '100%', margin: '8px 0' }}>{text}</div>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onCancel}>{tr('chats.cancelar')}</button>
          <button className="btn btn-primary btn-sm" onClick={onConfirm} disabled={busy} autoFocus>{busy ? tr('chats.enviando') : tr('chats.confirmarEnvio')}</button>
        </div>
      </div>
    </div>
  )
}

function TodoModal({ chat, message, onClose }: { chat: ChatSummary; message: ChatMessage | null; onClose: () => void }): React.ReactElement {
  const [title, setTitle] = useState(message ? `${chat.contactName || chat.title}: ${message.text.replace(/\s+/g, ' ').slice(0, 80)}` : `Responder ${chat.contactName || chat.title}`)
  const [due, setDue] = useState('')
  const [err, setErr] = useState<string | null>(null)
  async function save(): Promise<void> {
    try {
      await window.api.chats.createTodo(chat.id, title, due || null, message?.id ?? null)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: '100%' }}>
        <h2>{tr('chats.criarTarefa')}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tr('chats.vaiParaOTodoVinculada')}{chat.contactName ? tr('chats.eA', { contactName: chat.contactName }) : ''}.</p>
        <div className="editor-field">
          <label>{tr('chats.titulo')}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="editor-field">
          <label>{tr('chats.prazoOpcional')}</label>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        {err && <div className="chats-msg err">{err}</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>{tr('chats.cancelar')}</button>
          <button className="btn btn-primary btn-sm" onClick={() => void save()}>{tr('chats.criar')}</button>
        </div>
      </div>
    </div>
  )
}

function DeleteModal({ chat, message, onClose, onDone }: { chat: ChatSummary; message: ChatMessage; onClose: () => void; onDone: () => void }): React.ReactElement {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    const k = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  async function run(forEveryone: boolean): Promise<void> {
    setBusy(true)
    setErr(null)
    try {
      await window.api.chats.deleteMessage(chat.id, message.id, forEveryone)
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, width: '100%' }}>
        <h2>{tr('chats.apagarMensagem')}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {tr('chats.em')} <b>{chat.contactName || chat.title}</b> {tr('chats.noNaoDaParaDesfazer', { icon: networkInfo(chat.network).icon, label: networkInfo(chat.network).label })}
        </p>
        <div className="chats-bubble" style={{ maxWidth: '100%', margin: '8px 0' }}>{message.text || <i>{tr('chats.semTexto')}</i>}</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tr('chats.paraTodosDependeDaRede')}</p>
        {err && <div className="chats-msg err">{err}</div>}
        <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={busy}>{tr('chats.cancelar')}</button>
          <button className="btn btn-secondary btn-sm" onClick={() => void run(false)} disabled={busy}>{tr('chats.apagarSoParaMim')}</button>
          <button className="btn btn-danger btn-sm" onClick={() => void run(true)} disabled={busy} autoFocus>{busy ? tr('chats.apagando') : tr('chats.apagarParaTodos')}</button>
        </div>
      </div>
    </div>
  )
}

export function ChatView({ chat }: { chat: ChatSummary }): React.ReactElement {
  const { status, setPane, setDetailOpen, detailOpen, refreshActive } = useChatsStore()
  const [page, setPage] = useState<MessagePage | null>(null)
  const [items, setItems] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [picking, setPicking] = useState(false)
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [sending, setSending] = useState(false)
  const [image, setImageState] = useState<PendingImage | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [sendErr, setSendErr] = useState<string | null>(null)
  const [ai, setAi] = useState<'suggest' | 'summary' | null>(null)
  const [todoFor, setTodoFor] = useState<ChatMessage | null | undefined>(undefined)
  const [templates, setTemplates] = useState<ChatTemplate[]>([])
  const [flash, setFlash] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [editBusy, setEditBusy] = useState(false)
  const [editErr, setEditErr] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<ChatMessage | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  const offline = status?.state === 'offline' || status?.state === 'error' || status?.state === 'disabled'
  const canSend = !chat.stale && !offline && !!status?.capabilities.sendMessages
  const canImage = canSend && !!status?.capabilities.sendImages
  const canEdit = !chat.stale && !offline && !!status?.capabilities.editMessages
  const canDelete = !chat.stale && !offline && !!status?.capabilities.deleteMessages

  async function load(): Promise<void> {
    setLoading(true)
    setErr(null)
    try {
      const p = await window.api.chats.messages(chat.id)
      setPage(p)
      setItems(p.items)
      stick.current = true
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  // Esc fecha o painel de IA e, depois, a seleção (fora de campos de texto)
  useEffect(() => {
    if (!ai && !picking) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.tagName === 'SELECT')) return
      if (document.querySelector('.modal-overlay')) return
      if (ai) setAi(null)
      else {
        setPicking(false)
        setPicked([])
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ai, picking])

  useEffect(() => {
    setPicked([])
    setPicking(false)
    setReplyTo(null)
    setAi(null)
    setText('')
    setImage(null)
    setSendErr(null)
    setEditing(null)
    setDeleting(null)
    void load()
    void (async () => {
      cfgCache ??= (await window.api.chats.config()).config
      if (cfgCache.markReadOnOpen && (chat.unreadCount ?? 0) > 0 && status?.capabilities.markAsRead) await window.api.chats.markRead(chat.id, true).catch(() => undefined)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id])

  // tempo real: recarrega a página recente quando a conversa muda (sem perder as antigas carregadas)
  useEffect(() => {
    return window.api.chats.onUpdated(({ chatIds }) => {
      if (!chatIds.includes(chat.id)) return
      void window.api.chats.messages(chat.id).then((p) => {
        setItems((old) => {
          const m = new Map(old.map((x) => [x.id, x]))
          for (const x of p.items) m.set(x.id, x)
          return [...m.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey, undefined, { numeric: true }))
        })
      })
    })
  }, [chat.id])

  useEffect(() => {
    if (stick.current && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [items])

  async function older(): Promise<ChatMessage[]> {
    if (!page?.cursor) return []
    const el = listRef.current
    const prevH = el?.scrollHeight ?? 0
    stick.current = false
    const p = await window.api.chats.messages(chat.id, page.cursor)
    setPage({ ...p, items: [] })
    setItems((old) => {
      const ids = new Set(old.map((x) => x.id))
      return [...p.items.filter((x) => !ids.has(x.id)), ...old]
    })
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevH
    })
    return p.items
  }

  async function gotoMention(): Promise<void> {
    let target = [...items].reverse().find((m) => m.mentionsMe)
    for (let i = 0; !target && i < 5 && page?.cursor; i++) {
      const more = await older()
      target = [...more].reverse().find((m) => m.mentionsMe)
    }
    if (!target) return
    setFlash(target.id)
    stick.current = false
    setTimeout(() => document.getElementById(`msg-${target!.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50)
    setTimeout(() => setFlash(null), 1800)
  }

  const togglePick = (id: string): void => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  function pickSinceMyLast(): void {
    let last = -1
    items.forEach((m, i) => {
      if (m.isMine) last = i
    })
    const ids = items.slice(last + 1).filter((m) => !m.isMine && !m.deleted).map((m) => m.id)
    setPicked(ids.length ? ids : items.filter((m) => !m.isMine).slice(-3).map((m) => m.id))
    setPicking(true)
  }

  function setImage(next: PendingImage | null): void {
    setImageState((old) => {
      if (old && old.url !== next?.url) URL.revokeObjectURL(old.url)
      return next
    })
  }

  async function attach(f: File | null | undefined): Promise<void> {
    if (!f) return
    setSendErr(null)
    try {
      setImage(await readImage(f))
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : String(e))
    }
  }

  function imageFrom(dt: DataTransfer | null): File | null {
    if (!dt) return null
    for (const it of Array.from(dt.items ?? [])) if (it.kind === 'file' && it.type.startsWith('image/')) return it.getAsFile()
    return Array.from(dt.files ?? []).find((f) => f.type.startsWith('image/')) ?? null
  }

  async function send(body: string, reply: ChatMessage | null, img: PendingImage | null = null): Promise<boolean> {
    setSending(true)
    setSendErr(null)
    try {
      await window.api.chats.send(chat.id, body, reply?.id ?? null, img ? { base64: img.base64, mimeType: img.mimeType, fileName: img.fileName } : null)
      stick.current = true
      await load()
      void refreshActive()
      return true
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setSending(false)
    }
  }

  async function saveEdit(): Promise<void> {
    if (!editing) return
    const original = items.find((m) => m.id === editing.id)
    if (original && original.text === editing.text.trim()) {
      setEditing(null)
      return
    }
    setEditBusy(true)
    setEditErr(null)
    try {
      await window.api.chats.editMessage(chat.id, editing.id, editing.text)
      setItems((old) => old.map((m) => (m.id === editing.id ? { ...m, text: editing.text.trim(), edited: true } : m)))
      setEditing(null)
      void refreshActive()
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : String(e))
    } finally {
      setEditBusy(false)
    }
  }

  async function sendComposer(): Promise<void> {
    if ((!text.trim() && !image) || !canSend) return
    if (await send(text, replyTo, image)) {
      setText('')
      setImage(null)
      setReplyTo(null)
    }
  }

  const byId = useMemo(() => new Map(items.map((m) => [m.id, m])), [items])
  const pickedMsgs = items.filter((m) => picked.includes(m.id))
  const hasMention = (chat.unreadMentions ?? 0) > 0 || items.some((m) => m.mentionsMe)
  const n = networkInfo(chat.network)

  let lastDay = ''
  return (
    <>
      <div className="chats-view-head">
        <button className="btn btn-secondary btn-sm chats-back" onClick={() => setPane('list')} aria-label={tr('chats.voltar')}>←</button>
        <Avatar chat={chat} size={34} />
        <div className="chats-view-title">
          <b>{chat.contactName && chat.contactName !== chat.title ? `${chat.contactName} · ${chat.title}` : chat.title}</b>
          <span>
            {n.icon} {n.label}
            {chat.type === 'group' && chat.participantCount ? tr('chats.participantes', { participantCount: chat.participantCount }) : ''}
            {chat.peerHandle ? ` · ${chat.peerHandle}` : ''}
          </span>
        </div>
        <div className="chats-view-actions">
          {hasMention && <button className="btn btn-secondary btn-sm" onClick={() => void gotoMention()} title={tr('chats.irParaAMencao')}>{tr('chats.irPMencao')}</button>}
          {status?.capabilities.markAsRead && (chat.unreadCount ?? 0) > 0 && (
            <button className="btn btn-secondary btn-sm" disabled={offline || chat.stale} onClick={() => void window.api.chats.markRead(chat.id, true).then(refreshActive)}>{tr('chats.marcarLida')}</button>
          )}
          {status?.capabilities.markAsUnread && (chat.unreadCount ?? 0) === 0 && (
            <button className="btn btn-secondary btn-sm" disabled={offline || chat.stale} onClick={() => void window.api.chats.markRead(chat.id, false).then(refreshActive)}>{tr('chats.naoLida')}</button>
          )}
          <PinButton ids={[chat.id]} pinned={!!chat.pinnedAt} compact />
          <StateMenu ids={[chat.id]} label={tr('chats.estado')} />
          <SnoozeMenu ids={[chat.id]} current={chat.snoozeUntil} />
          <button className="btn btn-secondary btn-sm" onClick={() => (picking ? (setPicking(false), setPicked([])) : setPicking(true))}>{picking ? tr('chats.cancelarSelecao') : tr('chats.selecionar2')}</button>
          <button className="btn btn-secondary btn-sm chats-info-btn" onClick={() => setDetailOpen(!detailOpen)} title={tr('chats.pessoaTagsNotas')}>{tr('chats.detalhes2')}</button>
        </div>
      </div>

      {chat.stale && <div className="chats-notice warn">{tr('chats.estaConversaEDeUm')}</div>}
      {!chat.stale && offline && <div className="chats-notice warn">{tr('chats.provedorIndisponivelMostrandoOQue')}</div>}
      {page?.fromCache && <div className="chats-notice">{tr('chats.mensagensDoCacheLocalPodem')}</div>}

      <div className="chats-messages" ref={listRef} onScroll={(e) => {
        const el = e.currentTarget
        stick.current = el.scrollTop + el.clientHeight > el.scrollHeight - 80
      }}>
        {page?.cursor && (
          <div style={{ textAlign: 'center' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => void older()}>{tr('chats.carregarMaisAntigas')}</button>
          </div>
        )}
        {page && !page.cursor && items.length > 0 && page.partialHistory && (
          <div className="chats-day">{tr('chats.inicioDoHistoricoDisponivelNo')}</div>
        )}
        {loading && items.length === 0 && <div className="chats-empty">{tr('chats.carregandoMensagens')}</div>}
        {err && <div className="chats-empty">{tr('chats.naoFoiPossivelCarregar')} {err}</div>}
        {!loading && !err && items.length === 0 && <div className="chats-empty">{tr('chats.nenhumaMensagemDisponivel')}</div>}
        {items.map((m) => {
          const d = new Date(m.timestamp).toDateString()
          const showDay = d !== lastDay
          lastDay = d
          const ref = m.replyToId ? byId.get(m.replyToId) : null
          return (
            <React.Fragment key={m.id}>
              {showDay && <div className="chats-day">{dayLabel(m.timestamp)}</div>}
              <div className={`chats-msgrow ${m.isMine ? 'mine' : ''}`} id={`msg-${m.id}`}>
                {picking && <input type="checkbox" className="chats-msgsel" checked={picked.includes(m.id)} onChange={() => togglePick(m.id)} aria-label={tr('chats.selecionarMensagem')} />}
                <div
                  className={`chats-bubble ${m.mentionsMe ? 'mention' : ''} ${picked.includes(m.id) ? 'picked' : ''} ${flash === m.id ? 'flash' : ''} ${editing?.id === m.id ? 'editing' : ''}`}
                  onClick={picking ? () => togglePick(m.id) : undefined}
                >
                  {chat.type === 'group' && !m.isMine && <div className="chats-sender">{m.senderName}</div>}
                  {ref && <div className="chats-reply-ref">↩ {ref.isMine ? tr('chats.voce') : ref.senderName}: {ref.text.slice(0, 80)}</div>}
                  {m.deleted ? (
                    <i style={{ color: 'var(--text-muted)' }}>{tr('chats.mensagemApagada')}</i>
                  ) : editing?.id === m.id ? (
                    <div className="chats-edit" onClick={(e) => e.stopPropagation()}>
                      <textarea
                        value={editing.text}
                        autoFocus
                        rows={Math.min(8, Math.max(2, editing.text.split('\n').length))}
                        onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setEditing(null)
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault()
                            void saveEdit()
                          }
                        }}
                      />
                      {editErr && <div className="chats-msg err" style={{ margin: 0 }}>{editErr}</div>}
                      <div className="chats-edit-actions">
                        <span>{tr('chats.aEdicaoApareceParaTodos')}</span>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(null)} disabled={editBusy}>{tr('chats.cancelar')}</button>
                        <button className="btn btn-primary btn-sm" onClick={() => void saveEdit()} disabled={editBusy || !editing.text.trim()}>{editBusy ? tr('chats.salvando') : tr('chats.salvarEdicao')}</button>
                      </div>
                    </div>
                  ) : (
                    m.text
                  )}
                  {m.attachments.map((a, i) => (
                    <div className="chats-attach" key={i}>
                      {a.url && a.type === 'image' ? (
                        <a href={authedUrl(a.url)} target="_blank" rel="noreferrer"><img src={authedUrl(a.url)} alt={a.fileName ?? tr('chats.imagem')} loading="lazy" /></a>
                      ) : a.url ? (
                        <a href={authedUrl(a.url)} target="_blank" rel="noreferrer">📎 {a.fileName ?? a.type}</a>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>{tr('chats.indisponivel', { p0: a.fileName ?? a.type })}</span>
                      )}
                    </div>
                  ))}
                  {m.reactions.length > 0 && (
                    <div className="chats-reactions">{m.reactions.map((r) => <span key={r.emoji}>{r.emoji}{r.count > 1 ? ` ${r.count}` : ''}</span>)}</div>
                  )}
                  <div className="chats-bubble-meta">
                    {m.mentionsMe && <span title={m.mentionEstimated ? tr('chats.estimativaTextoCitaSeuNome') : tr('chats.mencionaVoce')}>{m.mentionEstimated ? '~@' : '@'} {tr('chats.voce2')}</span>}
                    {m.edited && <span>{tr('chats.editada')}</span>}
                    <span>{new Date(m.timestamp).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {!picking && !m.deleted && editing?.id !== m.id && (
                    <div className="chats-msg-menu">
                      {status?.capabilities.replyTo && <button title={tr('chats.responderAEsta')} onClick={() => setReplyTo(m)}>↩</button>}
                      <button title={tr('chats.selecionar3')} onClick={() => (setPicking(true), setPicked([m.id]))}>☑</button>
                      <button title={tr('chats.criarTarefa2')} onClick={() => setTodoFor(m)}>{tr('chats.tarefa')}</button>
                      {m.isMine && !m.pending && canEdit && m.text && m.attachments.length === 0 && (
                        <button title={tr('chats.editarMensagem')} onClick={() => (setEditErr(null), setEditing({ id: m.id, text: m.text }))}>{tr('chats.editar2')}</button>
                      )}
                      {m.isMine && !m.pending && canDelete && <button title={tr('chats.apagarMensagem2')} onClick={() => setDeleting(m)}>{tr('chats.apagar')}</button>}
                    </div>
                  )}
                </div>
              </div>
            </React.Fragment>
          )
        })}
      </div>

      {(picking || picked.length > 0) && (
        <div className="chats-selbar">
          <b>{tr('chats.nSelecionadas', { count: picked.length })}</b>
          <button className="btn btn-primary btn-sm" disabled={!picked.length} onClick={() => setAi('suggest')}>{tr('chats.gerarSugestoes')}</button>
          <button className="btn btn-secondary btn-sm" disabled={!picked.length} onClick={() => setAi('summary')}>{tr('chats.resumir2')}</button>
          <button className="btn btn-secondary btn-sm" disabled={picked.length !== 1} onClick={() => setTodoFor(pickedMsgs[0] ?? null)}>{tr('chats.tarefa2')}</button>
          <span style={{ flex: 1 }} />
          <button className="chats-linkbtn" onClick={pickSinceMyLast}>{tr('chats.desdeMinhaUltimaResposta')}</button>
          <button className="chats-linkbtn" onClick={() => setPicked(items.slice(-5).map((m) => m.id))}>{tr('chats.ultimas5')}</button>
          <button className="chats-linkbtn" onClick={() => setPicked([])}>{tr('chats.limpar2')}</button>
          <button className="chats-x" onClick={() => (setPicking(false), setPicked([]), setAi(null))} title={tr('chats.fecharSelecaoEsc')} aria-label={tr('chats.fecharSelecao')}>✕</button>
        </div>
      )}

      {ai && (
        <AiPanel
          chat={chat}
          mode={ai}
          messages={pickedMsgs}
          canSend={canSend}
          onClose={() => setAi(null)}
          onUse={(t) => setText(t)}
          onSend={(t, msgId) => send(t, msgId ? byId.get(msgId) ?? null : null)}
        />
      )}

      <div
        className={`chats-composer${dragOver ? ' drop' : ''}`}
        onDragOver={(e) => {
          if (!canImage || !Array.from(e.dataTransfer.types).includes('Files')) return
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          setDragOver(false)
          if (!canImage) return
          const f = imageFrom(e.dataTransfer)
          if (f) {
            e.preventDefault()
            void attach(f)
          }
        }}
      >
        {image && (
          <div className="chats-outimg">
            <img src={image.url} alt={tr('chats.imagemParaEnviar')} />
            <div className="chats-outimg-info">
              <b>{image.fileName}</b>
              <span>{kb(image.size)} · {text.trim() ? tr('chats.oTextoVaiComoLegenda') : tr('chats.semLegenda')} {tr('chats.soSaiQuandoVoceClicar')}</span>
            </div>
            <button className="chats-x" onClick={() => setImage(null)} title={tr('chats.removerImagem')} aria-label={tr('chats.removerImagem')}>✕</button>
          </div>
        )}
        {replyTo && (
          <div className="chats-replying">
            {tr('chats.respondendoA')} {replyTo.isMine ? tr('chats.voce2') : replyTo.senderName}: <i>{replyTo.text.slice(0, 60)}</i>
            <button className="chats-linkbtn" onClick={() => setReplyTo(null)}>✕</button>
          </div>
        )}
        {sendErr && <div className="chats-msg err" style={{ marginTop: 0 }}>{sendErr}</div>}
        <div className="chats-composer-row">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              if (!canImage) return
              const f = imageFrom(e.clipboardData)
              if (f) {
                e.preventDefault()
                void attach(f)
              }
            }}
            placeholder={canSend ? (image ? tr('chats.legendaOpcionalCtrlEnterEnvia') : tr('chats.escrevaUmaRespostaCtrlEnter', { p0: canImage ? '; cole uma imagem com Ctrl/⌘+V' : '' })) : tr('chats.envioIndisponivelAgoraProvedorOffline')}
            rows={2}
            disabled={!canSend}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void sendComposer()
              }
            }}
          />
          <button className="btn btn-primary" disabled={!canSend || (!text.trim() && !image) || sending} onClick={() => void sendComposer()}>{sending ? '…' : tr('chats.enviar2')}</button>
        </div>
        <div className="chats-composer-tools">
          <Popover label={tr('chats.respostasRapidas')} className="btn btn-secondary btn-sm" align="left" up>
            {(close) => (
              <TemplatesList
                templates={templates}
                onLoad={() => void window.api.chats.templates().then(setTemplates)}
                onPick={(t) => {
                  setText((cur) => (cur ? `${cur}\n${t.body}` : t.body))
                  close()
                }}
              />
            )}
          </Popover>
          <button className="btn btn-secondary btn-sm" onClick={pickSinceMyLast} title={tr('chats.selecionaAsMensagensRecebidasDesde')}>{tr('chats.sugerirResposta')}</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setTodoFor(null)}>{tr('chats.tarefa2')}</button>
          {canImage && (
            <button className="btn btn-secondary btn-sm" onClick={() => void pickFile(IMAGE_TYPES.join(',')).then(attach)} title={tr('chats.escolherImagemOuColeCom')}>{tr('chats.imagem2')}</button>
          )}
        </div>
      </div>

      {deleting && (
        <DeleteModal
          chat={chat}
          message={deleting}
          onClose={() => setDeleting(null)}
          onDone={() => {
            setDeleting(null)
            void load()
            void refreshActive()
          }}
        />
      )}
      {todoFor !== undefined && <TodoModal chat={chat} message={todoFor} onClose={() => setTodoFor(undefined)} />}
    </>
  )
}

function TemplatesList({ templates, onLoad, onPick }: { templates: ChatTemplate[]; onLoad: () => void; onPick: (t: ChatTemplate) => void }): React.ReactElement {
  useEffect(onLoad, [])
  return (
    <>
      {templates.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 6 }}>{tr('chats.crieModelosEmConfiguracoesMensagens')}</div>}
      {templates.map((t) => (
        <button key={t.id} className="opt" onClick={() => onPick(t)} title={t.body}>{t.title}</button>
      ))}
    </>
  )
}
