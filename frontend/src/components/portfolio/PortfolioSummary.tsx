import React, { useEffect, useMemo, useRef, useState } from 'react'
import { PortfolioSummary as PortfolioSummaryType } from '../../types'
import { usePriceStatus, usePrivacyMode } from '../../hooks'
import { useAnnualPerformance } from '../../hooks/useAnnualPerformance'
import { PRIVACY_MASK } from '../../hooks/usePrivacyMode'

/**
 * Format number with full precision
 */
const formatNumber = (value: number): string => {
  return value.toLocaleString('en-US', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })
}

interface PortfolioSummaryProps {
  summary: PortfolioSummaryType | null
  onRefreshPrices?: () => Promise<boolean>
}

/**
 * Portfolio Overview Card
 * Displays total value, invested amount, returns, and key metrics
 */
export const PortfolioSummary: React.FC<PortfolioSummaryProps> = ({ summary, onRefreshPrices }) => {
  const { priceStatus } = usePriceStatus()
  const { isPrivate } = usePrivacyMode()
  const { performanceData, loading: perfLoading } = useAnnualPerformance()
  if (!summary || summary.transaction_count === 0) {
    return null
  }

  const returnColor = summary.total_gain_loss_pct >= 0 ? 'text-gain' : 'text-loss'
  const [isInfoOpen, setIsInfoOpen] = useState(false)
  const [priceRefreshState, setPriceRefreshState] = useState<'idle' | 'loading' | 'error'>('idle')
  const infoRef = useRef<HTMLDivElement | null>(null)

  // YTD is the current-year row when the backend flags it.
  // Avg annual is the arithmetic mean of completed calendar years only
  // (excludes the partial current year to avoid biasing the headline).
  const { ytdPct, avgAnnualPct, completedYearCount } = useMemo(() => {
    const years = performanceData?.years ?? []
    const current = years.find(y => y.is_current_year) ?? null
    const completed = years.filter(y => !y.is_current_year)
    const mean = completed.length > 0
      ? completed.reduce((acc, y) => acc + y.total_gain_pct, 0) / completed.length
      : null
    return {
      ytdPct: current?.total_gain_pct ?? null,
      avgAnnualPct: mean,
      completedYearCount: completed.length,
    }
  }, [performanceData])

  // Format price update info using status_counts from API
  const getPriceInfo = () => {
    if (!priceStatus || !priceStatus.has_prices) {
      return { text: 'No price data', color: 'text-gray-500' }
    }

    // Use pre-computed counts from API (no iteration needed)
    const { cached = 0, recent = 0, stale = 0 } = priceStatus.status_counts || {}
    const totalFresh = cached + recent
    const allFresh = totalFresh === priceStatus.prices_count
    const allStale = stale === priceStatus.prices_count

    let lastUpdate = 'Unknown'
    let color = 'text-gray-400'

    if (priceStatus.last_update) {
      try {
        const date = new Date(priceStatus.last_update)
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffMins = Math.floor(diffMs / 60000)
        const diffHours = Math.floor(diffMs / 3600000)

        if (diffMins < 1) {
          lastUpdate = 'Just now'
          color = 'text-green-400'
        } else if (diffMins < 60) {
          lastUpdate = `${diffMins}m ago`
          color = 'text-green-400'
        } else if (diffHours < 24) {
          lastUpdate = `${diffHours}h ago`
          color = allFresh ? 'text-green-400' : 'text-yellow-400'
        } else {
          const days = Math.floor(diffHours / 24)
          lastUpdate = `${days}d ago`
          color = allStale ? 'text-red-400' : 'text-yellow-400'
        }
      } catch {
        lastUpdate = 'Unknown'
      }
    }

    return {
      text: lastUpdate,
      color,
      tooltip: allFresh
        ? 'All prices current'
        : allStale
        ? `All prices stale (${stale} need update)`
        : `${totalFresh} current, ${stale} stale`
    }
  }

  const priceInfo = getPriceInfo()
  const pricesNeedAttention = priceInfo.color === 'text-yellow-400' || priceInfo.color === 'text-red-400'

  const refreshPrices = async () => {
    if (!onRefreshPrices || priceRefreshState === 'loading') return
    setPriceRefreshState('loading')
    const succeeded = await onRefreshPrices()
    setPriceRefreshState(succeeded ? 'idle' : 'error')
  }
  
  const getPriceIndicator = () => {
    if (!priceStatus || !priceStatus.has_prices) return { dotClass: 'bg-gray-500', label: 'No data' }
    
    const { color, text } = priceInfo
    
    if (color === 'text-green-400') {
      return { dotClass: 'bg-green-400', label: text }
    } else if (color === 'text-yellow-400') {
      return { dotClass: 'bg-yellow-400', label: text }
    } else if (color === 'text-red-400') {
      return { dotClass: 'bg-red-400', label: text }
    } else {
      return { dotClass: 'bg-gray-500', label: text }
    }
  }
  
  const priceIndicator = getPriceIndicator()

  useEffect(() => {
    if (!isInfoOpen) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsInfoOpen(false)
    }

    const onPointerDown = (e: MouseEvent | PointerEvent) => {
      if (!infoRef.current) return
      if (infoRef.current.contains(e.target as Node)) return
      setIsInfoOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [isInfoOpen])

  return (
    <div className="space-y-4">
      {/* Header - Cleaner, more minimal */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-white tracking-tight font-heading">Portfolio Overview</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {summary.holdings_count} holdings · {summary.transaction_count} transactions
            {priceStatus && priceStatus.has_prices && (
              <span className={`${pricesNeedAttention ? 'hidden' : 'mt-0.5 flex items-center gap-1 sm:mt-0 sm:ml-2 sm:inline-flex'}`}>
                <span className="hidden sm:inline" aria-hidden="true">·&nbsp;</span>
                Prices:
                <span className={`inline-block w-2 h-2 rounded-full ${priceIndicator.dotClass}`} aria-hidden="true" />
                <span className={priceInfo.color}>{priceIndicator.label}</span>
              </span>
            )}
          </p>
          {!!summary.estimated_holdings_count && (
            <p className="text-xs text-amber-400 mt-1">
              {summary.estimated_holdings_count} holding{summary.estimated_holdings_count === 1 ? '' : 's'} currently {summary.estimated_holdings_count === 1 ? 'uses' : 'use'} cost basis because no quote was available.
            </p>
          )}
        </div>
        <div className="relative" ref={infoRef}>
          <button
            type="button"
            onClick={() => setIsInfoOpen(v => !v)}
            aria-label="About unrealized profit"
            aria-expanded={isInfoOpen}
            className="p-2 rounded-xl text-gray-500 hover:text-white hover:bg-white/5 transition-all"
            title="What does this show?"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
          </button>

          {isInfoOpen && (
            <div
              role="dialog"
              aria-label="Portfolio overview help"
              className="absolute right-0 top-full mt-2 w-[280px] sm:w-[320px] bg-surface-dark border border-white/10 rounded-xl shadow-2xl p-4 text-sm text-gray-300 z-50"
            >
              <div className="text-white font-medium mb-2">What this shows</div>
              <div className="text-gray-400 leading-relaxed">
                This shows profit on <span className="text-white">current open positions</span> only.
                For total gains including realized profits, check the <span className="text-white">Performance</span> tab.
              </div>
            </div>
          )}
        </div>
      </div>

      {pricesNeedAttention && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2.5">
          <div className="min-w-0">
            <div className="text-sm font-medium text-amber-200">
              Last price update: {priceIndicator.label}
            </div>
            <div className="text-xs text-amber-200/60">
              Refresh before relying on today&apos;s portfolio value.
            </div>
            {priceRefreshState === 'error' && (
              <div role="alert" className="mt-1 text-xs text-loss">
                Prices could not be refreshed. Try again later.
              </div>
            )}
          </div>
          {onRefreshPrices && (
            <button
              type="button"
              onClick={refreshPrices}
              disabled={priceRefreshState === 'loading'}
              className="min-h-11 shrink-0 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-300/15 focus:outline-none focus:ring-2 focus:ring-amber-300/50 disabled:cursor-wait disabled:opacity-60"
            >
              {priceRefreshState === 'loading' ? 'Updating…' : 'Update'}
            </button>
          )}
        </div>
      )}

      {/* Mobile: one clear answer first, secondary performance beneath it. */}
      <div className="glass rounded-xl p-4 sm:hidden">
        <div className="text-xs font-medium uppercase tracking-wider text-gray-500">Portfolio value</div>
        <div className="mt-1 text-3xl font-semibold tracking-tight text-white">
          {isPrivate ? PRIVACY_MASK : `€${formatNumber(summary.total_value)}`}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/5 pt-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Total return</div>
            <div className={`mt-1 text-xl font-semibold tabular-nums ${isPrivate ? 'text-gray-500' : returnColor}`}>
              {isPrivate ? PRIVACY_MASK : `${summary.total_gain_loss_pct >= 0 ? '+' : ''}${summary.total_gain_loss_pct.toFixed(2)}%`}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Profit & loss</div>
            <div className={`mt-1 text-xl font-semibold tabular-nums ${isPrivate ? 'text-gray-500' : returnColor}`}>
              {isPrivate ? PRIVACY_MASK : `${summary.total_gain_loss >= 0 ? '+' : '-'}€${formatNumber(Math.abs(summary.total_gain_loss))}`}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-sm">
          <span className="text-gray-500">
            Invested {isPrivate ? PRIVACY_MASK : `€${formatNumber(summary.total_invested)}`}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:hidden">
        <div className="rounded-xl border border-white/5 bg-white/[0.025] px-3 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">YTD</div>
          <div className={`mt-1 text-lg font-semibold tabular-nums ${
            isPrivate || ytdPct === null ? 'text-gray-500' : ytdPct >= 0 ? 'text-gain' : 'text-loss'
          }`}>
            {perfLoading ? 'Loading…' : isPrivate ? PRIVACY_MASK : ytdPct === null ? 'Not available' : `${ytdPct >= 0 ? '+' : ''}${ytdPct.toFixed(2)}%`}
          </div>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.025] px-3 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Avg annual{completedYearCount > 0 ? ` (${completedYearCount}y)` : ''}
          </div>
          <div className={`mt-1 text-lg font-semibold tabular-nums ${
            isPrivate || avgAnnualPct === null ? 'text-gray-500' : avgAnnualPct >= 0 ? 'text-gain' : 'text-loss'
          }`}>
            {perfLoading ? 'Loading…' : isPrivate ? PRIVACY_MASK : avgAnnualPct === null ? 'Not available' : `${avgAnnualPct >= 0 ? '+' : ''}${avgAnnualPct.toFixed(2)}%`}
          </div>
        </div>
      </div>

      {/* Metrics Grid — left column (amounts) wider, right column (%) narrower */}
      <div className="hidden grid-cols-[3fr_2fr] gap-3 sm:grid">
        {/* Row 1: Value | Return */}
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wider mb-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="20" height="12" rx="2"/>
              <circle cx="12" cy="12" r="2"/>
              <path d="M6 12h.01M18 12h.01"/>
            </svg>
            Value
          </div>
          <div className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
            {isPrivate ? PRIVACY_MASK : `€${formatNumber(summary.total_value)}`}
          </div>
        </div>

        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wider mb-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
            Return
          </div>
          <div className={`text-2xl sm:text-3xl font-semibold tracking-tight ${isPrivate ? 'text-gray-500' : returnColor}`}>
            {isPrivate ? PRIVACY_MASK : `${summary.total_gain_loss_pct >= 0 ? '+' : ''}${summary.total_gain_loss_pct.toFixed(2)}%`}
          </div>
        </div>

        {/* Row 2: Invested | Avg Annual */}
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wider mb-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M19 12l-7 7-7-7"/>
            </svg>
            Invested
          </div>
          <div className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
            {isPrivate ? PRIVACY_MASK : `€${formatNumber(summary.total_invested)}`}
          </div>
        </div>

        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wider mb-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 3v18h18" />
              <path d="M7 14l4-4 3 3 5-6" />
            </svg>
            Annual
            {!perfLoading && avgAnnualPct !== null && completedYearCount > 0 && (
              <span className="text-gray-500 normal-case tracking-normal">({completedYearCount}y)</span>
            )}
          </div>
          {perfLoading ? (
            <div className="h-8 sm:h-9 w-24 rounded bg-white/5 animate-pulse" aria-hidden="true" />
          ) : avgAnnualPct === null ? (
            <div className="text-2xl sm:text-3xl font-semibold text-gray-500 tracking-tight">—</div>
          ) : (
            <div
              className={`text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums ${
                isPrivate ? 'text-gray-500' : avgAnnualPct >= 0 ? 'text-gain' : 'text-loss'
              }`}
            >
              {isPrivate ? PRIVACY_MASK : `${avgAnnualPct >= 0 ? '+' : ''}${avgAnnualPct.toFixed(2)}%`}
            </div>
          )}
        </div>

        {/* Row 3: P&L | YTD */}
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wider mb-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
            P&L
          </div>
          <div className={`text-2xl sm:text-3xl font-semibold tracking-tight ${isPrivate ? 'text-gray-500' : returnColor}`}>
            {isPrivate ? PRIVACY_MASK : `${summary.total_gain_loss >= 0 ? '+' : '-'}€${formatNumber(Math.abs(summary.total_gain_loss))}`}
          </div>
        </div>

        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wider mb-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            YTD
          </div>
          {perfLoading ? (
            <div className="h-8 sm:h-9 w-24 rounded bg-white/5 animate-pulse" aria-hidden="true" />
          ) : ytdPct === null ? (
            <div className="text-2xl sm:text-3xl font-semibold text-gray-500 tracking-tight">—</div>
          ) : (
            <div
              className={`text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums ${
                isPrivate ? 'text-gray-500' : ytdPct >= 0 ? 'text-gain' : 'text-loss'
              }`}
            >
              {isPrivate ? PRIVACY_MASK : `${ytdPct >= 0 ? '+' : ''}${ytdPct.toFixed(2)}%`}
            </div>
          )}
        </div>
      </div>

      {/* CSS note: .glass is defined in index.css for the frosted-panel look */}
    </div>
  )
}
