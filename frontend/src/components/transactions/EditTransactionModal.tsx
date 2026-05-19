import React, { useState } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { transactionService } from '../../services'
import { Transaction, TransactionFormData } from '../../types'
import { getEffectiveCurrencyForTicker, isStrongEurTicker, getDefaultWithholding, normalizeDecimal } from '../../utils'
import { useSwipeToDismiss } from '../../hooks'

interface EditTransactionModalProps {
  transaction: Transaction
  onClose: () => void
  onSave: () => void
}

/**
 * Mobile-optimized modal for editing an existing transaction
 * Matches AddTransactionModal bottom sheet design
 */
export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({ 
  transaction, 
  onClose, 
  onSave 
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
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(transaction.date))
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

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
    setIsSaving(true)
    setError('')

    try {
      const formattedDate = selectedDate.toISOString().split('T')[0]
      const submitData = { ...formData, date: formattedDate }
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

  const isBuy = formData.type === 'buy'
  const { sheetProps } = useSwipeToDismiss({ onDismiss: onClose })

  const netAmount = isDividend
    ? (parseFloat(formData.gross_amount || '0') || 0) - (parseFloat(formData.withholding_tax || '0') || 0)
    : 0

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div {...sheetProps} className="bg-surface-dark w-full sm:max-w-md rounded-2xl border border-white/10 mx-4 sm:mx-0 overflow-hidden animate-slide-up">
        <div className="w-9 h-1 rounded-full bg-white/20 mx-auto mt-2 sm:hidden" />
        <div className="px-5 pt-4 pb-3 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white tracking-tight font-heading">Edit Transaction</h2>
          <button 
            onClick={onClose} 
            className="p-2 -mr-2 rounded-xl text-gray-500 hover:text-white hover:bg-white/5 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 pb-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl mb-4 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-5">
            {/* Buy/Sell/Dividend Toggle - Segmented Control */}
            <div className="bg-surface-elevated p-1 rounded-xl flex">
              <button
                type="button"
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
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Symbol
              </label>
              <input
                type="text"
                value={formData.ticker}
                onChange={(e) => handleTickerChange(e.target.value)}
                className="w-full px-4 py-3.5 bg-surface-elevated border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500/50 text-white text-lg font-medium tracking-wide placeholder:text-gray-600"
                placeholder="AAPL"
                required
              />
            </div>

            {isDividend ? (
              <>
                {/* Dividend: Gross Amount + Withholding Tax */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                      Gross Amount
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formData.gross_amount || ''}
                        onChange={(e) => handleGrossAmountChange(e.target.value)}
                        className="w-full px-4 py-3 pr-12 bg-surface-elevated border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500/50 text-white placeholder:text-gray-600"
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
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                      Tax {(() => { const { label } = getDefaultWithholding(formData.ticker); return label ? <span className="text-gray-600 normal-case">({label})</span> : null })()}
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formData.withholding_tax || ''}
                      onChange={(e) => handleWithholdingTaxChange(e.target.value)}
                      className="w-full px-4 py-3 bg-surface-elevated border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500/50 text-white placeholder:text-gray-600"
                      placeholder="1.50"
                    />
                  </div>
                </div>

                {/* Net amount display */}
                <div className="flex items-center justify-between px-4 py-3 bg-violet-500/10 border border-violet-500/20 rounded-xl">
                  <span className="text-sm text-gray-400">Net Received</span>
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
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                      Shares
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formData.shares}
                      onChange={(e) => setFormData({ ...formData, shares: normalizeDecimal(e.target.value) })}
                      className="w-full px-4 py-3 bg-surface-elevated border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500/50 text-white placeholder:text-gray-600"
                      placeholder="10"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                      Price
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: normalizeDecimal(e.target.value) })}
                        className="w-full px-4 py-3 pr-12 bg-surface-elevated border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500/50 text-white placeholder:text-gray-600"
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
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Date
              </label>
              <DatePicker
                selected={selectedDate}
                onChange={(date: Date | null) => date && setSelectedDate(date)}
                dateFormat="MMM d, yyyy"
                className="w-full px-4 py-3 bg-surface-elevated border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500/50 text-white"
                wrapperClassName="w-full"
                calendarClassName="dark-calendar"
                required
              />
            </div>

            {/* Save Button */}
            <button
              type="submit"
              disabled={isSaving}
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
                'Save Changes'
              )}
            </button>

            {/* Cancel */}
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-gray-500 hover:text-white text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
