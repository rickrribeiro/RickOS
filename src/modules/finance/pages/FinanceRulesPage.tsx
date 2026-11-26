import React, { useEffect, useState } from 'react'
import { Category, FinanceRule, RulePreviewItem } from '../../../types'
import { useFinanceStore } from '../store/financeStore'
import { MonthNav } from '../components/MonthNav'
import { formatMoney, monthLabel } from '../util'
import { matchFinanceRule, parseKeywords } from '../../../../shared/finance'
import { t } from '../../../i18n'

/** Select de categoria agrupado por tipo. */
function CategorySelect({
  categories,
  value,
  onChange
}: {
  categories: Category[]
  value: number | ''
  onChange: (id: number | '') => void
}): React.ReactElement {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}>
      <option value="">{t('finance.categoria2')}</option>
      <optgroup label={t('finance.despesas')}>
        {categories.filter((c) => c.type === 'expense').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </optgroup>
      <optgroup label={t('finance.receitas')}>
        {categories.filter((c) => c.type === 'income').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </optgroup>
    </select>
  )
}

function RuleRow({
  rule,
  index,
  total,
  categories,
  onChanged
}: {
  rule: FinanceRule
  index: number
  total: number
  categories: Category[]
  onChanged: () => void
}): React.ReactElement {
  const [keywords, setKeywords] = useState(rule.keywords)
  useEffect(() => setKeywords(rule.keywords), [rule.keywords])
  const cat = categories.find((c) => c.id === rule.categoryId)

  async function update(patch: Partial<{ categoryId: number; keywords: string; active: boolean }>): Promise<void> {
    await window.api.financeRules.update(
      rule.id,
      patch.categoryId ?? rule.categoryId,
      patch.keywords ?? rule.keywords,
      patch.active ?? !!rule.active
    )
    onChanged()
  }

  function saveKeywords(): void {
    const k = keywords.trim()
    if (k === rule.keywords) return
    if (!parseKeywords(k).length) {
      setKeywords(rule.keywords)
      return
    }
    update({ keywords: k })
  }

  async function move(dir: -1 | 1): Promise<void> {
    await window.api.financeRules.move(rule.id, dir)
    onChanged()
  }

  async function remove(): Promise<void> {
    if (!confirm(t('finance.excluirARegra', { keywords: rule.keywords, p1: cat?.name ?? '?' }))) return
    await window.api.financeRules.delete(rule.id)
    onChanged()
  }

  return (
    <div className="list-row" style={{ opacity: rule.active ? 1 : 0.55, flexWrap: 'wrap', gap: 6 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <button className="btn btn-secondary btn-sm" style={{ padding: '0 6px', lineHeight: 1.2 }} disabled={index === 0} onClick={() => move(-1)} title={t('finance.maisPrioritaria')}>▲</button>
        <button className="btn btn-secondary btn-sm" style={{ padding: '0 6px', lineHeight: 1.2 }} disabled={index === total - 1} onClick={() => move(1)} title={t('finance.menosPrioritaria')}>▼</button>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }} title={t('finance.ativarDesativar')}>
        <input type="checkbox" checked={!!rule.active} onChange={(e) => update({ active: e.target.checked })} />
        {rule.active ? t('finance.ativa') : t('finance.inativa')}
      </label>
      <input
        value={keywords}
        onChange={(e) => setKeywords(e.target.value)}
        onBlur={saveKeywords}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        placeholder={t('finance.palavrasSeparadasPorVirgula')}
        style={{ flex: 1, minWidth: 160 }}
        title={t('finance.seADescricaoContiverQualquer')}
      />
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>→</span>
      <span className="priority-dot" style={{ background: cat?.color ?? 'var(--border)' }} />
      <CategorySelect categories={categories} value={rule.categoryId} onChange={(id) => id !== '' && update({ categoryId: id })} />
      <button className="btn btn-danger btn-sm" onClick={remove} title={t('finance.excluirRegra')}>✕</button>
    </div>
  )
}

export function FinanceRulesPage(): React.ReactElement {
  const { categories, month, refresh, categoryName } = useFinanceStore()
  const [rules, setRules] = useState<FinanceRule[]>([])
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [keywords, setKeywords] = useState('')
  const [testDesc, setTestDesc] = useState('')
  const [testType, setTestType] = useState<'expense' | 'income'>('expense')
  const [preview, setPreview] = useState<{ scope: string; items: RulePreviewItem[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function load(): Promise<void> {
    setRules(await window.api.financeRules.getAll())
  }

  useEffect(() => {
    refresh()
    load()
  }, [])

  async function handleAdd(): Promise<void> {
    if (categoryId === '' || !parseKeywords(keywords).length) return
    await window.api.financeRules.create(categoryId, keywords.trim())
    setKeywords('')
    await load()
  }

  async function openPreview(allMonths: boolean): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      const items = await window.api.financeRules.preview(allMonths ? undefined : month)
      if (!items.length) setMsg(t('finance.nenhumaTransacaoSemCategoriaEm'))
      else setPreview({ scope: allMonths ? t('finance.todosOsMeses') : monthLabel(month), items })
    } finally {
      setBusy(false)
    }
  }

  async function confirmApply(): Promise<void> {
    if (!preview) return
    setBusy(true)
    try {
      await window.api.financeRules.apply(preview.items.map((i) => ({ id: i.id, categoryId: i.toCategoryId })))
      setMsg(t('finance.transacaoOesCategorizadaS', { count: preview.items.length }))
      setPreview(null)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const tested = testDesc.trim() ? matchFinanceRule(rules, categories, testDesc, testType) : null

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t('finance.regras')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('finance.categorizacaoAutomaticaDasTransacoesImportadas')}</p>
        </div>
        <MonthNav />
      </div>

      <div className="chart-section" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            placeholder={t('finance.palavrasSeparadasPorVirgulaEx')}
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            style={{ flex: 1, minWidth: 200 }}
          />
          <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />
          <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={categoryId === '' || !parseKeywords(keywords).length}>
            {t('finance.adicionarRegra')}
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          {t('finance.seADescricaoContiverQualquer2')}
        </p>
      </div>

      <div className="list-stack">
        {rules.length === 0 && <div className="empty-hint">{t('finance.nenhumaRegraAinda')}</div>}
        {rules.map((r, i) => (
          <RuleRow key={r.id} rule={r} index={i} total={rules.length} categories={categories} onChanged={load} />
        ))}
      </div>

      <div className="chart-section" style={{ marginTop: 16 }}>
        <div className="chart-title">{t('finance.testar')}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <select value={testType} onChange={(e) => setTestType(e.target.value as 'expense' | 'income')}>
            <option value="expense">{t('finance.despesa')}</option>
            <option value="income">{t('finance.receita')}</option>
          </select>
          <input placeholder={t('finance.descricaoDeExemploExUber')} value={testDesc} onChange={(e) => setTestDesc(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          {testDesc.trim() && (
            <span style={{ fontSize: 13, color: tested ? 'var(--success)' : 'var(--text-muted)' }}>
              {tested ? t('finance.regra', { p0: categoryName(tested.categoryId), keywords: tested.keywords }) : t('finance.nenhumaRegraBate')}
            </span>
          )}
        </div>
      </div>

      <div className="chart-section" style={{ marginTop: 16 }}>
        <div className="chart-title">{t('finance.aplicarNasTransacoesExistentes')}</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 8px' }}>
          {t('finance.soMexeNasQueEstao')}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" disabled={busy || !rules.length} onClick={() => openPreview(false)}>
            {t('finance.aplicarEm', { p0: monthLabel(month) })}
          </button>
          <button className="btn btn-secondary btn-sm" disabled={busy || !rules.length} onClick={() => openPreview(true)}>
            {t('finance.aplicarEmTodosOsMeses')}
          </button>
        </div>
        {msg && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>{msg}</div>}
      </div>

      {preview && (
        <div className="modal-overlay" onClick={() => setPreview(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 340, maxWidth: 640 }}>
            <h2>{t('finance.categorizarTransacaoOes', { count: preview.items.length })}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{preview.scope}</p>
            <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {preview.items.map((i) => (
                <div key={i.id} style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'baseline' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{i.date.slice(5)}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.description}</span>
                  <span>{formatMoney(i.amount, i.currency)}</span>
                  <span style={{ color: 'var(--accent)' }}>→ {categoryName(i.toCategoryId)}</span>
                  <button
                    className="btn btn-sm"
                    style={{ padding: '0 4px', lineHeight: 1.2, background: 'transparent', border: 'none', color: 'var(--text-muted)' }}
                    title={t('finance.tirarDaLista')}
                    aria-label={t('finance.tirarDaLista')}
                    onClick={() => setPreview({ ...preview, items: preview.items.filter((x) => x.id !== i.id) })}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setPreview(null)}>{t('finance.cancelar')}</button>
              <button className="btn btn-primary btn-sm" onClick={confirmApply} disabled={busy || !preview.items.length}>{t('finance.aplicar')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
