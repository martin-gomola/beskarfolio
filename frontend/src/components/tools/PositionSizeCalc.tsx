import React, { useState } from 'react'
import { normalizeDecimal } from '../../utils'

interface PositionSizeCalcProps {
  onClose: () => void
}

export const PositionSizeCalc: React.FC<PositionSizeCalcProps> = ({ onClose }) => {
  const [amount, setAmount] = useState('')
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState<'USD' | 'EUR'>('USD')

  const amountNum = parseFloat(amount) || 0
  const priceNum = parseFloat(price) || 0
  const hasResult = amountNum > 0 && priceNum > 0

  const exactShares = hasResult ? amountNum / priceNum : 0
  const wholeShares = Math.floor(exactShares)
  const wholeCost = wholeShares * priceNum
  const remainder = amountNum - wholeCost
  const sym = currency === 'USD' ? '$' : '€'

  const handleClear = () => { setAmount(''); setPrice('') }

  return (
    <>
      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-accent-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <path d="M12 12h.01" />
            <path d="M17 12h.01" />
            <path d="M7 12h.01" />
          </svg>
          <span className="text-sm font-medium text-white">Position Size</span>
        </div>
        <div className="flex items-center gap-1">
          {(amount || price) && (
            <button onClick={handleClear} className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded transition-colors">
              Clear
            </button>
          )}
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1 rounded transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="px-5 pb-5 space-y-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Investment Amount</label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(normalizeDecimal(e.target.value))}
              className="w-full px-3 py-2.5 pr-12 bg-surface-elevated border border-white/5 rounded-xl text-white text-right font-medium placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-accent-500/50"
              placeholder="500.00"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setCurrency(c => c === 'USD' ? 'EUR' : 'USD')}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg text-sm font-medium bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
            >
              {sym}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Price Per Share</label>
          <input
            type="text"
            inputMode="decimal"
            value={price}
            onChange={e => setPrice(normalizeDecimal(e.target.value))}
            className="w-full px-3 py-2.5 bg-surface-elevated border border-white/5 rounded-xl text-white text-right font-medium placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-accent-500/50"
            placeholder="195.00"
          />
        </div>

        {hasResult && (
          <div className="space-y-2 pt-1">
            {/* Fractional shares */}
            <div className="px-4 py-3 rounded-xl border border-accent-500/20 bg-accent-500/10 text-center">
              <div className="text-2xl font-bold text-accent-400 tracking-tight">
                {exactShares.toFixed(4)}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                fractional shares &middot; {sym}{amountNum.toFixed(2)}
              </div>
            </div>

            {/* Whole shares breakdown */}
            <div className="px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Whole shares</span>
                <span className="text-white font-medium">{wholeShares}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Cost</span>
                <span className="text-white font-medium">{sym}{wholeCost.toFixed(2)}</span>
              </div>
              {remainder > 0.005 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Remainder</span>
                  <span className="text-yellow-400 font-medium">{sym}{remainder.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
