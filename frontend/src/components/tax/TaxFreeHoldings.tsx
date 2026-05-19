import React, { useState, useEffect, useMemo } from 'react'
import { taxService } from '../../services'
import { TaxFreeHolding } from '../../types'
import { usePrivacyMode } from '../../hooks'
import { PRIVACY_MASK } from '../../hooks/usePrivacyMode'

/**
 * Tax-Free Holdings Component
 * Slovak Tax Rules: Shares held > 365 days are tax-free
 * Uses FIFO accounting to track share lots
 */
export const TaxFreeHoldings: React.FC = () => {
  const [taxFreeData, setTaxFreeData] = useState<TaxFreeHolding[]>([])
  const [loading, setLoading] = useState(true)
  const [showDetails, setShowDetails] = useState(false)
  const { isPrivate } = usePrivacyMode()

  const fetchTaxFreeData = async () => {
    try {
      setLoading(true)
      const data = await taxService.getTaxFreeHoldings()
      setTaxFreeData(data)
    } catch (error) {
      console.error('Failed to fetch tax-free data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTaxFreeData()
  }, [])

  // Calculate days until a date (must be before useMemo)
  const daysUntil = (dateStr: string): number => {
    const target = new Date(dateStr)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    target.setHours(0, 0, 0, 0)
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  // Format days remaining
  const formatDaysRemaining = (dateStr: string): string => {
    const days = daysUntil(dateStr)
    if (days <= 0) return 'Now'
    if (days === 1) return '1 day'
    if (days < 30) return `${days} days`
    if (days < 365) return `${Math.round(days / 30)} mo`
    return `${(days / 365).toFixed(1)} yr`
  }

  // Calculate derived values (must be before early returns to satisfy hooks rules)
  const totalShares = taxFreeData.reduce((sum, h) => sum + h.total_shares, 0)
  const totalTaxFree = taxFreeData.reduce((sum, h) => sum + h.tax_free_shares, 0)
  const overallTaxFreePct = totalShares > 0 ? (totalTaxFree / totalShares * 100) : 0
  const isFullyTaxFree = overallTaxFreePct >= 100

  // Find next upcoming tax-free date across all holdings (useMemo must be called before any returns)
  const nextUpcoming = useMemo(() => {
    if (taxFreeData.length === 0) return null
    const withDates = taxFreeData
      .filter(h => h.next_tax_free_date)
      .map(h => ({ ...h, daysLeft: daysUntil(h.next_tax_free_date!) }))
      .sort((a, b) => a.daysLeft - b.daysLeft)
    return withDates[0] || null
  }, [taxFreeData])

  if (loading) {
    return (
      <div className="glass rounded-xl p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-white/5 rounded w-1/4 mb-4"></div>
          <div className="h-8 bg-white/5 rounded"></div>
        </div>
      </div>
    )
  }

  if (taxFreeData.length === 0) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <div className="text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9 12l2 2 4-4"/>
          </svg>
          <p>No holdings found. Add transactions to see tax analysis.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="glass rounded-xl overflow-hidden">
      {/* Summary Header */}
      <div className={`px-4 sm:px-5 py-4 border-b border-white/5 ${
        isFullyTaxFree
          ? 'bg-emerald-500/10'
          : ''
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isFullyTaxFree ? 'bg-emerald-500/20' : 'bg-white/5'
            }`}>
              <svg className={`w-5 h-5 ${isFullyTaxFree ? 'text-emerald-400' : 'text-gray-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9 12l2 2 4-4"/>
              </svg>
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-white tracking-tight">
                {isFullyTaxFree ? (
                  'All Shares Tax-Free!'
                ) : (
                  'Tax-Free Holdings'
                )}
              </h3>
              <span className="text-xs sm:text-sm text-gray-500">
                {isFullyTaxFree ? (
                  <span>{taxFreeData.length} holdings · {isPrivate ? PRIVACY_MASK : `${totalTaxFree.toFixed(0)} shares`}</span>
                ) : (
                  <span>FIFO · 365-day rule</span>
                )}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className={`text-2xl sm:text-3xl font-semibold tracking-tight ${isFullyTaxFree ? 'text-emerald-400' : 'text-white'}`}>
              {overallTaxFreePct.toFixed(1)}%
            </div>
            <div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider">Tax-Free</div>
          </div>
        </div>
      </div>

      {/* Compact Celebration View when 100% */}
      {isFullyTaxFree ? (
        <div className="p-4 sm:p-5">
          {/* Celebration message */}
          <div className="text-center py-6">
            <div className="text-4xl mb-3">🎉</div>
            <p className="text-gray-300 text-sm sm:text-base">
              All your holdings have passed the 365-day threshold
            </p>
            <p className="text-gray-500 text-xs sm:text-sm mt-1">
              Capital gains on these shares are tax-exempt
            </p>
          </div>

          {/* Compact ticker list */}
          <div className="flex flex-wrap gap-2 justify-center py-4 border-t border-white/5">
            {taxFreeData.map((holding) => (
              <span
                key={holding.ticker}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs sm:text-sm font-medium"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
                {holding.ticker}
              </span>
            ))}
          </div>

          {/* Expand button */}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full mt-3 py-2 text-xs text-gray-500 hover:text-white transition-colors flex items-center justify-center gap-1"
          >
            <span>{showDetails ? 'Hide' : 'Show'} details</span>
            <svg className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>

          {/* Expandable details */}
          {showDetails && (
            <div className="mt-3 space-y-1.5 border-t border-white/5 pt-3">
              {taxFreeData.map((holding) => (
                <div key={holding.ticker} className="flex items-center justify-between px-4 py-2.5 bg-white/[0.02] rounded-xl text-sm">
                  <span className="font-mono text-accent-400">{holding.ticker}</span>
                  <span className="text-gray-400">{isPrivate ? PRIVACY_MASK : `${holding.total_shares.toFixed(2)} shares`}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Regular Holdings List when not 100% */
        <div className="p-4 sm:p-5 space-y-2">
          {taxFreeData.map((holding) => (
            <div
              key={holding.ticker}
              className="bg-white/[0.02] rounded-xl p-3 sm:p-4 hover:bg-white/[0.04] transition-colors"
            >
              {/* Row: Ticker + Progress + Next Date */}
              <div className="flex items-center gap-3 sm:gap-4">
                {/* Ticker */}
                <div className="w-20 sm:w-24 flex-shrink-0">
                  <span className="font-mono text-sm sm:text-base font-medium text-accent-400">{holding.ticker}</span>
                </div>

                {/* Progress Section */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 sm:gap-3">
                    {/* Progress bar */}
                    <div className="flex-1 h-1.5 sm:h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          holding.tax_free_pct >= 100
                            ? 'bg-emerald-500'
                            : holding.tax_free_pct >= 50
                            ? 'bg-emerald-600'
                            : 'bg-gray-600'
                        }`}
                        style={{ width: `${Math.min(holding.tax_free_pct, 100)}%` }}
                      />
                    </div>
                    {/* Percentage */}
                    <span className={`text-sm sm:text-base font-medium w-12 text-right ${
                      holding.tax_free_pct >= 100 ? 'text-emerald-400' :
                      holding.tax_free_pct >= 50 ? 'text-emerald-500' : 'text-gray-400'
                    }`}>
                      {holding.tax_free_pct.toFixed(0)}%
                    </span>
                  </div>
                  {/* Shares breakdown - desktop */}
                  <div className="hidden sm:flex items-center gap-4 mt-1.5 text-xs text-gray-500">
                    {isPrivate ? (
                      <span className="text-gray-500">{PRIVACY_MASK}</span>
                    ) : (
                      <>
                        <span><span className="text-gray-400">{holding.tax_free_shares.toFixed(2)}</span> tax-free</span>
                        <span><span className="text-gray-400">{holding.taxable_shares.toFixed(2)}</span> taxable</span>
                        <span className="text-gray-600">of {holding.total_shares.toFixed(2)}</span>
                      </>
                    )}
                  </div>
                  {/* Shares breakdown - mobile */}
                  <div className="sm:hidden mt-1 text-[10px] text-gray-500">
                    {isPrivate ? (
                      <span className="text-gray-500">{PRIVACY_MASK}</span>
                    ) : (
                      <>
                        <span className="text-gray-400">{holding.tax_free_shares.toFixed(1)}</span>
                        <span className="text-gray-600"> / </span>
                        <span className="text-gray-500">{holding.total_shares.toFixed(1)} shares</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Next Tax-Free with Days Countdown */}
                <div className="w-24 sm:w-32 flex-shrink-0 text-right">
                  {holding.next_tax_free_date ? (
                    <div>
                      <div className={`text-sm sm:text-base font-medium ${
                        daysUntil(holding.next_tax_free_date) <= 30 ? 'text-amber-400' : 'text-gray-300'
                      }`}>
                        {formatDaysRemaining(holding.next_tax_free_date)}
                      </div>
                      <div className="text-[10px] sm:text-xs text-gray-500">
                        {isPrivate ? PRIVACY_MASK : `+${holding.next_tax_free_shares.toFixed(holding.next_tax_free_shares < 10 ? 2 : 1)} shares`}
                      </div>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs sm:text-sm text-emerald-400">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5"/>
                      </svg>
                      <span className="hidden sm:inline">Done</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Next upcoming summary */}
          {nextUpcoming && (
            <div className="flex items-center gap-2 pt-3 px-1 text-xs text-gray-500">
              <svg className="w-3.5 h-3.5 text-amber-500/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
              <span>
                Next: <span className="text-gray-400">{nextUpcoming.ticker}</span> in{' '}
                <span className="text-amber-400">{formatDaysRemaining(nextUpcoming.next_tax_free_date!)}</span>
              </span>
            </div>
          )}

          {/* Info - Simple inline with per-lot explanation */}
          <div className="flex items-start gap-2 pt-2 text-xs text-gray-500">
            <svg className="w-3.5 h-3.5 text-gray-600 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
            <span>
              FIFO accounting · Each purchase lot (including fractional shares) has its own 365-day countdown from acquisition date
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
