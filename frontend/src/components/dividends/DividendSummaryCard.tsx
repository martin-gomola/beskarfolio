import React, { useState, useEffect } from 'react'
import { api } from '../../services'
import { readBrowserTransactions } from '../../services/browserPortfolioState'
import { usePrivacyMode } from '../../hooks'
import { PRIVACY_MASK } from '../../hooks/usePrivacyMode'
import { formatCurrency } from '../../utils'

interface DividendTickerSummary {
  ticker: string
  currency: string
  total_gross: number
  total_tax: number
  total_net: number
  payment_count: number
  avg_withholding_pct: number
}

interface DividendYearSummary {
  year: number
  total_gross: number
  total_tax: number
  total_net: number
  payment_count: number
}

interface DividendSummary {
  total_gross: number
  total_tax: number
  total_net: number
  payment_count: number
  by_ticker: DividendTickerSummary[]
  by_year: DividendYearSummary[]
}

export const DividendSummaryCard: React.FC = () => {
  const [data, setData] = useState<DividendSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [showDetails, setShowDetails] = useState(false)
  const { isPrivate } = usePrivacyMode()

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const transactions = readBrowserTransactions()
        const hasDividends = transactions.some(t => t.type === 'dividend')
        if (!hasDividends) {
          setData(null)
          return
        }

        const response = await api.post('/api/dividends/summary', { transactions })
        if (response.data.success && response.data.payment_count > 0) {
          setData(response.data)
        } else {
          setData(null)
        }
      } catch (error) {
        console.error('Failed to fetch dividend summary:', error)
        setData(null)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="glass rounded-xl p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-white/5 rounded w-1/4 mb-4" />
          <div className="h-8 bg-white/5 rounded" />
        </div>
      </div>
    )
  }

  if (!data) return null

  const effectiveTaxRate = data.total_gross > 0
    ? (data.total_tax / data.total_gross * 100)
    : 0

  return (
    <div className="glass rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 py-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-white tracking-tight">Dividends</h3>
              <span className="text-xs sm:text-sm text-gray-500">
                {data.payment_count} payment{data.payment_count !== 1 ? 's' : ''} · {effectiveTaxRate.toFixed(1)}% avg tax
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-violet-400">
              {isPrivate ? PRIVACY_MASK : formatCurrency(data.total_net, 'EUR')}
            </div>
            <div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider">Net Received</div>
          </div>
        </div>
      </div>

      {/* Summary row */}
      <div className="px-4 sm:px-5 py-3 border-b border-white/5">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-sm sm:text-base font-medium text-white">
              {isPrivate ? PRIVACY_MASK : formatCurrency(data.total_gross, 'EUR')}
            </div>
            <div className="text-[10px] sm:text-xs text-gray-500">Gross</div>
          </div>
          <div>
            <div className="text-sm sm:text-base font-medium text-rose-400">
              {isPrivate ? PRIVACY_MASK : `-${formatCurrency(data.total_tax, 'EUR')}`}
            </div>
            <div className="text-[10px] sm:text-xs text-gray-500">Tax Withheld</div>
          </div>
          <div>
            <div className="text-sm sm:text-base font-medium text-violet-400">
              {isPrivate ? PRIVACY_MASK : formatCurrency(data.total_net, 'EUR')}
            </div>
            <div className="text-[10px] sm:text-xs text-gray-500">Net</div>
          </div>
        </div>
      </div>

      {/* Per-ticker breakdown */}
      <div className="p-4 sm:p-5">
        <div className="space-y-1.5">
          {data.by_ticker.map((ticker) => (
            <div key={ticker.ticker} className="flex items-center justify-between px-3 sm:px-4 py-2.5 bg-white/[0.02] rounded-xl text-sm">
              <div className="flex items-center gap-2">
                <span className="font-mono text-accent-400">{ticker.ticker}</span>
                <span className="text-[10px] text-gray-600">{ticker.payment_count}x</span>
              </div>
              <div className="flex items-center gap-3">
                {ticker.avg_withholding_pct > 0 && (
                  <span className="text-xs text-gray-500">{ticker.avg_withholding_pct}% tax</span>
                )}
                <span className="text-white font-medium">
                  {isPrivate ? PRIVACY_MASK : formatCurrency(ticker.total_net, ticker.currency)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Expand for yearly breakdown */}
        {data.by_year.length > 1 && (
          <>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="w-full mt-3 py-2 text-xs text-gray-500 hover:text-white transition-colors flex items-center justify-center gap-1"
            >
              <span>{showDetails ? 'Hide' : 'Show'} yearly breakdown</span>
              <svg className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {showDetails && (
              <div className="mt-3 space-y-1.5 border-t border-white/5 pt-3">
                {data.by_year.map((year) => (
                  <div key={year.year} className="flex items-center justify-between px-3 sm:px-4 py-2.5 bg-white/[0.02] rounded-xl text-sm">
                    <span className="text-gray-400">{year.year}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-gray-500">{year.payment_count} payments</span>
                      <span className="text-white font-medium">
                        {isPrivate ? PRIVACY_MASK : formatCurrency(year.total_net, 'EUR')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
