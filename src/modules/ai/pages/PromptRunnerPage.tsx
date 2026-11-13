import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AiConversation, AiConversationPatch, AiImageInput, AiPromptResponse, ConvEffort, ConvPermissionMode, SlashCommandInfo } from '../../../../shared/aiConversations'
import { DEFAULT_CONTEXT_WINDOW, MAX_IMAGES_PER_MESSAGE, PERMISSION_MODE_LABELS } from '../../../../shared/aiConversations'
import { useSkillStore, parseTags } from '../store/skillStore'
import { useAgentStore } from '../store/agentStore'
import { useProjectStore } from '../../projects/store/projectStore'
import { isUnseen, useConvStore } from '../store/convStore'
import { timeAgo } from '../../../utils/dates'
import { ContextMeter, fmtCost, fmtTokens, TurnView } from '../components/runner/TurnView'
import { TerminalSessionsModal } from '../components/runner/TerminalSessionsModal'
import { ChangesPanel } from '../components/runner/ChangesPanel'
import { imageFiles, prepareImage } from '../images'
import '../runner.css'

/**
 * Prompt Runner: conversas com o Claude Code CLI local. Cada conversa é uma sessão do
 * CLI (continuada com --resume), com histórico salvo, tokens/contexto, fila de mensagens
 * e aprovação de permissões / respostas às perguntas do Claude pela interface.
 */

// Hand-off de outras telas (Histórico "reabrir", Projetos): abre uma conversa nova com o
// prompt preenchido.
export const DRAFT_KEY = 'rickos:promptRunnerDraft'
const LEGACY_TABS_KEY = 'rickos:promptRunnerTabs'
const COMPOSER_KEY = (id: string | null): string => `rickos:runnerComposer:${id ?? 'new'}`
const PROJECT_FILTER_KEY = 'rickos:runnerProjectFilter'
/** Texto que abre o autocompletar: um único token começando com "/". */
const SLASH_RE = /^\/([\w:.-]*)$/

const MODES: ConvPermissionMode[] = ['default', 'acceptEdits', 'plan', 'bypassPermissions']
const MODE_HINT: Record<ConvPermissionMode, string> = {
  default: 'Pergunta antes de rodar comandos ou editar arquivos (fora das ferramentas liberadas).',
  acceptEdits: 'Edita arquivos sozinho; pergunta antes de comandos.',
  plan: 'Só lê e planeja; você aprova o plano antes de qualquer mudança.',
  bypassPermissions: 'Roda tudo sem perguntar (perguntas do Claude ainda aparecem).'
}
const EFFORTS: { v: ConvEffort; label: string }[] = [
  { v: '', label: 'Padrão' },
  { v: 'low', label: 'Baixo' },
  { v: 'medium', label: 'Médio' },
  { v: 'high', label: 'Alto' },
  { v: 'xhigh', label: 'Muito alto' },
  { v: 'max', label: 'Máximo' }
]

interface DraftSettings {
  projectId: number | null
  agentId: string | null
  skillIds: string[]
  model: string
  effort: ConvEffort
  permissionMode: ConvPermissionMode
  useWorktree: boolean
}

const EMPTY_DRAFT: DraftSettings = { projectId: null, agentId: null, skillIds: [], model: '', effort: '', permissionMode: 'default', useWorktree: false }

function readStorage(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}
function writeStorage(key: string, v: string): void {
  try {
    if (v) localStorage.setItem(key, v)
    else localStorage.removeItem(key)
  } catch {
    // armazenamento indisponível
  }
}

const isTouch = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches

export function PromptRunnerPage(): React.ReactElement {
  const { skills, refresh: refreshSkills } = useSkillStore()
  const { agents, refresh: refreshAgents } = useAgentStore()
  const { projects, refresh: refreshProjects } = useProjectStore()
  const store = useConvStore()
  const { conversations, archived, showArchived, selectedId, turns } = store

  const [draft, setDraft] = useState<DraftSettings>(EMPTY_DRAFT)
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [pane, setPane] = useState<'list' | 'chat'>('list')
  const [showTerminal, setShowTerminal] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [skillSearch, setSkillSearch] = useState('')
  const [editingTitle, setEditingTitle] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [sending, setSending] = useState(false)
  const [images, setImages] = useState<AiImageInput[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [showChanges, setShowChanges] = useState(false)
  const [changeCount, setChangeCount] = useState<number | null>(null)
  // filtro da lista: 'all' | 'none' (sem projeto) | id do projeto
  const [projectFilter, setProjectFilter] = useState<string>(() => readStorage(PROJECT_FILTER_KEY) || 'all')
  // autocompletar de "/" (skills e comandos do Claude Code)
  const [slashList, setSlashList] = useState<{ key: string; items: SlashCommandInfo[] } | null>(null)
  const [slashIdx, setSlashIdx] = useState(0)
  const [slashDismissed, setSlashDismissed] = useState(false)

  const messagesRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const stickBottom = useRef(true)

  const conv: AiConversation | null = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? archived.find((c) => c.id === selectedId) ?? null,
    [conversations, archived, selectedId]
  )
  const convTurns = selectedId ? turns[selectedId] ?? [] : []
  // configurações efetivas (conversa aberta ou rascunho de uma nova)
  const settings: DraftSettings = conv
    ? {
        projectId: conv.projectId,
        agentId: conv.agentId,
        skillIds: conv.skillIds,
        model: conv.model,
        effort: conv.effort,
        permissionMode: conv.permissionMode,
        useWorktree: conv.useWorktree
      }
    : draft

  function flash(m: string): void {
    setToast(m)
    setTimeout(() => setToast(''), 2000)
  }

  // ── carga inicial + escuta ao vivo ──
  useEffect(() => {
    refreshSkills()
    refreshAgents()
    refreshProjects()
    store.listen()
    store.setViewing(true)
    store.refresh().then(() => {
      const st = useConvStore.getState()
      if (st.selectedId) st.loadTurns(st.selectedId)
    })

    // hand-off de outras telas → conversa nova com o prompt preenchido
    let handoff: { agentId?: string | null; skillIds?: string[]; userPrompt?: string; projectId?: number | null } | null = null
    try {
      handoff = JSON.parse(readStorage(DRAFT_KEY) || 'null')
      if (!handoff) {
        // abas antigas do runner: aproveita o primeiro prompt não enviado
        const legacy = JSON.parse(readStorage(LEGACY_TABS_KEY) || '[]') as Array<{ userPrompt?: string; projectId?: number | null; agentId?: string | null; skillIds?: string[] }>
        const t = Array.isArray(legacy) ? legacy.find((x) => x.userPrompt?.trim()) : undefined
        if (t) handoff = t
      }
    } catch {
      handoff = null
    }
    writeStorage(DRAFT_KEY, '')
    writeStorage(LEGACY_TABS_KEY, '')
    if (handoff) {
      setDraft({
        ...EMPTY_DRAFT,
        projectId: typeof handoff.projectId === 'number' ? handoff.projectId : null,
        agentId: handoff.agentId ?? null,
        skillIds: Array.isArray(handoff.skillIds) ? handoff.skillIds : []
      })
      useConvStore.getState().select(null)
      setText(handoff.userPrompt ?? '')
      setPane('chat')
    }
    return () => store.setViewing(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // rascunho do composer por conversa
  useEffect(() => {
    setText((cur) => (selectedId === null && cur ? cur : readStorage(COMPOSER_KEY(selectedId))))
    stickBottom.current = true
    setMenuOpen(false)
    setSkillsOpen(false)
    setImages([])
    setChangeCount(null)
  }, [selectedId])

  // nº de arquivos alterados (badge), atualizado ao abrir e ao fim de cada turno
  const convCwd = conv?.cwd ?? null
  const convRunning = !!conv?.running
  useEffect(() => {
    if (!selectedId || !convCwd || convRunning) return
    let alive = true
    window.api.conv
      .changes(selectedId)
      .then((c) => alive && setChangeCount(c.isRepo ? c.files.length : null))
      .catch(() => alive && setChangeCount(null))
    return () => {
      alive = false
    }
  }, [selectedId, convCwd, convRunning])
  useEffect(() => {
    writeStorage(COMPOSER_KEY(selectedId), text)
  }, [text, selectedId])

  // rola para o fim enquanto o usuário estiver no fim
  useLayoutEffect(() => {
    const el = messagesRef.current
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight
  }, [convTurns])

  // altura automática do textarea
  useLayoutEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 260) + 'px'
  }, [text])

  const projectName = useCallback((id: number | null) => (id == null ? null : projects.find((p) => p.id === id)?.name ?? null), [projects])
  const agentName = (id: string | null): string | null => (id ? agents.find((a) => a.id === id)?.name ?? null : null)

  async function patch(p: AiConversationPatch): Promise<void> {
    if (conv) await store.update(conv.id, p)
    else setDraft((d) => ({ ...d, ...(p as Partial<DraftSettings>) }))
  }

  function applyAgent(agentId: string | null): void {
    const a = agents.find((x) => x.id === agentId)
    patch({ agentId, ...(a ? { skillIds: parseTags(a.defaultSkillIds) } : {}) })
  }

  function newConversation(): void {
    store.select(null)
    setDraft(conv ? { ...EMPTY_DRAFT, projectId: conv.projectId, model: conv.model, effort: conv.effort } : EMPTY_DRAFT)
    setText(readStorage(COMPOSER_KEY(null)))
    setPane('chat')
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  function open(id: string): void {
    store.select(id)
    setPane('chat')
  }

  async function send(raw?: string): Promise<void> {
    const msg = (raw ?? text).trim()
    const imgs = raw === undefined ? images : []
    if ((!msg && !imgs.length) || sending) return
    setSending(true)
    try {
      let id = conv?.id
      if (!id) {
        const c = await store.create({ ...draft, useWorktree: draft.useWorktree && draft.projectId != null })
        id = c.id
        await store.select(id)
        writeStorage(COMPOSER_KEY(null), '')
      }
      if (raw === undefined) {
        setText('')
        setImages([])
      }
      stickBottom.current = true
      await store.send(id, msg, imgs)
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  const respond = useCallback(
    async (requestId: string, r: AiPromptResponse) => {
      if (!selectedId) return
      await store.respond(selectedId, requestId, r)
      if (r.kind === 'chat') setTimeout(() => textareaRef.current?.focus(), 50)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId]
  )

  function cycleMode(): void {
    const i = MODES.indexOf(settings.permissionMode)
    patch({ permissionMode: MODES[(i + 1) % MODES.length] })
  }

  function applySlash(c: SlashCommandInfo): void {
    setText(`/${c.name} `)
    setSlashDismissed(true)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (slashOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const n = slashMatches.length
        setSlashIdx((i) => (e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n))
        return
      }
      if ((e.key === 'Enter' && !e.shiftKey) || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault()
        applySlash(slashMatches[Math.min(slashIdx, slashMatches.length - 1)])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSlashDismissed(true)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isTouch()) {
      e.preventDefault()
      send()
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      cycleMode()
    } else if (e.key === 'Escape' && conv?.running) {
      e.preventDefault()
      store.cancel(conv.id)
    }
  }

  async function copyTerminalCommand(): Promise<void> {
    if (!conv) return
    setMenuOpen(false)
    const cmd = await window.api.conv.terminalCommand(conv.id)
    if (!cmd) return flash('A conversa ainda não tem sessão.')
    try {
      await navigator.clipboard.writeText(cmd)
      flash('Comando copiado: cole no terminal ✓')
    } catch {
      window.prompt('Copie o comando:', cmd)
    }
  }

  async function resync(): Promise<void> {
    if (!conv) return
    setMenuOpen(false)
    try {
      const r = await window.api.conv.resync(conv.id)
      if (r.updated) {
        await store.loadTurns(conv.id)
        flash('Atualizado com o terminal ✓')
      } else flash('Nada novo no terminal.')
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e))
    }
  }

  async function remove(): Promise<void> {
    if (!conv) return
    setMenuOpen(false)
    const msg = conv.running ? 'A conversa está executando. Excluir vai interromper. Continuar?' : 'Excluir esta conversa do rickOS? (A sessão do CLI continua no disco.)'
    if (!window.confirm(msg)) return
    const dropWt =
      conv.useWorktree && !!conv.worktreeBranch && window.confirm(`Apagar também o worktree e a branch ${conv.worktreeBranch}? (Cancelar mantém a pasta e a branch.)`)
    await store.remove(conv.id, dropWt)
    setPane('list')
  }

  async function fork(): Promise<void> {
    if (!conv) return
    setMenuOpen(false)
    try {
      const f = await window.api.conv.fork(conv.id)
      await store.refresh()
      await store.select(f.id)
      flash('Conversa ramificada ✓')
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e))
    }
  }

  async function dropWorktree(): Promise<void> {
    if (!conv?.worktreeBranch) return
    setMenuOpen(false)
    if (!window.confirm(`Apagar o worktree e a branch ${conv.worktreeBranch}? Mudanças não mescladas serão perdidas. A conversa vai para Arquivadas.`)) return
    try {
      await window.api.conv.removeWorktree(conv.id)
      setShowChanges(false)
      flash('Worktree removido ✓')
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e))
    }
  }

  async function addImages(files: File[]): Promise<void> {
    if (!files.length) return
    const room = MAX_IMAGES_PER_MESSAGE - images.length
    if (room <= 0) return flash(`Máximo de ${MAX_IMAGES_PER_MESSAGE} imagens por mensagem.`)
    try {
      const prepared = await Promise.all(files.slice(0, room).map(prepareImage))
      setImages((cur) => [...cur, ...prepared].slice(0, MAX_IMAGES_PER_MESSAGE))
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e))
    }
  }

  function pickImages(): void {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/gif,image/webp'
    input.multiple = true
    input.onchange = () => addImages(imageFiles(input.files))
    input.click()
  }

  function scrollToPending(): void {
    const el = messagesRef.current?.querySelector('.cv-tool.pending, .cv-card.pending')
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const list = showArchived ? archived : conversations
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return list.filter(
      (c) =>
        (projectFilter === 'all' || (projectFilter === 'none' ? c.projectId == null : String(c.projectId) === projectFilter)) &&
        (!q || `${c.title} ${projectName(c.projectId) ?? ''}`.toLowerCase().includes(q))
    )
  }, [list, search, projectName, projectFilter])
  // projetos que aparecem no filtro: os que têm conversa (+ o filtrado, se sumiu)
  const filterProjects = useMemo(() => {
    const ids = new Set([...conversations, ...archived].map((c) => c.projectId).filter((x): x is number => x != null))
    if (/^\d+$/.test(projectFilter)) ids.add(Number(projectFilter))
    return projects.filter((p) => ids.has(p.id)).sort((a, b) => a.name.localeCompare(b.name))
  }, [conversations, archived, projects, projectFilter])
  const hasNoProject = conversations.some((c) => c.projectId == null)

  // ── autocompletar de "/" ──
  const slashKey = `${selectedId ?? 'new'}|${settings.projectId ?? ''}`
  const slashQuery = SLASH_RE.exec(text)?.[1]
  const wantSlash = slashQuery !== undefined && !slashDismissed
  useEffect(() => {
    setSlashDismissed(false)
    setSlashIdx(0)
  }, [slashQuery])
  useEffect(() => {
    if (!wantSlash || slashList?.key === slashKey) return
    let alive = true
    window.api.conv
      .slashCommands(selectedId, settings.projectId)
      .then((items) => alive && setSlashList({ key: slashKey, items }))
      .catch(() => alive && setSlashList({ key: slashKey, items: [] }))
    return () => {
      alive = false
    }
  }, [wantSlash, slashKey, slashList?.key, selectedId, settings.projectId])
  const slashMatches = useMemo(() => {
    if (!wantSlash || !slashList || slashList.key !== slashKey) return []
    const q = (slashQuery ?? '').toLowerCase()
    const starts = slashList.items.filter((c) => c.name.toLowerCase().startsWith(q))
    const contains = slashList.items.filter((c) => !c.name.toLowerCase().startsWith(q) && (c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)))
    return [...starts, ...contains].slice(0, 30)
  }, [wantSlash, slashList, slashKey, slashQuery])
  const slashOpen = slashMatches.length > 0

  const activeAgent = agents.find((a) => a.id === settings.agentId) ?? null
  const agentSkillIds = activeAgent ? parseTags(activeAgent.defaultSkillIds) : []
  const pickerSkills = skills.filter((s) => {
    const q = skillSearch.trim().toLowerCase()
    return !q || s.name.toLowerCase().includes(q) || parseTags(s.tags).some((t) => t.includes(q))
  })
  const sortedPicker = [...pickerSkills].sort((a, b) => Number(agentSkillIds.includes(b.id)) - Number(agentSkillIds.includes(a.id)))
  const contextWindow = conv?.contextWindow || DEFAULT_CONTEXT_WINDOW
  const projectLocked = !!conv?.sessionId

  return (
    <div className="cv-page" data-pane={pane}>
      <div className={`cv-body ${conv && showChanges && conv.cwd ? 'with-changes' : ''}`}>
        {/* ── Lista de conversas ── */}
        <aside className="cv-side">
          <div className="cv-side-head">
            <h2>▶️ Prompt Runner</h2>
            <div className="cv-side-actions">
              <button className="btn btn-primary btn-sm" onClick={newConversation}>
                ＋ Nova
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowTerminal(true)} title="Continuar uma sessão do Claude Code do terminal">
                ⌨️ Terminal
              </button>
            </div>
          </div>
          <div className="cv-filters">
            <input type="text" className="cv-search" placeholder="🔍 Buscar conversas…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select
              className={`cv-project-filter ${projectFilter !== 'all' ? 'cv-on' : ''}`}
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value)
                writeStorage(PROJECT_FILTER_KEY, e.target.value === 'all' ? '' : e.target.value)
              }}
              title="Filtrar por projeto"
            >
              <option value="all">📁 Todos os projetos</option>
              {hasNoProject && <option value="none">Sem projeto</option>}
              {filterProjects.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="cv-list">
            {filtered.length === 0 && (
              <div className="empty-hint" style={{ fontSize: 12, padding: 16 }}>
                {showArchived ? 'Nenhuma conversa arquivada.' : store.loaded ? 'Nenhuma conversa ainda. Comece uma nova ou continue uma do terminal.' : 'Carregando…'}
              </div>
            )}
            {filtered.map((c) => {
              const ctxPct = c.contextTokens && (c.contextWindow || DEFAULT_CONTEXT_WINDOW) ? Math.round((c.contextTokens / (c.contextWindow || DEFAULT_CONTEXT_WINDOW)) * 100) : 0
              const fresh = c.id !== selectedId && isUnseen(c)
              return (
                <button
                  key={c.id}
                  className={`cv-item ${c.id === selectedId ? 'active' : ''} ${fresh ? 'unseen' : ''} ${c.pendingPrompts ? 'attn' : ''}`}
                  onClick={() => open(c.id)}
                >
                  <div className="cv-item-title">
                    {c.running && <span className="active-task-dot" style={{ width: 7, height: 7, flexShrink: 0 }} />}
                    {fresh && <span className="cv-unseen-dot" />}
                    {c.pinned && <span title="Fixada">📌</span>}
                    <span className="cv-item-name">{c.title || 'Nova conversa'}</span>
                    {!!c.pendingPrompts && <span className="cv-badge-attn" title="Esperando sua resposta">🤚 {c.pendingPrompts}</span>}
                    {fresh && !c.pendingPrompts && <span className="cv-badge-new">nova resposta</span>}
                  </div>
                  <div className="cv-item-meta">
                    {c.origin === 'terminal' && <span title="Veio do terminal">⌨️</span>}
                    {projectName(c.projectId) && <span>{projectName(c.projectId)}</span>}
                    <span>{timeAgo(c.updatedAt)}</span>
                    {ctxPct > 0 && <span className={ctxPct >= 85 ? 'cv-hot' : ''}>{ctxPct}% ctx</span>}
                    {!!c.queued?.length && <span>+{c.queued.length} na fila</span>}
                  </div>
                </button>
              )
            })}
          </div>
          <button className="cv-side-foot" onClick={() => store.setShowArchived(!showArchived)}>
            {showArchived ? '← Voltar às conversas' : '🗄️ Arquivadas'}
          </button>
        </aside>

        {/* ── Conversa ── */}
        <main className="cv-main">
          <div className="cv-head">
            <button className="btn btn-secondary btn-sm cv-back" onClick={() => setPane('list')}>
              ←
            </button>
            <div className="cv-head-title">
              {conv && editingTitle !== null ? (
                <input
                  autoFocus
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={() => {
                    store.update(conv.id, { title: editingTitle })
                    setEditingTitle(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setEditingTitle(null)
                  }}
                />
              ) : (
                <h3 onDoubleClick={() => conv && setEditingTitle(conv.title)} title={conv ? 'Duplo clique para renomear' : undefined}>
                  {conv ? conv.title || 'Nova conversa' : 'Nova conversa'}
                </h3>
              )}
            </div>
            {toast && <span className="cv-toast">{toast}</span>}
            {conv?.worktreeBranch && (
              <span className="cv-chip cv-wt-chip" title={`Worktree isolado: ${conv.cwd ?? ''}`}>
                🌿 {conv.worktreeBranch.replace(/^claude\//, '')}
              </span>
            )}
            {conv?.cwd && changeCount !== null && (
              <button className={`btn btn-secondary btn-sm ${showChanges ? 'cv-on' : ''}`} onClick={() => setShowChanges((v) => !v)} title="Arquivos alterados, diff, commit e PR">
                📝 {changeCount > 0 ? `${changeCount} mudança${changeCount > 1 ? 's' : ''}` : 'Mudanças'}
              </button>
            )}
            {conv && (
              <div className="cv-head-stats">
                <ContextMeter used={conv.contextTokens} window={contextWindow} onCompact={conv.running ? undefined : () => send('/compact')} />
                <span className="cv-cost" title={`Entrada: ${conv.totalInputTokens.toLocaleString('pt-BR')} · Saída: ${conv.totalOutputTokens.toLocaleString('pt-BR')} tokens`}>
                  {fmtCost(conv.totalCostUsd)} · {fmtTokens(conv.totalOutputTokens)} saída
                </span>
              </div>
            )}
            {conv && (
              <div className="cv-menu-wrap">
                <button className="btn btn-secondary btn-sm" onClick={() => setMenuOpen((v) => !v)} title="Mais ações">
                  ⋯
                </button>
                {menuOpen && (
                  <div className="cv-menu" onMouseLeave={() => setMenuOpen(false)}>
                    <button onClick={copyTerminalCommand} disabled={!conv.sessionId}>
                      ⌨️ Continuar no terminal (copiar comando)
                    </button>
                    <button onClick={resync} disabled={!conv.sessionId || conv.running}>
                      🔄 Atualizar com o terminal
                    </button>
                    <button onClick={fork} disabled={!conv.sessionId || conv.running} title="Nova conversa com o mesmo histórico, que segue numa sessão separada">
                      🌱 Ramificar conversa
                    </button>
                    <button onClick={() => { setEditingTitle(conv.title); setMenuOpen(false) }}>✏️ Renomear</button>
                    <button onClick={() => { store.update(conv.id, { pinned: !conv.pinned }); setMenuOpen(false) }}>{conv.pinned ? '📌 Desafixar' : '📌 Fixar'}</button>
                    <button onClick={() => { store.update(conv.id, { archived: !conv.archived }); setMenuOpen(false) }}>{conv.archived ? '📤 Desarquivar' : '🗄️ Arquivar'}</button>
                    {conv.worktreeBranch && (
                      <button className="danger" onClick={dropWorktree} disabled={conv.running}>
                        🧹 Remover worktree e branch
                      </button>
                    )}
                    <button className="danger" onClick={remove}>🗑️ Excluir</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* configurações da conversa */}
          <div className="cv-settings">
            <label title={projectLocked ? 'A sessão já roda na pasta deste projeto; para outro projeto, abra uma conversa nova.' : 'Roda o Claude dentro da pasta do projeto'}>
              📁
              <select value={settings.projectId ?? ''} disabled={projectLocked} onChange={(e) => patch({ projectId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{conv?.cwd && !conv.projectId ? `Pasta: ${conv.cwd.split('/').filter(Boolean).pop()}` : 'Sem projeto'}</option>
                {projects.filter((p) => !p.archived || p.id === settings.projectId).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {!conv?.cwd && settings.projectId != null && (
              <label title="Cria um git worktree (branch claude/rickos-…) só para esta conversa: abas em paralelo não pisam umas nas outras">
                <input type="checkbox" checked={settings.useWorktree} onChange={(e) => patch({ useWorktree: e.target.checked })} />
                🌿 Worktree isolado
              </label>
            )}
            <label title="Agente: prompt de sistema extra">
              🤖
              <select value={settings.agentId ?? ''} onChange={(e) => applyAgent(e.target.value || null)}>
                <option value="">Sem agente</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="cv-skills-wrap">
              <button className={`btn btn-secondary btn-sm ${settings.skillIds.length ? 'cv-on' : ''}`} onClick={() => setSkillsOpen((v) => !v)}>
                🧩 Skills{settings.skillIds.length ? ` (${settings.skillIds.length})` : ''}
              </button>
              {skillsOpen && (
                <div className="cv-skills-pop">
                  <input type="text" placeholder="🔍 Buscar skills…" value={skillSearch} onChange={(e) => setSkillSearch(e.target.value)} autoFocus />
                  <div className="cv-skills-actions">
                    <button className="cv-link" onClick={() => patch({ skillIds: skills.filter((s) => s.isFavorite).map((s) => s.id) })}>★ Favoritas</button>
                    <button className="cv-link" onClick={() => patch({ skillIds: [] })}>Limpar</button>
                    <button className="cv-link" style={{ marginLeft: 'auto' }} onClick={() => setSkillsOpen(false)}>Fechar</button>
                  </div>
                  <div className="cv-skills-list">
                    {sortedPicker.length === 0 && <div className="empty-hint" style={{ fontSize: 12 }}>Nenhuma skill.</div>}
                    {sortedPicker.map((s) => (
                      <label key={s.id} className="skill-check-row">
                        <input
                          type="checkbox"
                          checked={settings.skillIds.includes(s.id)}
                          onChange={() =>
                            patch({ skillIds: settings.skillIds.includes(s.id) ? settings.skillIds.filter((x) => x !== s.id) : [...settings.skillIds, s.id] })
                          }
                        />
                        <span>
                          {s.isFavorite ? '★ ' : ''}
                          {s.name}
                          {agentSkillIds.includes(s.id) ? ' · do agente' : ''}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <label title="Modelo">
              🧠
              <select value={settings.model} onChange={(e) => patch({ model: e.target.value })}>
                <option value="">Modelo padrão</option>
                <option value="opus">Opus</option>
                <option value="sonnet">Sonnet</option>
                <option value="haiku">Haiku</option>
              </select>
            </label>
            <label title="Esforço de raciocínio (--effort)">
              ⚡
              <select value={settings.effort} onChange={(e) => patch({ effort: e.target.value as ConvEffort })}>
                {EFFORTS.map((x) => (
                  <option key={x.v} value={x.v}>
                    {x.v ? `Esforço: ${x.label}` : 'Esforço padrão'}
                  </option>
                ))}
              </select>
            </label>
            {conv && (conv.agentId || conv.skillIds.length > 0) && (
              <span className="cv-settings-hint">
                {agentName(conv.agentId) ? `agente ${agentName(conv.agentId)}` : ''}
                {conv.agentId && conv.skillIds.length ? ' + ' : ''}
                {conv.skillIds.length ? `${conv.skillIds.length} skill(s)` : ''} no prompt de sistema
              </span>
            )}
          </div>

          {/* mensagens */}
          <div
            className="cv-messages"
            ref={messagesRef}
            onScroll={(e) => {
              const el = e.currentTarget
              stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
            }}
          >
            {convTurns.length === 0 && (
              <div className="cv-empty">
                <div style={{ fontSize: 30 }}>💬</div>
                <p>
                  {conv ? 'Conversa vazia.' : 'Nova conversa com o Claude Code local.'} As mensagens seguintes continuam a mesma sessão, com o contexto
                  das anteriores.
                </p>
                <ul>
                  <li><kbd>Enter</kbd> envia · <kbd>Shift</kbd>+<kbd>Enter</kbd> quebra linha</li>
                  <li><kbd>Shift</kbd>+<kbd>Tab</kbd> troca o modo de permissão · <kbd>Esc</kbd> interrompe</li>
                  <li>Mensagens enviadas durante uma execução entram na fila.</li>
                  <li>Digite <code className="md-code">/</code> para usar suas skills e comandos do Claude Code (pessoais, da conta de trabalho e do projeto).</li>
                  <li>Cole, arraste ou anexe (📎) imagens: prints de tela, erros, layouts.</li>
                </ul>
              </div>
            )}
            {convTurns.map((t, i) => (
              <TurnView key={t.id} turn={t} onRespond={respond} onRetry={i === convTurns.length - 1 && !conv?.running ? (p) => send(p) : undefined} />
            ))}
          </div>

          {/* fila + atenção */}
          {conv && !!conv.pendingPrompts && (
            <button className="cv-attn" onClick={scrollToPending}>
              🤚 Claude está esperando sua resposta — ver ↑
            </button>
          )}
          {conv && !!conv.queued?.length && (
            <div className="cv-queue">
              {conv.queued.map((q, i) => (
                <div key={i} className="cv-queue-item">
                  <span>⏳ {q}</span>
                  <button className="cv-link" onClick={() => window.api.conv.removeQueued(conv.id, i)} title="Tirar da fila">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* composer */}
          <div
            className={`cv-composer ${dragOver ? 'drag' : ''}`}
            onDragOver={(e) => {
              if (Array.from(e.dataTransfer.types).includes('Files')) {
                e.preventDefault()
                setDragOver(true)
              }
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              setDragOver(false)
              const files = imageFiles(e.dataTransfer.files)
              if (files.length) {
                e.preventDefault()
                addImages(files)
              }
            }}
          >
            {images.length > 0 && (
              <div className="cv-attach">
                {images.map((im, i) => (
                  <div key={i} className="cv-attach-item">
                    <img src={im.thumb} alt="" />
                    <button onClick={() => setImages((cur) => cur.filter((_, k) => k !== i))} title="Remover">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            {slashOpen && (
              <div className="cv-slash" role="listbox">
                {slashMatches.map((c, i) => (
                  <button
                    key={c.name}
                    role="option"
                    aria-selected={i === slashIdx}
                    className={`cv-slash-item ${i === slashIdx ? 'on' : ''}`}
                    onMouseEnter={() => setSlashIdx(i)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      applySlash(c)
                    }}
                  >
                    <span className="cv-slash-name">
                      /{c.name}
                      {c.argumentHint && <span className="cv-slash-hint"> {c.argumentHint}</span>}
                    </span>
                    <span className="cv-slash-desc">{c.description}</span>
                    <span className="cv-slash-src">{c.source}</span>
                  </button>
                ))}
              </div>
            )}
            <textarea
              onPaste={(e) => {
                const files = imageFiles(e.clipboardData?.items)
                if (files.length) {
                  e.preventDefault()
                  addImages(files)
                }
              }}
              ref={textareaRef}
              rows={1}
              value={text}
              placeholder={conv?.running ? 'Mensagem (entra na fila)…' : conv ? 'Responder…' : 'O que vamos fazer?'}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <div className="cv-composer-bar">
              <select
                className={`cv-mode cv-mode-${settings.permissionMode}`}
                value={settings.permissionMode}
                onChange={(e) => patch({ permissionMode: e.target.value as ConvPermissionMode })}
                title={`${MODE_HINT[settings.permissionMode]} (Shift+Tab alterna)`}
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    🛡️ {PERMISSION_MODE_LABELS[m]}
                  </option>
                ))}
              </select>
              <button className="btn btn-secondary btn-sm cv-clip" onClick={pickImages} title="Anexar imagens (também dá para colar ou arrastar)">
                📎
              </button>
              <span className="cv-composer-hint">{MODE_HINT[settings.permissionMode]}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                {conv?.running && (
                  <button className="btn btn-danger btn-sm" onClick={() => store.cancel(conv.id)} title="Interromper (Esc)">
                    ⏹ Parar
                  </button>
                )}
                <button className="btn btn-primary btn-sm" onClick={() => send()} disabled={(!text.trim() && !images.length) || sending}>
                  {conv?.running ? '⏳ Na fila' : '➤ Enviar'}
                </button>
              </div>
            </div>
          </div>
        </main>
        {conv && showChanges && conv.cwd && <ChangesPanel conv={conv} onClose={() => setShowChanges(false)} onCount={setChangeCount} />}
      </div>

      {showTerminal && (
        <TerminalSessionsModal
          projectName={projectName}
          onClose={() => setShowTerminal(false)}
          onOpen={async (id) => {
            setShowTerminal(false)
            await store.refresh()
            open(id)
          }}
        />
      )}
    </div>
  )
}
