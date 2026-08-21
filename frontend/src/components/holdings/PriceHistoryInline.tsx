import React, { useState, useEffect, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot, ReferenceLine } from 'recharts'
import { api } from '../../services'
import { readBrowserTransactions } from '../../services/browserPortfolioState'
import { normalizeDate } from '../../utils/guestStorage'
import { formatCurrency } from '../../utils'

interface PriceHistoryInlineProps {
  ticker: string
  currency: string
}

type Period = '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'ALL'

interface PricePoint {
  date: string
  close: number
  displayDate?: string
}

interface TxnMarker {
  date: string
  price: number
  type: 'buy' | 'sell'
  shares: number
  chartDate: string // The actual date on the chart (may differ if transaction was on weekend)
}

// Custom triangle shape for sell markers
const TriangleDown = (props: any) => {
  const { cx, cy } = props
  if (cx === undefined || cy === undefined) return <g />
  const size = 6
  return (
    <polygon
      points={`${cx},${cy + size} ${cx - size},${cy - size} ${cx + size},${cy - size}`}
      fill="#ef4444"
      stroke="#fff"
      strokeWidth={2}
    />
  )
}

const parsePriceDate = (date: string): Date => {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

const formatAxisDate = (date: string, showYear: boolean): string => {
  const d = parsePriceDate(date)
  return d.toLocaleDateString('en-US', showYear
    ? { month: 'short', year: '2-digit' }
    : { month: 'short', day: 'numeric' }
  )
}

const formatTooltipDate = (date: string, showYear: boolean): string => {
  const d = parsePriceDate(date)
  return d.toLocaleDateString('en-US', showYear
    ? { month: 'short', day: 'numeric', year: 'numeric' }
    : { month: 'short', day: 'numeric' }
  )
}

const formatTooltipMonthDay = (date: string): string => {
  const d = parsePriceDate(date)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const formatTooltipYear = (date: string): string => {
  return parsePriceDate(date).getFullYear().toString()
}

export const PriceHistoryInline: React.FC<PriceHistoryInlineProps> = ({ ticker, currency }) => {
  const [priceData, setPriceData] = useState<PricePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('1Y')

  // Get transactions for this ticker
  const transactions = useMemo(() => {
    const allTxns = readBrowserTransactions()
    return allTxns
      .filter(t => t.ticker.toUpperCase() === ticker.toUpperCase())
      .map(t => {
        const normalizedDate = normalizeDate(t.date)
        return {
          date: normalizedDate,
          price: t.price,
          type: t.type as 'buy' | 'sell',
          shares: t.shares,
          chartDate: normalizedDate // Will be updated when we find closest date
        }
      })
  }, [ticker])

  // Calculate date range based on period
  const getDateRange = (p: Period): { from: string; to: string } => {
    const now = new Date()
    const toDate = now.toISOString().split('T')[0]
    let fromDate: Date

    switch (p) {
      case '1M':
        fromDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
        break
      case '3M':
        fromDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
        break
      case '6M':
        fromDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())
        break
      case '1Y':
        fromDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
        break
      case 'YTD':
        fromDate = new Date(now.getFullYear(), 0, 1)
        break
      case 'ALL':
        fromDate = new Date('2020-01-01')
        break
      default:
        fromDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
    }

    return { from: fromDate.toISOString().split('T')[0], to: toDate }
  }

  useEffect(() => {
    const fetchPrices = async () => {
      setLoading(true)
      setError(null)

      try {
        const { from, to } = getDateRange(period)
        const response = await api.get(`/api/prices/${ticker}/range`, {
          params: { from_date: from, to_date: to }
        })

        const data = response.data.map((p: { date: string; close: number }) => ({
          date: p.date,
          close: p.close,
          displayDate: formatTooltipDate(p.date, period === 'ALL')
        }))

        setPriceData(data)
      } catch (err: unknown) {
        const error = err as { response?: { data?: { detail?: string } } }
        setError(error.response?.data?.detail || 'Failed to load price history')
      } finally {
        setLoading(false)
      }
    }

    fetchPrices()
  }, [ticker, period])

  // Find closest date in price data for each transaction
  const findClosestDate = (txnDate: string, dates: string[]): string | null => {
    if (dates.length === 0) return null

    const txnTime = new Date(txnDate).getTime()
    let closest = dates[0]
    let minDiff = Math.abs(new Date(dates[0]).getTime() - txnTime)

    for (const d of dates) {
      const diff = Math.abs(new Date(d).getTime() - txnTime)
      if (diff < minDiff) {
        minDiff = diff
        closest = d
      }
    }

    // Only return if within 10 days (weekends + holidays + sparse data)
    if (minDiff <= 10 * 24 * 60 * 60 * 1000) {
      return closest
    }
    return null
  }

  // Find transaction markers that fall within the price data range
  const transactionMarkers: TxnMarker[] = useMemo(() => {
    if (!priceData.length) return []

    const dates = priceData.map(p => p.date)
    const { from } = getDateRange(period)
    const fromTime = new Date(from).getTime()

    const markers = transactions
      .filter(t => {
        const txnTime = new Date(t.date).getTime()
        return txnTime >= fromTime
      })
      .map(t => {
        const chartDate = findClosestDate(t.date, dates)
        return chartDate ? { ...t, chartDate } : null
      })
      .filter((t): t is TxnMarker => t !== null)

    return markers
  }, [priceData, transactions, period])

  // Calculate price change
  const priceChange = useMemo(() => {
    if (priceData.length < 2) return { value: 0, percent: 0 }
    const first = priceData[0].close
    const last = priceData[priceData.length - 1].close
    return {
      value: last - first,
      percent: ((last - first) / first) * 100
    }
  }, [priceData])

  // Find year boundaries for reference lines
  const yearBoundaries = useMemo(() => {
    if (priceData.length === 0) return []

    const boundaries: { date: string; year: number }[] = []
    let currentYear = -1

    for (const point of priceData) {
      const year = new Date(point.date).getFullYear()
      if (year !== currentYear) {
        // Find first trading day of this year in our data
        boundaries.push({ date: point.date, year })
        currentYear = year
      }
    }

    // Skip first boundary (start of chart)
    return boundaries.slice(1)
  }, [priceData])

  const shouldShowYearOnDates = useMemo(() => {
    if (period === 'ALL') return true
    if (priceData.length < 2) return false

    const first = parsePriceDate(priceData[0].date)
    const last = parsePriceDate(priceData[priceData.length - 1].date)
    return first.getFullYear() !== last.getFullYear()
  }, [period, priceData])

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: PricePoint }> }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-surface-elevated border border-gray-700 rounded-lg px-3 py-2 shadow-xl">
          <p className="flex items-baseline gap-1.5 text-gray-400">
            <span className="text-xs">{formatTooltipMonthDay(data.date)}</span>
            {shouldShowYearOnDates && (
              <span className="text-[10px] font-medium text-gray-500">{formatTooltipYear(data.date)}</span>
            )}
          </p>
          <p className="text-white font-semibold">{formatCurrency(data.close, currency)}</p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="bg-surface-dark border-t border-gray-800">
      {/* Period Selector */}
      <div className="px-4 py-2 flex items-center gap-2 border-b border-gray-800">
        <span className="text-xs text-gray-500 mr-2">Period:</span>
        {(['1M', '3M', '6M', '1Y', 'YTD', 'ALL'] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
              period === p
                ? 'bg-accent-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {p}
          </button>
        ))}
        {!loading && priceData.length > 0 && (
          <span className={`ml-auto text-xs font-medium ${priceChange.percent >= 0 ? 'text-gain' : 'text-loss'}`}>
            {priceChange.percent >= 0 ? '+' : ''}{priceChange.percent.toFixed(2)}%
          </span>
        )}
      </div>

      {/* Chart */}
      <div className="px-4 py-3">
        {loading ? (
          <div className="h-40 flex items-center justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full"></div>
          </div>
        ) : error ? (
          <div className="h-40 flex items-center justify-center text-red-400 text-sm">
            {error}
          </div>
        ) : priceData.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-gray-400 text-sm">
            No price data available
          </div>
        ) : (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={priceData} margin={{ top: 18, right: 5, left: 0, bottom: 0 }}>
                {/* Year separator lines */}
                {yearBoundaries.map((boundary) => (
                  <ReferenceLine
                    key={boundary.year}
                    x={boundary.date}
                    stroke="#374151"
                    strokeDasharray="3 3"
                    label={{
                      value: boundary.year.toString(),
                      position: 'top',
                      fill: '#6b7280',
                      fontSize: 10
                    }}
                  />
                ))}
                <XAxis
                  dataKey="date"
                  tickFormatter={(date) => formatAxisDate(date, shouldShowYearOnDates)}
                  stroke="#6b7280"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={shouldShowYearOnDates ? 64 : 50}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  stroke="#6b7280"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${currency === 'EUR' ? '€' : '$'}${value.toFixed(0)}`}
                  width={45}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke={priceChange.percent >= 0 ? '#22c55e' : '#ef4444'}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3, fill: '#fff' }}
                />
                {/* Buy markers - green dots */}
                {transactionMarkers
                  .filter(txn => txn.type === 'buy')
                  .map((txn, i) => {
                    const pricePoint = priceData.find(p => p.date === txn.chartDate)
                    if (!pricePoint) return null
                    return (
                      <ReferenceDot
                        key={`buy-${txn.date}-${i}`}
                        x={txn.chartDate}
                        y={pricePoint.close}
                        r={6}
                        fill="#22c55e"
                        stroke="#fff"
                        strokeWidth={2}
                        isFront={true}
                      />
                    )
                  })}
                {/* Sell markers - red triangles */}
                {transactionMarkers
                  .filter(txn => txn.type === 'sell')
                  .map((txn, i) => {
                    const pricePoint = priceData.find(p => p.date === txn.chartDate)
                    if (!pricePoint) return null
                    return (
                      <ReferenceDot
                        key={`sell-${txn.date}-${i}`}
                        x={txn.chartDate}
                        y={pricePoint.close}
                        r={6}
                        shape={TriangleDown}
                        isFront={true}
                      />
                    )
                  })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Stats Row with Legend */}
      {!loading && !error && priceData.length > 0 && (
        <div className="px-4 pb-3 flex items-center justify-between text-xs">
          <div className="flex gap-4">
            <div>
              <span className="text-gray-500">Current: </span>
              <span className="text-white font-medium">
                {formatCurrency(priceData[priceData.length - 1]?.close || 0, currency)}
              </span>
            </div>
            <div>
              <span className="text-gray-500">High: </span>
              <span className="text-gain font-medium">
                {formatCurrency(Math.max(...priceData.map(p => p.close)), currency)}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Low: </span>
              <span className="text-loss font-medium">
                {formatCurrency(Math.min(...priceData.map(p => p.close)), currency)}
              </span>
            </div>
          </div>
          {/* Marker Legend */}
          {transactionMarkers.length > 0 && (
            <div className="flex items-center gap-3 text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                Buy
              </span>
              <span className="flex items-center gap-1">
                <span className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-red-500"></span>
                Sell
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
