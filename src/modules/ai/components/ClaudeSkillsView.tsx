import React, { useEffect, useMemo, useState } from 'react'
import type { ClaudeSkillInfo } from '../../../../shared/aiConversations'
import { useUIStore } from '../../../store/uiStore'
import { renderMarkdown } from '../../estudos/markdown'
import { useSkillStore } from '../store/skillStore'
import { DRAFT_KEY } from '../pages/PromptRunnerPage'
import { t } from '../../../i18n'

/** Corpo do arquivo sem o frontmatter (para copiar como skill do rickOS / pré-visualizar). */
function stripFrontmatter(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

function shortPath(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, '~')
}

function SkillFileModal({ skill, onClose, onSaved }: { skill: ClaudeSkillInfo; onClose: () => void; onSaved: () => void }): React.ReactElement {
  const [content, setContent] = useState<string | null>(null)
  const [original, setOriginal] = useState('')
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api.claudeSkills
      .read(skill.id)
      .then((r) => {
        setContent(r.content)
        setOriginal(r.content)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [skill.id])

  async function save(): Promise<void> {
    if (content == null) return
    setBusy(true)
    try {
      await window.api.claudeSkills.save(skill.id, content)
      setOriginal(content)
      setMode('view')
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const dirty = content != null && content !== original
  return (
    <div className="modal-overlay" onClick={() => (!dirty || window.confirm(t('ai.descartarAsAlteracoes'))) && onClose()}>
      <div className="modal cc-skill-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cc-skill-modal-head">
          <h2 style={{ margin: 0 }}>/{skill.name}</h2>
          <span className="cat-chip">{skill.kind === 'skill' ? t('ai.skill') : t('ai.comando')}</span>
          <span className="project-chip">{skill.source}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button className={`btn btn-sm ${mode === 'view' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode('view')}>
              {t('ai.ver')}
            </button>
            <button className={`btn btn-sm ${mode === 'edit' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode('edit')}>
              {t('ai.editar')}
            </button>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '4px 0 10px', wordBreak: 'break-all' }}>{shortPath(skill.path)}</div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
        {content == null && !error && <div className="empty-hint">{t('ai.carregando')}</div>}
        {content != null && mode === 'view' && <div className="cc-skill-preview">{renderMarkdown(stripFrontmatter(content))}</div>}
        {content != null && mode === 'edit' && (
          <textarea className="cc-skill-editor" value={content} onChange={(e) => setContent(e.target.value)} spellCheck={false} />
        )}
        <div className="modal-actions">
          {mode === 'edit' && (
            <button className="btn btn-primary btn-sm" disabled={!dirty || busy} onClick={save} title={t('ai.gravaOArquivoNoDisco')}>
              {busy ? t('ai.salvando') : t('ai.salvarArquivo')}
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => (!dirty || window.confirm(t('ai.descartarAsAlteracoes'))) && onClose()}>
            {t('ai.fechar')}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Skills e comandos do Claude Code criados por você: de usuário (cada conta: ~/.claude,
 * ~/.claude-trabalho…) e de cada projeto (`.claude/skills` do repositório).
 */
export function ClaudeSkillsView({ search }: { search: string }): React.ReactElement {
  const { setPage } = useUIStore()
  const { create } = useSkillStore()
  const [items, setItems] = useState<ClaudeSkillInfo[] | null>(null)
  const [error, setError] = useState('')
  const [source, setSource] = useState('all')
  const [open, setOpen] = useState<ClaudeSkillInfo | null>(null)
  const [toast, setToast] = useState('')

  const load = (fresh = false): void => {
    window.api.claudeSkills
      .list(fresh)
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }
  useEffect(() => load(), [])

  const sources = useMemo(() => Array.from(new Set((items ?? []).map((s) => (s.scope === 'project' ? `📁 ${s.source}` : `👤 ${s.source}`)))), [items])
  const label = (s: ClaudeSkillInfo): string => (s.scope === 'project' ? `📁 ${s.source}` : `👤 ${s.source}`)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (items ?? []).filter(
      (s) => (source === 'all' || label(s) === source) && (!q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
    )
  }, [items, source, search])

  const groups = useMemo(() => {
    const m = new Map<string, ClaudeSkillInfo[]>()
    for (const s of filtered) m.set(label(s), [...(m.get(label(s)) ?? []), s])
    return [...m.entries()]
  }, [filtered])

  function flash(m: string): void {
    setToast(m)
    setTimeout(() => setToast(''), 1800)
  }

  function openInRunner(s: ClaudeSkillInfo): void {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ agentId: null, skillIds: [], userPrompt: `/${s.name} `, projectId: s.projectId }))
    } catch {
      // armazenamento indisponível
    }
    setPage('ai-runner')
  }

  async function copyToRickos(s: ClaudeSkillInfo): Promise<void> {
    const r = await window.api.claudeSkills.read(s.id)
    await create(s.name, s.description || null, 'Claude Code', [s.source], stripFrontmatter(r.content).trim())
    flash(t('ai.copiadaParaAsSkillsDo', { name: s.name }))
  }

  return (
    <div>
      <div className="todo-toolbar" style={{ marginBottom: 12 }}>
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="all">{t('ai.todasAsOrigens')}</option>
          {sources.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={() => load(true)} title={t('ai.lerAsPastasDeNovo')}>
          {t('ai.recarregar')}
        </button>
        {toast && <span className="badge-hot" style={{ background: 'var(--accent-dim)', color: 'var(--accent-hover)' }}>{toast}</span>}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
        {t('ai.lidasDe')} <code className="md-code">~/.claude*/skills</code>, <code className="md-code">~/.claude*/commands</code> {t('ai.eDaPasta')} <code className="md-code">.claude/</code> {t('ai.deCadaProjetoComCaminho')} <code className="md-code">/nome</code>.
      </p>
      {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
      {!items && !error && <div className="empty-hint">{t('ai.lendoSkills')}</div>}
      {items && filtered.length === 0 && <div className="empty-hint">{t('ai.nenhumaSkillDoClaudeCode')}</div>}
      {groups.map(([g, list]) => (
        <div key={g} style={{ marginBottom: 18 }}>
          <h3 className="cc-skill-group">
            {g} <span>{list.length}</span>
          </h3>
          <div className="cards-grid">
            {list.map((s) => (
              <div key={s.id} className="stat-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span className="stat-card-value" style={{ fontSize: 15 }}>
                    /{s.name}
                  </span>
                  {s.argumentHint && <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{s.argumentHint}</span>}
                  <span className="cat-chip" style={{ marginLeft: 'auto' }}>
                    {s.kind === 'skill' ? t('ai.skill') : t('ai.comando')}
                  </span>
                </div>
                {s.description && <div className="stat-card-sub cc-skill-desc">{s.description}</div>}
                <div className="stat-card-sub" style={{ marginTop: 6 }}>
                  {s.updatedAt.slice(0, 10)}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => openInRunner(s)} title={t('ai.abreUmaConversaNovaCom')}>
                    {t('ai.usar')}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setOpen(s)}>
                    {t('ai.verEditar')}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => copyToRickos(s)} title={t('ai.criaUmaSkillDoRickos')}>
                    {t('ai.copiarPRickos')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {open && <SkillFileModal skill={open} onClose={() => setOpen(null)} onSaved={() => load(true)} />}
    </div>
  )
}
