/**
 * Target Allocation Editor Modal
 * 
 * Allows editing target allocation percentages
 * Validates that total = 100%
 * Supports adding/removing tickers
 */

import { useState, useEffect } from 'react'
import { allocationService } from '../../services/allocationService'
import { usePortfolio } from '../../hooks/usePortfolio'
import type { TargetAllocation, AllocationStatus } from '../../types/allocation'

interface Props {
  onSave: () => void
  currentAllocationStatus?: AllocationStatus | null  // Pass existing data to avoid re-fetching
}

export function TargetAllocationEditor({
  onSave,
  currentAllocationStatus
}: Props) {
  const [allocations, setAllocations] = useState<TargetAllocation>({})
  const [lockedTickers, setLockedTickers] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [buyOnlyMode, setBuyOnlyMode] = useState(false)

  // Get current portfolio holdings
  const { holdings, loading: portfolioLoading } = usePortfolio()

  // Initialize editor with current portfolio weights (so drift = 0% initially)
  // User can then adjust targets from there
  useEffect(() => {
    const initializeWithCurrentWeights = () => {
      setLoading(true)
      
      try {
        // Use passed allocation status data if available (most accurate)
        if (currentAllocationStatus?.drift_data) {
          const currentAllocation: TargetAllocation = {}
          
          currentAllocationStatus.drift_data.forEach((item) => {
            if (item.current_weight_pct > 0) {
              currentAllocation[item.ticker] = Math.round(item.current_weight_pct * 100) / 100
            }
          })
          
          // Adjust to make total exactly 100%
          const calculatedTotal = Object.values(currentAllocation).reduce((sum, val) => sum + val, 0)
          if (Math.abs(calculatedTotal - 100) > 0.001 && Object.keys(currentAllocation).length > 0) {
            const largestTicker = Object.entries(currentAllocation)
              .sort(([, a], [, b]) => b - a)[0][0]
            currentAllocation[largestTicker] += (100 - calculatedTotal)
            currentAllocation[largestTicker] = Math.round(currentAllocation[largestTicker] * 100) / 100
          }
          
          setAllocations(currentAllocation)
        } else {
          // Fallback: calculate from holdings
          const totalValue = holdings.reduce((sum, h) => sum + h.current_value, 0)
          
          if (totalValue > 0) {
            const currentAllocation: TargetAllocation = {}
            
            holdings.forEach(holding => {
              const percentage = (holding.current_value / totalValue) * 100
              currentAllocation[holding.ticker] = Math.round(percentage * 100) / 100
            })
            
            const calculatedTotal = Object.values(currentAllocation).reduce((sum, val) => sum + val, 0)
            if (Math.abs(calculatedTotal - 100) > 0.001 && Object.keys(currentAllocation).length > 0) {
              const largestTicker = Object.entries(currentAllocation)
                .sort(([, a], [, b]) => b - a)[0][0]
              currentAllocation[largestTicker] += (100 - calculatedTotal)
              currentAllocation[largestTicker] = Math.round(currentAllocation[largestTicker] * 100) / 100
            }
            
            setAllocations(currentAllocation)
          } else {
            setAllocations({})
          }
        }
      } catch (err: any) {
        console.error('Failed to initialize allocations:', err)
        setAllocations({})
      } finally {
        setLoading(false)
      }
    }
    
    // Only initialize when portfolio is ready
    if (!portfolioLoading && holdings.length > 0) {
      initializeWithCurrentWeights()
    } else if (!portfolioLoading && holdings.length === 0) {
      setLoading(false)
      setAllocations({})
    }
  }, [portfolioLoading, holdings, currentAllocationStatus])

  // Calculate total - must be exactly 100%
  const total = Object.values(allocations).reduce((sum, val) => sum + val, 0)
  const isValid = Math.abs(total - 100) < 0.01

  // Update allocation with auto-redistribution
  const updateAllocation = (ticker: string, weight: number) => {
    // Prevent negative values
    if (weight < 0) {
      weight = 0
    }
    // Prevent values over 100%
    if (weight > 100) {
      weight = 100
    }
    
    // Update the changed ticker first
    const updatedAllocations = {
      ...allocations,
      [ticker]: weight
    }
    
    const round2 = (val: number) => parseFloat(val.toFixed(2))
    const tickers = Object.keys(updatedAllocations)
    const lockedTotal = tickers
      .filter(t => lockedTickers.has(t))
      .reduce((sum, t) => sum + (updatedAllocations[t] || 0), 0)

    const normalizeToHundred = () => {
      const totalNow = Object.values(updatedAllocations).reduce((sum, val) => sum + val, 0)
      const diff = 100 - totalNow
      if (Math.abs(diff) < 0.01) return

      const adjustable = tickers.filter(t => !lockedTickers.has(t))
      if (adjustable.length === 0) return

      // Prefer adjusting the last editable ticker (stable) to absorb rounding
      const targetTicker = adjustable.includes(ticker)
        ? ticker
        : adjustable[adjustable.length - 1]

      updatedAllocations[targetTicker] = round2((updatedAllocations[targetTicker] || 0) + diff)
    }

    // Buy-only mode: scale other unlocked tickers proportionally so total stays 100 without implying sells
    if (buyOnlyMode) {
      const unlocked = tickers.filter(t => !lockedTickers.has(t))

      if (unlocked.length === 0) {
        setError('All tickers are locked. Unlock some to adjust allocations.')
        return
      }

      const currentTotal = Object.values(updatedAllocations).reduce((sum, val) => sum + val, 0)

      if (Math.abs(currentTotal - 100) < 0.01) {
        setAllocations(updatedAllocations)
        setError(null)
        return
      }

      const adjustProportionally = (delta: number, direction: 'reduce' | 'increase') => {
        // Prefer adjusting tickers other than the one just edited; fallback to all unlocked
        let adjustable = unlocked.filter(t => t !== ticker)
        if (adjustable.length === 0) adjustable = unlocked

        const baseSum = adjustable.reduce((sum, t) => sum + (updatedAllocations[t] || 0), 0)

        if (baseSum <= 0) {
          // Nothing to scale against: nudge the edited ticker to keep total at 100
          updatedAllocations[ticker] = round2(
            direction === 'reduce'
              ? Math.max(0, (updatedAllocations[ticker] || 0) - delta)
              : (updatedAllocations[ticker] || 0) + delta
          )
          return
        }

        adjustable.forEach((t, idx) => {
          const share = (updatedAllocations[t] || 0) / baseSum
          const change = share * delta
          const next =
            direction === 'reduce'
              ? Math.max(0, (updatedAllocations[t] || 0) - change)
              : (updatedAllocations[t] || 0) + change
          updatedAllocations[t] = round2(next)

          // On last adjustable ticker, fix rounding so total returns to 100 exactly
          if (idx === adjustable.length - 1) {
            const totalAfter = Object.values(updatedAllocations).reduce((sum, val) => sum + val, 0)
            updatedAllocations[t] = round2((updatedAllocations[t] || 0) + (100 - totalAfter))
          }
        })
      }

      if (currentTotal > 100 + 0.01) {
        adjustProportionally(currentTotal - 100, 'reduce')
      } else if (currentTotal < 100 - 0.01) {
        adjustProportionally(100 - currentTotal, 'increase')
      }

      normalizeToHundred()
      setAllocations(updatedAllocations)
      setError(null)
      return
    }

    // Default mode: respect locks and split remaining equally among unlocked tickers
    const isThisLocked = lockedTickers.has(ticker)
    const hasLockedTickers = lockedTickers.size > 0
    
    if (hasLockedTickers) {
      const remaining = 100 - lockedTotal
      const unlockedTickers = Object.keys(updatedAllocations).filter(t => !lockedTickers.has(t))
      
      if (unlockedTickers.length > 0 && remaining >= 0) {
        let tickersToRedistribute = unlockedTickers
        let remainingToDistribute = remaining
        
        if (!isThisLocked && unlockedTickers.includes(ticker)) {
          tickersToRedistribute = unlockedTickers.filter(t => t !== ticker)
          remainingToDistribute = remaining - weight
        }
        
        if (tickersToRedistribute.length > 0) {
          const equalWeight = remainingToDistribute / tickersToRedistribute.length
          
          tickersToRedistribute.forEach(t => {
            updatedAllocations[t] = parseFloat(equalWeight.toFixed(2))
          })
          
          const newTotal = Object.values(updatedAllocations).reduce((sum, val) => sum + val, 0)
          const lastTicker = tickersToRedistribute[tickersToRedistribute.length - 1]
          updatedAllocations[lastTicker] += 100 - newTotal
          updatedAllocations[lastTicker] = parseFloat(updatedAllocations[lastTicker].toFixed(2))
        }
      }
    }
    
    normalizeToHundred()
    setAllocations(updatedAllocations)
    setError(null)
  }

  // Remove ticker
  const removeTicker = (ticker: string) => {
    setAllocations(prev => {
      const newAllocations = { ...prev }
      delete newAllocations[ticker]
      return newAllocations
    })
  }

  // Save allocations
  const handleSave = async () => {
    if (!isValid) {
      setError(`Total must be exactly 100%, currently ${total.toFixed(2)}%`)
      return
    }

    try {
      setSaving(true)
      setError(null)
      await allocationService.saveTargets(allocations)
      onSave()
    } catch (err: any) {
      console.error('Failed to save targets:', err)
      setError(err.response?.data?.detail || err.message || 'Failed to save targets')
      setSaving(false)
    }
  }

  // Reset to current portfolio percentages (reuses already-fetched allocation data)
  const resetToCurrentPortfolio = () => {
    if (holdings.length === 0) return
    
    // Use passed allocation status data if available (avoids extra API call)
    if (currentAllocationStatus?.drift_data) {
      const currentAllocation: TargetAllocation = {}
      
      // Extract current_weight_pct from drift_data
      currentAllocationStatus.drift_data.forEach((item) => {
        if (item.current_weight_pct > 0) {
          currentAllocation[item.ticker] = Math.round(item.current_weight_pct * 100) / 100
        }
      })
      
      // Adjust the largest holding to make total exactly 100%
      const calculatedTotal = Object.values(currentAllocation).reduce((sum, val) => sum + val, 0)
      if (Math.abs(calculatedTotal - 100) > 0.001) {
        const largestTicker = Object.entries(currentAllocation)
          .sort(([, a], [, b]) => b - a)[0][0]
        
        currentAllocation[largestTicker] += (100 - calculatedTotal)
        currentAllocation[largestTicker] = Math.round(currentAllocation[largestTicker] * 100) / 100
      }
      
      setAllocations(currentAllocation)
      setError(null)
      return
    }
    
    // Fallback to holdings-based calculation if no allocation status provided
    const totalValue = holdings.reduce((sum, h) => sum + h.current_value, 0)
    
    if (totalValue > 0) {
      const currentAllocation: TargetAllocation = {}
      
      holdings.forEach(holding => {
        const percentage = (holding.current_value / totalValue) * 100
        currentAllocation[holding.ticker] = Math.round(percentage * 100) / 100
      })
      
      const calculatedTotal = Object.values(currentAllocation).reduce((sum, val) => sum + val, 0)
      if (Math.abs(calculatedTotal - 100) > 0.001) {
        const largestTicker = Object.entries(currentAllocation)
          .sort(([, a], [, b]) => b - a)[0][0]
        
        currentAllocation[largestTicker] += (100 - calculatedTotal)
        currentAllocation[largestTicker] = Math.round(currentAllocation[largestTicker] * 100) / 100
      }
      
      setAllocations(currentAllocation)
      setError(null)
    }
  }

  // Toggle lock status for a ticker
  const toggleLock = (ticker: string) => {
    setLockedTickers(prev => {
      const newLocked = new Set(prev)
      if (newLocked.has(ticker)) {
        newLocked.delete(ticker)
      } else {
        newLocked.add(ticker)
      }
      return newLocked
    })
  }

  // Redistribute remaining percentage among unlocked tickers
  const redistributeRemaining = () => {
    const tickers = Object.keys(allocations)
    if (tickers.length === 0) return

    // Calculate locked total
    const lockedTotal = tickers
      .filter(t => lockedTickers.has(t))
      .reduce((sum, t) => sum + (allocations[t] || 0), 0)

    // Calculate remaining percentage
    const remaining = 100 - lockedTotal

    // Get unlocked tickers
    const unlockedTickers = tickers.filter(t => !lockedTickers.has(t))
    
    if (unlockedTickers.length === 0) {
      setError('Cannot redistribute: all tickers are locked')
      return
    }

    if (remaining < 0) {
      setError(`Cannot redistribute: locked tickers total ${lockedTotal.toFixed(2)}% (over 100%)`)
      return
    }

    // Distribute remaining equally among unlocked tickers
    const equalWeight = remaining / unlockedTickers.length
    const newAllocations: TargetAllocation = { ...allocations }
    
    unlockedTickers.forEach(ticker => {
      newAllocations[ticker] = parseFloat(equalWeight.toFixed(2))
    })

    // Adjust last unlocked ticker to make total exactly 100%
    const total = Object.values(newAllocations).reduce((sum, val) => sum + val, 0)
    const lastUnlockedTicker = unlockedTickers[unlockedTickers.length - 1]
    newAllocations[lastUnlockedTicker] += 100 - total
    newAllocations[lastUnlockedTicker] = parseFloat(newAllocations[lastUnlockedTicker].toFixed(2))

    setAllocations(newAllocations)
    setError(null)
  }

  // Auto-distribute remaining weight
  const autoDistribute = () => {
    const tickers = Object.keys(allocations)
    if (tickers.length === 0) return

    const equalWeight = 100 / tickers.length
    const newAllocations: TargetAllocation = {}
    tickers.forEach(ticker => {
      newAllocations[ticker] = parseFloat(equalWeight.toFixed(2))
    })

    // Adjust last ticker to make total exactly 100%
    const total = Object.values(newAllocations).reduce((sum, val) => sum + val, 0)
    const lastTicker = tickers[tickers.length - 1]
    newAllocations[lastTicker] += 100 - total

    setAllocations(newAllocations)
    setLockedTickers(new Set()) // Clear all locks when auto-distributing
  }

  // Scale down all allocations proportionally to reach 100%
  const scaleDownTo100 = () => {
    const currentTotal = Object.values(allocations).reduce((sum, val) => sum + val, 0)
    if (currentTotal <= 100) return

    const scaleFactor = 100 / currentTotal
    const newAllocations: TargetAllocation = {}
    
    Object.entries(allocations).forEach(([ticker, weight]) => {
      newAllocations[ticker] = parseFloat((weight * scaleFactor).toFixed(2))
    })

    // Adjust last ticker to make total exactly 100%
    const newTotal = Object.values(newAllocations).reduce((sum, val) => sum + val, 0)
    const lastTicker = Object.keys(newAllocations)[Object.keys(newAllocations).length - 1]
    newAllocations[lastTicker] += 100 - newTotal
    newAllocations[lastTicker] = parseFloat(newAllocations[lastTicker].toFixed(2))

    setAllocations(newAllocations)
    setError(null)
  }

  if (loading) {
    return (
      <div className="glass rounded-xl p-4 sm:p-6">
        <div className="text-center text-gray-400 text-sm sm:text-base">Loading...</div>
      </div>
    )
  }

  return (
    <div className="glass rounded-xl overflow-hidden">
        {/* Header */}
        <div className="p-3 sm:p-6 border-b border-white/[0.06]">
          <div className="flex items-start justify-between gap-2 sm:gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-2xl font-bold text-white font-heading">Edit Target Allocation</h2>
              <p className="text-gray-400 mt-1 text-xs sm:text-sm">
                Set target weights (total 100%). Lock (🔒) tickers to keep their percentage fixed.
              </p>
              
              {/* Configuration Section - Compact on mobile */}
              <div className="mt-3 sm:mt-4 p-2 sm:p-3 bg-white/[0.03] rounded-xl border border-white/[0.06]">
                {/* Buttons row */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <button
                    onClick={resetToCurrentPortfolio}
                    disabled={holdings.length === 0}
                    className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm bg-white/10 text-white rounded-lg hover:bg-white/15 transition disabled:opacity-50"
                  >
                    📊 <span className="hidden xs:inline">Reset to </span>Current
                  </button>
                  <button
                    onClick={autoDistribute}
                    className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm bg-white/10 text-white rounded-lg hover:bg-white/15 transition"
                  >
                    ⚖️ <span className="hidden xs:inline">Auto-</span>Distribute
                  </button>
                  
                  <div className="hidden sm:block h-6 w-px bg-white/10"></div>
                  
                  <label className="inline-flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-200">
                    <input
                      type="checkbox"
                      checked={buyOnlyMode}
                      onChange={(e) => setBuyOnlyMode(e.target.checked)}
                      className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded border-white/10 bg-white/5"
                    />
                    <span>Buy-only</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-3 sm:p-6 overflow-y-auto flex-1">
          {/* Current Allocations */}
          <div className="space-y-1.5 sm:space-y-2">
            {Object.entries(allocations).map(([ticker, weight]) => {
              const isLocked = lockedTickers.has(ticker)
              return (
                <div key={ticker} className="flex items-center gap-1.5 sm:gap-2">
                  {/* Lock button */}
                  <button
                    onClick={() => toggleLock(ticker)}
                    className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg transition flex-shrink-0 ${
                      isLocked 
                        ? 'bg-accent-600 text-white hover:bg-accent-700' 
                        : 'bg-white/10 text-gray-400 hover:bg-white/15'
                    }`}
                    title={isLocked ? 'Unlock' : 'Lock'}
                  >
                    <span className="text-xs">{isLocked ? '🔒' : '🔓'}</span>
                  </button>
                  
                  {/* Ticker name */}
                  <span className="w-16 sm:w-24 font-mono text-xs sm:text-sm text-white truncate flex-shrink-0">{ticker}</span>
                  
                  {/* Input with % */}
                  <div className="flex-1 flex items-center gap-1 min-w-0">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={weight}
                      onChange={(e) => {
                        const val = e.target.value
                        // Allow typing: numbers, dots, empty
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                          const numVal = val === '' ? 0 : parseFloat(val) || 0
                          updateAllocation(ticker, numVal)
                        }
                      }}
                      onBlur={(e) => {
                        // Clean up on blur: ensure valid number
                        const numVal = parseFloat(e.target.value) || 0
                        const clamped = Math.max(0, Math.min(100, numVal))
                        updateAllocation(ticker, parseFloat(clamped.toFixed(2)))
                      }}
                      onFocus={(e) => e.target.select()}
                      placeholder="0"
                      className={`w-full px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 ${
                        isLocked
                          ? 'bg-accent-900/30 text-white border-accent-600 ring-1 ring-accent-500/50'
                          : 'bg-surface-elevated text-white border-white/[0.08]'
                      }`}
                      title={isLocked ? 'Locked: others will adjust' : ''}
                    />
                    <span className="text-gray-400 text-xs sm:text-sm flex-shrink-0">%</span>
                  </div>
                  
                  {/* Remove button */}
                  <button
                    onClick={() => removeTicker(ticker)}
                    className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-red-600 text-white rounded hover:bg-red-700 transition flex-shrink-0"
                    title="Remove ticker"
                  >
                    ×
                  </button>
                </div>
              )
            })}

          </div>

          {/* Quick Fixes (only show when needed) */}
          {Object.keys(allocations).length > 0 && (total > 100 || lockedTickers.size > 0) && (
            <div className="mt-3 sm:mt-4 flex gap-2 sm:gap-4 flex-wrap text-xs sm:text-sm">
              {/* Scale down button - only show when over 100% */}
              {total > 100 && (
                <button
                  onClick={scaleDownTo100}
                  className="text-yellow-400 hover:text-yellow-300 underline"
                >
                  📉 Scale to 100%
                </button>
              )}
              
              {/* Redistribute locked/unlocked */}
              {lockedTickers.size > 0 && (
                <button
                  onClick={redistributeRemaining}
                  className="text-green-400 hover:text-green-300 underline"
                >
                  ✨ Redistribute unlocked
                </button>
              )}
            </div>
          )}

          {/* Total Display */}
          <div className={`mt-4 sm:mt-6 p-3 sm:p-4 rounded-lg border ${
            isValid 
              ? 'bg-green-500/10 border-green-500/30' 
              : 'bg-red-500/10 border-red-500/30'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-gray-300 font-semibold text-sm sm:text-base">Total:</span>
              <span className={`text-xl sm:text-2xl font-bold ${
                isValid ? 'text-green-400' : 'text-red-400'
              }`}>
                {total.toFixed(2)}%
              </span>
            </div>
            {!isValid && (
              <div className="text-xs sm:text-sm text-red-400 mt-1.5 sm:mt-2">
                ❌ Must equal 100% ({total > 100 ? '+' : ''}{(total - 100).toFixed(2)}% {total > 100 ? 'over' : 'under'})
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-3 sm:mt-4 p-2 sm:p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-xs sm:text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-6 border-t border-white/[0.06] flex items-center justify-end gap-2 sm:gap-3">
          <button
            onClick={handleSave}
            disabled={!isValid || saving || Object.keys(allocations).length === 0}
            className="px-4 sm:px-6 py-2 sm:py-3 bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm sm:text-base"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
  )
}


