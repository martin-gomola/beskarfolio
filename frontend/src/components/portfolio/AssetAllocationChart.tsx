import React, { useState, useEffect, useCallback } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Holding } from '../../types'
import { usePrivacyMode, useTargetAllocations, useTickerProfiles } from '../../hooks'
import { PRIVACY_MASK } from '../../hooks/usePrivacyMode'
import { CHART_COLORS } from '../../utils/constants'
import {
  AllocationDonutView,
  SelectedPositionDetails,
  type AllocationChartItem,
} from './AllocationDonutView'
import { TargetAllocationView } from './TargetAllocationView'

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

type ViewMode = 'allocation' | 'target' | 'sector'

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
export const AssetAllocationChart: React.FC<AssetAllocationChartProps> = ({
  holdings,
  totalValue,
}) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('allocation')
  const [driftData, setDriftData] = useState<DriftData[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const { isPrivate } = usePrivacyMode()
  const { targetAllocations } = useTargetAllocations()
  const holdingTickers = React.useMemo(() => holdings.map(holding => holding.ticker), [holdings])
  const { getSector, getRegion, isETF } = useTickerProfiles(holdingTickers)

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

  const chartData = React.useMemo<AllocationChartItem[]>(() => holdings
    .map(holding => ({
      name: holding.ticker,
      value: getHoldingValueEur(holding),
      percentage: safeTotalValue > 0 ? (getHoldingValueEur(holding) / safeTotalValue) * 100 : 0,
      currency: holding.currency,
      shares: holding.shares,
      avgPrice: holding.avg_buy_price,
      currentPrice: holding.current_price,
      gainLoss: holding.gain_loss,
      gainLossPct: holding.gain_loss_pct,
      nativeValue: holding.current_value,
    }))
    .filter(item => Number.isFinite(item.value) && item.value > 0)
    .sort((a, b) => b.value - a.value), [getHoldingValueEur, holdings, safeTotalValue])

  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= chartData.length) {
      setSelectedIndex(null)
    }
  }, [chartData.length, selectedIndex])
  
  return (
    <div className="glass rounded-xl p-4 sm:p-5">
      {/* Header with view toggle */}
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div>
          <h3 className="text-base sm:text-lg font-semibold text-white tracking-tight font-heading">Portfolio composition</h3>
          <p className="mt-0.5 text-xs text-gray-500">Allocation and largest positions</p>
        </div>
        
        {/* View Toggle - Refined segmented control */}
        <div className="flex bg-white/5 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('allocation')}
            aria-label="Show portfolio allocation"
            aria-pressed={viewMode === 'allocation'}
            className={`flex min-h-11 min-w-11 items-center justify-center rounded-md text-xs font-medium transition-all ${
              viewMode === 'allocation'
                ? 'bg-accent-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
            title="Portfolio allocation"
          >
            <PieChartIcon size={16} />
          </button>
          <button
            onClick={() => setViewMode('sector')}
            aria-label="Show sector and region breakdown"
            aria-pressed={viewMode === 'sector'}
            className={`flex min-h-11 min-w-11 items-center justify-center rounded-md text-xs font-medium transition-all ${
              viewMode === 'sector'
                ? 'bg-accent-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
            title="Sector & Region breakdown"
          >
            <LayersIcon size={16} />
          </button>
          {hasTargets && (
            <button
              onClick={() => setViewMode('target')}
              aria-label="Show target allocation check"
              aria-pressed={viewMode === 'target'}
              className={`flex min-h-11 min-w-11 items-center justify-center rounded-md text-xs font-medium transition-all ${
                viewMode === 'target'
                  ? 'bg-accent-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Target allocation check"
            >
              <TargetIcon size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Allocation View - Pie Chart */}
      {viewMode === 'allocation' && (
        <div className="grid gap-5 lg:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)] lg:items-start lg:gap-8 xl:grid-cols-[380px_minmax(0,1fr)]">
          <AllocationDonutView
            activeIndex={activeIndex}
            selectedIndex={selectedIndex}
            chartData={chartData}
            safeTotalValue={safeTotalValue}
            isPrivate={isPrivate}
            onActiveIndexChange={setActiveIndex}
            onSelectedIndexChange={setSelectedIndex}
          />

          <div className="min-w-0">
            <div className="mb-2 hidden grid-cols-[minmax(0,1fr)_88px_120px_90px] gap-3 border-b border-white/[0.07] px-3 pb-2 text-[10px] font-medium uppercase tracking-wide text-gray-500 lg:grid">
              <span>Position</span>
              <span className="text-right">Weight</span>
              <span className="text-right">Value</span>
              <span className="text-right">Return</span>
            </div>
            <div className="grid grid-cols-2 gap-1 lg:block lg:space-y-1" aria-label="Largest portfolio positions">
              {chartData.map((item, index) => {
                const isSelected = selectedIndex === index
                const returnColor = item.gainLoss >= 0 ? 'text-gain' : 'text-loss'
                return (
                  <React.Fragment key={item.name}>
                    <button
                      type="button"
                      onClick={() => setSelectedIndex(isSelected ? null : index)}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseLeave={() => setActiveIndex(null)}
                      aria-expanded={isSelected}
                      className={`flex min-h-16 w-full items-center rounded-lg px-2.5 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500/50 lg:grid lg:min-h-14 lg:grid-cols-[minmax(0,1fr)_88px_120px_90px] lg:gap-3 lg:px-3 ${
                        isSelected ? 'bg-accent-600/20' : 'hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          <span className="flex items-baseline gap-2">
                            <span className="truncate text-sm font-medium text-white">{item.name}</span>
                            <span className="shrink-0 text-xs font-semibold tabular-nums text-gray-300 lg:hidden">
                              {item.percentage.toFixed(1)}%
                            </span>
                          </span>
                          <span className="block text-xs text-gray-500">
                            {item.shares.toLocaleString('en-US', { maximumFractionDigits: 2 })} shares
                          </span>
                        </span>
                      </span>

                      <span className="hidden text-right text-sm font-medium tabular-nums text-gray-300 lg:block">
                        {item.percentage.toFixed(1)}%
                      </span>

                      <span className="hidden text-right lg:block">
                        <span className="block text-sm font-medium tabular-nums text-gray-100">
                          {isPrivate ? PRIVACY_MASK : `€${item.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                        </span>
                      </span>

                      <span className={`hidden text-right text-sm font-semibold tabular-nums lg:block ${isPrivate ? 'text-gray-500' : returnColor}`}>
                        {isPrivate ? PRIVACY_MASK : `${item.gainLossPct >= 0 ? '+' : ''}${item.gainLossPct.toFixed(1)}%`}
                      </span>
                    </button>

                    {isSelected && (
                      <div className="col-span-2 lg:col-span-1">
                        <SelectedPositionDetails
                          item={item}
                          selectedIndex={index}
                          isPrivate={isPrivate}
                          onClose={() => setSelectedIndex(null)}
                        />
                      </div>
                    )}
                  </React.Fragment>
                )
              })}
            </div>

          </div>
        </div>
      )}

      {/* Target Check View */}
      {viewMode === 'target' && (
        <TargetAllocationView
          driftData={driftData}
          alerts={alerts}
          hasTargets={Boolean(hasTargets)}
        />
      )}

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
