/**
 * Rebalancing Plan Modal
 * 
 * Shows buy/sell recommendations to reach target allocation
 * Displays tax implications and savings
 * Allows configuring cash injection and preferences
 */

import { useState } from 'react'
import { allocationService } from '../../services/allocationService'
import type { RebalancePlan, RebalanceTrade } from '../../types/allocation'

interface Props {
  onClose: () => void
}

export function RebalancePlanModal({ onClose }: Props) {
  const [plan, setPlan] = useState<RebalancePlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Settings
  const [strategy, setStrategy] = useState<'sell' | 'buy-only'>('sell')
  const [cashAvailable, setCashAvailable] = useState(0)
  const [minTradeValue, setMinTradeValue] = useState(100)
  const [useTaxFreeOnly, setUseTaxFreeOnly] = useState(true)

  // Generate plan
  const generatePlan = async () => {
    try {
      setLoading(true)
      setError(null)
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
      console.error('Failed to generate rebalancing plan:', err)
      setError(err.response?.data?.detail || err.message || 'Failed to generate plan')
    } finally {
      setLoading(false)
    }
  }

  // Copy trades to clipboard
  const copyToClipboard = () => {
    if (!plan) return

    const text = plan.trades.map(t => 
      `${t.action.toUpperCase()} ${t.shares} ${t.ticker} @ €${t.price.toFixed(2)} = €${t.eur_value.toFixed(2)}`
    ).join('\n')

    navigator.clipboard.writeText(text)
    alert('Copied to clipboard!')
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface-dark w-full sm:max-w-4xl rounded-2xl border border-white/10 max-h-[85vh] mx-4 sm:mx-0 flex flex-col overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-white tracking-tight">Rebalancing Plan</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Generate buy/sell recommendations to reach target allocation
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

        {/* Content */}
        <div className="px-5 pb-5 overflow-y-auto flex-1">
          {/* Settings */}
          {!plan && (
            <div className="space-y-4 mb-4">
              {/* Strategy Selector */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                  Rebalancing Strategy
                </label>
                <div className="space-y-3">
                  <div 
                    onClick={() => setStrategy('sell')}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition ${
                      strategy === 'sell' 
                        ? 'border-accent-500/50 bg-accent-500/10' 
                        : 'border-white/5 bg-surface-elevated hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="strategy"
                        checked={strategy === 'sell'}
                        onChange={() => setStrategy('sell')}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-semibold text-white text-sm">Sell & Buy (Self-Funding)</div>
                        <p className="text-xs text-gray-500 mt-1">
                          Sell overweight positions and use proceeds to buy underweight positions.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div 
                    onClick={() => setStrategy('buy-only')}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition ${
                      strategy === 'buy-only' 
                        ? 'border-emerald-500/50 bg-emerald-500/10' 
                        : 'border-white/5 bg-surface-elevated hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="strategy"
                        checked={strategy === 'buy-only'}
                        onChange={() => setStrategy('buy-only')}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-semibold text-white text-sm">Buy Only (Cash Injection)</div>
                        <p className="text-xs text-gray-500 mt-1">
                          Calculate how much cash is needed to buy underweight positions.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Cash Available (EUR)
                </label>
                <input
                  type="number"
                  value={cashAvailable}
                  onChange={(e) => setCashAvailable(parseFloat(e.target.value) || 0)}
                  min="0"
                  step="100"
                  className="w-full px-4 py-3 bg-surface-elevated border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500/50 text-white"
                  placeholder="0.00"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {strategy === 'buy-only' 
                    ? 'Optional: Enter available cash to see if it\'s enough.'
                    : 'Optional: New cash to invest in addition to proceeds from sells.'}
                </p>
              </div>

              {strategy === 'sell' && (
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="useTaxFree"
                    checked={useTaxFreeOnly}
                    onChange={(e) => setUseTaxFreeOnly(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="useTaxFree" className="text-sm text-gray-300">
                    Prioritize tax-free shares (held 365+ days)
                  </label>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Minimum Trade Value (EUR)
                </label>
                <input
                  type="number"
                  value={minTradeValue}
                  onChange={(e) => setMinTradeValue(parseFloat(e.target.value) || 0)}
                  min="0"
                  step="50"
                  className="w-full px-4 py-3 bg-surface-elevated border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500/50 text-white"
                />
              </div>

              <button
                onClick={generatePlan}
                disabled={loading}
                className="w-full py-4 bg-accent-600 hover:bg-accent-700 text-white rounded-xl font-semibold transition-all disabled:opacity-50 active:scale-[0.98]"
              >
                {loading ? 'Generating...' : 'Generate Rebalancing Plan'}
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
              {error}
            </div>
          )}

          {/* Plan Results */}
          {plan && (
            <div className="space-y-4">
              {/* Strategy Banner */}
              <div className={`p-4 rounded-xl border ${
                strategy === 'buy-only' 
                  ? 'bg-emerald-500/10 border-emerald-500/20' 
                  : 'bg-accent-500/10 border-accent-500/20'
              }`}>
                <div className="font-semibold text-white text-sm">
                  {strategy === 'buy-only' 
                    ? 'Buy-Only Strategy (No Selling)' 
                    : 'Sell & Buy Strategy (Self-Funding)'}
                </div>
                <p className="text-sm text-gray-400 mt-1">
                  {strategy === 'buy-only' 
                    ? `Cash needed: €${plan.summary.total_buys_eur.toLocaleString()} to reach target allocation.`
                    : `Generate €${plan.summary.cash_generated.toLocaleString()} from sells, buy €${plan.summary.total_buys_eur.toLocaleString()}.`}
                </p>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-surface-elevated rounded-xl p-3 border border-white/5">
                  <div className="text-xs text-gray-500">Total Trades</div>
                  <div className="text-xl font-bold text-white mt-1">
                    {plan.summary.total_trades}
                  </div>
                </div>
                
                {strategy === 'sell' && (
                  <div className="bg-surface-elevated rounded-xl p-3 border border-white/5">
                    <div className="text-xs text-gray-500">Total Sells</div>
                    <div className="text-xl font-bold text-rose-400 mt-1">
                      €{plan.summary.total_sells_eur.toLocaleString()}
                    </div>
                  </div>
                )}
                
                <div className="bg-surface-elevated rounded-xl p-3 border border-white/5">
                  <div className="text-xs text-gray-500">
                    {strategy === 'buy-only' ? 'Total Cash Needed' : 'Total Buys'}
                  </div>
                  <div className="text-xl font-bold text-emerald-400 mt-1">
                    €{strategy === 'buy-only' 
                      ? (plan.summary.cash_needed || plan.summary.total_buys_eur).toLocaleString()
                      : plan.summary.total_buys_eur.toLocaleString()}
                  </div>
                </div>
                
                {strategy === 'sell' && (
                  <div className="bg-surface-elevated rounded-xl p-3 border border-white/5">
                    <div className="text-xs text-gray-500">Cash Remaining</div>
                    <div className="text-xl font-bold text-white mt-1">
                      €{plan.summary.cash_remaining.toLocaleString()}
                    </div>
                  </div>
                )}

                {strategy === 'buy-only' && plan.summary.cash_shortfall > 0 && (
                  <div className="bg-amber-500/10 rounded-xl p-3 border border-amber-500/20">
                    <div className="text-xs text-amber-400">Additional Cash Needed</div>
                    <div className="text-xl font-bold text-amber-400 mt-1">
                      €{plan.summary.cash_shortfall.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      You provided €{plan.summary.cash_used.toLocaleString()} but need €{plan.summary.cash_needed.toLocaleString()}
                    </div>
                  </div>
                )}
              </div>

              {/* Tax Savings */}
              {plan.summary.tax_savings > 0 && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-emerald-400">Tax Savings</div>
                      <div className="text-xs text-gray-500 mt-1">
                        By selling tax-free shares vs. taxable shares
                      </div>
                    </div>
                    <div className="text-xl font-bold text-emerald-400">
                      €{plan.summary.tax_savings.toFixed(2)}
                    </div>
                  </div>
                </div>
              )}

              {/* Trades Table */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">Recommended Trades</h3>
                  <button
                    onClick={copyToClipboard}
                    className="text-xs text-accent-400 hover:text-accent-300 transition-colors"
                  >
                    Copy to Clipboard
                  </button>
                </div>

                {plan.trades.length === 0 ? (
                  <div className="text-center text-gray-500 py-8 bg-surface-elevated rounded-xl border border-white/5">
                    Portfolio is well-balanced! No rebalancing needed.
                  </div>
                ) : (
                  <div className="bg-surface-elevated rounded-xl overflow-hidden border border-white/5">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/5">
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticker</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Shares</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total (EUR)</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Tax Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {plan.trades.map((trade: RebalanceTrade, idx: number) => (
                          <tr key={idx} className="hover:bg-white/[0.02]">
                            <td className="px-4 py-3">
                              <span className={`inline-block px-2 py-1 rounded-lg text-xs font-semibold ${
                                trade.action === 'buy' 
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : 'bg-rose-500/10 text-rose-400'
                              }`}>
                                {trade.action.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-white text-sm">{trade.ticker}</td>
                            <td className="px-4 py-3 text-right text-gray-300 text-sm">{trade.shares}</td>
                            <td className="px-4 py-3 text-right text-gray-300 text-sm">€{trade.price.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-white text-sm">
                              €{trade.eur_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-center text-sm">
                              {trade.action === 'sell' && (
                                trade.tax_free 
                                  ? <span className="text-emerald-400">Tax-Free</span>
                                  : <span className="text-amber-400">Taxable</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Warning if not enough tax-free shares */}
              {useTaxFreeOnly && plan.trades.some(t => t.action === 'sell' && !t.tax_free) && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-amber-400 text-sm">
                  Some recommended sells use taxable shares (held less than 365 days). 
                  Consider waiting until these shares become tax-free.
                </div>
              )}

              {/* New Plan Button */}
              <button
                onClick={() => setPlan(null)}
                className="w-full py-3 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl transition-colors text-sm font-medium"
              >
                Generate New Plan
              </button>
            </div>
          )}
        </div>

        {/* Close */}
        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="w-full py-2 text-gray-500 hover:text-white text-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
