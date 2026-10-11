import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { transactionService } from '../../services'
import { Holding, TransactionFormData } from '../../types'
import { getEffectiveCurrencyForTicker, isStrongEurTicker, getDefaultWithholding, normalizeDecimal } from '../../utils'

interface AddTransactionModalProps {
  holdings: Holding[]
  onClose: () => void
  onTransactionAdded: () => void
}

/**
 * Records completed activity in a native modal dialog.
 */
export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({ 
  holdings,
  onClose, 
  onTransactionAdded 
}) => {
  const [formData, setFormData] = useState<TransactionFormData>({
    ticker: '',
    type: 'buy',
    date: new Date().toISOString().split('T')[0],
    shares: '',
    price: '',
    currency: 'USD'
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [investmentSelection, setInvestmentSelection] = useState('')
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    dialog?.querySelector<HTMLElement>('#add-transaction-investment, #add-transaction-ticker')?.focus()
    return () => {
      if (dialog?.open) dialog.close()
      if (previousFocus?.isConnected && !previousFocus.matches(':disabled')) previousFocus.focus()
      else document.getElementById('transaction-search')?.focus()
    }
  }, [])

  useEffect(() => { if (error) errorRef.current?.focus() }, [error])

  const taxManuallyEdited = useRef(false)

  const isCurrencyLocked = isStrongEurTicker(formData.ticker)
  const isDividend = formData.type === 'dividend'
  const existingInvestments = [...holdings].sort((a, b) => a.ticker.localeCompare(b.ticker))
  const enterNewSymbol = holdings.length === 0 || investmentSelection === '__new__'

  const handleTickerChange = (ticker: string, preferredCurrency?: string) => {
    const normalizedTicker = ticker.toUpperCase()
    setFormData(current => {
      const next = {
        ...current,
        ticker: normalizedTicker,
        currency: getEffectiveCurrencyForTicker(normalizedTicker, preferredCurrency ?? current.currency),
      }
      if (current.type === 'dividend' && !taxManuallyEdited.current && current.gross_amount) {
        const gross = parseFloat(current.gross_amount) || 0
        const tax = gross * getDefaultWithholding(normalizedTicker).pct / 100
        const net = Math.max(gross - tax, 0)
        next.withholding_tax = tax > 0 ? tax.toFixed(2) : ''
        next.price = net > 0 ? net.toFixed(2) : ''
      }
      return next
    })
  }

  const handleGrossAmountChange = (value: string) => {
    const gross = normalizeDecimal(value)
    setFormData((current) => {
      const grossNum = parseFloat(gross) || 0

      let taxStr = current.withholding_tax || ''
      if (!taxManuallyEdited.current && grossNum > 0) {
        const { pct } = getDefaultWithholding(current.ticker)
        const autoTax = grossNum * pct / 100
        taxStr = autoTax > 0 ? autoTax.toFixed(2) : ''
      }

      const taxNum = parseFloat(taxStr) || 0
      const net = Math.max(grossNum - taxNum, 0)
      return { ...current, gross_amount: gross, withholding_tax: taxStr, price: net > 0 ? net.toFixed(2) : '' }
    })
  }

  const handleWithholdingTaxChange = (value: string) => {
    taxManuallyEdited.current = true
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
    if (isSubmitting) return
    setIsSubmitting(true)
    setError('')

    try {
      const submitData = { ...formData }
      if (isDividend) {
        submitData.shares = '1'
      }
      await transactionService.create(submitData)
      onTransactionAdded()
      onClose()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add transaction'
      setError(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  const isBuy = formData.type === 'buy'
  const netAmount = isDividend
    ? (parseFloat(formData.gross_amount || '0') || 0) - (parseFloat(formData.withholding_tax || '0') || 0)
    : 0

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="add-transaction-title"
      onCancel={event => { if (isSubmitting) event.preventDefault(); else onClose() }}
      onClick={event => { if (event.target === event.currentTarget && !isSubmitting) onClose() }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border-0 bg-transparent p-0 text-white backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="bg-surface-dark w-full rounded-2xl border border-white/10 overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex justify-between items-center">
          <h2 id="add-transaction-title" className="text-lg font-semibold text-white tracking-tight font-heading">Add transaction</h2>
          <button 
            onClick={onClose}
            disabled={isSubmitting}
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

          <fieldset disabled={isSubmitting} className="min-w-0 space-y-5">
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
                onClick={() => { taxManuallyEdited.current = false; setFormData({ ...formData, type: 'dividend', withholding_tax: '', gross_amount: '', price: '' }) }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isDividend
                    ? 'bg-violet-500/90 text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Dividend
              </button>
            </div>

            {existingInvestments.length > 0 && (
              <div>
                <label htmlFor="add-transaction-investment" className="mb-2 block text-sm font-medium text-gray-300">Investment</label>
                <div className="relative">
                  <select
                    id="add-transaction-investment"
                    value={investmentSelection}
                    onChange={event => {
                      const ticker = event.target.value
                      setInvestmentSelection(ticker)
                      const holding = holdings.find(item => item.ticker === ticker)
                      handleTickerChange(holding?.ticker ?? '', holding?.currency ?? 'USD')
                    }}
                    required
                    className="min-h-11 w-full appearance-none rounded-xl border border-white/5 bg-surface-elevated py-3 pl-4 pr-12 text-base text-white focus:outline-none focus:ring-2 focus:ring-accent-500/50 [color-scheme:dark]"
                  >
                    <option value="" disabled>Choose an investment</option>
                    {existingInvestments.map(holding => <option key={holding.ticker} value={holding.ticker}>{holding.ticker} ({getEffectiveCurrencyForTicker(holding.ticker, holding.currency)})</option>)}
                    <option value="__new__">Enter a new symbol…</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                </div>
              </div>
            )}

            {enterNewSymbol && <div>
              <label htmlFor="add-transaction-ticker" className="block text-sm font-medium text-gray-300 mb-2">
                Ticker symbol
              </label>
              <input id="add-transaction-ticker"
                        type="text"
                value={formData.ticker}
                onChange={(e) => handleTickerChange(e.target.value)}
                className="w-full px-4 py-3.5 bg-surface-elevated border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500/50 text-white text-lg font-medium tracking-wide placeholder:text-gray-400"
                placeholder="AAPL"
                autoFocus
                required
              />
            </div>}

            {isDividend ? (
              <>
                {/* Dividend: Gross Amount + Withholding Tax */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="add-transaction-gross" className="block text-sm font-medium text-gray-300 mb-2">
                      Dividend before tax ({formData.currency})
                    </label>
                    <div className="relative">
                      <input id="add-transaction-gross"
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
                    <label htmlFor="add-transaction-withholding" className="block text-sm font-medium text-gray-300 mb-2">
                      Tax withheld
                    </label>
                    <input id="add-transaction-withholding"
                        type="text"
                      inputMode="decimal"
                      value={formData.withholding_tax || ''}
                        aria-describedby={!taxManuallyEdited.current && formData.withholding_tax ? 'add-withholding-hint' : undefined}
                      onChange={(e) => handleWithholdingTaxChange(e.target.value)}
                      className="w-full px-4 py-3 bg-surface-elevated border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500/50 text-white placeholder:text-gray-400"
                      placeholder="1.50"
                    />
                    {!taxManuallyEdited.current && formData.withholding_tax && <p id="add-withholding-hint" className="mt-1.5 text-xs leading-relaxed text-gray-400">Suggested amount. Check your statement.</p>}
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
                    <label htmlFor="add-transaction-shares" className="block text-sm font-medium text-gray-300 mb-2">
                      Shares
                    </label>
                    <input id="add-transaction-shares"
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
                    <label htmlFor="add-transaction-price" className="block text-sm font-medium text-gray-300 mb-2">
                      Price per share ({formData.currency})
                    </label>
                    <div className="relative">
                      <input id="add-transaction-price"
                        type="text"
                        inputMode="decimal"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: normalizeDecimal(e.target.value) })}
                        className="w-full px-4 py-3 pr-12 bg-surface-elevated border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500/50 text-white placeholder:text-gray-400"
                        placeholder="150.00"
                        required
                      />
                      {/* Currency toggle inside price field */}
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
              <label htmlFor="add-transaction-date" className="block text-sm font-medium text-gray-300 mb-2">
                Date
              </label>
              <input id="add-transaction-date"
                        type="date"
                value={formData.date}
                onChange={(event) => setFormData((current) => ({ ...current, date: event.target.value }))}
                className="w-full px-4 py-3 bg-surface-elevated border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500/50 text-white"
                required
              />
            </div>

            {/* Action Button - Full width, prominent */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-4 rounded-xl text-white font-semibold transition-all disabled:opacity-50 active:scale-[0.98] ${
                isDividend
                  ? 'bg-violet-500 hover:bg-violet-600'
                  : isBuy 
                    ? 'bg-emerald-500 hover:bg-emerald-600' 
                    : 'bg-rose-500 hover:bg-rose-600'
              }`}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Adding...
                </span>
              ) : (
                isDividend
                  ? 'Save dividend'
                  : 'Save transaction'
              )}
            </button>

            {/* Cancel - Text link style */}
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
