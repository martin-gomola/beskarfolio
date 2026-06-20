/**
 * Share-Based Rebalancing Tool (Inline Version)
 * 
 * Instead of adjusting percentages, specify how many shares to buy/sell
 * The tool automatically calculates the new portfolio allocation
 * Perfect for: "I want to buy 10 shares of AMZN, how will that affect my portfolio?"
 */

import { useState, useRef, useEffect } from 'react'
import { usePortfolio } from '../../hooks/usePortfolio'

// Simple chevron icon component
const ChevronDown = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
)

interface ShareChange {
  ticker: string
  action: 'buy' | 'sell'
  shares: number
  currentPrice: number      // Price in native currency
  currentPriceEur: number   // Price converted to EUR
  currency: string          // 'USD' or 'EUR'
}

interface PersistedShareChange {
  ticker: string
  shares: number
}

const TRADE_PLAN_STORAGE_KEY = 'beskarfolio_allocation_trade_plan'

const loadPersistedTradePlan = (): PersistedShareChange[] => {
  try {
    const stored = localStorage.getItem(TRADE_PLAN_STORAGE_KEY)
    if (!stored) return []

    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item): item is PersistedShareChange => {
        return (
          item &&
          typeof item.ticker === 'string' &&
          Number.isFinite(item.shares) &&
          item.shares !== 0
        )
      })
      .map(item => ({
        ticker: item.ticker.trim().toUpperCase(),
        shares: item.shares
      }))
      .filter(item => item.ticker.length > 0)
  } catch (err) {
    console.error('Failed to load allocation trade plan:', err)
    return []
  }
}

const savePersistedTradePlan = (changes: Record<string, ShareChange>): void => {
  try {
    const persisted = Object.values(changes).map(change => ({
      ticker: change.ticker,
      shares: change.shares
    }))

    if (persisted.length === 0) {
      localStorage.removeItem(TRADE_PLAN_STORAGE_KEY)
      return
    }

    localStorage.setItem(TRADE_PLAN_STORAGE_KEY, JSON.stringify(persisted))
  } catch (err) {
    console.error('Failed to save allocation trade plan:', err)
  }
}

const buildShareChange = (
  ticker: string,
  shares: number,
  holdings: ReturnType<typeof usePortfolio>['holdings']
): ShareChange | null => {
  const holding = holdings.find(h => h.ticker === ticker)
  if (!holding || holding.current_price <= 0 || holding.shares <= 0) return null

  const isSell = shares < 0
  const maxSellShares = holding.shares
  const clampedShares = isSell ? -Math.min(Math.abs(shares), maxSellShares) : shares
  if (clampedShares === 0) return null

  return {
    ticker,
    action: clampedShares > 0 ? 'buy' : 'sell',
    shares: clampedShares,
    currentPrice: holding.current_price,
    currentPriceEur: holding.current_value_eur / holding.shares,
    currency: holding.currency || 'EUR'
  }
}

export function ShareBasedRebalancingToolInline() {
  const { holdings, loading } = usePortfolio()
  const [shareChanges, setShareChanges] = useState<Record<string, ShareChange>>({})
  const [newTicker, setNewTicker] = useState('')
  const [newShares, setNewShares] = useState('')
  const [newAction, setNewAction] = useState<'buy' | 'sell'>('buy')
  const [error, setError] = useState<string | null>(null)
  const [showTickerDropdown, setShowTickerDropdown] = useState(false)
  const [hasLoadedPersistedChanges, setHasLoadedPersistedChanges] = useState(false)
  const tickerInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Get portfolio tickers for dropdown
  const portfolioTickers = holdings.map(h => h.ticker).sort()
  
  // Filter tickers based on input
  const filteredTickers = newTicker
    ? portfolioTickers.filter(t => t.includes(newTicker.toUpperCase()))
    : portfolioTickers

  // Handle clicking outside dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        tickerInputRef.current &&
        !tickerInputRef.current.contains(event.target as Node)
      ) {
        setShowTickerDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (loading || hasLoadedPersistedChanges) return

    const restoredChanges = loadPersistedTradePlan().reduce<Record<string, ShareChange>>((acc, item) => {
      const change = buildShareChange(item.ticker, item.shares, holdings)
      if (change) acc[change.ticker] = change
      return acc
    }, {})

    setShareChanges(restoredChanges)
    setHasLoadedPersistedChanges(true)
  }, [hasLoadedPersistedChanges, holdings, loading])

  useEffect(() => {
    if (!hasLoadedPersistedChanges) return
    savePersistedTradePlan(shareChanges)
  }, [hasLoadedPersistedChanges, shareChanges])

  useEffect(() => {
    if (!hasLoadedPersistedChanges || loading || Object.keys(shareChanges).length === 0) return

    const reconciledChanges = Object.values(shareChanges).reduce<Record<string, ShareChange>>((acc, change) => {
      const reconciled = buildShareChange(change.ticker, change.shares, holdings)
      if (reconciled) acc[reconciled.ticker] = reconciled
      return acc
    }, {})

    if (JSON.stringify(reconciledChanges) !== JSON.stringify(shareChanges)) {
      setShareChanges(reconciledChanges)
    }
  }, [hasLoadedPersistedChanges, holdings, loading, shareChanges])

  // Calculate current portfolio value (in EUR)
  const currentPortfolioValue = holdings.reduce((sum, h) => sum + h.current_value_eur, 0)

  // Calculate new portfolio after share changes
  // shares > 0 = BUY, shares < 0 = SELL
  // All calculations use EUR for consistency
  const calculateNewPortfolio = () => {
    const newHoldings = [...holdings]
    let cashOutEur = 0  // Money spent on buys
    let cashInEur = 0   // Money received from sells

    // Apply share changes
    Object.values(shareChanges).forEach(change => {
      const existingIndex = newHoldings.findIndex(h => h.ticker === change.ticker)
      const absShares = Math.abs(change.shares)
      // Use EUR price for portfolio calculations
      const tradeValueEur = absShares * (change.currentPriceEur || change.currentPrice)
      const isBuy = change.shares > 0

      if (isBuy) {
        cashOutEur += tradeValueEur
        if (existingIndex >= 0) {
          // Add to existing position
          const existing = newHoldings[existingIndex]
          const newShares = existing.shares + absShares
          const newValue = existing.current_value_eur + tradeValueEur
          newHoldings[existingIndex] = {
            ...existing,
            shares: newShares,
            current_value_eur: newValue,
            current_value: newValue
          }
        } else {
          // New position
          newHoldings.push({
            ticker: change.ticker,
            shares: absShares,
            avg_buy_price: change.currentPrice,
            current_price: change.currentPrice,
            current_value: tradeValueEur,
            current_value_eur: tradeValueEur,
            invested_value: tradeValueEur,
            invested_value_eur: tradeValueEur,
            gain_loss: 0,
            gain_loss_pct: 0,
            currency: change.currency || 'EUR'
          })
        }
      } else {
        // Sell
        cashInEur += tradeValueEur
        if (existingIndex >= 0) {
          const existing = newHoldings[existingIndex]
          const newShares = existing.shares - absShares
          if (newShares <= 0) {
            // Remove position entirely
            newHoldings.splice(existingIndex, 1)
          } else {
            const newValue = existing.current_value_eur - tradeValueEur
            newHoldings[existingIndex] = {
              ...existing,
              shares: newShares,
              current_value_eur: newValue,
              current_value: newValue
            }
          }
        }
      }
    })

    const newPortfolioValue = newHoldings.reduce((sum, h) => sum + h.current_value_eur, 0)

    // Calculate new allocations
    const newAllocations = newHoldings.map(h => ({
      ticker: h.ticker,
      shares: h.shares,
      value: h.current_value_eur,
      percentage: newPortfolioValue > 0 ? (h.current_value_eur / newPortfolioValue) * 100 : 0,
      price: h.current_price
    }))

    const netCashChange = cashInEur - cashOutEur  // Positive = net inflow, Negative = net outflow
    
    return {
      holdings: newAllocations,
      totalValue: newPortfolioValue,
      cashOut: cashOutEur,      // Money needed for buys
      cashIn: cashInEur,        // Money received from sells
      netCash: netCashChange,   // Net cash flow
      cashNeeded: Math.max(0, cashOutEur - cashInEur)  // Net cash needed (if buys > sells)
    }
  }

  const newPortfolio = calculateNewPortfolio()

  // Add share change
  const addShareChange = () => {
    const ticker = newTicker.trim().toUpperCase()
    const shares = parseFloat(newShares)

    if (!ticker) {
      setError('Please enter a ticker')
      return
    }

    if (isNaN(shares) || shares <= 0) {
      setError('Shares must be a positive number')
      return
    }

    // Find current price from holdings
    const holding = holdings.find(h => h.ticker === ticker)
    if (!holding && newAction === 'sell') {
      setError(`You don't own ${ticker}`)
      return
    }

    if (newAction === 'sell' && holding) {
      if (shares > holding.shares) {
        setError(`You only have ${holding.shares.toFixed(2)} shares of ${ticker}`)
        return
      }
    }

    const currentPrice = holding?.current_price || 0
    if (currentPrice === 0 && !holding) {
      setError(`Cannot find price for ${ticker}. Please add it to your portfolio first.`)
      return
    }

    // Get currency and calculate EUR price
    const currency = holding?.currency || 'EUR'
    const currentPriceEur = holding 
      ? holding.current_value_eur / holding.shares  // Derive EUR price from holding
      : currentPrice  // Fallback to same price (assume EUR)

    // Store shares as negative for sells, positive for buys
    // This ensures the display logic (shares > 0 = buy) works correctly
    const signedShares = newAction === 'sell' ? -shares : shares
    
    setShareChanges(prev => ({
      ...prev,
      [ticker]: {
        ticker,
        action: newAction,
        shares: signedShares,
        currentPrice,
        currentPriceEur,
        currency
      }
    }))

    setNewTicker('')
    setNewShares('')
    setError(null)
  }

  // Remove share change
  const removeShareChange = (ticker: string) => {
    setShareChanges(prev => {
      const newChanges = { ...prev }
      delete newChanges[ticker]
      return newChanges
    })
  }

  // Update share count for existing trade
  // Positive shares = BUY, Negative shares = SELL
  const updateShareCount = (ticker: string, delta: number) => {
    setShareChanges(prev => {
      const existing = prev[ticker]
      if (!existing) return prev
      
      const holding = holdings.find(h => h.ticker === ticker)
      const maxSellShares = holding?.shares || 0
      
      let newShares = existing.shares + delta
      
      // Skip 0: go from +1 to -1 or -1 to +1
      if (newShares === 0) {
        newShares = delta > 0 ? 1 : -1
      }
      
      // Limit sell to max shares owned (can't go below -maxSellShares)
      if (newShares < -maxSellShares) {
        return prev // At max sell limit
      }
      
      // Determine action based on sign
      const action: 'buy' | 'sell' = newShares > 0 ? 'buy' : 'sell'
      
      return {
        ...prev,
        [ticker]: {
          ...existing,
          shares: newShares,
          action
        }
      }
    })
  }

  // Get current allocation for comparison
  const currentAllocations = holdings.map(h => ({
    ticker: h.ticker,
    shares: h.shares,
    value: h.current_value_eur,
    percentage: currentPortfolioValue > 0 ? (h.current_value_eur / currentPortfolioValue) * 100 : 0,
    price: h.current_price
  }))

  return (
    <div className="space-y-4">
      {/* Description */}
      <p className="text-gray-400 text-sm">
        Plan your trades and see how they affect your portfolio allocation.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* LEFT: Planned Trades - 40% on desktop, full width on mobile */}
        <div className={`lg:col-span-2 space-y-3 ${showTickerDropdown ? 'relative z-30' : ''}`}>
          <h3 className="text-base lg:text-lg font-bold text-white">Planned Trades</h3>

          {/* Add trade form */}
          <div className={`glass rounded-xl p-3 space-y-2 ${showTickerDropdown ? 'relative z-40' : 'relative z-0'}`}>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={newAction}
                onChange={(e) => setNewAction(e.target.value as 'buy' | 'sell')}
                className="pl-3 pr-8 py-2 bg-surface-elevated border border-white/[0.08] rounded-lg text-white text-sm"
              >
                <option value="buy">BUY</option>
                <option value="sell">SELL</option>
              </select>
              
              {/* Ticker combobox - input with dropdown */}
              <div className="relative">
                <div className="relative">
                  <input
                    ref={tickerInputRef}
                    type="text"
                    value={newTicker}
                    onChange={(e) => {
                      setNewTicker(e.target.value.toUpperCase())
                      setShowTickerDropdown(true)
                    }}
                    onFocus={() => setShowTickerDropdown(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setShowTickerDropdown(false)
                      } else if (e.key === 'Enter') {
                        if (filteredTickers.length === 1) {
                          setNewTicker(filteredTickers[0])
                          setShowTickerDropdown(false)
                        } else if (newTicker && newShares) {
                          addShareChange()
                        }
                      }
                    }}
                    placeholder="Ticker"
                    className="w-full px-3 py-2 pr-8 bg-surface-elevated border border-white/[0.08] rounded-lg text-white text-sm font-mono uppercase placeholder:normal-case placeholder:font-sans"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTickerDropdown(!showTickerDropdown)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white"
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${showTickerDropdown ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                
                {/* Dropdown */}
                {showTickerDropdown && (
                  <div
                    ref={dropdownRef}
                    className="absolute z-[100] mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-white/15 bg-surface-elevated shadow-2xl shadow-black/60"
                  >
                    {filteredTickers.length > 0 ? (
                      filteredTickers.map(ticker => (
                        <button
                          key={ticker}
                          type="button"
                          onClick={() => {
                            setNewTicker(ticker)
                            setShowTickerDropdown(false)
                            setError(null)
                          }}
                          className={`w-full px-3 py-2 text-left text-sm font-mono hover:bg-white/10 transition-colors ${
                            ticker === newTicker ? 'bg-accent-600 text-white' : 'text-white'
                          }`}
                        >
                          {ticker}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-gray-400">
                        {newTicker ? `Add "${newTicker}" as new ticker` : 'No tickers in portfolio'}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <input
                type="number"
                value={newShares}
                onChange={(e) => setNewShares(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTicker && newShares) {
                    addShareChange()
                  }
                }}
                placeholder="Shares"
                min="0.01"
                step="any"
                className="px-3 py-2 bg-surface-elevated border border-white/[0.08] rounded-lg text-white text-sm"
              />
            </div>
            <button
              onClick={addShareChange}
              className="w-full px-4 py-2 bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition text-sm font-semibold"
            >
              Add Trade
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Trades list */}
          <div className="relative z-0 space-y-2">
            {Object.values(shareChanges).map(change => {
              const holding = holdings.find(h => h.ticker === change.ticker)
              const maxSellShares = holding?.shares || 0
              const absShares = Math.abs(change.shares)
              const isBuy = change.shares > 0
              
              // Can always decrement (go more negative/sell more) unless at max sell
              const canDecrement = isBuy || absShares < maxSellShares
              // Can always increment (go more positive/buy more)
              const canIncrement = true
              
              return (
                <div 
                  key={change.ticker}
                  className={`p-3 rounded-lg border ${
                    isBuy
                      ? 'bg-green-500/10 border-green-500/30'
                      : 'bg-red-500/10 border-red-500/30'
                  }`}
                >
                  {/* Top row: Action badge, Ticker, Remove button */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-bold transition-colors ${
                        isBuy
                          ? 'bg-green-600 text-white'
                          : 'bg-red-600 text-white'
                      }`}>
                        {isBuy ? 'BUY' : 'SELL'}
                      </span>
                      <span className="font-mono font-bold text-white text-lg">{change.ticker}</span>
                    </div>
                    <button
                      onClick={() => removeShareChange(change.ticker)}
                      className="w-7 h-7 flex items-center justify-center bg-red-600/20 text-red-400 rounded hover:bg-red-600/30"
                    >
                      ✕
                    </button>
                  </div>
                  
                  {/* Bottom row: Share controls and total */}
                  <div className="flex items-center justify-between">
                    {/* Share adjustment controls */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateShareCount(change.ticker, -1)}
                        disabled={!canDecrement}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg font-bold text-lg ${
                          canDecrement
                            ? 'bg-white/10 text-white hover:bg-white/15'
                            : 'bg-white/5 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        −
                      </button>
                      <div className="w-12 text-center">
                        <span className="font-bold text-white text-lg">{absShares}</span>
                      </div>
                      <button
                        onClick={() => updateShareCount(change.ticker, 1)}
                        disabled={!canIncrement}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg font-bold text-lg ${
                          canIncrement
                            ? 'bg-white/10 text-white hover:bg-white/15'
                            : 'bg-white/5 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        +
                      </button>
                    </div>
                    
                    {/* Price and total in native currency */}
                    <div className="text-right">
                      <div className="text-lg font-bold text-white">
                        {change.currency === 'USD' ? '$' : '€'}
                        {(absShares * change.currentPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs text-gray-400">
                        @ {change.currency === 'USD' ? '$' : '€'}{change.currentPrice.toFixed(2)}/share
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            {Object.keys(shareChanges).length === 0 && (
              <div className="text-center text-gray-400 py-8 text-sm glass rounded-xl">
                No trades planned yet. Add your first trade above.
              </div>
            )}
          </div>

          {/* Cash summary in EUR */}
          {Object.keys(shareChanges).length > 0 && (
            <div className="glass rounded-xl p-3 space-y-2">
              {/* Show breakdown if mixed buys and sells */}
              {newPortfolio.cashOut > 0 && newPortfolio.cashIn > 0 ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Buys (cash out)</span>
                    <span className="text-red-400 font-semibold">
                      −€{newPortfolio.cashOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Sells (cash in)</span>
                    <span className="text-green-400 font-semibold">
                      +€{newPortfolio.cashIn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="border-t border-white/[0.06] pt-2 flex items-center justify-between">
                    <span className="text-gray-300 font-semibold">Net Cash</span>
                    <span className={`text-xl font-bold ${newPortfolio.netCash >= 0 ? 'text-green-400' : 'text-yellow-400'}`}>
                      {newPortfolio.netCash >= 0 ? '+' : '−'}€{Math.abs(newPortfolio.netCash).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-gray-300 font-semibold">
                      {newPortfolio.cashOut > 0 ? 'Cash Required' : 'Cash Received'}
                    </span>
                    <span className="text-gray-500 text-xs ml-1">(EUR)</span>
                  </div>
                  <span className={`text-2xl font-bold ${newPortfolio.cashOut > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {newPortfolio.cashOut > 0 ? '' : '+'}€{(newPortfolio.cashOut || newPortfolio.cashIn).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Before & After Comparison - 60% on desktop, full width on mobile */}
        <div className="lg:col-span-3 space-y-3">
          <h3 className="text-base lg:text-lg font-bold text-white">Allocation Comparison</h3>

          {/* Portfolio value summary */}
          <div className="grid grid-cols-2 gap-2">
            <div className="glass rounded-xl p-2">
              <div className="text-xs text-gray-400">Current Value</div>
              <div className="text-lg font-bold text-white">
                €{currentPortfolioValue.toLocaleString()}
              </div>
            </div>
            <div className="glass rounded-xl p-2">
              <div className="text-xs text-gray-400">New Value</div>
              <div className={`text-lg font-bold ${newPortfolio.totalValue >= currentPortfolioValue ? 'text-green-400' : 'text-red-400'}`}>
                €{newPortfolio.totalValue.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Allocations table */}
          <div className="glass rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-black/20 sticky top-0">
                  <tr className="border-b border-white/[0.06]">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400">Ticker</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-400">Shares</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-400">Current %</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-400">New %</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-400">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {/* Combine all tickers: current holdings + new positions */}
                  {(() => {
                    // Get all unique tickers
                    const allTickers = new Set([
                      ...currentAllocations.map(h => h.ticker),
                      ...newPortfolio.holdings.map(h => h.ticker)
                    ])
                    
                    return Array.from(allTickers).map(ticker => {
                      const currentHolding = currentAllocations.find(h => h.ticker === ticker)
                      const newHolding = newPortfolio.holdings.find(h => h.ticker === ticker)
                      const currentPct = currentHolding?.percentage || 0
                      const newPct = newHolding?.percentage || 0
                      const change = newPct - currentPct
                      const currentShares = currentHolding?.shares || 0
                      const newShares = newHolding?.shares || 0
                      
                      // Determine row styling
                      const isSoldOut = currentShares > 0 && newShares === 0
                      const isNewPosition = currentShares === 0 && newShares > 0
                      
                      return (
                        <tr key={ticker} className={`hover:bg-white/[0.02] ${isSoldOut ? 'opacity-60' : ''}`}>
                          <td className={`px-3 py-2 font-mono font-bold ${isSoldOut ? 'text-red-400 line-through' : 'text-white'}`}>
                            {ticker}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-300">
                            {isNewPosition ? (
                              <strong className="text-green-400">+{newShares.toFixed(2)}</strong>
                            ) : isSoldOut ? (
                              <span>
                                {currentShares.toFixed(2)} → <strong className="text-red-400">0</strong>
                              </span>
                            ) : currentShares !== newShares ? (
                              <span>
                                {currentShares.toFixed(2)} → <strong className="text-white">{newShares.toFixed(2)}</strong>
                              </span>
                            ) : (
                              <span className="text-gray-400">{currentShares.toFixed(2)}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-400">
                            {currentPct.toFixed(1)}%
                          </td>
                          <td className={`px-3 py-2 text-right font-bold ${isSoldOut ? 'text-red-400' : 'text-white'}`}>
                            {newPct.toFixed(1)}%
                          </td>
                          <td className={`px-3 py-2 text-right font-bold ${
                            Math.abs(change) < 0.01 ? 'text-gray-400' :
                            change > 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {change > 0 ? '+' : ''}{change.toFixed(1)}%
                          </td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
