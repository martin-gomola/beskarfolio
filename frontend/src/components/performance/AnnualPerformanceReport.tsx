import React, { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useAnnualPerformance } from '../../hooks/useAnnualPerformance'
import { PerformanceChartPoint, TickerBreakdown } from '../../types'
import { usePrivacyMode } from '../../hooks'
import { PRIVACY_MASK } from '../../hooks/usePrivacyMode'
import { PerformanceChart } from './PerformanceChart'
import { api } from '../../services'
import { readBrowserTransactions } from '../../services/browserPortfolioState'
import { getCachedChartData, cacheChartData, haveTransactionsChanged } from '../../utils/guestCache'

const money = (value: number, symbol = '€', signed = false): string =>
  `${value < 0 ? '-' : signed && value > 0 ? '+' : ''}${symbol}${Math.abs(value).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const percent = (value: number): string => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
const tone = (value: number): string => value > 0 ? 'text-gain' : value < 0 ? 'text-loss' : 'text-gray-300'
const dateLabel = (value: string): string => new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

const DetailSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <details className="group overflow-hidden rounded-xl border border-white/10 bg-surface-dark/80">
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-gray-200 hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 focus-visible:outline-offset-[-2px] [&::-webkit-details-marker]:hidden">
      {title}<ChevronDown className="h-4 w-4 shrink-0 group-open:rotate-180" aria-hidden="true" />
    </summary>
    <div className="border-t border-white/5 p-4 text-sm leading-relaxed text-gray-300">{children}</div>
  </details>
)

const InvestmentResults: React.FC<{ tickers: TickerBreakdown[] }> = ({ tickers }) => {
  const { isPrivate } = usePrivacyMode()
  if (tickers.length === 0) return <p className="text-gray-400">No investment breakdown available for this period.</p>
  return (
    <ul className="divide-y divide-white/5">
      {[...tickers].sort((a, b) => a.ticker.localeCompare(b.ticker)).map(ticker => (
        <li key={ticker.ticker} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 py-3">
          <span className="break-words font-mono font-medium text-accent-300">{ticker.ticker}</span>
          <span className={`tabular-nums ${isPrivate ? 'text-gray-400' : tone(ticker.gain)}`}>{isPrivate ? PRIVACY_MASK : money(ticker.gain, ticker.currency === 'USD' ? '$' : ticker.currency === 'EUR' ? '€' : `${ticker.currency} `, true)}</span>
          <span className="text-xs text-gray-400">Gain/loss in {ticker.currency}</span>
          <span className="text-right text-xs tabular-nums text-gray-400">{isPrivate ? PRIVACY_MASK : `${percent(ticker.gain_pct)} return`}</span>
        </li>
      ))}
    </ul>
  )
}

export const AnnualPerformanceReport: React.FC = () => {
  const { performanceData, loading, error, refetch } = useAnnualPerformance()
  const { isPrivate } = usePrivacyMode()
  const [period, setPeriod] = useState('all-time')
  const [chartData, setChartData] = useState<PerformanceChartPoint[]>([])
  const [chartLoading, setChartLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setChartData([])
    setChartLoading(true)
    if (loading) return () => { cancelled = true }
    if (!performanceData?.all_time || performanceData.all_time.trade_count === 0) {
      setChartLoading(false)
      return () => { cancelled = true }
    }
    const loadChart = async () => {
      try {
        const transactions = readBrowserTransactions()
        if (transactions.length === 0) return
        const cached = getCachedChartData()
        if (cached?.data_points && !haveTransactionsChanged(transactions)) {
          if (!cancelled) setChartData(cached.data_points)
          return
        }
        const response = await api.post('/api/portfolio/performance-history?benchmark=SXR8.DE', {
          transactions: transactions.map(({ ticker, type, date, shares, price, currency }) => ({ ticker, type, date, shares, price, currency })),
        })
        if (!cancelled && response.data.success && Array.isArray(response.data.data_points)) {
          setChartData(response.data.data_points)
          cacheChartData(response.data)
        }
      } catch {
        const cached = getCachedChartData({ allowExpired: true })
        if (!cancelled && cached?.data_points) setChartData(cached.data_points)
      } finally {
        if (!cancelled) setChartLoading(false)
      }
    }
    void loadChart()
    return () => { cancelled = true }
  }, [loading, performanceData])

  if (loading) return <div role="status" aria-busy="true" className="glass rounded-xl p-6 text-sm text-gray-300">Calculating your investment performance…</div>
  if (error) return (
    <div role="alert" className="glass rounded-xl p-6">
      <p className="text-gray-300">Could not load your performance report.</p>
      <button type="button" onClick={() => void refetch()} className="mt-3 min-h-11 rounded-lg border border-white/10 px-4 text-sm text-accent-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400">Try again</button>
    </div>
  )
  if (!performanceData?.all_time || performanceData.all_time.trade_count === 0) return (
    <div className="glass rounded-xl p-6 text-center">
      <h2 className="text-lg font-semibold text-white">No investment performance yet</h2>
      <p className="mt-2 text-sm text-gray-400">Add completed purchases in Transactions to see your gains and losses.</p>
    </div>
  )

  const years = [...(performanceData.years ?? [])].sort((a, b) => b.year - a.year)
  const selectedYear = years.find(year => String(year.year) === period)
  const data = period === 'all-time' ? performanceData.all_time : selectedYear
  const validPoints = chartData.filter(point => point.date && Number.isFinite(point.portfolio_return_pct)
    && data && point.date >= data.start_date && point.date <= data.end_date).sort((a, b) => a.date.localeCompare(b.date))
  const first = validPoints[0]
  const last = validPoints[validPoints.length - 1]
  // Annual reports use starting value + purchases; history uses net invested funds.
  // Only compare the history's own paired returns, on matching report dates.
  const matchingHistory = period === 'all-time' && !!data && first?.date === data.start_date && last?.date === data.end_date
  const historyReady = matchingHistory && !!last && !!data
    && Number.isFinite(last.value) && Number.isFinite(last.invested) && last.invested > 0
    && Math.abs(last.value - data.ending_balance) <= 0.02
    && Math.abs(last.invested - data.net_deposits) <= 0.02
  const reportedReturn = historyReady ? last.portfolio_return_pct! : data?.total_gain_pct ?? 0
  const gain = data?.total_gain ?? 0
  const hasReference = historyReady && Number.isFinite(last.benchmark_return_pct)
  const referenceReturn = hasReference ? last.benchmark_return_pct! : null
  const difference = referenceReturn === null ? null : reportedReturn - referenceReturn
  const returnPending = period === 'all-time' && chartLoading

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white font-heading">Performance</h2>
          {data && <p className="mt-1 text-sm text-gray-400">{dateLabel(data.start_date)} – {dateLabel(data.end_date)}</p>}
        </div>
        <div className="sm:w-44">
          <label htmlFor="performance-period" className="mb-1.5 block text-sm font-medium text-gray-300">Period</label>
          <div className="relative">
            <select id="performance-period" value={period} onChange={event => setPeriod(event.target.value)} className="min-h-11 w-full appearance-none rounded-lg border border-white/10 bg-surface-elevated py-2.5 pl-3 pr-12 text-base text-white focus:outline-none focus:ring-2 focus:ring-accent-400 [color-scheme:dark]">
              <option value="all-time">All time</option>
              {years.map(year => <option key={year.year} value={year.year}>{year.year}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          </div>
        </div>
      </div>

      {data ? <>
        <section aria-label="Selected-period result" className="glass rounded-xl p-4 sm:p-5">
          <p className="text-sm text-gray-400">Selected-period return</p>
          <p className={`mt-2 break-words text-4xl font-semibold tabular-nums sm:text-5xl ${isPrivate || returnPending ? 'text-gray-400' : tone(reportedReturn)}`}>
            {isPrivate ? PRIVACY_MASK : returnPending ? 'Loading…' : percent(reportedReturn)}
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-white/10 pt-4 lg:grid-cols-4">
            <div>
              <dt className="text-sm text-gray-400">Invested in purchases</dt>
              <dd className="mt-1 break-words text-lg font-semibold tabular-nums text-white sm:text-xl">{isPrivate ? PRIVACY_MASK : money(data.total_invested)}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400">Investment gain/loss</dt>
              <dd className={`mt-1 break-words text-lg font-semibold tabular-nums sm:text-xl ${isPrivate ? 'text-gray-400' : tone(gain)}`}>{isPrivate ? PRIVACY_MASK : money(gain, '€', true)}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400">{period === 'all-time' ? 'Portfolio value' : 'Value at period end'}</dt>
              <dd className="mt-1 break-words text-lg font-semibold tabular-nums text-white sm:text-xl">{isPrivate ? PRIVACY_MASK : money(data.ending_balance)}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400">Received from sales</dt>
              <dd className="mt-1 break-words text-lg font-semibold tabular-nums text-white sm:text-xl">{isPrivate ? PRIVACY_MASK : money(data.total_withdrawn)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-gray-400">
            {period !== 'all-time' && <>Value at period start: {isPrivate ? PRIVACY_MASK : money(data.beginning_balance)}. </>}
            Purchases and sale proceeds are separate from investment gain/loss. All amounts are in EUR.
          </p>
        </section>

        {historyReady && !chartLoading && (
          <p className="text-sm leading-relaxed text-gray-300">
            {isPrivate ? 'Comparison hidden in privacy mode.' : referenceReturn === null ? 'S&P 500 reference data is unavailable for this period.' : difference === 0 ? `Your return matches the S&P 500 reference (${percent(referenceReturn)}), a difference of 0.00 percentage points.` : `Your return is ${Math.abs(difference!).toFixed(2)} percentage points ${difference! > 0 ? 'higher' : 'lower'} than the S&P 500 reference (${percent(referenceReturn)}).`}
          </p>
        )}


        {period !== 'all-time' ? (
          <div className="glass rounded-xl p-4 text-sm text-gray-400">Comparable return history is unavailable for this calendar-year calculation. Select All time to compare with the reference index.</div>
        ) : chartLoading ? (
          <div role="status" aria-busy="true" className="glass rounded-xl p-5 text-sm text-gray-300">Loading return history…</div>
        ) : historyReady ? (
          <PerformanceChart data={validPoints} />
        ) : (
          <div className="glass rounded-xl p-4 text-sm text-gray-400">Comparable return history is unavailable for this report. The headline shows the report’s return on funds committed.</div>
        )}


        <section aria-labelledby="investment-results-heading" className="glass rounded-xl p-4 sm:p-5 text-sm">
          <h3 id="investment-results-heading" className="mb-2 text-base font-semibold text-white">Results by investment</h3>
          <p className="mb-2 text-gray-400">Amounts and investment returns use each investment’s original currency.{period === 'all-time' ? ' Details are grouped by calendar year.' : ''}</p>
          {selectedYear ? <InvestmentResults tickers={selectedYear.tickers ?? []} /> : years.length === 0 ? <p className="text-gray-400">No investment breakdown available for this period.</p> : years.map(year => (
            <section key={year.year} className="mt-4"><h3 className="font-medium text-white">{year.year}</h3><InvestmentResults tickers={year.tickers ?? []} /></section>
          ))}
        </section>

        <DetailSection title="How this is calculated">
          <div className="space-y-3 text-gray-400">
            <p>Gain/loss equals ending investment value plus sale proceeds, minus starting value and purchases. Purchases themselves are not investment gains.</p>
            <p>{historyReady ? 'The All time percentage and chart use gain divided by net money invested (purchases minus sales).' : 'The reported percentage uses gain divided by starting investment value plus purchases during the period.'} The percentage covers the displayed period rather than a yearly rate.</p>
            <p>The reference is a hypothetical SXR8.DE portfolio tracking the S&P 500, using the same purchase and sale amounts on the same dates. Comparable calendar-year reference results are unavailable in the current report.</p>
            <p>Portfolio totals are in EUR and use stored closing-price snapshots. Recorded dividend payments are excluded from these gains.</p>
          </div>
        </DetailSection>
      </> : <p className="glass rounded-xl p-5 text-sm text-gray-400">No performance report is available for this period.</p>}
    </div>
  )
}
