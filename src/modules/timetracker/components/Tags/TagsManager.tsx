import React, { useEffect, useState } from 'react'
import { useTagStore } from '../../store/tagStore'
import { Tag } from '@/types'
import { useProjectStore } from '../../../projects/store/projectStore'
import { t } from '../../../../i18n'

const PRESET_COLORS = [
  '#6366f1', '#3b82f6', '#22c55e', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4'
]

interface FormState {
  name: string
  color: string
  isProductive: number
}

const defaultForm: FormState = { name: '', color: '#6366f1', isProductive: 1 }

export function TagsManager(): React.ReactElement {
  const { tags, createTag, updateTag, deleteTag, refreshTags } = useTagStore()
  const { projects, refresh: refreshProjects } = useProjectStore()
  useEffect(() => {
    if (!projects.length) void refreshProjects()
  }, [])

  async function linkProject(tag: Tag, projectId: number | null): Promise<void> {
    await window.api.projects.linkTag(tag.id, projectId)
    await refreshTags()
  }
  const [form, setForm] = useState<FormState>(defaultForm)
  const [editing, setEditing] = useState<Tag | null>(null)
  const [showForm, setShowForm] = useState(false)

  function startEdit(tag: Tag) {
    setEditing(tag)
    setForm({ name: tag.name, color: tag.color, isProductive: tag.isProductive })
    setShowForm(true)
  }

  function startCreate() {
    setEditing(null)
    setForm(defaultForm)
    setShowForm(true)
  }

  async function handleSubmit() {
    if (!form.name.trim()) return
    if (editing) {
      await updateTag(editing.id, form.name.trim(), form.color, form.isProductive)
    } else {
      await createTag(form.name.trim(), form.color, form.isProductive)
    }
    setShowForm(false)
    setEditing(null)
    setForm(defaultForm)
  }

  async function handleDelete(tag: Tag) {
    if (tag.id <= 3) {
      alert(t('timetracker.cannotDeleteBuiltInTags'))
      return
    }
    if (!confirm(t('timetracker.deleteTagTasksWillBe', { name: tag.name }))) return
    await deleteTag(tag.id)
  }

  return (
    <div className="tags-page">
      <div className="tags-header">
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t('timetracker.tags')}</h2>
        <button className="btn btn-primary" onClick={startCreate}>{t('timetracker.newTag')}</button>
      </div>

      {showForm && (
        <div className="tag-form">
          <h3>{editing ? t('timetracker.editTag') : t('timetracker.newTag2')}</h3>
          <div className="tag-form-fields">
            <input
              type="text"
              placeholder={t('timetracker.tagName')}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              autoFocus
            />
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: c,
                    border: form.color === c ? '2px solid white' : '2px solid transparent',
                    cursor: 'pointer'
                  }}
                  onClick={() => setForm({ ...form, color: c })}
                />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <label htmlFor="productive-select" style={{ fontSize: 13 }}>
              {t('timetracker.type')}
            </label>
            <select
              id="productive-select"
              value={form.isProductive}
              onChange={(e) => setForm({ ...form, isProductive: Number(e.target.value) })}
              style={{ fontSize: 13, padding: '4px 8px' }}
            >
              <option value={0}>{t('timetracker.nonProductive')}</option>
              <option value={1}>{t('timetracker.productive2')}</option>
              <option value={2}>{t('timetracker.semiProductive2')}</option>
              <option value={3}>{t('timetracker.productiveeros2')}</option>
            </select>
          </div>
          <div className="tag-form-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowForm(false); setEditing(null) }}>
              {t('timetracker.cancel')}
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleSubmit}>
              {editing ? t('timetracker.save') : t('timetracker.create')}
            </button>
          </div>
        </div>
      )}

      <div className="tags-list">
        {tags.map((tag) => (
          <div key={tag.id} className="tag-item">
            <div className="tag-color-dot" style={{ background: tag.color }} />
            <span className="tag-name">{tag.name}</span>
            <span className={`tag-badge ${tag.isProductive === 1 ? 'productive' : tag.isProductive === 2 ? 'semi-productive' : tag.isProductive === 3 ? 'productive-eros' : 'idle'}`}>
              {tag.isProductive === 1 ? t('timetracker.productive2') : tag.isProductive === 2 ? t('timetracker.semiProductive2') : tag.isProductive === 3 ? t('timetracker.productiveeros2') : t('timetracker.nonProductive')}
            </span>
            {tag.id !== 1 && tag.id !== 3 && projects.length > 0 && (
              <select
                value={tag.projectId ?? ''}
                onChange={(e) => linkProject(tag, e.target.value ? Number(e.target.value) : null)}
                title={t('timetracker.horasComEsteTagContam')}
                aria-label={t('timetracker.projetoVinculado')}
                style={{ width: 'auto', maxWidth: 160, fontSize: 12 }}
              >
                <option value="">{t('timetracker.semProjeto')}</option>
                {projects.filter((p) => p.status !== 'encerrado' || p.id === tag.projectId).map((p) => (
                  <option key={p.id} value={p.id}>🗂 {p.name}</option>
                ))}
              </select>
            )}
            <div className="tag-actions">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => startEdit(tag)}
              >
                {t('timetracker.edit')}
              </button>
              {tag.id > 3 && (
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(tag)}
                >
                  {t('timetracker.delete2')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
