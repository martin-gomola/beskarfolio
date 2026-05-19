import React, { useState } from 'react'
import { normalizeDecimal } from '../../utils'

interface PctChangeCalcProps {
  onClose: () => void
}

export const PctChangeCalc: React.FC<PctChangeCalcProps> = ({ onClose }) => {
  const [before, setBefore] = useState('')
  const [after, setAfter] = useState('')

  const beforeNum = parseFloat(before) || 0
  const afterNum = parseFloat(after) || 0
  const hasResult = beforeNum !== 0 && after !== ''
  const pctChange = hasResult ? ((afterNum - beforeNum) / Math.abs(beforeNum)) * 100 : 0
  const absChange = afterNum - beforeNum
  const isPositive = pctChange > 0
  const isZero = pctChange === 0

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-accent-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="5" x2="5" y2="19" />
            <circle cx="6.5" cy="6.5" r="2.5" />
            <circle cx="17.5" cy="17.5" r="2.5" />
          </svg>
          <span className="text-sm font-medium text-white">Percentage Change</span>
        </div>
        <div className="flex items-center gap-1">
          {(before || after) && (
            <button onClick={() => { setBefore(''); setAfter('') }} className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded transition-colors">
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

      {/* Inputs */}
      <div className="p-4 space-y-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Before</label>
          <input
            type="text"
            inputMode="decimal"
            value={before}
            onChange={e => setBefore(normalizeDecimal(e.target.value))}
            className="w-full px-3 py-2.5 bg-surface-elevated border border-white/5 rounded-xl text-white text-right text-lg font-medium placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-accent-500/50"
            placeholder="0"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">After</label>
          <input
            type="text"
            inputMode="decimal"
            value={after}
            onChange={e => setAfter(normalizeDecimal(e.target.value))}
            className="w-full px-3 py-2.5 bg-surface-elevated border border-white/5 rounded-xl text-white text-right text-lg font-medium placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-accent-500/50"
            placeholder="0"
          />
        </div>

        {hasResult && (
          <div className={`mt-1 px-4 py-3 rounded-xl border text-center ${
            isZero
              ? 'bg-gray-500/10 border-gray-500/20'
              : isPositive
                ? 'bg-emerald-500/10 border-emerald-500/20'
                : 'bg-rose-500/10 border-rose-500/20'
          }`}>
            <div className={`text-2xl font-bold tracking-tight ${
              isZero ? 'text-gray-400' : isPositive ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {isPositive ? '+' : ''}{pctChange.toFixed(2)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {isPositive ? '+' : ''}{absChange.toFixed(2)} change
            </div>
          </div>
        )}
      </div>
    </>
  )
}
