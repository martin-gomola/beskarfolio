import React, { useEffect, useRef, useState } from 'react'
import { useAnnualPerformance } from '../../hooks/useAnnualPerformance'
import { AllTimePerformance, PerformanceChartPoint, YearPerformance, TickerBreakdown } from '../../types'
import { usePrivacyMode } from '../../hooks'
import { PRIVACY_MASK } from '../../hooks/usePrivacyMode'
import { PerformanceChart } from './PerformanceChart'
import { api } from '../../services'
import { loadGuestTransactions } from '../../utils/guestStorage'
import {
  getCachedChartData,
  cacheChartData,
  haveTransactionsChanged
} from '../../utils/guestCache'

const formatCurrency = (value: number, currency: string = '€'): string => {
  return `${currency}${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const formatPercent = (value: number): string => {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

const getGainColor = (value: number): string => {
  if (value > 0) return 'text-gain'
  if (value < 0) return 'text-loss'
  return 'text-gray-400'
}

const formatDate = (dateStr: string): string => {
  if (!dateStr) return 'N/A'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

interface YearTabProps {
  label: string
  isActive: boolean
  onClick: () => void
}

const YearTab: React.FC<YearTabProps> = ({ label, isActive, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`px-3 sm:px-4 py-2 rounded-lg font-medium text-sm transition-all ${
        isActive
          ? 'bg-accent-600 text-white shadow-sm'
          : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
      }`}
    >
      {label}
    </button>
  )
}

interface YearSummaryCardProps {
  data: YearPerformance | AllTimePerformance
  periodLabel: string
  benchmark?: BenchmarkSnapshot | null
}

interface BenchmarkSnapshot {
  portfolioReturn: number
  benchmarkReturn: number
  delta: number
}

const formatBenchmarkLabel = (benchmark?: BenchmarkSnapshot | null): string => {
  if (!benchmark) return 'Benchmark loading'
  if (benchmark.delta > 0) return `Ahead by ${formatPercent(benchmark.delta)}`
  if (benchmark.delta < 0) return `Behind by ${Math.abs(benchmark.delta).toFixed(2)}%`
  return 'Matching benchmark'
}

const YearSummaryCard: React.FC<YearSummaryCardProps> = ({ data, periodLabel, benchmark }) => {
  const { isPrivate } = usePrivacyMode()
  return (
    <section className="glass rounded-xl p-4 sm:p-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{periodLabel}</p>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
              benchmark && benchmark.delta >= 0
                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                : benchmark
                  ? 'border-rose-500/25 bg-rose-500/10 text-rose-300'
                  : 'border-white/10 bg-white/[0.03] text-gray-400'
            }`}>
              {formatBenchmarkLabel(benchmark)}
            </span>
          </div>

          <div className="mt-5">
            <p className={`text-4xl sm:text-5xl font-semibold tracking-tight ${isPrivate ? 'text-gray-500' : getGainColor(data.total_gain_pct)}`}>
              {isPrivate ? PRIVACY_MASK : formatPercent(data.total_gain_pct)}
            </p>
            <p className={`mt-2 text-lg sm:text-xl font-medium ${isPrivate ? 'text-gray-500' : getGainColor(data.total_gain)}`}>
              {isPrivate ? PRIVACY_MASK : `${formatCurrency(data.total_gain)} total gain`}
            </p>
            <p className="mt-3 text-sm text-gray-500">
              {formatDate(data.start_date)} - {formatDate(data.end_date)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
            <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-gray-500">Portfolio</p>
            <p className={`mt-1 text-base sm:text-xl font-semibold ${isPrivate ? 'text-gray-500' : getGainColor(benchmark?.portfolioReturn ?? data.total_gain_pct)}`}>
              {isPrivate ? PRIVACY_MASK : benchmark ? formatPercent(benchmark.portfolioReturn) : formatPercent(data.total_gain_pct)}
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
            <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-gray-500">SXR8.DE</p>
            <p className="mt-1 text-base sm:text-xl font-semibold text-gray-300">
              {isPrivate ? PRIVACY_MASK : benchmark ? formatPercent(benchmark.benchmarkReturn) : 'Loading'}
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
            <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-gray-500">Delta</p>
            <p className={`mt-1 text-base sm:text-xl font-semibold ${isPrivate ? 'text-gray-500' : getGainColor(benchmark?.delta ?? 0)}`}>
              {isPrivate ? PRIVACY_MASK : benchmark ? formatPercent(benchmark.delta) : 'Loading'}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
          <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-gray-500">Value</p>
          <p className="mt-1 text-sm sm:text-lg font-semibold text-white">
            {isPrivate ? PRIVACY_MASK : formatCurrency(data.ending_balance)}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
          <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-gray-500">Net flow</p>
          <p className={`mt-1 text-sm sm:text-lg font-semibold ${isPrivate ? 'text-gray-500' : data.net_deposits >= 0 ? 'text-accent-400' : 'text-amber-400'}`}>
            {isPrivate ? PRIVACY_MASK : formatCurrency(data.net_deposits)}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
          <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-gray-500">Trades</p>
          <p className="mt-1 text-sm sm:text-lg font-semibold text-white">{data.trade_count}</p>
        </div>
      </div>

      <details className="mt-3 rounded-lg border border-white/10 bg-black/15">
        <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-gray-300">Cash flow details</summary>
        <div className="grid grid-cols-2 gap-3 border-t border-white/5 px-3 py-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-gray-500">Start</p>
            <p className="text-gray-300">{isPrivate ? PRIVACY_MASK : formatCurrency(data.beginning_balance)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Invested</p>
            <p className="text-accent-400">{isPrivate ? PRIVACY_MASK : formatCurrency(data.total_invested)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Withdrawn</p>
            <p className="text-amber-400">{isPrivate ? PRIVACY_MASK : formatCurrency(data.total_withdrawn)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">End</p>
            <p className="text-gray-300">{isPrivate ? PRIVACY_MASK : formatCurrency(data.ending_balance)}</p>
          </div>
        </div>
      </details>
    </section>
  )
}

interface TickerBreakdownTableProps {
  tickers: TickerBreakdown[]
}

const TickerBreakdownTable: React.FC<TickerBreakdownTableProps> = ({ tickers }) => {
  // Safety check
  if (!tickers) {
    return null
  }
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(new Set())
  const { isPrivate } = usePrivacyMode()

  const toggleTicker = (ticker: string) => {
    setExpandedTickers((prev) => {
      const next = new Set(prev)
      if (next.has(ticker)) {
        next.delete(ticker)
      } else {
        next.add(ticker)
      }
      return next
    })
  }

  if (tickers.length === 0) {
    return (
      <div className="glass rounded-xl p-6">
        <p className="text-gray-500 text-center">No ticker activity for this period</p>
      </div>
    )
  }

  return (
    <div className="glass rounded-xl overflow-hidden">
      {/* Mobile: Card-style list */}
      <div className="md:hidden divide-y divide-white/5">
        {tickers.map((ticker) => {
          const isExpanded = expandedTickers.has(ticker.ticker)
          const currencySymbol = ticker.currency === 'USD' ? '$' : '€'
          
          return (
            <div key={ticker.ticker} className="p-3">
              <button
                onClick={() => toggleTicker(ticker.ticker)}
                className="w-full text-left"
              >
                  <div className="flex items-center justify-between mb-2">
                  <span className="text-accent-400 font-mono font-medium">{ticker.ticker}</span>
                  <div className="flex items-center gap-3">
                    <span className={`font-medium ${isPrivate ? 'text-gray-500' : getGainColor(ticker.gain_pct)}`}>
                      {isPrivate ? PRIVACY_MASK : formatPercent(ticker.gain_pct)}
                    </span>
                    <svg className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">{isPrivate ? PRIVACY_MASK : `${ticker.shares_end.toFixed(2)} shares`}</span>
                  <span className={`font-medium ${isPrivate ? 'text-gray-500' : getGainColor(ticker.gain)}`}>
                    {isPrivate ? PRIVACY_MASK : formatCurrency(ticker.gain, currencySymbol)}
                  </span>
                </div>
              </button>
              {isExpanded && (
                <div className="mt-3 pt-3 -mx-3 px-3 pb-1 bg-white/[0.02] rounded-b-xl grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500">Price (Start)</p>
                    <p className="text-gray-300">
                      {isPrivate ? PRIVACY_MASK : ticker.shares_start > 0 
                        ? `${currencySymbol}${(ticker.value_start / ticker.shares_start).toFixed(2)}`
                        : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Price (End)</p>
                    <p className="text-gray-300">
                      {isPrivate ? PRIVACY_MASK : ticker.shares_end > 0 
                        ? `${currencySymbol}${(ticker.value_end / ticker.shares_end).toFixed(2)}`
                        : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Shares +/-</p>
                    <p className={`${isPrivate ? 'text-gray-500' :
                      ticker.shares_end > ticker.shares_start ? 'text-gain' :
                      ticker.shares_end < ticker.shares_start ? 'text-loss' :
                      'text-gray-400'
                    }`}>
                      {isPrivate ? PRIVACY_MASK : `${ticker.shares_end - ticker.shares_start >= 0 ? '+' : ''}${(ticker.shares_end - ticker.shares_start).toFixed(2)}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Invested</p>
                    <p className="text-accent-400">{isPrivate ? PRIVACY_MASK : formatCurrency(ticker.invested, currencySymbol)}</p>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Desktop: Full table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-black/20 border-b border-white/5">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticker</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Shares (Start)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Shares (End)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Value (Start)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Value (End)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Gain/Loss</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Return %</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Trades</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {tickers.map((ticker) => {
              const isExpanded = expandedTickers.has(ticker.ticker)
              const currencySymbol = ticker.currency === 'USD' ? '$' : '€'

              return (
                <React.Fragment key={ticker.ticker}>
                  <tr className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-accent-400 font-mono font-medium">{ticker.ticker}</td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {isPrivate ? PRIVACY_MASK : ticker.shares_start.toFixed(4)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">
                      {isPrivate ? PRIVACY_MASK : ticker.shares_end.toFixed(4)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {isPrivate ? PRIVACY_MASK : formatCurrency(ticker.value_start, currencySymbol)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">
                      {isPrivate ? PRIVACY_MASK : formatCurrency(ticker.value_end, currencySymbol)}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${isPrivate ? 'text-gray-500' : getGainColor(ticker.gain)}`}>
                      {isPrivate ? PRIVACY_MASK : formatCurrency(ticker.gain, currencySymbol)}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${isPrivate ? 'text-gray-500' : getGainColor(ticker.gain_pct)}`}>
                      {isPrivate ? PRIVACY_MASK : formatPercent(ticker.gain_pct)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {ticker.trade_count}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleTicker(ticker.ticker)}
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        {isExpanded ? (
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 15l-6-6-6 6"/>
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 9l6 6 6-6"/>
                          </svg>
                        )}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-white/[0.02]">
                      <td colSpan={9} className="px-4 py-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Invested</p>
                            <p className="text-sm text-accent-400 font-medium">
                              {isPrivate ? PRIVACY_MASK : formatCurrency(ticker.invested, currencySymbol)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Withdrawn</p>
                            <p className="text-sm text-amber-400 font-medium">
                              {isPrivate ? PRIVACY_MASK : formatCurrency(ticker.withdrawn, currencySymbol)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Share Change</p>
                            <p className={`text-sm font-medium ${isPrivate ? 'text-gray-500' :
                              ticker.shares_end > ticker.shares_start ? 'text-gain' :
                              ticker.shares_end < ticker.shares_start ? 'text-loss' :
                              'text-gray-400'
                            }`}>
                              {isPrivate ? PRIVACY_MASK : `${(ticker.shares_end - ticker.shares_start >= 0 ? '+' : '')}${(ticker.shares_end - ticker.shares_start).toFixed(4)}`}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Value Change</p>
                            <p className={`text-sm font-medium ${isPrivate ? 'text-gray-500' : getGainColor(ticker.value_end - ticker.value_start)}`}>
                              {isPrivate ? PRIVACY_MASK : formatCurrency(ticker.value_end - ticker.value_start, currencySymbol)}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const aggregateTickerDrivers = (years: YearPerformance[] = []): TickerBreakdown[] => {
  const byTicker = new Map<string, TickerBreakdown>()

  years.forEach((year) => {
    year.tickers?.forEach((ticker) => {
      const existing = byTicker.get(ticker.ticker)
      if (!existing) {
        byTicker.set(ticker.ticker, { ...ticker })
        return
      }

      byTicker.set(ticker.ticker, {
        ...existing,
        shares_start: existing.shares_start || ticker.shares_start,
        shares_end: ticker.shares_end,
        value_start: existing.value_start || ticker.value_start,
        value_end: ticker.value_end,
        invested: existing.invested + ticker.invested,
        withdrawn: existing.withdrawn + ticker.withdrawn,
        gain: existing.gain + ticker.gain,
        gain_pct: existing.value_start > 0
          ? ((existing.gain + ticker.gain) / existing.value_start) * 100
          : ticker.gain_pct,
        trade_count: existing.trade_count + ticker.trade_count,
      })
    })
  })

  return Array.from(byTicker.values())
}

interface PerformanceDriversProps {
  tickers: TickerBreakdown[]
  label: string
}

const PerformanceDrivers: React.FC<PerformanceDriversProps> = ({ tickers, label }) => {
  const { isPrivate } = usePrivacyMode()
  if (!tickers.length) return null

  const topContributor = [...tickers].sort((a, b) => b.gain - a.gain)[0]
  const biggestDetractor = [...tickers].sort((a, b) => a.gain - b.gain)[0]
  const mostTraded = [...tickers].sort((a, b) => b.trade_count - a.trade_count)[0]

  const cards = [
    { title: 'Best contributor', ticker: topContributor, metric: 'gain' as const },
    { title: 'Needs review', ticker: biggestDetractor, metric: 'gain' as const },
    { title: 'Most traded', ticker: mostTraded, metric: 'trades' as const },
  ]

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-white font-heading">Performance drivers</h3>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-3">
        {cards.map(({ title, ticker, metric }) => {
          const currencySymbol = ticker.currency === 'USD' ? '$' : '€'
          return (
            <div key={title} className="rounded-lg border border-white/10 bg-surface-dark/80 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
              <div className="mt-3 flex items-start justify-between gap-3">
                <p className="font-mono text-lg font-semibold text-accent-300">{ticker.ticker}</p>
                <p className={`text-right text-sm font-semibold ${isPrivate ? 'text-gray-500' : metric === 'gain' ? getGainColor(ticker.gain) : 'text-white'}`}>
                  {isPrivate
                    ? PRIVACY_MASK
                    : metric === 'gain'
                      ? formatCurrency(ticker.gain, currencySymbol)
                      : `${ticker.trade_count} trades`}
                </p>
              </div>
              {metric === 'gain' && (
                <p className={`mt-1 text-xs ${isPrivate ? 'text-gray-500' : getGainColor(ticker.gain_pct)}`}>
                  {isPrivate ? PRIVACY_MASK : formatPercent(ticker.gain_pct)}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

export const AnnualPerformanceReport: React.FC = () => {
  const { performanceData, loading, error } = useAnnualPerformance()
  const [selectedTab, setSelectedTab] = useState<string>('all-time')
  const [isTickerTipOpen, setIsTickerTipOpen] = useState(false)
  const tickerTipRef = useRef<HTMLDivElement | null>(null)
  const chartFetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Performance chart data (all-time source; year tabs derive filtered/rebased view)
  const [chartData, setChartData] = useState<PerformanceChartPoint[]>([])
  const [chartLoading, setChartLoading] = useState(false)
  
  // Fetch chart data once after annual performance loads
  useEffect(() => {
    // Wait for annual performance to finish loading before fetching chart data
    if (loading) {
      console.log('⏳ Waiting for annual performance to finish loading...')
      setChartData([])
      return
    }
    
    // Skip if no performance data available
    if (!performanceData || !performanceData.years || performanceData.years.length === 0) {
      console.log('⏭️ No performance data available yet, skipping chart fetch')
      setChartData([])
      return
    }
    
    const fetchChartData = async () => {
      const benchmark = 'SXR8.DE' // S&P 500 ETF - hardcoded since we have historical data
      console.log('📊 Fetching chart data...')
      setChartLoading(true)
      try {
        // Load transactions from localStorage
        const transactions = loadGuestTransactions()
        
        if (!transactions || transactions.length === 0) {
          console.warn('⚠️ No transactions found')
          setChartData([])
          setChartLoading(false)
          return
        }

        // ✅ FAST PATH: Check cache first (avoids hash calculation)
        const cachedData = getCachedChartData()
        if (cachedData && cachedData.data_points) {
          // Cache exists and is valid, check if transactions changed
          const transactionsChanged = haveTransactionsChanged(transactions)
          
          if (!transactionsChanged) {
            // Use cached data (FAST!)
            console.log('⚡ Using cached chart data')
            setChartData(cachedData.data_points)
            setChartLoading(false)
            return
          }
          // If transactions changed, recalculate
        }
        // No cache or cache invalid → calculate fresh (normal speed)
        
        console.log(`📊 Fetching performance chart with ${transactions.length} transactions`)
        
        // Format transactions for backend (remove id, total_value fields)
        const formattedTransactions = transactions.map((t: any) => ({
          ticker: t.ticker,
          type: t.type,
          date: t.date,
          shares: t.shares,
          price: t.price,
          currency: t.currency
        }))
        
        const response = await api.post(`/api/portfolio/performance-history?benchmark=${encodeURIComponent(benchmark)}`, {
          transactions: formattedTransactions
        })
        
        if (response.data.success && response.data.data_points) {
          console.log(`✅ Chart data loaded: ${response.data.data_points?.length || 0} data points`)
          setChartData(response.data.data_points)
          
          // ✅ Cache the chart data
          cacheChartData(response.data)
        } else {
          console.warn('⚠️ No chart data received:', response.data)
        }
      } catch (err: any) {
        console.error('❌ Failed to fetch chart data:', err)
        console.error('Error details:', err.response?.data || err.message)
        const cachedData = getCachedChartData({ allowExpired: true })
        if (cachedData?.data_points) {
          console.warn('📦 Using cached chart data for offline fallback')
          setChartData(cachedData.data_points)
        }
      } finally {
        setChartLoading(false)
      }
    }
    
    // Clear any pending timeout from previous render
    if (chartFetchTimeoutRef.current) {
      clearTimeout(chartFetchTimeoutRef.current)
      chartFetchTimeoutRef.current = null
    }
    
    // Add small delay to ensure localStorage is ready
    chartFetchTimeoutRef.current = setTimeout(() => {
      fetchChartData()
      chartFetchTimeoutRef.current = null
    }, 500)
    
    // Cleanup timeout on unmount
    return () => {
      if (chartFetchTimeoutRef.current) {
        clearTimeout(chartFetchTimeoutRef.current)
        chartFetchTimeoutRef.current = null
      }
    }
  }, [loading, performanceData])

  // For year tabs, rebase chart returns to the first point in the selected year.
  // This avoids showing all-time cumulative percentages inside a year-only view.
  const displayChartData = (() => {
    if (!chartData || chartData.length === 0) return []

    const filtered = selectedTab === 'all-time'
      ? chartData
      : chartData.filter(d => d && d.date && d.date.startsWith(selectedTab))

    if (selectedTab === 'all-time' || filtered.length === 0) {
      return filtered
    }

    const basePortfolio = filtered[0].portfolio_return_pct ?? 0
    const baseBenchmark = filtered[0].benchmark_return_pct ?? 0

    return filtered.map(point => ({
      ...point,
      portfolio_return_pct: Number(((point.portfolio_return_pct ?? 0) - basePortfolio).toFixed(2)),
      benchmark_return_pct: Number(((point.benchmark_return_pct ?? 0) - baseBenchmark).toFixed(2)),
    }))
  })()
  
  useEffect(() => {
    if (!isTickerTipOpen) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsTickerTipOpen(false)
    }

    const onPointerDown = (e: MouseEvent | PointerEvent) => {
      if (!tickerTipRef.current) return
      if (tickerTipRef.current.contains(e.target as Node)) return
      setIsTickerTipOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [isTickerTipOpen])

  // Annual Performance now works in both guest mode and authenticated mode!
  // Guest mode: Transactions sent from localStorage, calculations done on backend
  // Authenticated mode: Transactions from database, calculations done on backend
  // Both use the same lightweight calculation (~100-300ms)

  if (loading) {
    return (
      <div className="glass rounded-xl p-12">
        <div className="flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500 mb-4"></div>
          <p className="text-gray-400">Calculating annual performance...</p>
          <p className="text-sm text-gray-500 mt-2">This may take up to 3 minutes for large portfolios</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass rounded-xl border border-rose-500/20 p-6">
        <p className="text-rose-400">Error: {error}</p>
      </div>
    )
  }

  if (!performanceData || !performanceData.all_time || (performanceData.years?.length === 0 && performanceData.all_time.trade_count === 0)) {
    return (
      <div className="glass rounded-xl p-6">
        <p className="text-gray-500 text-center">No transaction data available</p>
      </div>
    )
  }

  const selectedData = selectedTab === 'all-time'
    ? { data: performanceData.all_time, isYear: false }
    : {
        data: performanceData.years?.find((y) => y.year.toString() === selectedTab),
        isYear: true
      }

  const latestBenchmarkPoint = [...displayChartData]
    .reverse()
    .find(point => typeof point.portfolio_return_pct === 'number' && typeof point.benchmark_return_pct === 'number')

  const benchmarkSnapshot = latestBenchmarkPoint
    ? {
        portfolioReturn: latestBenchmarkPoint.portfolio_return_pct ?? 0,
        benchmarkReturn: latestBenchmarkPoint.benchmark_return_pct ?? 0,
        delta: (latestBenchmarkPoint.portfolio_return_pct ?? 0) - (latestBenchmarkPoint.benchmark_return_pct ?? 0),
      }
    : null

  const driverTickers = selectedData.isYear && selectedData.data && 'tickers' in selectedData.data
    ? selectedData.data.tickers
    : aggregateTickerDrivers(performanceData.years)

  const driverLabel = selectedData.isYear
    ? `Ticker drivers for ${selectedTab}.`
    : 'Aggregated from yearly ticker breakdowns.'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-heading">Performance</h2>
        <p className="mt-1 text-sm text-gray-500">Return, benchmark, cash flow, and ticker drivers.</p>
      </div>

      {/* Year Tabs */}
      <div className="flex flex-wrap gap-2">
        <YearTab
          label="All Time"
          isActive={selectedTab === 'all-time'}
          onClick={() => setSelectedTab('all-time')}
        />
        {Array.isArray(performanceData.years) && performanceData.years
          .sort((a, b) => b.year - a.year) // Most recent first
          .map((year) => (
            <YearTab
              key={year.year}
              label={year.year.toString()}
              isActive={selectedTab === year.year.toString()}
              onClick={() => setSelectedTab(year.year.toString())}
            />
          ))}
      </div>

      {/* Summary Card */}
      {selectedData.data ? (
        <YearSummaryCard
          data={selectedData.data}
          periodLabel={selectedTab === 'all-time' ? 'All time' : selectedTab}
          benchmark={benchmarkSnapshot}
        />
      ) : (
        <div className="glass rounded-xl p-6">
          <p className="text-gray-500 text-center">No performance data available for this period</p>
        </div>
      )}
      
      {/* Performance Chart (only for All Time view - works in both guest and authenticated mode) */}
      {/* Performance Chart - shown for all tabs */}
      {chartLoading ? (
        <div className="glass rounded-xl p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500 mr-3"></div>
            <p className="text-gray-400">Loading chart data...</p>
          </div>
        </div>
      ) : displayChartData.length > 0 ? (
        <PerformanceChart 
          data={displayChartData}
        />
      ) : null}

      <PerformanceDrivers tickers={driverTickers} label={driverLabel} />

      <details className="rounded-xl border border-white/10 bg-surface-dark/80">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-white">How performance is calculated</summary>
        <div className="space-y-3 border-t border-white/5 px-4 py-4 text-sm text-gray-300">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Gain</p>
              <p className="mt-2 font-mono text-xs text-gray-300">Ending Balance + Withdrawn - Beginning Balance - Invested</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Return</p>
              <p className="mt-2 font-mono text-xs text-gray-300">Total Gain / Total Invested × 100</p>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-gray-500">
            Benchmark uses SXR8.DE on the same valuation dates as your portfolio. Ticker gains are shown in native currency, while total gain is converted to EUR.
          </p>
        </div>
      </details>

      {/* Per-Ticker Breakdown (only for individual years) */}
      {selectedData.isYear && selectedData.data && 'tickers' in selectedData.data && Array.isArray(selectedData.data.tickers) && selectedData.data.tickers.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-semibold text-white font-heading">Per-Ticker Breakdown</h3>
            <div className="relative" ref={tickerTipRef}>
              <button
                type="button"
                onClick={() => setIsTickerTipOpen(v => !v)}
                aria-label="About ticker currency display"
                aria-expanded={isTickerTipOpen}
                className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 bg-surface/40 transition-colors"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
              </button>

              {isTickerTipOpen && (
                <div
                  role="dialog"
                  aria-label="Per-ticker breakdown help"
                  className="absolute left-0 top-full mt-2 w-[calc(100vw-2rem)] max-w-[280px] sm:max-w-[360px] bg-surface border border-gray-700 rounded-lg shadow-xl p-3 text-sm text-gray-300 z-50"
                >
                  <div className="text-gray-100 font-semibold mb-1">Currency note</div>
                  <div className="text-gray-300">
                    Ticker gains are shown in their <span className="font-semibold">native currency</span> ($ or €).
                    "Total Gain" above is in <span className="font-semibold">EUR</span> (all currencies converted).
                  </div>
                </div>
              )}
            </div>
          </div>
          <TickerBreakdownTable tickers={selectedData.data.tickers} />
        </div>
      )}
    </div>
  )
}
