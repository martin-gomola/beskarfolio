/**
 * Interactive Allocation Tool
 * 
 * Consolidated tool that combines allocation editing with live rebalancing preview
 * - Adjust allocation percentages
 * - Select strategy (sell-buy or buy-only)
 * - See real-time trade calculations as you adjust
 * - One-click save and execute
 */

import { useState, useEffect } from 'react'
import { allocationService } from '../../services/allocationService'
import { usePortfolio } from '../../hooks/usePortfolio'
import type { TargetAllocation, RebalancePlan, RebalanceTrade } from '../../types/allocation'

interface Props {
  onClose: () => void
}

export function InteractiveAllocationTool({ onClose }: Props) {
  // Allocation state
  const [allocations, setAllocations] = useState<TargetAllocation>({})
  const [partialMode, setPartialMode] = useState(false)
  
  // Strategy state
  const [strategy, setStrategy] = useState<'sell' | 'buy-only'>('buy-only')
  const [cashAvailable, setCashAvailable] = useState(10000)
  const [minTradeValue, setMinTradeValue] = useState(100)
  const [useTaxFreeOnly, setUseTaxFreeOnly] = useState(true)
  
  // Plan state
  const [plan, setPlan] = useState<RebalancePlan | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  
  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const { holdings, loading: portfolioLoading } = usePortfolio()

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        
        const targetsData = await allocationService.getTargets()
        
        if (!targetsData.allocations || Object.keys(targetsData.allocations).length === 0) {
          const totalValue = holdings.reduce((sum, h) => sum + h.current_value, 0)
          
          if (totalValue > 0) {
            const currentAllocation: TargetAllocation = {}
            holdings.forEach(holding => {
              const percentage = (holding.current_value / totalValue) * 100
              currentAllocation[holding.ticker] = parseFloat(percentage.toFixed(2))
            })

            const currentTotal = Object.values(currentAllocation).reduce((sum, val) => sum + val, 0)
            if (Math.abs(currentTotal - 100) > 0.01 && Object.keys(currentAllocation).length > 0) {
              const diff = 100 - currentTotal
              const largestTicker = Object.keys(currentAllocation).reduce((a, b) => 
                currentAllocation[a] > currentAllocation[b] ? a : b
              )
              currentAllocation[largestTicker] = parseFloat((currentAllocation[largestTicker] + diff).toFixed(2))
            }
            setAllocations(currentAllocation)
          }
        } else {
          setAllocations(targetsData.allocations)
        }
      } catch (err: any) {
        console.error('Failed to load data:', err)
        setAllocations({})
      } finally {
        setLoading(false)
      }
    }
    
    if (!portfolioLoading && holdings.length > 0) {
      loadData()
    } else if (!portfolioLoading && holdings.length === 0) {
      setLoading(false)
      setAllocations({})
    }
  }, [portfolioLoading, holdings])

  const total = Object.values(allocations).reduce((sum, val) => sum + val, 0)
  const isValid = partialMode 
    ? (total > 0 && total <= 100.01)
    : Math.abs(total - 100) < 0.01

  // Auto-generate plan when allocations or settings change
  useEffect(() => {
    if (Object.keys(allocations).length === 0 || loading || !isValid) {
      setPlan(null)
      return
    }
    
    const generatePlan = async () => {
      try {
        setPlanLoading(true)
        const allowSelling = strategy === 'sell'
        const backendStrategy = strategy === 'buy-only' ? 'buy_only' : 'sell_buy'
        
        const data = await allocationService.getRebalancePlan({
          cash_available: cashAvailable,
          allow_selling: allowSelling,
          min_trade_value: minTradeValue,
          use_tax_free_only: useTaxFreeOnly,
          strategy: backendStrategy
        })
        setPlan(data)
      } catch (err: any) {
        console.error('Failed to generate plan:', err)
        setPlan(null)
      } finally {
        setPlanLoading(false)
      }
    }

    const timer = setTimeout(generatePlan, 500)
    return () => clearTimeout(timer)
  }, [allocations, strategy, cashAvailable, minTradeValue, useTaxFreeOnly, loading, isValid, partialMode])

  const updateAllocation = (ticker: string, weight: number) => {
    if (weight < 0) weight = 0
    if (weight > 100) weight = 100
    setAllocations(prev => ({ ...prev, [ticker]: weight }))
  }

  const scaleDownTo100 = () => {
    const currentTotal = Object.values(allocations).reduce((sum, val) => sum + val, 0)
    if (currentTotal <= 100) return

    const scaleFactor = 100 / currentTotal
    const newAllocations: TargetAllocation = {}
    
    Object.entries(allocations).forEach(([ticker, weight]) => {
      newAllocations[ticker] = parseFloat((weight * scaleFactor).toFixed(2))
    })

    const newTotal = Object.values(newAllocations).reduce((sum, val) => sum + val, 0)
    const lastTicker = Object.keys(newAllocations)[Object.keys(newAllocations).length - 1]
    newAllocations[lastTicker] += 100 - newTotal
    newAllocations[lastTicker] = parseFloat(newAllocations[lastTicker].toFixed(2))

    setAllocations(newAllocations)
    setError(null)
  }

  const removeTicker = (ticker: string) => {
    setAllocations(prev => {
      const newAllocations = { ...prev }
      delete newAllocations[ticker]
      return newAllocations
    })
  }

  const handleSaveAndApply = async () => {
    if (!isValid) {
      setError(`Cannot save: total must be ${partialMode ? 'between 0% and 100%' : 'exactly 100%'}`)
      return
    }

    try {
      setSaving(true)
      setError(null)
      await allocationService.saveTargets(allocations)
      onClose()
    } catch (err: any) {
      console.error('Failed to save targets:', err)
      setError(err.response?.data?.detail || err.message || 'Failed to save targets')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-surface-dark rounded-2xl p-6 border border-white/10">
          <div className="text-center text-gray-400">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface-dark w-full sm:max-w-7xl rounded-2xl border border-white/10 max-h-[85vh] mx-4 sm:mx-0 flex flex-col overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white tracking-tight">Interactive Allocation Tool</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Adjust allocations and see rebalancing trades in real-time
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-xl text-gray-500 hover:text-white hover:bg-white/5 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Strategy Selector */}
        <div className="px-5 pb-3">
          <div className="bg-surface-elevated p-1 rounded-xl flex">
            <button
              onClick={() => setStrategy('sell')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                strategy === 'sell' 
                  ? 'bg-accent-600 text-white' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Sell & Buy
            </button>
            <button
              onClick={() => setStrategy('buy-only')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                strategy === 'buy-only' 
                  ? 'bg-emerald-500/90 text-white' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Buy Only
            </button>
          </div>

          {/* Settings Row */}
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                Cash (EUR)
              </label>
              <input
                type="number"
                value={cashAvailable}
                onChange={(e) => setCashAvailable(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-surface-elevated border border-white/5 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                Min Trade (EUR)
              </label>
              <input
                type="number"
                value={minTradeValue}
                onChange={(e) => setMinTradeValue(parseFloat(e.target.value) || 100)}
                className="w-full px-3 py-2 bg-surface-elevated border border-white/5 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/50"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useTaxFreeOnly}
                  onChange={(e) => setUseTaxFreeOnly(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-xs">Tax-free first</span>
              </label>
            </div>
          </div>
        </div>

        {/* Main Content: Side by Side */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-5 pb-4">
            {/* LEFT: Allocation Editor */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Target Allocation</h3>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={partialMode}
                    onChange={(e) => setPartialMode(e.target.checked)}
                    className="w-3.5 h-3.5"
                  />
                  <span className="text-gray-400">Partial</span>
                </label>
              </div>

              {/* Allocation inputs */}
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {Object.entries(allocations).map(([ticker, weight]) => (
                  <div key={ticker} className="flex items-center gap-2">
                    <div className="w-20 text-sm text-white font-mono">{ticker}</div>
                    <input
                      type="number"
                      value={weight}
                      onChange={(e) => updateAllocation(ticker, parseFloat(e.target.value) || 0)}
                      min="0"
                      max="100"
                      step="0.01"
                      className="flex-1 px-3 py-2 bg-surface-elevated border border-white/5 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/50"
                    />
                    <span className="text-gray-500 text-sm w-6">%</span>
                    <button
                      onClick={() => removeTicker(ticker)}
                      className="px-2 py-1 bg-rose-500/10 text-rose-400 rounded-lg hover:bg-rose-500/20 text-xs transition-colors"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {total > 100 && (
                <button
                  onClick={scaleDownTo100}
                  className="w-full mt-2 px-3 py-2.5 bg-amber-500/90 hover:bg-amber-600 text-white rounded-xl transition-all text-sm font-semibold active:scale-[0.98]"
                >
                  Scale Down to 100% (currently {total.toFixed(2)}%)
                </button>
              )}

              {/* Total */}
              <div className={`p-4 rounded-xl border-2 ${
                isValid 
                  ? 'bg-emerald-500/10 border-emerald-500/20' 
                  : 'bg-rose-500/10 border-rose-500/20'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 font-semibold text-sm">Total:</span>
                  <span className={`text-2xl font-bold ${
                    isValid ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {total.toFixed(2)}%
                  </span>
                </div>
                {!isValid && (
                  <div className="text-xs text-rose-400 mt-2">
                    {partialMode && total > 100
                      ? `Total cannot exceed 100%. Click "Scale Down" or remove tickers.`
                      : partialMode
                      ? `Total must be between 0% and 100%`
                      : `Total must equal 100% (currently ${(total - 100).toFixed(2)}% ${total > 100 ? 'over' : 'under'})`
                    }
                  </div>
                )}
                {isValid && partialMode && total < 100 && (
                  <div className="text-xs text-accent-400 mt-2">
                    Partial: {(100 - total).toFixed(2)}% remains in current positions
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: Live Trade Preview */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-white">
                {planLoading ? 'Calculating...' : 'Rebalancing Trades'}
              </h3>

              {!isValid && !planLoading && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
                  <div className="text-sm text-rose-400">
                    <strong>Cannot calculate trades:</strong> Allocation total must be valid.
                    {total > 100 ? (
                      <div className="mt-2">Click <strong>"Scale Down to 100%"</strong> to fix.</div>
                    ) : (
                      <div className="mt-2">Adjust percentages to reach {partialMode ? '≤100%' : 'exactly 100%'}.</div>
                    )}
                  </div>
                </div>
              )}

              {planLoading && (
                <div className="text-center text-gray-500 py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent-500 border-t-transparent mx-auto"></div>
                  <p className="mt-2 text-xs">Calculating optimal trades...</p>
                </div>
              )}

              {isValid && !planLoading && plan && (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-surface-elevated rounded-xl p-3 border border-white/5">
                      <div className="text-xs text-gray-500">Total Trades</div>
                      <div className="text-xl font-bold text-white mt-1">
                        {plan.summary.total_trades}
                      </div>
                    </div>
                    <div className="bg-surface-elevated rounded-xl p-3 border border-white/5">
                      <div className="text-xs text-gray-500">
                        {strategy === 'buy-only' ? 'Cash Needed' : 'Total Buys'}
                      </div>
                      <div className="text-xl font-bold text-emerald-400 mt-1">
                        €{(plan.summary.cash_needed || plan.summary.total_buys_eur).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {strategy === 'buy-only' && plan.summary.cash_shortfall > 0 && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                      <div className="text-sm text-amber-400">
                        Need €{plan.summary.cash_shortfall.toLocaleString()} more cash
                      </div>
                    </div>
                  )}

                  {/* Trades list */}
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {plan.trades.map((trade: RebalanceTrade, idx: number) => (
                      <div 
                        key={idx}
                        className={`p-3 rounded-xl border ${
                          trade.action === 'buy'
                            ? 'bg-emerald-500/10 border-emerald-500/20'
                            : 'bg-rose-500/10 border-rose-500/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
                              trade.action === 'buy'
                                ? 'bg-emerald-500/90 text-white'
                                : 'bg-rose-500/90 text-white'
                            }`}>
                              {trade.action.toUpperCase()}
                            </span>
                            <span className="font-mono font-bold text-white text-sm">{trade.ticker}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-white">
                              {trade.shares} shares
                            </div>
                            <div className="text-xs text-gray-500">
                              €{trade.eur_value.toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {isValid && !planLoading && !plan && (
                <div className="text-center text-gray-500 py-8 text-sm">
                  No rebalancing needed - portfolio is on target!
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          {error && (
            <div className="mb-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
              {error}
            </div>
          )}
          
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl transition-colors disabled:opacity-50 font-medium text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAndApply}
              disabled={!isValid || saving || Object.keys(allocations).length === 0}
              className="flex-1 py-3 bg-accent-600 hover:bg-accent-700 text-white rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm active:scale-[0.98]"
            >
              {saving ? 'Saving...' : 'Save Allocation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
