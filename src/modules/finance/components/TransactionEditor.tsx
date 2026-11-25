import React, { useState } from 'react'
import { Transaction } from '../../../types'
import { useFinanceStore } from '../store/financeStore'
import { transactionKind, PAYMENT_METHODS, type TransactionKind } from '../../../../shared/finance'

const CURRENCIES = ['BRL', 'USD', 'JPY', 'EUR']

export function TransactionEditor({ tx, onClose }: { tx: Transaction; onClose: () => void }): React.ReactElement {
  const { categories, accounts, updateTransaction, setTransactionKind, setTransactionPaymentMethod } = useFinanceStore()
  const [type, setType] = useState(tx.type)
  const [amount, setAmount] = useState(String(tx.amount))
  const [currency, setCurrency] = useState(tx.currency)
  const [categoryId, setCategoryId] = useState<number | ''>(tx.categoryId ?? '')
  const [accountId, setAccountId] = useState<number | ''>(tx.accountId ?? '')
  const [description, setDescription] = useState(tx.description ?? '')
  const [date, setDate] = useState(tx.date)
  const [kind, setKind] = useState<TransactionKind>(transactionKind(tx))
  const [payment, setPayment] = useState<string>(tx.paymentMethod ?? '')

  async function save(): Promise<void> {
    const v = parseFloat(amount)
    if (isNaN(v) || v <= 0) return
    await updateTransaction({
      ...tx,
      type,
      amount: v,
      currency,
      categoryId: categoryId === '' ? null : Number(categoryId),
      accountId: accountId === '' ? null : Number(accountId),
      description: description.trim() || null,
      date
    })
    if (kind !== transactionKind(tx)) await setTransactionKind(tx.id, kind)
    if (payment !== (tx.paymentMethod ?? '')) await setTransactionPaymentMethod(tx.id, payment || null)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 380 }}>
        <h2>Editar transação</h2>
        <div className="editor-row">
          <div className="editor-field">
            <label>Tipo</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="expense">Despesa</option>
              <option value="income">Receita</option>
            </select>
          </div>
          <div className="editor-field">
            <label>Valor</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="editor-field">
            <label>Moeda</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="editor-row">
          <div className="editor-field">
            <label>Categoria</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">—</option>
              {categories
                .filter((c) => c.type === type || c.id === categoryId) // mantém a atual mesmo se for do outro tipo
                .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="editor-field">
            <label>Conta</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="editor-field">
            <label>Data</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="editor-field">
          <label>Descrição</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="editor-field">
          <label>Forma de pagamento</label>
          <select value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="">Não identificada</option>
            {PAYMENT_METHODS.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.label}</option>)}
          </select>
        </div>
        <div className="editor-field">
          <label>Natureza</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as TransactionKind)}>
            <option value="normal">{type === 'income' ? 'Receita' : 'Gasto'} normal</option>
            <option value="investment">Investimento ({type === 'income' ? 'resgate' : 'aplicação'})</option>
            <option value="transfer">Transferência entre minhas contas</option>
          </select>
          {kind !== 'normal' && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Não conta como {type === 'income' ? 'receita' : 'gasto'}
              {kind === 'investment' ? '; aparece à parte no Dashboard.' : ' — o dinheiro só mudou de conta.'}
            </span>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
  )
}
