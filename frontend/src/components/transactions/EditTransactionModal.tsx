import React, { useState, useRef, useEffect } from 'react'
import { transactionService } from '../../services'
import { Transaction, TransactionFormData } from '../../types'
import { getEffectiveCurrencyForTicker, isStrongEurTicker, normalizeDecimal } from '../../utils'

interface EditTransactionModalProps {
  transaction: Transaction
  onClose: () => void
  onSave: () => void
  onDelete?: () => Promise<void>
}

/**
 * Corrects an existing record in a native modal dialog.
 */
export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({ 
  transaction, 
  onClose, 
  onSave,
  onDelete
}) => {
  const [formData, setFormData] = useState<TransactionFormData>({
    ticker: transaction.ticker,
    type: transaction.type,
    date: transaction.date,
    shares: transaction.shares.toString(),
    price: transaction.price.toString(),
    currency: getEffectiveCurrencyForTicker(transaction.ticker, transaction.currency),
    gross_amount: transaction.gross_amount?.toString() || '',
    withholding_tax: transaction.withholding_tax?.toString() || '',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    dialog?.querySelector<HTMLInputElement>('input')?.focus()
    return () => {
      if (dialog?.open) dialog.close()
      if (previousFocus?.isConnected && !previousFocus.matches(':disabled')) previousFocus.focus()
      else document.getElementById('transaction-search')?.focus()
    }
  }, [])

  useEffect(() => { if (error) errorRef.current?.focus() }, [error])

  const isCurrencyLocked = isStrongEurTicker(formData.ticker)
  const isDividend = formData.type === 'dividend'

  const handleTickerChange = (ticker: string) => {
    const normalizedTicker = ticker.toUpperCase()
    setFormData((current) => ({
      ...current,
      ticker: normalizedTicker,
      currency: getEffectiveCurrencyForTicker(normalizedTicker, current.currency)
    }))
  }

  const handleGrossAmountChange = (value: string) => {
    const gross = normalizeDecimal(value)
    setFormData((current) => {
      const grossNum = parseFloat(gross) || 0
      const taxNum = parseFloat(current.withholding_tax || '0') || 0
      const net = Math.max(grossNum - taxNum, 0)
      return { ...current, gross_amount: gross, price: net > 0 ? net.toFixed(2) : '' }
    })
  }

  const handleWithholdingTaxChange = (value: string) => {
    const tax = normalizeDecimal(value)
    setFormData((current) => {
      const grossNum = parseFloat(current.gross_amount || '0') || 0
      const taxNum = parseFloat(tax) || 0
      const net = Math.max(grossNum - taxNum, 0)
      return { ...current, withholding_tax: tax, price: net > 0 ? net.toFixed(2) : '' }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (isSaving || confirmDelete) return
    setIsSaving(true)
    setError('')

    try {
      const submitData = { ...formData }
      if (isDividend) {
        submitData.shares = '1'
      }
      await transactionService.update(transaction.id, submitData)
      await onSave()
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update transaction')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete || isSaving) return
    setIsSaving(true)
    setError('')
    try {
      await onDelete()
      onClose()
    } catch {
      setError('Could not delete this record. Try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const isBuy = formData.type === 'buy'
  const netAmount = isDividend
    ? (parseFloat(formData.gross_amount || '0') || 0) - (parseFloat(formData.withholding_tax || '0') || 0)
    : 0

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="edit-transaction-title"
      onCancel={event => { if (isSaving) event.preventDefault(); else onClose() }}
      onClick={event => { if (event.target === event.currentTarget && !isSaving) onClose() }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border-0 bg-transparent p-0 text-white backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="bg-surface-dark w-full rounded-2xl border border-white/10 overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex justify-between items-center">
          <h2 id="edit-transaction-title" className="text-lg font-semibold text-white tracking-tight font-heading">Edit transaction</h2>
          <button 
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close transaction form"
            className="min-h-11 min-w-11 p-2 -mr-2 rounded-xl text-gray-500 hover:text-white hover:bg-white/5 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 pb-5">
          <p className="mb-4 text-sm text-gray-400">Record a completed trade or dividend.</p>
          {error && (
            <div ref={errorRef} tabIndex={-1} role="alert" className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl mb-4 text-sm">
              {error}
            </div>
          )}

          <fieldset disabled={isSaving} className="min-w-0 space-y-5">
            {/* Buy/Sell/Dividend Toggle - Segmented Control */}
            <div className="bg-surface-elevated p-1 rounded-xl flex">
              <button
                type="button"
                aria-pressed={formData.type === 'buy'}
                onClick={() => setFormData({ ...formData, type: 'buy' })}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  formData.type === 'buy'
                    ? 'bg-emerald-500/90 text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Buy
              </button>
              <button
                type="button"
                aria-pressed={formData.type === 'sell'}
                onClick={() => setFormData({ ...formData, type: 'sell' })}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  formData.type === 'sell'
                    ? 'bg-rose-500/90 text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Sell
              </button>
              <button
                type="button"
                aria-pressed={isDividend}
                onClick={() => setFormData({ ...formData, type: 'dividend' })}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isDividend
                    ? 'bg-violet-500/90 text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Dividend
              </button>
            </div>

            {/* Ticker */}
            <div>
              <label htmlFor="edit-transaction-ticker" className="block text-sm font-medium text-gray-300 mb-2">
                Ticker symbol
              </label>
              <input id="edit-transaction-ticker"
                        type="text"
                value={formData.ticker}
                onChange={(e) => handleTickerChange(e.target.value)}
                className="w-full px-4 py-3.5 bg-surface-elevated border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500/50 text-white text-lg font-medium tracking-wide placeholder:text-gray-400"
                placeholder="AAPL"
                required
                autoFocus
              />
            </div>

            {isDividend ? (
              <>
                {/* Dividend: Gross Amount + Withholding Tax */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="edit-transaction-gross" className="block text-sm font-medium text-gray-300 mb-2">
                      Dividend before tax ({formData.currency})
                    </label>
                    <div className="relative">
                      <input id="edit-transaction-gross"
                        type="text"
                        inputMode="decimal"
                        value={formData.gross_amount || ''}
                        onChange={(e) => handleGrossAmountChange(e.target.value)}
                        className="w-full px-4 py-3 pr-12 bg-surface-elevated border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500/50 text-white placeholder:text-gray-400"
                        placeholder="10.00"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (isCurrencyLocked) return
                          setFormData({
                            ...formData,
                            currency: formData.currency === 'USD' ? 'EUR' : 'USD'
                          })
                        }}
                        disabled={isCurrencyLocked}
                        aria-label={isCurrencyLocked ? 'Currency: EUR' : `Currency: ${formData.currency}. Change currency`}
                        title={isCurrencyLocked ? 'Currency is fixed to EUR for this ticker' : 'Toggle currency'}
                        className={`absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg text-sm font-medium transition-all ${
                          isCurrencyLocked
                            ? 'bg-white/5 text-gray-500 cursor-not-allowed'
                            : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white'
                        }`}
                      >
                        {formData.currency === 'USD' ? '$' : '€'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="edit-transaction-withholding" className="block text-sm font-medium text-gray-300 mb-2">
                      Tax withheld
                    </label>
                    <input id="edit-transaction-withholding"
                        type="text"
                      inputMode="decimal"
                      value={formData.withholding_tax || ''}
                      onChange={(e) => handleWithholdingTaxChange(e.target.value)}
                      className="w-full px-4 py-3 bg-surface-elevated border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500/50 text-white placeholder:text-gray-400"
                      placeholder="1.50"
                    />
                  </div>
                </div>

                {/* Net amount display */}
                <div className="flex items-center justify-between px-4 py-3 bg-violet-500/10 border border-violet-500/20 rounded-xl">
                  <span className="text-sm text-gray-400">Received after tax</span>
                  <span className="text-lg font-semibold text-violet-400">
                    {formData.currency === 'USD' ? '$' : '€'}{netAmount > 0 ? netAmount.toFixed(2) : '0.00'}
                  </span>
                </div>
              </>
            ) : (
              <>
                {/* Buy/Sell: Shares + Price - Two columns */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="edit-transaction-shares" className="block text-sm font-medium text-gray-300 mb-2">
                      Shares
                    </label>
                    <input id="edit-transaction-shares"
                        type="text"
                      inputMode="decimal"
                      value={formData.shares}
                      onChange={(e) => setFormData({ ...formData, shares: normalizeDecimal(e.target.value) })}
                      className="w-full px-4 py-3 bg-surface-elevated border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500/50 text-white placeholder:text-gray-400"
                      placeholder="10"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="edit-transaction-price" className="block text-sm font-medium text-gray-300 mb-2">
                      Price per share ({formData.currency})
                    </label>
                    <div className="relative">
                      <input id="edit-transaction-price"
                        type="text"
                        inputMode="decimal"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: normalizeDecimal(e.target.value) })}
                        className="w-full px-4 py-3 pr-12 bg-surface-elevated border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500/50 text-white placeholder:text-gray-400"
                        placeholder="150.00"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (isCurrencyLocked) return
                          setFormData({
                            ...formData,
                            currency: formData.currency === 'USD' ? 'EUR' : 'USD'
                          })
                        }}
                        disabled={isCurrencyLocked}
                        aria-label={isCurrencyLocked ? 'Currency: EUR' : `Currency: ${formData.currency}. Change currency`}
                        title={isCurrencyLocked ? 'Currency is fixed to EUR for this ticker' : 'Toggle currency'}
                        className={`absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg text-sm font-medium transition-all ${
                          isCurrencyLocked
                            ? 'bg-white/5 text-gray-500 cursor-not-allowed'
                            : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white'
                        }`}
                      >
                        {formData.currency === 'USD' ? '$' : '€'}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Date */}
            <div>
              <label htmlFor="edit-transaction-date" className="block text-sm font-medium text-gray-300 mb-2">
                Date
              </label>
              <input id="edit-transaction-date"
                        type="date"
                value={formData.date}
                onChange={(event) => setFormData((current) => ({ ...current, date: event.target.value }))}
                className="w-full px-4 py-3 bg-surface-elevated border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500/50 text-white"
                required
              />
            </div>

            {/* Save Button */}
            <button
              type="submit"
              disabled={isSaving || confirmDelete}
              className={`w-full py-4 rounded-xl text-white font-semibold transition-all disabled:opacity-50 active:scale-[0.98] ${
                isDividend
                  ? 'bg-violet-500 hover:bg-violet-600'
                  : isBuy 
                    ? 'bg-emerald-500 hover:bg-emerald-600' 
                    : 'bg-rose-500 hover:bg-rose-600'
              }`}
            >
              {isSaving ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Saving...
                </span>
              ) : (
                'Save changes'
              )}
            </button>

            {onDelete && (
              <div className="border-t border-white/10 pt-3">
                {confirmDelete ? (
                  <div className="space-y-3">
                    <p className="text-sm leading-relaxed text-gray-300">Delete the {transaction.type} record for {transaction.ticker} dated {transaction.date}? This removes it from your portfolio history; it does not undo the activity at your broker.</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-11 rounded-lg border border-white/10 px-3 text-sm text-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400">Keep transaction</button>
                      <button type="button" onClick={() => void handleDelete()} className="min-h-11 rounded-lg bg-rose-600 px-3 text-sm font-medium text-white hover:bg-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400">{isSaving ? 'Deleting…' : 'Delete record'}</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => { setError(''); setConfirmDelete(true) }} className="min-h-11 w-full rounded-lg px-3 text-sm text-rose-300 hover:bg-rose-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400">Delete transaction</button>
                )}
              </div>
            )}

            {/* Cancel */}
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 w-full py-2 rounded-lg text-gray-400 hover:text-white text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400"
            >
              Cancel
            </button>
          </fieldset>
        </form>
      </div>
    </dialog>
  )
}
