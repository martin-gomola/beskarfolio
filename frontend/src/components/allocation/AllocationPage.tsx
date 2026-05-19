/**
 * Portfolio Allocation & Rebalancing Page
 * 
 * Shows current vs. target allocation with drift analysis
 * Allows editing target allocations
 * Generates rebalancing recommendations
 */

import { useState, useEffect } from 'react'
import { allocationService } from '../../services/allocationService'
import { TargetAllocationEditor } from './TargetAllocationEditor'
import { ShareBasedRebalancingToolInline } from './ShareBasedRebalancingToolInline'
import type { AllocationStatus, AllocationData } from '../../types/allocation'

// Column visibility configuration
type AllocationColumnKey = 'shares' | 'valueEur' | 'driftEur' | 'sharesToTrade' | 'action'

interface AllocationVisibleColumns {
  shares: boolean
  valueEur: boolean
  driftEur: boolean
  sharesToTrade: boolean
  action: boolean
}

const ALLOCATION_COLUMNS_STORAGE_KEY = 'beskarfolio_allocation_visible_columns'

const DEFAULT_ALLOCATION_COLUMNS: AllocationVisibleColumns = {
  shares: true,
  valueEur: true,
  driftEur: true,
  sharesToTrade: true,
  action: true,
}

export function AllocationPage() {
  const [status, setStatus] = useState<AllocationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'drift' | 'ticker' | 'current' | 'target'>('drift')
  const [sortAsc, setSortAsc] = useState(false)
  const [activeTab, setActiveTab] = useState<'status' | 'edit' | 'whatif'>('status')
  const [showColumnSelector, setShowColumnSelector] = useState(false)
  
  // Load visible columns from localStorage or use defaults
  const [visibleColumns, setVisibleColumns] = useState<AllocationVisibleColumns>(() => {
    const stored = localStorage.getItem(ALLOCATION_COLUMNS_STORAGE_KEY)
    return stored ? JSON.parse(stored) : DEFAULT_ALLOCATION_COLUMNS
  })
  
  // Save visible columns to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(ALLOCATION_COLUMNS_STORAGE_KEY, JSON.stringify(visibleColumns))
  }, [visibleColumns])
  
  const toggleColumn = (column: AllocationColumnKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [column]: !prev[column]
    }))
  }
  
  const resetColumns = () => {
    setVisibleColumns(DEFAULT_ALLOCATION_COLUMNS)
  }

  // Load allocation status
  const loadStatus = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Check if target allocations exist first
      const targets = await allocationService.getTargets()
      if (!targets.allocations || Object.keys(targets.allocations).length === 0) {
        // No target allocations configured - show empty state
        setStatus(null)
        setLoading(false)
        return
      }
      
      const data = await allocationService.getStatus()
      setStatus(data)
    } catch (err: any) {
      console.error('Failed to load allocation status:', err)
      setError(err.response?.data?.detail || err.message || 'Failed to load allocation status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStatus()
  }, [])

  // Sort drift data
  const sortedDrift = status?.drift_data ? [...status.drift_data].sort((a, b) => {
    let aVal, bVal
    switch (sortBy) {
      case 'ticker':
        aVal = a.ticker
        bVal = b.ticker
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      case 'current':
        aVal = a.current_weight_pct
        bVal = b.current_weight_pct
        break
      case 'target':
        aVal = a.target_weight_pct
        bVal = b.target_weight_pct
        break
      case 'drift':
      default:
        aVal = Math.abs(a.drift_pct)
        bVal = Math.abs(b.drift_pct)
        break
    }
    return sortAsc ? aVal - bVal : bVal - aVal
  }) : []

  // Handle sort column click
  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortAsc(!sortAsc)
    } else {
      setSortBy(column)
      setSortAsc(false)
    }
  }

  // Get action badge color
  const getActionColor = (action: string) => {
    switch (action) {
      case 'buy': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      case 'sell': return 'bg-rose-500/10 text-rose-400 border-rose-500/20'
      default: return 'bg-white/5 text-gray-400 border-white/10'
    }
  }

  // Get drift color
  const getDriftColor = (drift: number) => {
    if (Math.abs(drift) < 1) return 'text-gray-400'
    return drift > 0 ? 'text-rose-400' : 'text-emerald-400'
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Loading allocation data...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
          <p className="text-rose-400">{error}</p>
          {error.includes('No target allocation') && (
            <button
              onClick={() => setActiveTab('edit')}
              className="mt-3 px-4 py-2 bg-accent-600 text-white rounded-xl hover:bg-accent-700 transition-colors"
            >
              Set Target Allocation
            </button>
          )}
        </div>
      </div>
    )
  }

  // Show empty state when no target allocations configured AND not in edit mode
  if (!status && activeTab !== 'edit') {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white tracking-tight font-heading">Portfolio Allocation</h1>
        </div>
        
        <div className="glass rounded-xl p-8 text-center">
          <div className="text-gray-400 mb-6">
            <div className="mx-auto w-12 h-12 mb-4 rounded-xl bg-white/5 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>
                <path d="M22 12A10 10 0 0 0 12 2v10z"/>
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No Target Allocation Configured</h3>
            <p className="text-sm text-gray-500">Set your target allocation percentages to track drift and get rebalancing recommendations.</p>
          </div>
          
          <button
            onClick={() => setActiveTab('edit')}
            className="px-6 py-3 bg-accent-600 text-white rounded-xl hover:bg-accent-700 transition-colors font-medium"
          >
            Set Target Allocation
          </button>
        </div>
      </div>
    )
  }

  // Show editor if in edit mode (even without existing status)
  if (!status && activeTab === 'edit') {
    return (
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white font-heading">Portfolio Allocation</h1>
            <p className="text-gray-400 mt-1 text-sm sm:text-base">
              Set your target allocation percentages
            </p>
          </div>
          
          {/* Back button */}
          <button
            onClick={() => setActiveTab('status')}
            className="self-start px-4 py-2 text-sm text-gray-400 hover:text-white transition"
          >
            ← Back
          </button>
        </div>
        
        <TargetAllocationEditor
          onSave={() => {
            setActiveTab('status')
            loadStatus()
          }}
          currentAllocationStatus={null}
        />
      </div>
    )
  }

  // At this point, status is guaranteed to be non-null
  // (TypeScript doesn't infer this from the early returns above)
  if (!status) return null

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight font-heading">Portfolio Allocation</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">
            Current vs. target allocation with rebalancing recommendations
          </p>
        </div>
        
        {/* Tabs - Segmented Control Style */}
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('status')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              activeTab === 'status'
                ? 'bg-accent-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Status
          </button>
          <button
            onClick={() => setActiveTab('edit')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              activeTab === 'edit'
                ? 'bg-accent-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Edit Targets
          </button>
          <button
            onClick={() => setActiveTab('whatif')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              activeTab === 'whatif'
                ? 'bg-accent-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            What-If
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'status' && (
        <>
          {/* Summary Cards - Compact horizontal layout */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <div className="glass rounded-xl p-2.5 sm:p-5">
              <div className="text-[10px] sm:text-sm text-gray-500 uppercase tracking-wider mb-1 sm:mb-2">Value</div>
              <div className="text-sm sm:text-2xl font-semibold text-white tracking-tight">
                €{(status.total_value_eur / 1000).toFixed(1)}k
              </div>
            </div>
            <div className="glass rounded-xl p-2.5 sm:p-5">
              <div className="text-[10px] sm:text-sm text-gray-500 uppercase tracking-wider mb-1 sm:mb-2">Drift</div>
              <div className={`text-sm sm:text-2xl font-semibold tracking-tight ${
                status.total_drift_pct > 10 ? 'text-rose-400' :
                status.total_drift_pct > 5 ? 'text-amber-400' :
                'text-emerald-400'
              }`}>
                {status.total_drift_pct.toFixed(1)}%
              </div>
            </div>
            <div className="glass rounded-xl p-2.5 sm:p-5">
              <div className="text-[10px] sm:text-sm text-gray-500 uppercase tracking-wider mb-1 sm:mb-2">Status</div>
              <div className={`text-xs sm:text-lg font-semibold ${
                status.needs_rebalancing ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {status.needs_rebalancing ? 'Rebalance' : 'Balanced'}
              </div>
            </div>
          </div>

      {/* Allocation Table */}
      <div className="glass rounded-xl overflow-hidden">
        {/* Table Header with Column Selector */}
        <div className="px-4 sm:px-5 py-3 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Allocation Details</h3>
          
          {/* Column Selector Button */}
          <div className="relative">
            <button
              onClick={() => setShowColumnSelector(!showColumnSelector)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg transition"
              title="Select columns"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
              </svg>
              <span>Columns</span>
            </button>
            
            {/* Column Selector Dropdown */}
            {showColumnSelector && (
              <>
                {/* Backdrop */}
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowColumnSelector(false)}
                />
                
                {/* Dropdown */}
                <div className="absolute right-0 mt-2 w-64 bg-surface-dark border border-white/10 rounded-xl shadow-xl z-50">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-white">Show Columns</h4>
                      <button
                        onClick={resetColumns}
                        className="text-xs text-accent-400 hover:text-accent-300"
                      >
                        Reset
                      </button>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={visibleColumns.shares}
                          onChange={() => toggleColumn('shares')}
                          className="w-4 h-4 rounded border-white/10 bg-white/5 text-accent-500 focus:ring-2 focus:ring-accent-500/50 focus:ring-offset-0"
                        />
                        <span className="text-sm text-gray-400 group-hover:text-white">Shares</span>
                      </label>
                      
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={visibleColumns.valueEur}
                          onChange={() => toggleColumn('valueEur')}
                          className="w-4 h-4 rounded border-white/10 bg-white/5 text-accent-500 focus:ring-2 focus:ring-accent-500/50 focus:ring-offset-0"
                        />
                        <span className="text-sm text-gray-400 group-hover:text-white">Value (EUR)</span>
                      </label>
                      
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={visibleColumns.driftEur}
                          onChange={() => toggleColumn('driftEur')}
                          className="w-4 h-4 rounded border-white/10 bg-white/5 text-accent-500 focus:ring-2 focus:ring-accent-500/50 focus:ring-offset-0"
                        />
                        <span className="text-sm text-gray-400 group-hover:text-white">Drift (EUR)</span>
                      </label>
                      
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={visibleColumns.sharesToTrade}
                          onChange={() => toggleColumn('sharesToTrade')}
                          className="w-4 h-4 rounded border-white/10 bg-white/5 text-accent-500 focus:ring-2 focus:ring-accent-500/50 focus:ring-offset-0"
                        />
                        <span className="text-sm text-gray-400 group-hover:text-white">Shares to Trade</span>
                      </label>
                      
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={visibleColumns.action}
                          onChange={() => toggleColumn('action')}
                          className="w-4 h-4 rounded border-white/10 bg-white/5 text-accent-500 focus:ring-2 focus:ring-accent-500/50 focus:ring-offset-0"
                        />
                        <span className="text-sm text-gray-400 group-hover:text-white">Action</span>
                      </label>
                    </div>
                    
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <p className="text-xs text-gray-500">Ticker, Current %, Target %, and Drift % are always visible</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-black/20">
                <th 
                  onClick={() => handleSort('ticker')}
                  className="px-2 sm:px-4 py-2.5 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-white/[0.02] sticky left-0 bg-[#1e2422] z-10"
                >
                  Ticker {sortBy === 'ticker' && (sortAsc ? '↑' : '↓')}
                </th>
                {visibleColumns.shares && (
                  <th className="px-2 sm:px-4 py-2.5 sm:py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Shares
                  </th>
                )}
                {visibleColumns.valueEur && (
                  <th className="px-2 sm:px-4 py-2.5 sm:py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Value (EUR)
                  </th>
                )}
                <th 
                  onClick={() => handleSort('current')}
                  className="px-2 sm:px-4 py-2.5 sm:py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-white/[0.02]"
                >
                  <span className="hidden sm:inline">Current %</span>
                  <span className="sm:hidden">Cur%</span>
                  {sortBy === 'current' && (sortAsc ? ' ↑' : ' ↓')}
                </th>
                <th 
                  onClick={() => handleSort('target')}
                  className="px-2 sm:px-4 py-2.5 sm:py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-white/[0.02]"
                >
                  <span className="hidden sm:inline">Target %</span>
                  <span className="sm:hidden">Tgt%</span>
                  {sortBy === 'target' && (sortAsc ? ' ↑' : ' ↓')}
                </th>
                <th 
                  onClick={() => handleSort('drift')}
                  className="px-2 sm:px-4 py-2.5 sm:py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-white/[0.02]"
                >
                  <span className="hidden sm:inline">Drift %</span>
                  <span className="sm:hidden">Drft%</span>
                  {sortBy === 'drift' && (sortAsc ? ' ↑' : ' ↓')}
                </th>
                {visibleColumns.driftEur && (
                  <th className="px-2 sm:px-4 py-2.5 sm:py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Drift (€)
                  </th>
                )}
                {visibleColumns.sharesToTrade && (
                  <th className="px-2 sm:px-4 py-2.5 sm:py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <span className="hidden sm:inline">Shares to Trade</span>
                    <span className="sm:hidden">Trade</span>
                  </th>
                )}
                {visibleColumns.action && (
                  <th className="px-2 sm:px-4 py-2.5 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sortedDrift.map((item: AllocationData) => {
                // Calculate current price and shares to trade
                const currentPrice = item.current_shares > 0 ? item.current_value_eur / item.current_shares : 0
                const sharesToTrade = currentPrice > 0 ? Math.round(Math.abs(item.drift_value_eur) / currentPrice) : 0
                const showSharesValue = Math.abs(item.drift_pct) > 1.0 && sharesToTrade > 0
                
                return (
                  <tr key={item.ticker} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-2 sm:px-4 py-2.5 sm:py-3 text-left font-mono text-accent-400 font-medium text-xs sm:text-sm sticky left-0 bg-[#1e2422]">
                      {item.ticker}
                    </td>
                    {visibleColumns.shares && (
                      <td className="px-2 sm:px-4 py-2.5 sm:py-3 text-right text-gray-400 text-xs sm:text-sm">
                        {item.current_shares.toFixed(2)}
                      </td>
                    )}
                    {visibleColumns.valueEur && (
                      <td className="px-2 sm:px-4 py-2.5 sm:py-3 text-right text-gray-400 text-xs sm:text-sm">
                        €{item.current_value_eur.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    )}
                    <td className="px-2 sm:px-4 py-2.5 sm:py-3 text-right text-white font-medium text-xs sm:text-sm">
                      {item.current_weight_pct.toFixed(1)}%
                    </td>
                    <td className="px-2 sm:px-4 py-2.5 sm:py-3 text-right text-gray-500 text-xs sm:text-sm">
                      {item.target_weight_pct.toFixed(1)}%
                    </td>
                    <td className={`px-2 sm:px-4 py-2.5 sm:py-3 text-right font-medium text-xs sm:text-sm ${getDriftColor(item.drift_pct)}`}>
                      {item.drift_pct > 0 ? '+' : ''}{item.drift_pct.toFixed(1)}%
                    </td>
                    {visibleColumns.driftEur && (
                      <td className={`px-2 sm:px-4 py-2.5 sm:py-3 text-right text-xs sm:text-sm ${getDriftColor(item.drift_pct)}`}>
                        {item.drift_value_eur > 0 ? '+' : ''}€{item.drift_value_eur.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    )}
                    {visibleColumns.sharesToTrade && (
                      <td className={`px-2 sm:px-4 py-2.5 sm:py-3 text-right font-semibold text-xs sm:text-sm ${getDriftColor(item.drift_pct)}`}>
                        {showSharesValue ? (
                          <>
                            {item.action === 'sell' ? '-' : item.action === 'buy' ? '+' : ''}{sharesToTrade}
                          </>
                        ) : (
                          <span className="text-gray-600">-</span>
                        )}
                      </td>
                    )}
                    {visibleColumns.action && (
                      <td className="px-2 sm:px-4 py-2.5 sm:py-3 text-center">
                        <span className={`inline-block px-2 py-1 rounded-lg text-xs font-medium border ${getActionColor(item.action)}`}>
                          {item.action.toUpperCase()}
                        </span>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs sm:text-sm text-gray-500">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
          <span>Underweight (Buy)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
          <span>Overweight (Sell)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-gray-500"></div>
          <span>On Target (Hold)</span>
        </div>
      </div>
        </>
      )}

      {/* Edit Tab */}
      {activeTab === 'edit' && (
        <TargetAllocationEditor
          onSave={() => {
            setActiveTab('status')
            loadStatus()
          }}
          currentAllocationStatus={status}
        />
      )}

      {/* What-If Tab */}
      {activeTab === 'whatif' && (
        <ShareBasedRebalancingToolInline />
      )}
    </div>
  )
}

