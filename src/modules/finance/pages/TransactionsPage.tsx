import React, { useEffect, useRef, useState } from 'react'
import { Transaction } from '../../../types'
import { useFinanceStore } from '../store/financeStore'
import { MonthNav } from '../components/MonthNav'
import { TransactionEditor } from '../components/TransactionEditor'
import { formatMoney, parseBankCsv, transactionsToCsv, matchCategoryId, monthLabel, sumByCurrency } from '../util'
import { localDateStr } from '../../../utils/dates'
import { finishPluggySync } from '../pluggySync'
import { detectInvestmentMove } from '../../../../shared/finance'

const CURRENCIES = ['BRL', 'USD', 'JPY', 'EUR']

export function TransactionsPage(): React.ReactElement {
  const {
    transactions,
    monthListing,
    categories,
    accounts,
    month,
    refresh,
    addTransaction,
    removeTransaction,
    markTransactionValid,
    setTransactionInvestment,
    importTransactions,
    categoryName
  } = useFinanceStore()
  const fileRef = useRef<HTMLInputElement>(null)

  const [type, setType] = useState<'income' | 'expense'>('expense')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('BRL')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [accountId, setAccountId] = useState<number | ''>('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(localDateStr(new Date()))
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [pluggyReady, setPluggyReady] = useState(false)
  const [pluggyBusy, setPluggyBusy] = useState(false)
  const [pluggyMsg, setPluggyMsg] = useState<{ text: string; ok: boolean } | null>(null)
  // filtros da lista
  const [fType, setFType] = useState<'' | 'income' | 'expense' | 'investment'>('')
  const [fCategory, setFCategory] = useState<'' | 'none' | number>('')

  const filtered = monthListing.filter(
    (t) =>
      (fType === '' || (fType === 'investment' ? !!t.investment : t.type === fType)) &&
      (fCategory === '' || (fCategory === 'none' ? t.categoryId == null : t.categoryId === fCategory))
  )
  const filtering = fType !== '' || fCategory !== ''
  const fmtTotals = (items: Transaction[]): string =>
    Object.entries(sumByCurrency(items))
      .map(([c, v]) => formatMoney(v, c))
      .join(' · ') || formatMoney(0)
  const counted = filtered.filter((t) => !t.ignoredReason && !t.investment)
  const inTotal = fmtTotals(counted.filter((t) => t.type === 'income'))
  const outTotal = fmtTotals(counted.filter((t) => t.type === 'expense'))

  useEffect(() => {
    refresh()
    window.api.pluggy.status().then(setPluggyReady).catch(() => setPluggyReady(false))
  }, [])

  useEffect(() => {
    setPluggyMsg(null)
  }, [month])

  async function handlePluggy(): Promise<void> {
    setPluggyBusy(true)
    setPluggyMsg(null)
    try {
      const r = await window.api.pluggy.sync(month)
      const text = await finishPluggySync(r, `${monthLabel(month)}: `)
      await refresh()
      setPluggyMsg({ text, ok: true })
    } catch (e) {
      setPluggyMsg({ text: e instanceof Error ? e.message : String(e), ok: false })
    } finally {
      setPluggyBusy(false)
    }
  }

  async function handleAdd(): Promise<void> {
    const value = parseFloat(amount)
    if (isNaN(value) || value <= 0) return
    await addTransaction({
      accountId: accountId === '' ? null : Number(accountId),
      categoryId: categoryId === '' ? null : Number(categoryId),
      amount: value,
      currency,
      type,
      description: description.trim() || null,
      date
    })
    setAmount('')
    setDescription('')
  }

  async function handleCsv(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const rows = parseBankCsv(text)
    if (rows.length === 0) {
      alert('Não consegui reconhecer o CSV. Esperado colunas de data e valor.')
      return
    }
    const categorized = rows.filter((r) => matchCategoryId(r.description, categories) !== null).length
    if (!confirm(`Importar ${rows.length} transações? ${categorized} auto-categorizadas; o resto vai p/ "Outros".`)) return
    await importTransactions(
      rows.map((r) => ({
        accountId: accountId === '' ? null : Number(accountId),
        categoryId: matchCategoryId(r.description, categories) ?? 6, // fallback "Outros" seed
        amount: r.amount,
        currency: r.currency ?? currency,
        type: r.type,
        description: r.description || null,
        date: r.date,
        investment: detectInvestmentMove(r.description) ? 1 : 0
      }))
    )
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleExport(): void {
    const csv = transactionsToCsv(transactions, categoryName)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transacoes-${month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>💸 Transações</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {transactions.length} no mês
            {monthListing.length > transactions.length && ` · ${monthListing.length - transactions.length} ignorada(s)`}
          </p>
        </div>
        <MonthNav />
      </div>

      <div className="chart-section" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={type}
            onChange={(e) => {
              const v = e.target.value as 'income' | 'expense'
              setType(v)
              if (categoryId !== '' && categories.find((c) => c.id === categoryId)?.type !== v) setCategoryId('')
            }}
          >
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
          </select>
          <input type="number" placeholder="Valor" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 100 }} />
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Categoria…</option>
            {categories.filter((c) => c.type === type).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Conta…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input placeholder="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
          <button className="btn btn-primary btn-sm" onClick={handleAdd}>+ Adicionar</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {pluggyReady && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={handlePluggy}
              disabled={pluggyBusy}
              title={`Importa do Open Finance (Pluggy) só as transações de ${monthLabel(month)}`}
            >
              {pluggyBusy ? 'Importando…' : '🏦 Importar do Open Finance (mês)'}
            </button>
          )}
          <input ref={fileRef} type="file" accept=".csv" onChange={handleCsv} style={{ display: 'none' }} />
          <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>📥 Importar CSV</button>
          <button className="btn btn-secondary btn-sm" onClick={handleExport} disabled={transactions.length === 0}>📤 Exportar CSV</button>
        </div>
        {pluggyMsg && (
          <div style={{ marginTop: 8, fontSize: 12, color: pluggyMsg.ok ? 'var(--success)' : 'var(--danger)' }}>
            {pluggyMsg.text}
          </div>
        )}
      </div>

      <div className="tx-filters" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <select
          value={fType}
          onChange={(e) => {
            const v = e.target.value as '' | 'income' | 'expense' | 'investment'
            setFType(v)
            // categoria escolhida é do outro tipo → some do select; limpa para não esconder tudo
            if (v && v !== 'investment' && typeof fCategory === 'number' && categories.find((c) => c.id === fCategory)?.type !== v) setFCategory('')
          }}
        >
          <option value="">Entradas e saídas</option>
          <option value="income">Só entradas</option>
          <option value="expense">Só saídas</option>
          <option value="investment">Só investimentos (aplicação/resgate)</option>
        </select>
        <select
          value={fCategory === '' ? '' : String(fCategory)}
          onChange={(e) => {
            const v = e.target.value
            setFCategory(v === '' ? '' : v === 'none' ? 'none' : Number(v))
          }}
        >
          <option value="">Todas as categorias</option>
          <option value="none">Sem categoria</option>
          {categories
            .filter((c) => fType === '' || fType === 'investment' || c.type === fType)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        {filtering && (
          <button className="btn btn-secondary btn-sm" onClick={() => { setFType(''); setFCategory('') }}>
            Limpar filtros
          </button>
        )}
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          {filtering && `${filtered.length} de ${monthListing.length} · `}
          <span style={{ color: 'var(--success)' }}>+{inTotal}</span> ·{' '}
          <span style={{ color: 'var(--danger)' }}>−{outTotal}</span>
        </span>
      </div>

      <div className="list-stack">
        {monthListing.length === 0 && <div className="empty-hint">Nenhuma transação neste mês.</div>}
        {monthListing.length > 0 && filtered.length === 0 && <div className="empty-hint">Nenhuma transação com esses filtros.</div>}
        {filtered.map((t: Transaction) => t.ignoredReason ? (
          <div key={t.id} className="list-row" style={{ opacity: 0.55 }} title="Não entra em nenhum cálculo nem gráfico">
            <span className="due-badge due-future">{t.date.slice(5)}</span>
            <span className="list-row-title" style={{ color: 'var(--text-muted)' }}>{t.description || categoryName(t.categoryId)}</span>
            <span className="project-chip" style={{ color: 'var(--text-muted)' }}>ignorada · {t.ignoredReason}</span>
            <span style={{ fontWeight: 600, color: 'var(--text-muted)', minWidth: 90, textAlign: 'right', textDecoration: 'line-through' }}>
              {t.type === 'income' ? '+' : '−'}{formatMoney(t.amount, t.currency)}
            </span>
            <button className="btn btn-secondary btn-sm" onClick={() => markTransactionValid(t.id)}>Marcar como transação válida</button>
            <button className="btn btn-danger btn-sm" onClick={() => removeTransaction(t.id)}>✕</button>
          </div>
        ) : (
          <div key={t.id} className="list-row">
            <span className="due-badge due-future">{t.date.slice(5)}</span>
            <span className="list-row-title">{t.description || categoryName(t.categoryId)}</span>
            <span className="project-chip">{categoryName(t.categoryId)}</span>
            {t.investment ? (
              <button
                className="project-chip"
                style={{ color: 'var(--accent)', cursor: 'pointer', border: 'none' }}
                title="Movimentação de investimento: fora de receitas/gastos. Clique para desmarcar."
                onClick={() => {
                  if (confirm('Desmarcar como investimento? Ela volta a contar como ' + (t.type === 'income' ? 'receita.' : 'gasto.')))
                    setTransactionInvestment(t.id, false)
                }}
              >
                📈 {t.type === 'income' ? 'resgate' : 'aplicação'}
              </button>
            ) : null}
            {t.pending ? (
              <span className="project-chip" style={{ color: 'var(--warning)' }} title="Pendente no banco: valor e descrição ainda podem mudar">
                pendente
              </span>
            ) : null}
            <span style={{ fontWeight: 600, color: t.type === 'income' ? 'var(--success)' : 'var(--danger)', minWidth: 90, textAlign: 'right' }}>
              {t.type === 'income' ? '+' : '−'}{formatMoney(t.amount, t.currency)}
            </span>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(t)}>Editar</button>
            <button className="btn btn-danger btn-sm" onClick={() => removeTransaction(t.id)}>✕</button>
          </div>
        ))}
      </div>

      {editing && <TransactionEditor tx={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
