import React, { useEffect, useState } from 'react'
import { Category } from '../../../types'
import { useFinanceStore } from '../store/financeStore'
import { MonthNav } from '../components/MonthNav'
import { formatMoney } from '../util'

/** "Outros": destino padrão das importações (Open Finance/CSV); não pode ser excluída. */
const FALLBACK_CATEGORY_ID = 6
const PALETTE = ['#22c55e', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#ef4444', '#eab308', '#6366f1', '#6b7280']

/** Linha de categoria: nome/cor editáveis, total do mês e (despesa) meta com barra. */
function CategoryRow({
  category,
  total,
  budget,
  txCount
}: {
  category: Category
  total: number
  budget: number | null // null = receita (sem meta)
  txCount: number
}): React.ReactElement {
  const { setBudget, updateCategory, removeCategory } = useFinanceStore()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [color, setColor] = useState(category.color)

  const isExpense = budget !== null
  const pct = budget && budget > 0 ? Math.min(100, (total / budget) * 100) : 0
  const over = !!budget && budget > 0 && total > budget

  async function saveBudget(): Promise<void> {
    const v = parseFloat(draft)
    if (isNaN(v)) return
    await setBudget(category.id, v)
    setDraft('')
  }

  async function saveEdit(): Promise<void> {
    if (!name.trim()) return
    await updateCategory(category.id, name.trim(), color)
    setEditing(false)
  }

  function remove(): void {
    const extra = txCount > 0 ? `\n\n${txCount} transação(ões) deste mês (e as de outros meses) ficarão sem categoria.` : ''
    if (!confirm(`Excluir a categoria "${category.name}"?${extra}`)) return
    removeCategory(category.id)
  }

  return (
    <div className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {editing ? (
          <>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 32, padding: 0 }} />
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} style={{ flex: 1, minWidth: 120 }} autoFocus />
            <button className="btn btn-primary btn-sm" onClick={saveEdit}>Salvar</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(false); setName(category.name); setColor(category.color) }}>Cancelar</button>
          </>
        ) : (
          <>
            <span className="priority-dot" style={{ background: category.color }} />
            <span className="list-row-title">{category.name}</span>
            <span style={{ fontSize: 13, color: over ? 'var(--danger)' : 'var(--text-secondary)' }}>
              {formatMoney(total)}
              {isExpense && <> / {budget && budget > 0 ? formatMoney(budget) : '—'} {over && '⚠'}</>}
            </span>
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap' }}>
              {isExpense && (
                <>
                  <input
                    type="number"
                    placeholder="meta"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveBudget()}
                    style={{ width: 90 }}
                  />
                  <button className="btn btn-secondary btn-sm" onClick={saveBudget} disabled={draft.trim() === ''}>Salvar meta</button>
                </>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)} title="Renomear / mudar cor">✎</button>
              {category.id !== FALLBACK_CATEGORY_ID && (
                <button className="btn btn-danger btn-sm" onClick={remove} title="Excluir categoria">✕</button>
              )}
            </div>
          </>
        )}
      </div>
      {isExpense && budget != null && budget > 0 && (
        <div className="bar-track">
          <div className="bar-fill" style={{ width: `${pct}%`, background: over ? 'var(--danger)' : category.color }} />
        </div>
      )}
    </div>
  )
}

export function BudgetPage(): React.ReactElement {
  const { categories, budgets, transactions, refresh, addCategory } = useFinanceStore()
  const [name, setName] = useState('')
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [color, setColor] = useState(PALETTE[0])

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    // sugere uma cor ainda não usada
    const used = new Set(categories.map((c) => c.color.toLowerCase()))
    setColor(PALETTE.find((p) => !used.has(p)) ?? PALETTE[0])
  }, [categories.length])

  const expenseCats = categories.filter((c) => c.type === 'expense')
  const incomeCats = categories.filter((c) => c.type === 'income')
  const budgetFor = (catId: number): number => budgets.find((b) => b.categoryId === catId)?.amount ?? 0
  const txOf = (catId: number, t: string): typeof transactions => transactions.filter((x) => x.type === t && x.categoryId === catId)
  const sum = (xs: typeof transactions): number => xs.reduce((s, t) => s + t.amount, 0)

  async function handleAdd(): Promise<void> {
    const n = name.trim()
    if (!n) return
    if (categories.some((c) => c.type === type && c.name.toLowerCase() === n.toLowerCase())) {
      alert(`Já existe a categoria "${n}".`)
      return
    }
    await addCategory(n, type, color)
    setName('')
  }

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🏷️ Categorias</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Categorias das transações e meta mensal de gastos (BRL)</p>
        </div>
        <MonthNav />
      </div>

      <div className="chart-section" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={type} onChange={(e) => setType(e.target.value as 'expense' | 'income')}>
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
          </select>
          <input
            placeholder="Nova categoria"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            style={{ flex: 1, minWidth: 140 }}
          />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} title="Cor" style={{ width: 36, padding: 0 }} />
          <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!name.trim()}>
            + Adicionar
          </button>
        </div>
      </div>

      <div className="chart-title" style={{ margin: '4px 0 8px' }}>Despesas</div>
      <div className="list-stack">
        {expenseCats.map((c) => (
          <CategoryRow key={c.id} category={c} total={sum(txOf(c.id, 'expense'))} budget={budgetFor(c.id)} txCount={txOf(c.id, 'expense').length} />
        ))}
      </div>

      <div className="chart-title" style={{ margin: '16px 0 8px' }}>Receitas</div>
      <div className="list-stack">
        {incomeCats.length === 0 && <div className="empty-hint">Nenhuma categoria de receita.</div>}
        {incomeCats.map((c) => (
          <CategoryRow key={c.id} category={c} total={sum(txOf(c.id, 'income'))} budget={null} txCount={txOf(c.id, 'income').length} />
        ))}
      </div>
    </div>
  )
}
