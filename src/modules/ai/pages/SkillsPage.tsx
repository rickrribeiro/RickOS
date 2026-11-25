import React, { useEffect, useMemo, useState } from 'react'
import { Skill } from '../../../types'
import { useSkillStore, parseTags } from '../store/skillStore'
import { ClaudeSkillsView } from '../components/ClaudeSkillsView'
import { t as tr } from '../../../i18n'

const TAB_KEY = 'rickos:skillsTab'

interface FormState {
  name: string
  description: string
  category: string
  tags: string[]
  content: string
}
const empty: FormState = { name: '', description: '', category: '', tags: [], content: '' }

function SkillEditor({ skill, onClose }: { skill: Skill | null; onClose: () => void }): React.ReactElement {
  const { create, update } = useSkillStore()
  const [form, setForm] = useState<FormState>(
    skill
      ? { name: skill.name, description: skill.description ?? '', category: skill.category ?? '', tags: parseTags(skill.tags), content: skill.content }
      : empty
  )
  const [tagDraft, setTagDraft] = useState('')

  function addTag(): void {
    const t = tagDraft.trim()
    if (t && !form.tags.includes(t)) setForm({ ...form, tags: [...form.tags, t] })
    setTagDraft('')
  }

  async function save(): Promise<void> {
    if (!form.name.trim()) return
    const args = [form.name.trim(), form.description.trim() || null, form.category.trim() || null, form.tags, form.content] as const
    if (skill) await update(skill.id, ...args)
    else await create(...args)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 460, maxWidth: 640 }}>
        <h2>{skill ? tr('ai.editarSkill') : tr('ai.novaSkill')}</h2>
        <div className="editor-field">
          <label>{tr('ai.nome')}</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </div>
        <div className="editor-row">
          <div className="editor-field">
            <label>{tr('ai.descricao')}</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="editor-field">
            <label>{tr('ai.categoria')}</label>
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
        </div>
        <div className="editor-field">
          <label>{tr('ai.tags')}</label>
          <div className="tag-input">
            {form.tags.map((t) => (
              <span key={t} className="project-chip" onClick={() => setForm({ ...form, tags: form.tags.filter((x) => x !== t) })} style={{ cursor: 'pointer' }}>
                {t} ✕
              </span>
            ))}
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ',') && (e.preventDefault(), addTag())}
              placeholder={tr('ai.tagEnter')}
              style={{ flex: 1, minWidth: 100, border: 'none', background: 'transparent', padding: 4 }}
            />
          </div>
        </div>
        <div className="editor-field">
          <label>{tr('ai.conteudo')} <span style={{ color: 'var(--text-muted)' }}>{tr('ai.chars', { count: form.content.length })}</span></label>
          <textarea rows={10} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} style={{ resize: 'vertical' }} />
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>{tr('ai.cancelar')}</button>
          <button className="btn btn-primary btn-sm" onClick={save}>{tr('ai.salvar')}</button>
        </div>
      </div>
    </div>
  )
}

export function SkillsPage(): React.ReactElement {
  const { skills, refresh, remove, toggleFavorite, duplicate, exportOne, importOne } = useSkillStore()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [sort, setSort] = useState<'updated' | 'name'>('updated')
  const [editing, setEditing] = useState<Skill | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [tab, setTab] = useState<'rickos' | 'claude'>(() => {
    try {
      return localStorage.getItem(TAB_KEY) === 'claude' ? 'claude' : 'rickos'
    } catch {
      return 'rickos'
    }
  })
  const switchTab = (t: 'rickos' | 'claude'): void => {
    setTab(t)
    try {
      localStorage.setItem(TAB_KEY, t)
    } catch {
      // armazenamento indisponível
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const categories = useMemo(() => Array.from(new Set(skills.map((s) => s.category).filter(Boolean))) as string[], [skills])
  const allTags = useMemo(() => Array.from(new Set(skills.flatMap((s) => parseTags(s.tags)))).sort(), [skills])
  const maxUsage = useMemo(() => Math.max(0, ...skills.map((s) => s.usageCount)), [skills])

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return skills
      .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q))
      .filter((s) => categoryFilter === 'all' || s.category === categoryFilter)
      .filter((s) => tagFilter === 'all' || parseTags(s.tags).includes(tagFilter))
      .sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) return b.isFavorite - a.isFavorite
        return sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt)
      })
  }, [skills, search, categoryFilter, tagFilter, sort])

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{tr('ai.skills')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {tab === 'rickos' ? tr('ai.skillsDoRickos', { count: skills.length }) : tr('ai.skillsEComandosDoClaude')}
          </p>
        </div>
        <div className="cc-skill-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'rickos'} className={tab === 'rickos' ? 'active' : ''} onClick={() => switchTab('rickos')}>
            {tr('ai.rickos')}
          </button>
          <button role="tab" aria-selected={tab === 'claude'} className={tab === 'claude' ? 'active' : ''} onClick={() => switchTab('claude')}>
            {tr('ai.claudeCode')}
          </button>
        </div>
        <div style={{ display: tab === 'rickos' ? 'flex' : 'none', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={importOne}>{tr('ai.importar')}</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setShowForm(true) }}>{tr('ai.novaSkill2')}</button>
        </div>
      </div>

      {tab === 'claude' && (
        <>
          <div className="todo-toolbar">
            <input type="text" placeholder={tr('ai.buscar')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
          </div>
          <ClaudeSkillsView search={search} />
        </>
      )}

      {tab === 'rickos' && (
      <>
      <div className="todo-toolbar">
        <input type="text" placeholder={tr('ai.buscar')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="all">{tr('ai.todasCategorias')}</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
          <option value="all">{tr('ai.todasTags')}</option>
          {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as 'updated' | 'name')}>
          <option value="updated">{tr('ai.recentes')}</option>
          <option value="name">{tr('ai.nome')}</option>
        </select>
      </div>

      <div className="cards-grid">
        {list.length === 0 && <div className="empty-hint">{tr('ai.nenhumaSkill')}</div>}
        {list.map((s) => (
          <div key={s.id} className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
              <span className="stat-card-value" style={{ fontSize: 15 }}>
                <button className="star-btn" onClick={() => toggleFavorite(s.id)} title={tr('ai.favoritar')}>{s.isFavorite ? '★' : '☆'}</button> {s.name}
              </span>
              {s.usageCount > 0 && s.usageCount === maxUsage && <span className="badge-hot">{tr('ai.maisUsada')}</span>}
            </div>
            {s.description && <div className="stat-card-sub">{s.description}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {s.category && <span className="cat-chip">{s.category}</span>}
              {parseTags(s.tags).map((t) => (
                <span key={t} className="project-chip" style={{ cursor: 'pointer' }} onClick={() => setTagFilter(t)}>{t}</span>
              ))}
            </div>
            <div className="stat-card-sub" style={{ marginTop: 6 }}>{tr('ai.usos', { usageCount: s.usageCount })} {s.updatedAt.slice(0, 10)}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(s); setShowForm(true) }}>{tr('ai.editar')}</button>
              <button className="btn btn-secondary btn-sm" onClick={() => duplicate(s)}>{tr('ai.duplicar')}</button>
              <button className="btn btn-secondary btn-sm" onClick={() => exportOne(s.id)}>{tr('ai.exportar')}</button>
              <button className="btn btn-danger btn-sm" onClick={() => confirm(tr('ai.excluir3', { name: s.name })) && remove(s.id)}>{tr('ai.excluir2')}</button>
            </div>
          </div>
        ))}
      </div>

      </>
      )}

      {showForm && <SkillEditor skill={editing} onClose={() => setShowForm(false)} />}
    </div>
  )
}
