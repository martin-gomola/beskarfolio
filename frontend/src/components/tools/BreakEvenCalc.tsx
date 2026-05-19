import React, { useState } from 'react'
import { normalizeDecimal } from '../../utils'

interface BreakEvenCalcProps {
  onClose: () => void
}

export const BreakEvenCalc: React.FC<BreakEvenCalcProps> = ({ onClose }) => {
  const [avgPrice, setAvgPrice] = useState('')
  const [shares, setShares] = useState('')
  const [currentPrice, setCurrentPrice] = useState('')
  const [dcaShares, setDcaShares] = useState('')

  const avg = parseFloat(avgPrice) || 0
  const qty = parseFloat(shares) || 0
  const current = parseFloat(currentPrice) || 0
  const dcaQty = parseFloat(dcaShares) || 0

  const hasPosition = avg > 0 && qty > 0
  const hasCurrent = hasPosition && current > 0

  const pl = hasCurrent ? (current - avg) * qty : 0
  const plPct = hasCurrent ? ((current - avg) / avg) * 100 : 0
  const isUp = pl > 0

  const isDown = hasCurrent && current < avg

  const hasDca = hasCurrent && dcaQty > 0
  const newAvg = hasDca ? ((avg * qty) + (current * dcaQty)) / (qty + dcaQty) : 0
  const newPl = hasDca ? (current - newAvg) * (qty + dcaQty) : 0
  const newPlPct = hasDca && newAvg > 0 ? ((current - newAvg) / newAvg) * 100 : 0

  const handleClear = () => { setAvgPrice(''); setShares(''); setCurrentPrice(''); setDcaShares('') }

  return (
    <>
      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-accent-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h18" />
            <path d="M8 7l-5 5 5 5" />
            <path d="M16 7l5 5-5 5" />
          </svg>
          <span className="text-sm font-medium text-white">Break-Even</span>
        </div>
        <div className="flex items-center gap-1">
          {(avgPrice || shares || currentPrice || dcaShares) && (
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
        {/* Position inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Avg Buy Price</label>
            <input
              type="text"
              inputMode="decimal"
              value={avgPrice}
              onChange={e => setAvgPrice(normalizeDecimal(e.target.value))}
              className="w-full px-3 py-2.5 bg-surface-elevated border border-white/5 rounded-xl text-white text-right font-medium placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-accent-500/50"
              placeholder="150.00"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Shares</label>
            <input
              type="text"
              inputMode="decimal"
              value={shares}
              onChange={e => setShares(normalizeDecimal(e.target.value))}
              className="w-full px-3 py-2.5 bg-surface-elevated border border-white/5 rounded-xl text-white text-right font-medium placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-accent-500/50"
              placeholder="10"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Current Price</label>
          <input
            type="text"
            inputMode="decimal"
            value={currentPrice}
            onChange={e => setCurrentPrice(normalizeDecimal(e.target.value))}
            className="w-full px-3 py-2.5 bg-surface-elevated border border-white/5 rounded-xl text-white text-right font-medium placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-accent-500/50"
            placeholder="135.00"
          />
        </div>

        {/* P/L result */}
        {hasCurrent && (
          <div className={`px-4 py-3 rounded-xl border text-center ${
            isUp ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'
          }`}>
            <div className={`text-xl font-bold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isUp ? '+' : ''}{pl.toFixed(2)}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {isUp ? '+' : ''}{plPct.toFixed(2)}% &middot; Break-even at {avg.toFixed(2)}
            </div>
          </div>
        )}

        {/* DCA section */}
        {hasCurrent && (
          <>
            <div className="border-t border-white/[0.06] pt-3">
              <div className="flex items-baseline justify-between mb-1">
                <label className="text-xs text-gray-500">DCA: Buy more at current price</label>
                {isDown && (
                  <div className="flex gap-1.5">
                    {[0.25, 0.5, 1].map(pct => {
                      const n = Math.ceil(qty * pct)
                      return (
                        <button
                          key={pct}
                          onClick={() => setDcaShares(n.toString())}
                          className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                            dcaShares === n.toString()
                              ? 'bg-accent-500/20 text-accent-400'
                              : 'text-gray-500 hover:text-gray-300'
                          }`}
                        >
                          +{n}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={dcaShares}
                onChange={e => setDcaShares(normalizeDecimal(e.target.value))}
                className="w-full px-3 py-2.5 bg-surface-elevated border border-white/5 rounded-xl text-white text-right font-medium placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-accent-500/50"
                placeholder="5"
              />
            </div>

            {hasDca && (
              <div className="px-4 py-3 rounded-xl border border-accent-500/20 bg-accent-500/10 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">DCA cost</span>
                  <span className="text-white font-medium">{(current * dcaQty).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">New avg price</span>
                  <span className="text-white font-medium">{newAvg.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Total shares</span>
                  <span className="text-white font-medium">{(qty + dcaQty).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">New P/L</span>
                  <span className={`font-medium ${newPl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {newPl >= 0 ? '+' : ''}{newPl.toFixed(2)} ({newPlPct >= 0 ? '+' : ''}{newPlPct.toFixed(2)}%)
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
