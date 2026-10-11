import React from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { PerformanceChartPoint } from '../../types'
import { usePrivacyMode } from '../../hooks'

interface PerformanceChartProps { data: PerformanceChartPoint[] }
interface TooltipEntry { payload: PerformanceChartPoint }
const percentage = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
const shortDate = (value: string, spansYears: boolean) => new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', spansYears ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' })

const ReturnTooltip = ({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) => {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  const portfolio = point.portfolio_return_pct
  const benchmark = point.benchmark_return_pct
  return (
    <div className="max-w-[260px] rounded-lg border border-white/10 bg-surface-dark p-3 text-sm shadow-xl">
      <p className="mb-2 text-xs text-gray-400">{point.date}</p>
      {typeof portfolio === 'number' && <p className="text-gray-100">Portfolio: {percentage(portfolio)}</p>}
      {typeof benchmark === 'number' && <p className="text-gray-300">S&P 500 reference: {percentage(benchmark)}</p>}
      {typeof portfolio === 'number' && typeof benchmark === 'number' && <p className="mt-1 text-gray-300">Difference: {(portfolio - benchmark).toFixed(2)} percentage points</p>}
    </div>
  )
}

export const PerformanceChart: React.FC<PerformanceChartProps> = ({ data }) => {
  const { isPrivate } = usePrivacyMode()
  const hasReference = data.some(point => Number.isFinite(point.benchmark_return_pct))
  const spansYears = data[0]?.date.slice(0, 4) !== data[data.length - 1]?.date.slice(0, 4)
  return (
    <section aria-label="Return history" className="glass rounded-xl p-4 sm:p-5">
      <h3 className="mb-4 text-base font-semibold text-white">Return over time</h3>
      {isPrivate ? <p className="text-sm text-gray-400">Performance chart hidden in privacy mode.</p> : (
        <div className="h-[260px] w-full sm:h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 5 }} accessibilityLayer>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis dataKey="date" tickFormatter={value => shortDate(value, spansYears)} stroke="#9ca3af" style={{ fontSize: 12 }} minTickGap={30} interval="preserveStartEnd" />
              <YAxis width={48} stroke="#9ca3af" style={{ fontSize: 12 }} tickFormatter={value => `${value > 0 ? '+' : ''}${value.toFixed(0)}%`} />
              <Tooltip content={<ReturnTooltip />} />
              <Legend iconType="line" wrapperStyle={{ fontSize: 12, color: '#9ca3af', paddingTop: 12 }} />
              <Line type="monotone" dataKey="portfolio_return_pct" stroke="#10b981" strokeWidth={2} dot={data.length === 1} name="Portfolio" isAnimationActive={false} />
              {hasReference && <Line type="monotone" dataKey="benchmark_return_pct" stroke="#9ca3af" strokeDasharray="5 4" strokeWidth={2} dot={data.length === 1} name="S&P 500 reference (SXR8.DE)" isAnimationActive={false} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
