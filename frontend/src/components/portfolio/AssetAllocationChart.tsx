import React, { useState, useEffect, useCallback } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Holding } from '../../types'
import { CHART_COLORS } from '../../utils/constants'
import { api } from '../../services'
import { usePrivacyMode } from '../../hooks'
import { PRIVACY_MASK } from '../../hooks/usePrivacyMode'

// LocalStorage key for user-defined ticker classifications
const TICKER_INFO_CACHE_KEY = 'beskarfolio_ticker_info_cache'

// Ticker info type (stored in localStorage, fetched from API)
interface TickerInfo {
  ticker?: string
  name?: string
  sector?: string
  industry?: string
  country?: string
  region?: string
  isETF?: boolean
  exchange?: string
  currency?: string
  source?: 'finnhub' | 'fallback'
  // Legacy field for backward compatibility
  type?: 'stock' | 'etf' | 'unknown'
}

// Inline SVG icons
const PieChartIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>
    <path d="M22 12A10 10 0 0 0 12 2v10z"/>
  </svg>
)

const TargetIcon = ({ size = 16, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="6"/>
    <circle cx="12" cy="12" r="2"/>
  </svg>
)

const LayersIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="12 2 2 7 12 12 22 7 12 2"/>
    <polyline points="2 17 12 22 22 17"/>
    <polyline points="2 12 12 17 22 12"/>
  </svg>
)

// LocalStorage key for target allocations (same as allocationService)
const ALLOCATION_STORAGE_KEY = 'beskarfolio_guest_target_allocation'

type ViewMode = 'allocation' | 'target' | 'sector'

// Sector/Region classification for common tickers
const TICKER_SECTORS: Record<string, string> = {
  // Tech
  'AAPL': 'Tech', 'MSFT': 'Tech', 'GOOGL': 'Tech', 'GOOG': 'Tech', 'META': 'Tech',
  'NVDA': 'Tech', 'AMD': 'Tech', 'INTC': 'Tech', 'ASML': 'Tech', 'TSM': 'Tech',
  'AVGO': 'Tech', 'QCOM': 'Tech', 'CSCO': 'Tech', 'ORCL': 'Tech', 'CRM': 'Tech',
  'ADBE': 'Tech', 'NOW': 'Tech', 'SNOW': 'Tech', 'PLTR': 'Tech', 'NET': 'Tech',
  // Financial
  'JPM': 'Finance', 'BAC': 'Finance', 'WFC': 'Finance', 'GS': 'Finance', 'MS': 'Finance',
  'V': 'Finance', 'MA': 'Finance', 'PYPL': 'Finance', 'SQ': 'Finance', 'NU': 'Finance',
  'COIN': 'Finance', 'SCHW': 'Finance', 'BLK': 'Finance',
  // Consumer
  'AMZN': 'Consumer', 'TSLA': 'Consumer', 'NKE': 'Consumer', 'SBUX': 'Consumer',
  'MCD': 'Consumer', 'HD': 'Consumer', 'LOW': 'Consumer', 'TGT': 'Consumer',
  'COST': 'Consumer', 'WMT': 'Consumer', 'DIS': 'Consumer', 'NFLX': 'Consumer',
  // Healthcare
  'JNJ': 'Healthcare', 'UNH': 'Healthcare', 'PFE': 'Healthcare', 'MRK': 'Healthcare',
  'ABBV': 'Healthcare', 'LLY': 'Healthcare', 'TMO': 'Healthcare', 'ABT': 'Healthcare',
  // Cyclicals / Industrial
  'BA': 'Cyclicals', 'CAT': 'Cyclicals', 'DE': 'Cyclicals', 'GE': 'Cyclicals',
  // Travel & Leisure (cruise lines, airlines, hotels)
  'NCLH': 'Travel', 'CCL': 'Travel', 'RCL': 'Travel',  // Cruise lines
  'DAL': 'Travel', 'UAL': 'Travel', 'AAL': 'Travel',   // Airlines
  'MAR': 'Travel', 'HLT': 'Travel', 'H': 'Travel',     // Hotels
  // Energy
  'XOM': 'Energy', 'CVX': 'Energy', 'COP': 'Energy', 'SLB': 'Energy',
  // EU Stocks
  'MC.PA': 'Consumer', 'OR.PA': 'Consumer', 'AIR.PA': 'Cyclicals',
  'SAP.DE': 'Tech', 'SIE.DE': 'Cyclicals', 'ALV.DE': 'Finance',
  'ASML.AS': 'Tech',
}

const TICKER_REGIONS: Record<string, string> = {
  // US stocks (default for most)
  'AAPL': 'US', 'MSFT': 'US', 'GOOGL': 'US', 'GOOG': 'US', 'META': 'US',
  'NVDA': 'US', 'AMD': 'US', 'INTC': 'US', 'AMZN': 'US', 'TSLA': 'US',
  'JPM': 'US', 'V': 'US', 'MA': 'US', 'JNJ': 'US', 'UNH': 'US',
  'NCLH': 'US', 'CCL': 'US', 'SNOW': 'US', 'NU': 'US', 'CSCO': 'US',
  // EU stocks
  'ASML': 'EU', 'ASML.AS': 'EU', 'MC.PA': 'EU', 'OR.PA': 'EU', 'AIR.PA': 'EU',
  'SAP.DE': 'EU', 'SIE.DE': 'EU', 'ALV.DE': 'EU',
  // Asia / EM
  'TSM': 'Asia/EM', 'BABA': 'Asia/EM', 'JD': 'Asia/EM', 'PDD': 'Asia/EM',
  'SONY': 'Asia/EM', 'TM': 'Asia/EM',
}

// Detect region from ticker suffix (fallback)
const getRegionFallback = (ticker: string): string => {
  if (TICKER_REGIONS[ticker]) return TICKER_REGIONS[ticker]
  if (ticker.endsWith('.DE') || ticker.endsWith('.PA') || ticker.endsWith('.AS') || 
      ticker.endsWith('.L') || ticker.endsWith('.MI')) return 'EU'
  if (ticker.endsWith('.HK') || ticker.endsWith('.T') || ticker.endsWith('.SS')) return 'Asia/EM'
  return 'US' // Default to US
}

// Detect sector - ETFs get special handling (fallback)
const getSectorFallback = (ticker: string): string => {
  if (isETFByPattern(ticker)) return 'ETF/Index'
  if (TICKER_SECTORS[ticker]) return TICKER_SECTORS[ticker]
  return 'Other'
}

// Load ticker info cache from localStorage
const loadTickerInfoCache = (): Record<string, TickerInfo> => {
  try {
    const cached = localStorage.getItem(TICKER_INFO_CACHE_KEY)
    return cached ? JSON.parse(cached) : {}
  } catch {
    return {}
  }
}

// Save ticker info cache to localStorage
const saveTickerInfoCache = (cache: Record<string, TickerInfo>) => {
  try {
    localStorage.setItem(TICKER_INFO_CACHE_KEY, JSON.stringify(cache))
  } catch (e) {
    console.warn('Failed to save ticker info cache:', e)
  }
}

// Sector colors
const SECTOR_COLORS: Record<string, string> = {
  // Primary sectors
  'Tech': '#3b82f6',           // blue
  'Technology': '#3b82f6',     // blue (alias)
  'Finance': '#10b981',        // emerald
  'Banking': '#10b981',        // emerald (alias)
  'Financial Services': '#10b981', // emerald (alias)
  'Consumer': '#f59e0b',       // amber
  'Retail': '#f59e0b',         // amber (alias)
  'Consumer Cyclical': '#f59e0b', // amber (alias)
  'Consumer Discretionary': '#f59e0b', // amber (alias)
  'Healthcare': '#ec4899',     // pink
  'Cyclicals': '#f97316',      // orange
  'Industrials': '#f97316',    // orange (alias)
  'Energy': '#ef4444',         // red
  'ETF/Index': '#8b5cf6',      // violet
  
  // Additional sectors from Finnhub
  'Media': '#06b6d4',          // cyan
  'Communication Services': '#06b6d4', // cyan (alias)
  'Communications': '#06b6d4', // cyan (alias)
  'Semiconductors': '#a855f7', // purple
  'Real Estate': '#84cc16',    // lime
  'Utilities': '#64748b',      // slate
  'Basic Materials': '#78716c', // stone
  'Materials': '#78716c',      // stone (alias)
  
  // Travel & Leisure (cruise lines, hotels, airlines)
  'Travel': '#14b8a6',         // teal
  'Leisure': '#14b8a6',        // teal (alias)
  'Hotels, Restaurants & Leisure': '#14b8a6', // teal (Finnhub exact)
  'Airlines': '#14b8a6',       // teal (alias)
  
  // Fallback
  'Other': '#6b7280',          // gray
}

const REGION_COLORS: Record<string, string> = {
  'US': '#3b82f6',        // blue
  'EU': '#10b981',        // emerald
  'Asia/EM': '#f59e0b',   // amber
}

interface TargetAllocation {
  [ticker: string]: number
}

interface DriftData {
  ticker: string
  currentPct: number
  targetPct: number
  driftPct: number
  driftValueEur: number
  action: 'buy' | 'sell' | 'hold'
  color: string
}

interface Alert {
  type: 'warning' | 'info' | 'danger'
  icon: string
  message: string
}

// Common ETF suffixes/patterns (fallback detection)
const ETF_PATTERNS = ['.DE', 'VWCE', 'SXR', 'IWDA', 'EUNL', 'CSPX', 'VOO', 'VTI', 'QQQ', 'SPY', 'IVV']
const isETFByPattern = (ticker: string) => ETF_PATTERNS.some(p => ticker.toUpperCase().includes(p))

interface AssetAllocationChartProps {
  holdings: Holding[]
  totalValue: number
}

/**
 * Asset Allocation Pie Chart with Target Comparison
 * Two views:
 * 1. Allocation - Shows portfolio distribution
 * 2. Target Check - Compares current vs target allocation with drift
 */
export const AssetAllocationChart: React.FC<AssetAllocationChartProps> = ({ holdings, totalValue }) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('allocation')
  const [targetAllocations, setTargetAllocations] = useState<TargetAllocation | null>(null)
  const [driftData, setDriftData] = useState<DriftData[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [tickerInfoCache, setTickerInfoCache] = useState<Record<string, TickerInfo>>({})
  const { isPrivate } = usePrivacyMode()

  const getHoldingValueEur = useCallback((holding: Holding): number => {
    if (Number.isFinite(holding.current_value_eur)) {
      return holding.current_value_eur
    }
    if (Number.isFinite(holding.current_value)) {
      return holding.current_value
    }
    return 0
  }, [])

  const safeTotalValue = React.useMemo(() => {
    if (Number.isFinite(totalValue) && totalValue > 0) {
      return totalValue
    }

    const fallbackTotal = holdings.reduce((sum, holding) => sum + getHoldingValueEur(holding), 0)
    return fallbackTotal > 0 ? fallbackTotal : 0
  }, [getHoldingValueEur, holdings, totalValue])

  // Load target allocations from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(ALLOCATION_STORAGE_KEY)
      if (stored) {
        setTargetAllocations(JSON.parse(stored))
      }
    } catch (err) {
      console.error('Failed to load target allocations:', err)
    }
  }, [])

  // Load ticker info cache and fetch missing profiles from API
  useEffect(() => {
    const fetchMissingProfiles = async () => {
      const cache = loadTickerInfoCache()
      setTickerInfoCache(cache)
      
      // Find tickers missing from cache
      const holdingTickers = holdings.map(h => h.ticker)
      const missingTickers = holdingTickers.filter(t => !cache[t])
      
      if (missingTickers.length === 0) return
      
      try {
        const response = await api.post('/api/tickers/profiles/batch', missingTickers)
        const data = response.data

        if (data.success && data.profiles) {
          // Merge with existing cache
          const updatedCache = { ...cache }
          for (const [ticker, profile] of Object.entries(data.profiles)) {
            updatedCache[ticker] = profile as TickerInfo
          }
          
          // Save to localStorage and update state
          saveTickerInfoCache(updatedCache)
          setTickerInfoCache(updatedCache)
          
          console.log(`✓ Fetched ${Object.keys(data.profiles).length} ticker profiles`)
        }
      } catch (e) {
        console.warn('Failed to fetch ticker profiles:', e)
        // Continue with fallback detection - not critical
      }
    }
    
    fetchMissingProfiles()
  }, [holdings])

  // Helper functions that use cache with fallback
  const getSector = useCallback((ticker: string): string => {
    const cached = tickerInfoCache[ticker]
    if (cached?.sector) return cached.sector
    return getSectorFallback(ticker)
  }, [tickerInfoCache])

  const getRegion = useCallback((ticker: string): string => {
    const cached = tickerInfoCache[ticker]
    if (cached?.region) return cached.region
    return getRegionFallback(ticker)
  }, [tickerInfoCache])

  // Check if ticker is an ETF (uses API cache with pattern fallback)
  const isETF = useCallback((ticker: string): boolean => {
    const cached = tickerInfoCache[ticker]
    if (cached?.isETF !== undefined) return cached.isETF
    // Legacy field support
    if (cached?.type === 'etf') return true
    if (cached?.type === 'stock') return false
    return isETFByPattern(ticker)
  }, [tickerInfoCache])

  // Calculate drift data when holdings or targets change
  useEffect(() => {
    if (!targetAllocations || holdings.length === 0) {
      setDriftData([])
      return
    }

    const data: DriftData[] = holdings.map(holding => {
      const currentValueEur = getHoldingValueEur(holding)
      const currentPct = safeTotalValue > 0 ? (currentValueEur / safeTotalValue) * 100 : 0
      const targetPct = targetAllocations[holding.ticker] || 0
      const driftPct = currentPct - targetPct
      const driftValueEur = (driftPct / 100) * safeTotalValue
      
      // Determine action based on drift (5% threshold)
      let action: 'buy' | 'sell' | 'hold' = 'hold'
      if (driftPct < -5) action = 'buy'
      else if (driftPct > 5) action = 'sell'
      
      // Color based on drift magnitude
      let color = '#6b7280' // gray for hold
      if (driftPct < -5) color = '#22c55e' // green for buy
      else if (driftPct > 5) color = '#ef4444' // red for sell
      else if (Math.abs(driftPct) > 2) color = '#f59e0b' // amber for slight drift
      
      return {
        ticker: holding.ticker,
        currentPct,
        targetPct,
        driftPct,
        driftValueEur,
        action,
        color
      }
    }).sort((a, b) => Math.abs(b.driftPct) - Math.abs(a.driftPct)) // Sort by drift magnitude
    
    setDriftData(data)
  }, [getHoldingValueEur, holdings, safeTotalValue, targetAllocations])

  // Calculate alerts based on portfolio rules
  useEffect(() => {
    if (holdings.length === 0) {
      setAlerts([])
      return
    }

    const newAlerts: Alert[] = []

    // Rule 1: Position > 20% → High concentration
    holdings.forEach(h => {
      const pct = safeTotalValue > 0 ? (getHoldingValueEur(h) / safeTotalValue) * 100 : 0
      if (pct > 20) {
        newAlerts.push({
          type: 'warning',
          icon: '⚠️',
          message: `${h.ticker} is ${pct.toFixed(0)}% of portfolio — High concentration`
        })
      }
    })

    // Rule 2: ETF weight < 10% → Consider diversification
    const etfWeight = holdings
      .filter(h => isETF(h.ticker))
      .reduce((sum, h) => {
        if (safeTotalValue <= 0) {
          return sum
        }
        return sum + (getHoldingValueEur(h) / safeTotalValue) * 100
      }, 0)
    
    if (etfWeight < 10 && holdings.length > 3) {
      newAlerts.push({
        type: 'info',
        icon: '💡',
        message: `ETF allocation is only ${etfWeight.toFixed(0)}% — Consider diversification`
      })
    }

    // Rule 3: Any stock down > 20% → Large drawdown
    holdings.forEach(h => {
      if (h.gain_loss_pct < -20) {
        newAlerts.push({
          type: 'danger',
          icon: '📉',
          message: `${h.ticker} is down ${Math.abs(h.gain_loss_pct).toFixed(0)}% — Large drawdown`
        })
      }
    })

    // Rule 4: Show next buy target (most underweight position)
    if (driftData.length > 0) {
      const mostUnderweight = driftData.filter(d => d.action === 'buy').sort((a, b) => a.driftPct - b.driftPct)[0]
      if (mostUnderweight) {
        newAlerts.push({
          type: 'info',
          icon: '🎯',
          message: `Next buy target: ${mostUnderweight.ticker} (${mostUnderweight.driftPct.toFixed(1)}% underweight)`
        })
      }
    }

    setAlerts(newAlerts)
  }, [driftData, getHoldingValueEur, holdings, safeTotalValue])

  const hasTargets = targetAllocations && Object.keys(targetAllocations).length > 0

  // Prepare data for pie chart using EUR values for consistency, sorted by value descending
  const chartData = holdings
    .map(holding => ({
      name: holding.ticker,
      value: getHoldingValueEur(holding),
      percentage: safeTotalValue > 0 ? (getHoldingValueEur(holding) / safeTotalValue) * 100 : 0,
      currency: holding.currency,
      // Include full holding data for details panel
      shares: holding.shares,
      avgPrice: holding.avg_buy_price,
      currentPrice: holding.current_price,
      gainLoss: holding.gain_loss,
      gainLossPct: holding.gain_loss_pct,
      nativeValue: holding.current_value
    }))
    .filter(item => Number.isFinite(item.value) && item.value > 0)
    .sort((a, b) => b.value - a.value)
  
  // Handle legend item click
  const handleLegendClick = (index: number) => {
    setSelectedIndex(selectedIndex === index ? null : index)
  }

  const onPieEnter = (_: any, index: number) => {
    setActiveIndex(index)
  }

  const onPieLeave = () => {
    setActiveIndex(null)
  }

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-surface-elevated border border-gray-700 rounded-lg p-3 shadow-xl">
          <p className="text-gray-100 font-semibold mb-1">{data.name}</p>
          <p className="text-sm text-gray-300">
            Value: {isPrivate ? PRIVACY_MASK : `€${data.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </p>
          <p className="text-sm text-gray-400">
            {data.percentage.toFixed(2)}% of portfolio
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="glass rounded-xl p-4 sm:p-5">
      {/* Header with view toggle */}
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h3 className="text-base sm:text-lg font-semibold text-white tracking-tight font-heading">Asset Allocation</h3>
        
        {/* View Toggle - Refined segmented control */}
        <div className="flex bg-white/5 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('allocation')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
              viewMode === 'allocation'
                ? 'bg-accent-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
            title="Portfolio allocation"
          >
            <PieChartIcon size={12} />
          </button>
          <button
            onClick={() => setViewMode('sector')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
              viewMode === 'sector'
                ? 'bg-accent-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
            title="Sector & Region breakdown"
          >
            <LayersIcon size={12} />
          </button>
          {hasTargets && (
            <button
              onClick={() => setViewMode('target')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === 'target'
                  ? 'bg-accent-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Target allocation check"
            >
              <TargetIcon size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Allocation View - Pie Chart */}
      {viewMode === 'allocation' && (
      <>
      <div className="flex flex-col items-center">
        {/* Donut Chart */}
        <div className="relative flex-shrink-0" style={{ height: '260px', width: '260px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={120}
                paddingAngle={1}
                dataKey="value"
                onMouseEnter={onPieEnter}
                onMouseLeave={onPieLeave}
                animationBegin={0}
                animationDuration={800}
              >
                {chartData.map((_entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                    opacity={activeIndex === null || activeIndex === index ? 1 : 0.6}
                    stroke={activeIndex === index ? '#fff' : 'none'}
                    strokeWidth={activeIndex === index ? 2 : 0}
                  />
                ))}
              </Pie>
              <Tooltip 
                content={<CustomTooltip />} 
                offset={20}
                wrapperStyle={{ zIndex: 1000 }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Center Label */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 10 }}>
            <div className="text-center">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide">Total</div>
              <div className="text-2xl font-bold text-gray-100">
                {isPrivate ? PRIVACY_MASK : `€${(safeTotalValue / 1000).toFixed(1)}k`}
              </div>
            </div>
          </div>
        </div>

        {/* Legend - 2 cols on mobile, single row on desktop */}
        <div className="grid grid-cols-2 lg:flex lg:flex-wrap lg:justify-center gap-x-4 gap-y-1.5 mt-3">
          {chartData.map((item, index) => (
            <div
              key={item.name}
              className={`flex items-center gap-1.5 px-1.5 py-1 rounded transition-all cursor-pointer min-w-0 ${
                selectedIndex === index 
                  ? 'bg-accent-600/30 ring-1 ring-accent-500/50' 
                  : activeIndex === index 
                    ? 'bg-gray-700/80' 
                    : 'hover:bg-gray-800/50'
              }`}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              onClick={() => handleLegendClick(index)}
            >
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
              />
              <span className="text-white text-xs font-medium truncate">{item.name}</span>
              <span className="text-white text-xs font-semibold flex-shrink-0">
                {item.percentage.toFixed(1)}%
              </span>
              {!isPrivate && (
                <span className="text-[10px] text-gray-500 flex-shrink-0 hidden xs:inline">
                  €{(item.value / 1000).toFixed(1)}k
                </span>
              )}
            </div>
          ))}
        </div>

      </div>

      {/* Selected Position Details Panel */}
      {selectedIndex !== null && chartData[selectedIndex] && (() => {
        const item = chartData[selectedIndex]
        const currencySymbol = item.currency === 'USD' ? '$' : '€'
        const isPositive = item.gainLoss >= 0
        
        return (
          <div className="mt-3 pt-3 sm:pt-4 border-t border-gray-700/50">
            {/* Desktop: Single row layout - evenly spaced */}
            <div className="hidden lg:flex items-center justify-between">
              {/* Ticker */}
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: CHART_COLORS[selectedIndex % CHART_COLORS.length] }}
                />
                <span className="text-white font-bold">{item.name}</span>
              </div>
              
              {/* Value */}
              <div className="text-center">
                <div className="text-gray-500 text-[10px] uppercase">Value</div>
                <div className="text-white font-semibold">
                  {isPrivate ? PRIVACY_MASK : (
                    <>
                      {currencySymbol}{item.nativeValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {item.currency === 'USD' && (
                        <span className="text-gray-500 text-xs ml-1">(€{(item.value / 1000).toFixed(1)}k)</span>
                      )}
                    </>
                  )}
                </div>
              </div>
              
              {/* Shares */}
              <div className="text-center">
                <div className="text-gray-500 text-[10px] uppercase">Shares</div>
                <div className="text-gray-200 font-medium">{isPrivate ? PRIVACY_MASK : item.shares.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
              </div>
              
              {/* Avg */}
              <div className="text-center">
                <div className="text-gray-500 text-[10px] uppercase">Avg</div>
                <div className="text-gray-200 font-medium">{isPrivate ? PRIVACY_MASK : `${currencySymbol}${item.avgPrice.toFixed(2)}`}</div>
              </div>
              
              {/* Now + % */}
              <div className="text-center">
                <div className="text-gray-500 text-[10px] uppercase">Now</div>
                <div className="text-gray-200 font-medium">
                  {currencySymbol}{item.currentPrice.toFixed(2)}
                  <span className={`ml-1 text-xs ${isPositive ? 'text-gain' : 'text-loss'}`}>
                    ({isPositive ? '+' : ''}{item.gainLossPct.toFixed(0)}%)
                  </span>
                </div>
              </div>
              
              {/* P&L */}
              <div className="text-center">
                <div className="text-gray-500 text-[10px] uppercase">P&L</div>
                <div className={`font-bold ${isPrivate ? 'text-gray-500' : isPositive ? 'text-gain' : 'text-loss'}`}>
                  {isPrivate ? PRIVACY_MASK : `${isPositive ? '+' : ''}${currencySymbol}${Math.abs(item.gainLoss).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </div>
              </div>
              
              {/* Close */}
              <button
                onClick={() => setSelectedIndex(null)}
                className="text-gray-500 hover:text-white p-1"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            
            {/* Mobile: Stacked layout */}
            <div className="lg:hidden">
              {/* Header: Ticker + EUR value + Close */}
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: CHART_COLORS[selectedIndex % CHART_COLORS.length] }}
                  />
                  <span className="text-white font-bold text-lg">{item.name}</span>
                  {!isPrivate && item.currency === 'USD' && (
                    <span className="text-gray-500 text-sm">
                      (€{item.value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })})
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setSelectedIndex(null)}
                  className="text-gray-500 hover:text-white p-1 -mr-1"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              
              {/* Value + P&L amount */}
              <div className="mb-2 sm:mb-3 flex items-baseline justify-between gap-2">
                <span className="text-white font-semibold text-xl sm:text-2xl">
                  {isPrivate ? PRIVACY_MASK : `${currencySymbol}${item.nativeValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </span>
                <div className="text-right flex-shrink-0">
                  <span className="text-gray-500 text-xs">P&L: </span>
                  <span className={`font-bold text-base sm:text-lg ${isPrivate ? 'text-gray-500' : isPositive ? 'text-gain' : 'text-loss'}`}>
                    {isPrivate ? PRIVACY_MASK : `${isPositive ? '+' : ''}${currencySymbol}${Math.abs(item.gainLoss).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </span>
                </div>
              </div>
              
              {/* Stats */}
              <div className="pt-2 sm:pt-3 border-t border-gray-700/50 grid grid-cols-3 gap-1 sm:gap-2 text-center">
                <div>
                  <div className="text-gray-500 text-[10px] uppercase">Shares</div>
                  <div className="text-gray-200 font-medium">{isPrivate ? PRIVACY_MASK : item.shares.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-[10px] uppercase">Avg</div>
                  <div className="text-gray-200 font-medium">{isPrivate ? PRIVACY_MASK : `${currencySymbol}${item.avgPrice.toFixed(2)}`}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-[10px] uppercase">Now</div>
                  <div className="text-gray-200 font-medium">
                    {currencySymbol}{item.currentPrice.toFixed(2)}
                    <span className={`ml-1 text-xs ${isPositive ? 'text-gain' : 'text-loss'}`}>
                      ({isPositive ? '+' : ''}{item.gainLossPct.toFixed(0)}%)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
      </>
      )}

      {/* Target Check View */}
      {viewMode === 'target' && (() => {
        // Prepare chart data for current vs target comparison
        const currentChartData = driftData.map((d, i) => ({
          name: d.ticker,
          value: d.currentPct,
          color: CHART_COLORS[i % CHART_COLORS.length]
        }))

        const targetChartData = driftData.map((d, i) => ({
          name: d.ticker,
          value: d.targetPct,
          color: CHART_COLORS[i % CHART_COLORS.length]
        }))

        // Calculate total drift
        const totalDrift = driftData.reduce((sum, d) => sum + Math.abs(d.driftPct), 0) / 2
        const maxDrift = driftData.length > 0 ? driftData[0] : null

        return (
          <div className="space-y-4">
            {/* No targets warning */}
            {(!hasTargets || driftData.length === 0) ? (
              <div className="text-center py-8 text-gray-500">
                <TargetIcon size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No target allocations configured.</p>
                <p className="text-xs mt-1">Go to Allocation tab to set targets.</p>
              </div>
            ) : (
              <>
                {/* Two pie charts: Current vs Target */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Current Allocation */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 text-center">Current</h4>
                    <div className="relative" style={{ height: '140px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={currentChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={35}
                            outerRadius={60}
                            paddingAngle={1}
                            dataKey="value"
                            animationBegin={0}
                            animationDuration={600}
                          >
                            {currentChartData.map((entry, index) => (
                              <Cell key={`current-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload
                                return (
                                  <div className="bg-surface-elevated border border-gray-700 rounded px-2 py-1 text-xs">
                                    <span className="text-white">{data.name}: {data.value.toFixed(1)}%</span>
                                  </div>
                                )
                              }
                              return null
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Target Allocation */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 text-center">Target</h4>
                    <div className="relative" style={{ height: '140px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={targetChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={35}
                            outerRadius={60}
                            paddingAngle={1}
                            dataKey="value"
                            animationBegin={0}
                            animationDuration={600}
                          >
                            {targetChartData.map((entry, index) => (
                              <Cell key={`target-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload
                                return (
                                  <div className="bg-surface-elevated border border-gray-700 rounded px-2 py-1 text-xs">
                                    <span className="text-white">{data.name}: {data.value.toFixed(1)}%</span>
                                  </div>
                                )
                              }
                              return null
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Drift Summary */}
                <div className="grid grid-cols-2 gap-3 p-3 bg-gray-800/30 rounded-lg">
                  <div className="text-center">
                    <div className="text-gray-500 text-[10px] uppercase">Total Drift</div>
                    <div className={`text-xl font-bold ${totalDrift > 10 ? 'text-red-400' : totalDrift > 5 ? 'text-amber-400' : 'text-green-400'}`}>
                      {totalDrift.toFixed(1)}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-gray-500 text-[10px] uppercase">Max Drift</div>
                    <div className={`text-xl font-bold ${maxDrift && Math.abs(maxDrift.driftPct) > 5 ? 'text-red-400' : 'text-green-400'}`}>
                      {maxDrift ? `${maxDrift.driftPct > 0 ? '+' : ''}${maxDrift.driftPct.toFixed(1)}%` : '0%'}
                    </div>
                    <div className="text-[10px] text-gray-500">{maxDrift?.ticker}</div>
                  </div>
                </div>

                {/* Alerts */}
                {alerts.length > 0 && (
                  <div className="space-y-1.5">
                    {alerts.map((alert, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center gap-2 p-2 rounded-lg text-xs ${
                          alert.type === 'danger' 
                            ? 'bg-red-500/10 border border-red-500/20 text-red-300'
                            : alert.type === 'warning'
                              ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
                              : 'bg-accent-500/10 border border-accent-500/20 text-accent-300'
                        }`}
                      >
                        <span>{alert.icon}</span>
                        <span>{alert.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Legend */}
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 pt-2 border-t border-gray-700/50">
                  {driftData.slice(0, 6).map((d, i) => (
                    <div key={d.ticker} className="flex items-center gap-1">
                      <div 
                        className="w-2 h-2 rounded-full" 
                        style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} 
                      />
                      <span className="text-[10px] text-gray-400">{d.ticker}</span>
                      <span className={`text-[10px] font-medium ${
                        d.driftPct > 5 ? 'text-red-400' : d.driftPct < -5 ? 'text-green-400' : 'text-gray-300'
                      }`}>
                        {d.driftPct > 0 ? '+' : ''}{d.driftPct.toFixed(0)}%
                      </span>
                    </div>
                  ))}
                  {driftData.length > 6 && (
                    <span className="text-[10px] text-gray-500">+{driftData.length - 6} more</span>
                  )}
                </div>
              </>
            )}
          </div>
        )
      })()}

      {/* Sector/Region View */}
      {viewMode === 'sector' && (() => {
        // Calculate sector breakdown
        const sectorData: Record<string, { value: number; tickers: string[] }> = {}
        const regionData: Record<string, { value: number; tickers: string[] }> = {}
        const typeData: Record<string, { value: number; tickers: string[] }> = {
          'ETF': { value: 0, tickers: [] },
          'Stock': { value: 0, tickers: [] }
        }

        holdings.forEach(h => {
          const sector = getSector(h.ticker)
          const region = getRegion(h.ticker)
          
          // Detect ETF vs Stock using cached API info or pattern fallback
          const isEtf = isETF(h.ticker)
          const assetType = isEtf ? 'ETF' : 'Stock'
          
          if (!sectorData[sector]) sectorData[sector] = { value: 0, tickers: [] }
          sectorData[sector].value += getHoldingValueEur(h)
          sectorData[sector].tickers.push(h.ticker)
          
          if (!regionData[region]) regionData[region] = { value: 0, tickers: [] }
          regionData[region].value += getHoldingValueEur(h)
          regionData[region].tickers.push(h.ticker)
          
          typeData[assetType].value += getHoldingValueEur(h)
          typeData[assetType].tickers.push(h.ticker)
        })

        // Sort by value
        const sectors = Object.entries(sectorData)
          .map(([name, data]) => ({ name, ...data, pct: safeTotalValue > 0 ? (data.value / safeTotalValue) * 100 : 0 }))
          .sort((a, b) => b.value - a.value)

        const regions = Object.entries(regionData)
          .map(([name, data]) => ({ name, ...data, pct: safeTotalValue > 0 ? (data.value / safeTotalValue) * 100 : 0 }))
          .sort((a, b) => b.value - a.value)

        const types = Object.entries(typeData)
          .filter(([_, data]) => data.value > 0)
          .map(([name, data]) => ({ name, ...data, pct: safeTotalValue > 0 ? (data.value / safeTotalValue) * 100 : 0 }))
          .sort((a, b) => b.value - a.value)

        // Prepare chart data
        const sectorChartData = sectors.map(s => ({
          name: s.name,
          value: s.value,
          pct: s.pct,
          tickers: s.tickers,
          color: SECTOR_COLORS[s.name] || '#6b7280'
        }))

        const regionChartData = regions.map(r => ({
          name: r.name,
          value: r.value,
          pct: r.pct,
          tickers: r.tickers,
          color: REGION_COLORS[r.name] || '#6b7280',
          flag: r.name === 'US' ? '🇺🇸' : r.name === 'EU' ? '🇪🇺' : '🌏'
        }))

        const typeChartData = types.map(t => ({
          name: t.name,
          value: t.value,
          pct: t.pct,
          tickers: t.tickers,
          color: t.name === 'ETF' ? '#8b5cf6' : '#3b82f6', // violet for ETF, blue for Stock
          icon: t.name === 'ETF' ? '📊' : '📈'
        }))

        return (
          <div className="space-y-4">
            {/* Three pie charts: Sector, Region, Type */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              
              {/* Sector Pie Chart */}
              <div className="col-span-2 lg:col-span-1">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 text-center">By Sector</h4>
                <div className="relative" style={{ height: '150px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sectorChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={60}
                        paddingAngle={2}
                        dataKey="value"
                        animationBegin={0}
                        animationDuration={600}
                      >
                        {sectorChartData.map((entry, index) => (
                          <Cell key={`sector-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload
                            return (
                              <div className="bg-surface-elevated border border-gray-700 rounded-lg p-2 shadow-xl text-xs">
                                <p className="text-white font-semibold">{data.name}</p>
                                <p className="text-gray-300">{data.pct.toFixed(1)}%{isPrivate ? '' : ` • €${(data.value / 1000).toFixed(1)}k`}</p>
                                <p className="text-gray-500 text-[10px]">{data.tickers.join(', ')}</p>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Sector Legend */}
                <div className="flex flex-wrap justify-center gap-x-2 gap-y-1 mt-1">
                  {sectorChartData.map(s => (
                    <div key={s.name} className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="text-[10px] text-gray-400">{s.name}</span>
                      <span className="text-[10px] text-white font-medium">{s.pct.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Region Pie Chart */}
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 text-center">By Region</h4>
                <div className="relative" style={{ height: '150px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={regionChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={60}
                        paddingAngle={2}
                        dataKey="value"
                        animationBegin={0}
                        animationDuration={600}
                      >
                        {regionChartData.map((entry, index) => (
                          <Cell key={`region-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload
                            return (
                              <div className="bg-surface-elevated border border-gray-700 rounded-lg p-2 shadow-xl text-xs">
                                <p className="text-white font-semibold">{data.flag} {data.name}</p>
                                <p className="text-gray-300">{data.pct.toFixed(1)}%{isPrivate ? '' : ` • €${(data.value / 1000).toFixed(1)}k`}</p>
                                <p className="text-gray-500 text-[10px]">{data.tickers.join(', ')}</p>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Region Legend */}
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1">
                  {regionChartData.map(r => (
                    <div key={r.name} className="flex items-center gap-1">
                      <span className="text-sm">{r.flag}</span>
                      <span className="text-[10px] text-gray-400">{r.name}</span>
                      <span className="text-[10px] text-white font-medium">{r.pct.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ETF vs Stock Pie Chart */}
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 text-center">ETF vs Stock</h4>
                <div className="relative" style={{ height: '150px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={typeChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={60}
                        paddingAngle={2}
                        dataKey="value"
                        animationBegin={0}
                        animationDuration={600}
                      >
                        {typeChartData.map((entry, index) => (
                          <Cell key={`type-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload
                            return (
                              <div className="bg-surface-elevated border border-gray-700 rounded-lg p-2 shadow-xl text-xs">
                                <p className="text-white font-semibold">{data.icon} {data.name}</p>
                                <p className="text-gray-300">{data.pct.toFixed(1)}%{isPrivate ? '' : ` • €${(data.value / 1000).toFixed(1)}k`}</p>
                                <p className="text-gray-500 text-[10px]">{data.tickers.join(', ')}</p>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Type Legend */}
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1">
                  {typeChartData.map(t => (
                    <div key={t.name} className="flex items-center gap-1">
                      <span className="text-sm">{t.icon}</span>
                      <span className="text-[10px] text-gray-400">{t.name}</span>
                      <span className="text-[10px] text-white font-medium">{t.pct.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Summary */}
            {/* <div className="text-[10px] text-gray-500 border-t border-gray-700/50 pt-2 text-center">
              💡 Data from yfinance API, cached in browser. ETFs detected automatically.</div> */}
          </div>
        )
      })()}
    </div>
  )
}
