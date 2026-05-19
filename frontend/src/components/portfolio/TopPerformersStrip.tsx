import React, { useMemo } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { Holding } from '../../types'
import { usePrivacyMode } from '../../hooks'
import { PRIVACY_MASK } from '../../hooks/usePrivacyMode'

interface TopPerformersStripProps {
  holdings: Holding[]
}

/**
 * Three-card strip: top 3 holdings by unrealized return %.
 * Excludes holdings with estimated prices (no real quote) to avoid
 * ranking by cost basis, and ties are broken by current value so
 * equal-% rows stay stable.
 */
export const TopPerformersStrip: React.FC<TopPerformersStripProps> = ({ holdings }) => {
  const { isPrivate } = usePrivacyMode()

  const top3 = useMemo(() => {
    return holdings
      .filter(h => h.price_status !== 'estimated')
      .slice()
      .sort((a, b) => {
        if (b.gain_loss_pct !== a.gain_loss_pct) return b.gain_loss_pct - a.gain_loss_pct
        return b.current_value_eur - a.current_value_eur
      })
      .slice(0, 3)
  }, [holdings])

  if (top3.length === 0) return null

  return (
    <section aria-labelledby="top-performers-heading" className="space-y-2 sm:space-y-3">
      <h3 id="top-performers-heading" className="text-sm font-medium text-gray-400 uppercase tracking-wider">
        Top Performers
      </h3>

      {/* Mobile: compact horizontal row */}
      <div className="flex gap-2 sm:hidden">
        {top3.map((h, idx) => {
          const isGain = h.gain_loss_pct >= 0
          const colorClass = isGain ? 'text-gain' : 'text-loss'
          return (
            <div key={h.ticker} className="glass rounded-xl px-3 py-2 flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-medium text-gray-500">#{idx + 1}</span>
                <span className="truncate text-xs font-medium text-white">{h.ticker}</span>
              </div>
              <div className={`text-sm font-semibold tabular-nums mt-0.5 ${isPrivate ? 'text-gray-500' : colorClass}`}>
                {isPrivate
                  ? PRIVACY_MASK
                  : `${h.gain_loss_pct >= 0 ? '+' : ''}${h.gain_loss_pct.toFixed(1)}%`}
              </div>
            </div>
          )
        })}
      </div>

      {/* Desktop: full 3-column grid */}
      <div className="hidden sm:grid sm:grid-cols-3 gap-3">
        {top3.map((h, idx) => {
          const isGain = h.gain_loss_pct >= 0
          const colorClass = isGain ? 'text-gain' : 'text-loss'
          const Icon = isGain ? TrendingUp : TrendingDown
          return (
            <div key={h.ticker} className="glass rounded-xl p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-xs font-medium text-gray-500 tabular-nums">#{idx + 1}</span>
                  <span className="truncate font-medium text-white">{h.ticker}</span>
                </div>
                <Icon className={`h-4 w-4 ${colorClass}`} aria-hidden="true" />
              </div>
              <div>
                <div className={`text-2xl font-semibold tracking-tight tabular-nums ${isPrivate ? 'text-gray-500' : colorClass}`}>
                  {isPrivate
                    ? PRIVACY_MASK
                    : `${h.gain_loss_pct >= 0 ? '+' : ''}${h.gain_loss_pct.toFixed(2)}%`}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {isPrivate
                    ? PRIVACY_MASK
                    : `${h.gain_loss >= 0 ? '+' : '-'}${h.currency === 'USD' ? '$' : h.currency === 'EUR' ? '€' : ''}${Math.abs(h.gain_loss).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
