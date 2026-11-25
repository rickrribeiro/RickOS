import React, { useEffect, useState } from 'react'
import { Transaction } from '../../../types'
import { useFinanceStore } from '../store/financeStore'
import { transactionKind, PAYMENT_METHODS, recurringKey, type TransactionKind } from '../../../../shared/finance'
import { t } from '../../../i18n'

const CURRENCIES = ['BRL', 'USD', 'JPY', 'EUR']

export function TransactionEditor({ tx, onClose }: { tx: Transaction; onClose: () => void }): React.ReactElement {
  const { categories, accounts, updateTransaction, setTransactionKind, setTransactionPaymentMethod, setRecurring, recurringSuggestions } = useFinanceStore()
  // recorrência é por estabelecimento: '' = automático, '1' = sempre, '0' = nunca
  const key = recurringKey(tx.description, tx.type)
  const suggested = recurringSuggestions.some((s) => s.key === key)
  const [recurringMode, setRecurringMode] = useState<'' | '1' | '0'>('')
  const [recurringLoaded, setRecurringLoaded] = useState<'' | '1' | '0'>('')
  useEffect(() => {
    window.api.transactions
      .recurringOverrides()
      .then((list) => {
        const o = list.find((x) => x.key === key)
        const v = o == null ? '' : o.recurring ? '1' : '0'
        setRecurringMode(v)
        setRecurringLoaded(v)
      })
      .catch(() => undefined)
  }, [key])
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
    if (key && recurringMode !== recurringLoaded) await setRecurring(key, recurringMode === '' ? null : recurringMode === '1')
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 380 }}>
        <h2>{t('finance.editarTransacao')}</h2>
        <div className="editor-row">
          <div className="editor-field">
            <label>{t('finance.tipo')}</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="expense">{t('finance.despesa')}</option>
              <option value="income">{t('finance.receita')}</option>
            </select>
          </div>
          <div className="editor-field">
            <label>{t('finance.valor')}</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="editor-field">
            <label>{t('finance.moeda')}</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="editor-row">
          <div className="editor-field">
            <label>{t('finance.categoria')}</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">—</option>
              {categories
                .filter((c) => c.type === type || c.id === categoryId) // mantém a atual mesmo se for do outro tipo
                .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="editor-field">
            <label>{t('finance.conta')}</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="editor-field">
            <label>{t('finance.data')}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="editor-field">
          <label>{t('finance.descricao')}</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="editor-field">
          <label>{t('finance.formaDePagamento')}</label>
          <select value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="">{t('finance.naoIdentificada')}</option>
            {PAYMENT_METHODS.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.label}</option>)}
          </select>
        </div>
        {key && (
          <div className="editor-field">
            <label>{t('finance.recorrencia')}</label>
            <select value={recurringMode} onChange={(e) => setRecurringMode(e.target.value as '' | '1' | '0')}>
              <option value="">{t('finance.naoDecidido')}{suggested ? t('finance.sugeridaComoRecorrente') : ''}</option>
              <option value="1">{t('finance.recorrente')}</option>
              <option value="0">{t('finance.naoERecorrente')}</option>
            </select>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('finance.valeParaTodasAsTransacoes')}</span>
          </div>
        )}
        <div className="editor-field">
          <label>{t('finance.natureza')}</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as TransactionKind)}>
            <option value="normal">{type === 'income' ? t('finance.receita') : t('finance.gasto')} {t('finance.normal')}</option>
            <option value="investment">{t('finance.investimento')}{type === 'income' ? t('finance.resgate') : t('finance.aplicacao')})</option>
            <option value="transfer">{t('finance.transferenciaEntreMinhasContas')}</option>
          </select>
          {kind !== 'normal' && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {t('finance.naoContaComo')} {type === 'income' ? t('finance.receita2') : t('finance.gasto2')}
              {kind === 'investment' ? t('finance.apareceAParteNoDashboard') : t('finance.oDinheiroSoMudouDe')}
            </span>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>{t('finance.cancelar')}</button>
          <button className="btn btn-primary btn-sm" onClick={save}>{t('finance.salvar')}</button>
        </div>
      </div>
    </div>
  )
}
