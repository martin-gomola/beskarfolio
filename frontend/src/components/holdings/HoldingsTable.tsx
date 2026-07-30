import React, { useState, useEffect } from 'react'
import { Holding } from '../../types'
import { formatCurrency, HOLDINGS_COLUMNS_STORAGE_KEY } from '../../utils'
import { useTableSort, usePrivacyMode, use52WeekRanges } from '../../hooks'
import { PRIVACY_MASK } from '../../hooks/usePrivacyMode'
import { TickerActionsMenu } from './TickerActionsMenu'
import { TransactionsModal } from '../transactions'
import { PriceHistoryInline } from './PriceHistoryInline'
import { FiftyTwoWeekChip } from './FiftyTwoWeekChip'

interface HoldingsTableProps {
  holdings: Holding[]
  onUpdate: () => void
  mobileExpanded?: boolean
  onMobileExpandedChange?: (expanded: boolean) => void
}

type ColumnKey = 'shares' | 'avgPrice' | 'invested' | 'currentPrice' | 'value' | 'return'

interface VisibleColumns {
  shares: boolean
  avgPrice: boolean
  invested: boolean
  currentPrice: boolean
  value: boolean
  return: boolean
}

const DEFAULT_COLUMNS: VisibleColumns = {
  shares: true,
  avgPrice: true,
  invested: true,
  currentPrice: true,
  value: true,
  return: true,
}

/**
 * Holdings Table Component
 * Displays all portfolio holdings with sortable columns and search
 * Includes mobile column visibility selector
 */
export const HoldingsTable: React.FC<HoldingsTableProps> = ({
  holdings,
  onUpdate,
  mobileExpanded = false,
  onMobileExpandedChange,
}) => {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null)
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showColumnSelector, setShowColumnSelector] = useState(false)
  const { sortBy, sortOrder, handleSort } = useTableSort<'ticker' | 'value' | 'return'>('value', 'desc')
  const { isPrivate } = usePrivacyMode()
  const { ranges: weekRanges } = use52WeekRanges()
  
  // Load visible columns from localStorage or use defaults
  const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>(() => {
    const stored = localStorage.getItem(HOLDINGS_COLUMNS_STORAGE_KEY)
    return stored ? JSON.parse(stored) : DEFAULT_COLUMNS
  })
  
  // Save visible columns to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(HOLDINGS_COLUMNS_STORAGE_KEY, JSON.stringify(visibleColumns))
  }, [visibleColumns])
  
  const toggleColumn = (column: ColumnKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [column]: !prev[column]
    }))
  }
  
  const resetColumns = () => {
    setVisibleColumns(DEFAULT_COLUMNS)
  }

  const renderPriceCell = (holding: Holding) => {
    if (isPrivate) {
      return PRIVACY_MASK
    }

    if (holding.price_status === 'estimated') {
      return (
        <div className="flex flex-col items-end">
          <span className="text-amber-300">Est. {formatCurrency(holding.current_price, holding.currency)}</span>
          <span className="text-[11px] text-amber-500/80">cost basis</span>
        </div>
      )
    }

    if (holding.price_status === 'stale') {
      return (
        <span className="text-gray-400" title="Stale quote — price may be outdated">
          {formatCurrency(holding.current_price, holding.currency)}
        </span>
      )
    }

    return formatCurrency(holding.current_price, holding.currency)
  }

  const renderValueCell = (holding: Holding) => {
    if (isPrivate) {
      return PRIVACY_MASK
    }

    if (holding.price_status === 'estimated') {
      return (
        <div className="flex flex-col items-end">
          <span className="text-amber-300">{formatCurrency(holding.current_value, holding.currency)}</span>
          <span className="text-[11px] text-amber-500/80">estimated value</span>
        </div>
      )
    }

    return formatCurrency(holding.current_value, holding.currency)
  }

  const getReturnColor = (holding: Holding): string => {
    if (holding.price_status === 'estimated') {
      return 'text-amber-300'
    }

    return holding.gain_loss >= 0 ? 'text-gain' : 'text-loss'
  }

  const getReturnBackground = (holding: Holding): string => {
    if (holding.price_status === 'estimated') {
      return 'bg-amber-500/10'
    }

    return holding.gain_loss >= 0 ? 'bg-gain/10' : 'bg-loss/10'
  }

  const renderReturnValue = (holding: Holding) => {
    if (isPrivate) {
      return PRIVACY_MASK
    }

    if (holding.price_status === 'estimated') {
      return 'Estimated'
    }

    return `${holding.gain_loss >= 0 ? '+' : ''}${formatCurrency(holding.gain_loss, holding.currency)}`
  }

  const renderReturnPercent = (holding: Holding): string => {
    if (holding.price_status === 'estimated') {
      return 'Est.'
    }

    return `${holding.gain_loss_pct >= 0 ? '+' : ''}${holding.gain_loss_pct.toFixed(2)}%`
  }

  if (holdings.length === 0) {
    return null
  }

  // Filter and sort holdings
  const filteredHoldings = holdings
    .filter(h => h.ticker.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'ticker':
          comparison = a.ticker.localeCompare(b.ticker)
          break
        case 'value':
          comparison = a.current_value - b.current_value
          break
        case 'return':
          comparison = a.gain_loss_pct - b.gain_loss_pct
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

  return (
    <>
      <div className="glass rounded-xl overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-white/5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-lg font-semibold text-white tracking-tight font-heading">Holdings details</h2>
              <p className="mt-0.5 text-xs text-gray-500 md:hidden">
                Prices, history and position actions
              </p>
            </div>

            <button
              type="button"
              onClick={() => onMobileExpandedChange?.(!mobileExpanded)}
              aria-expanded={mobileExpanded}
              aria-controls="mobile-holdings-list"
              className="min-h-11 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 text-sm font-medium text-gray-300 transition-colors hover:bg-white/[0.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-accent-500/50 md:hidden"
            >
              {mobileExpanded ? 'Hide details' : `View all ${holdings.length}`}
            </button>
            
            {/* Column Selector */}
            <div className="relative hidden md:block">
              <button
                onClick={() => setShowColumnSelector(!showColumnSelector)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition-all"
                title="Select columns"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1"/>
                  <rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/>
                  <rect x="14" y="14" width="7" height="7" rx="1"/>
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
                  <div className="absolute right-0 mt-2 w-64 bg-surface-dark border border-white/10 rounded-xl shadow-2xl z-50">
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-medium text-white">Show Columns</h3>
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
                            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-accent-500 focus:ring-2 focus:ring-accent-500 focus:ring-offset-0"
                          />
                          <span className="text-sm text-gray-300 group-hover:text-gray-100">Shares</span>
                        </label>
                        
                        <label className="flex items-center gap-3 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={visibleColumns.avgPrice}
                            onChange={() => toggleColumn('avgPrice')}
                            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-accent-500 focus:ring-2 focus:ring-accent-500 focus:ring-offset-0"
                          />
                          <span className="text-sm text-gray-300 group-hover:text-gray-100">Avg Price</span>
                        </label>
                        
                        <label className="flex items-center gap-3 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={visibleColumns.invested}
                            onChange={() => toggleColumn('invested')}
                            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-accent-500 focus:ring-2 focus:ring-accent-500 focus:ring-offset-0"
                          />
                          <span className="text-sm text-gray-300 group-hover:text-gray-100">Invested</span>
                        </label>
                        
                        <label className="flex items-center gap-3 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={visibleColumns.currentPrice}
                            onChange={() => toggleColumn('currentPrice')}
                            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-accent-500 focus:ring-2 focus:ring-accent-500 focus:ring-offset-0"
                          />
                          <span className="text-sm text-gray-300 group-hover:text-gray-100">Current Price</span>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={visibleColumns.value}
                            onChange={() => toggleColumn('value')}
                            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-accent-500 focus:ring-2 focus:ring-accent-500 focus:ring-offset-0"
                          />
                          <span className="text-sm text-gray-300 group-hover:text-gray-100">Value</span>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={visibleColumns.return}
                            onChange={() => toggleColumn('return')}
                            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-accent-500 focus:ring-2 focus:ring-accent-500 focus:ring-offset-0"
                          />
                          <span className="text-sm text-gray-300 group-hover:text-gray-100">Return (€)</span>
                        </label>
                      </div>

                      <div className="mt-3 pt-3 border-t border-gray-700">
                        <p className="text-xs text-gray-500">Ticker and % are always visible</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Search Bar */}
          <div className={`${mobileExpanded ? 'flex' : 'hidden'} items-center gap-2 sm:gap-3 md:flex`}>
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search..."
                className="w-full pl-9 pr-8 py-2 text-sm bg-white/5 border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500/50 text-white placeholder-gray-500"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <span className="text-xs sm:text-sm text-gray-400 whitespace-nowrap">{filteredHoldings.length} of {holdings.length}</span>
          </div>
        </div>

        <div id="mobile-holdings-list" className={`${mobileExpanded ? 'divide-y divide-white/5' : 'hidden'} md:hidden`}>
          {filteredHoldings.map((holding) => {
            const returnColor = getReturnColor(holding)
            const isExpanded = expandedTicker === holding.ticker

            return (
              <div key={holding.ticker} className={`${isExpanded ? 'bg-white/[0.02]' : ''}`}>
                <div className="flex items-start gap-1 px-2 py-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded-lg px-1 py-2 text-left transition-colors hover:bg-white/[0.02] focus:outline-none focus:ring-2 focus:ring-accent-500/40 btn-press"
                    onClick={() => setExpandedTicker(isExpanded ? null : holding.ticker)}
                    aria-expanded={isExpanded}
                    aria-controls={`holding-details-${holding.ticker}`}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <svg
                            className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            fill="currentColor"
                            viewBox="0 0 20 20"
                            aria-hidden="true"
                          >
                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                          <span className="truncate text-base font-semibold text-gray-100">{holding.ticker}</span>
                          <FiftyTwoWeekChip
                            currentPrice={holding.current_price}
                            range={weekRanges[holding.ticker]}
                          />
                        </div>
                        <div className="mt-1 pl-6 text-xs text-gray-500">
                          {isPrivate
                            ? PRIVACY_MASK
                          : `${holding.shares.toLocaleString('en-US', { maximumFractionDigits: 2 })} shares at ${formatCurrency(holding.avg_buy_price, holding.currency)}`}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-sm font-medium tabular-nums text-gray-100">{renderValueCell(holding)}</div>
                        <div className={`mt-1 text-xs font-semibold tabular-nums ${isPrivate ? 'text-gray-500' : returnColor}`}>
                          {renderReturnPercent(holding)}
                        </div>
                      </div>
                    </div>
                  </button>

                  <div className="shrink-0">
                    <TickerActionsMenu
                      ticker={holding.ticker}
                      onViewTransactions={() => setSelectedTicker(holding.ticker)}
                      onViewPriceHistory={() => setExpandedTicker(isExpanded ? null : holding.ticker)}
                      onHoldingRemoved={onUpdate}
                    />
                  </div>
                </div>

                {isExpanded && (
                  <div id={`holding-details-${holding.ticker}`} className="border-t border-white/5">
                    <div className="grid grid-cols-2 gap-3 px-4 py-3">
                      <div>
                        <div className="text-[11px] font-medium uppercase tracking-wide text-gray-600">Current price</div>
                        <div className="mt-1 text-sm font-medium text-gray-300">{renderPriceCell(holding)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-gray-600">Profit & loss</div>
                        <div className={`mt-1 text-sm font-semibold ${isPrivate ? 'text-gray-500' : returnColor}`}>
                          {renderReturnValue(holding)}
                        </div>
                      </div>
                    </div>
                    <PriceHistoryInline ticker={holding.ticker} currency={holding.currency} />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-black/20 border-b border-white/5">
                <th
                  onClick={() => handleSort('ticker')}
                  className="text-left py-2 sm:py-4 px-3 sm:px-6 text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200 select-none"
                >
                  <div className="flex items-center gap-2">
                    Ticker
                    {sortBy === 'ticker' && (
                      <svg className={`w-4 h-4 transition-transform ${sortOrder === 'asc' ? 'rotate-180' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </th>
                {visibleColumns.shares && (
                  <th className="text-right py-2 sm:py-4 px-3 sm:px-6 text-xs font-medium text-gray-400 uppercase tracking-wider lg:table-cell">Shares</th>
                )}
                {visibleColumns.avgPrice && (
                  <th className="text-right py-2 sm:py-4 px-3 sm:px-6 text-xs font-medium text-gray-400 uppercase tracking-wider lg:table-cell">Avg Price</th>
                )}
                {visibleColumns.invested && (
                  <th className="text-right py-2 sm:py-4 px-3 sm:px-6 text-xs font-medium text-gray-400 uppercase tracking-wider lg:table-cell">Invested</th>
                )}
                {visibleColumns.currentPrice && (
                  <th className="text-right py-2 sm:py-4 px-3 sm:px-6 text-xs font-medium text-gray-400 uppercase tracking-wider lg:table-cell">Current Price</th>
                )}
                {visibleColumns.value && (
                  <th
                    onClick={() => handleSort('value')}
                    className="text-right py-2 sm:py-4 px-3 sm:px-6 text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200 select-none"
                  >
                    <div className="flex items-center justify-end gap-2">
                      Value
                      {sortBy === 'value' && (
                        <svg className={`w-4 h-4 transition-transform ${sortOrder === 'asc' ? 'rotate-180' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </th>
                )}
                {visibleColumns.return && (
                  <th className="text-right py-2 sm:py-4 px-3 sm:px-6 text-xs font-medium text-gray-400 uppercase tracking-wider lg:table-cell">Return</th>
                )}
                <th
                  onClick={() => handleSort('return')}
                  className="text-right py-2 sm:py-4 px-3 sm:px-6 text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200 select-none"
                >
                  <div className="flex items-center justify-end gap-2">
                    <span className="hidden sm:inline">Return %</span>
                    <span className="sm:hidden">%</span>
                    {sortBy === 'return' && (
                      <svg className={`w-4 h-4 transition-transform ${sortOrder === 'asc' ? 'rotate-180' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </th>
                <th className="w-10 sm:w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredHoldings.map((holding) => {
                const returnColor = getReturnColor(holding)
                const returnBg = getReturnBackground(holding)
                const isExpanded = expandedTicker === holding.ticker

                return (
                  <React.Fragment key={holding.ticker}>
                    <tr
                      className={`hover:bg-white/[0.02] transition-colors cursor-pointer ${isExpanded ? 'bg-white/[0.02]' : ''}`}
                      onClick={() => setExpandedTicker(isExpanded ? null : holding.ticker)}
                    >
                      <td className="py-3 sm:py-4 px-3 sm:px-6 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <svg
                            className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                          <span className="font-medium text-sm sm:text-base text-gray-100 whitespace-nowrap">{holding.ticker}</span>
                          <FiftyTwoWeekChip
                            currentPrice={holding.current_price}
                            range={weekRanges[holding.ticker]}
                          />
                        </div>
                      </td>
                      {visibleColumns.shares && (
                        <td className="py-3 sm:py-4 px-3 sm:px-6 text-right text-sm text-gray-300 lg:table-cell">{isPrivate ? PRIVACY_MASK : holding.shares.toFixed(2)}</td>
                      )}
                      {visibleColumns.avgPrice && (
                        <td className="py-3 sm:py-4 px-3 sm:px-6 text-right text-sm text-gray-300 lg:table-cell">{isPrivate ? PRIVACY_MASK : formatCurrency(holding.avg_buy_price, holding.currency)}</td>
                      )}
                      {visibleColumns.invested && (
                        <td className="py-3 sm:py-4 px-3 sm:px-6 text-right text-sm text-gray-300 lg:table-cell">{isPrivate ? PRIVACY_MASK : formatCurrency(holding.shares * holding.avg_buy_price, holding.currency)}</td>
                      )}
                      {visibleColumns.currentPrice && (
                        <td className="py-3 sm:py-4 px-3 sm:px-6 text-right text-sm text-gray-100 font-medium lg:table-cell">
                          {renderPriceCell(holding)}
                        </td>
                      )}
                      {visibleColumns.value && (
                        <td className="py-3 sm:py-4 px-3 sm:px-6 text-right text-sm sm:text-base text-gray-100 font-medium">
                          {renderValueCell(holding)}
                        </td>
                      )}
                      {visibleColumns.return && (
                        <td className={`py-3 sm:py-4 px-3 sm:px-6 text-right text-sm font-medium ${isPrivate ? 'text-gray-500' : returnColor} lg:table-cell`}>
                          {renderReturnValue(holding)}
                        </td>
                      )}
                      <td className="py-3 sm:py-4 px-3 sm:px-6 text-right">
                        <span className={`inline-flex items-center px-2 sm:px-2.5 py-1 rounded-full text-xs font-medium ${returnBg} ${returnColor}`}>
                          {renderReturnPercent(holding)}
                        </span>
                      </td>
                      <td className="py-3 sm:py-4 px-3 sm:px-6" onClick={(e) => e.stopPropagation()}>
                        <TickerActionsMenu
                          ticker={holding.ticker}
                          onViewTransactions={() => setSelectedTicker(holding.ticker)}
                          onViewPriceHistory={() => setExpandedTicker(isExpanded ? null : holding.ticker)}
                          onHoldingRemoved={onUpdate}
                        />
                      </td>
                    </tr>
                    {/* Expanded Price History */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={10} className="p-0">
                          <PriceHistoryInline ticker={holding.ticker} currency={holding.currency} />
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

      {selectedTicker && (
        <TransactionsModal
          ticker={selectedTicker}
          onClose={() => setSelectedTicker(null)}
          onUpdate={onUpdate}
        />
      )}
    </>
  )
}
