import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import { PRIVACY_MASK } from '../../hooks/usePrivacyMode'
import { CHART_COLORS } from '../../utils/constants'

export interface AllocationChartItem {
  name: string
  value: number
  percentage: number
  currency: string
  shares: number
  avgPrice: number
  currentPrice: number
  gainLoss: number
  gainLossPct: number
  nativeValue: number
}

interface AllocationDonutViewProps {
  activeIndex: number | null
  selectedIndex: number | null
  chartData: AllocationChartItem[]
  safeTotalValue: number
  isPrivate: boolean
  onActiveIndexChange: (index: number | null) => void
  onSelectedIndexChange: (index: number | null) => void
}

export function AllocationDonutView({
  activeIndex,
  selectedIndex,
  chartData,
  safeTotalValue,
  isPrivate,
  onActiveIndexChange,
  onSelectedIndexChange,
}: AllocationDonutViewProps) {
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-surface-elevated border border-gray-700 rounded-lg p-3 shadow-xl">
          <p className="text-gray-100 font-semibold mb-1">{data.name}</p>
          <p className="text-sm text-gray-300">
            Value: {isPrivate ? PRIVACY_MASK : `€${data.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </p>
          <p className="text-sm text-gray-400">
            {data.percentage.toFixed(2)}% of portfolio
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-col items-center">
        <div className="relative h-[250px] w-[250px] flex-shrink-0 sm:h-[280px] sm:w-[280px] lg:h-[300px] lg:w-[300px] xl:h-[320px] xl:w-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius="55%"
                outerRadius="92%"
                paddingAngle={1}
                dataKey="value"
                onMouseEnter={(_, index) => onActiveIndexChange(index)}
                onMouseLeave={() => onActiveIndexChange(null)}
                onClick={(_, index) => onSelectedIndexChange(selectedIndex === index ? null : index)}
                animationBegin={0}
                animationDuration={800}
              >
                {chartData.map((_entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                    opacity={activeIndex === null || activeIndex === index ? 1 : 0.6}
                    stroke={activeIndex === index ? '#fff' : 'none'}
                    strokeWidth={activeIndex === index ? 2 : 0}
                  />
                ))}
              </Pie>
              <Tooltip
                content={<CustomTooltip />}
                offset={20}
                wrapperStyle={{ zIndex: 1000 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 10 }}>
            <div className="text-center">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide">Total</div>
              <div className="text-2xl font-bold text-gray-100">
                {isPrivate ? PRIVACY_MASK : `€${(safeTotalValue / 1000).toFixed(1)}k`}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SelectedPositionDetails({
  item,
  selectedIndex,
  isPrivate,
  onClose,
}: {
  item: AllocationChartItem
  selectedIndex: number
  isPrivate: boolean
  onClose: () => void
}) {
  const currencySymbol = item.currency === 'USD' ? '$' : '€'
  const isPositive = item.gainLoss >= 0

  return (
    <div className="mt-2">
      <div className="hidden grid-cols-[minmax(120px,1.2fr)_minmax(105px,1fr)_60px_90px_minmax(110px,1fr)_44px] items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-4 py-3 lg:grid xl:gap-4">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <div
              className="h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: CHART_COLORS[selectedIndex % CHART_COLORS.length] }}
            />
            <span className="truncate font-bold text-white">{item.name}</span>
          </div>
          <div className="mt-1 truncate text-base font-semibold tabular-nums text-white">
            {isPrivate ? PRIVACY_MASK : `${currencySymbol}${item.nativeValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500">Profit & loss</div>
          <div className={`truncate font-bold tabular-nums ${isPrivate ? 'text-gray-500' : isPositive ? 'text-gain' : 'text-loss'}`}>
            {isPrivate ? PRIVACY_MASK : `${isPositive ? '+' : ''}${currencySymbol}${Math.abs(item.gainLoss).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
        </div>

        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">Shares</div>
          <div className="font-medium tabular-nums text-gray-200">{isPrivate ? PRIVACY_MASK : item.shares.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
        </div>

        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">Avg price</div>
          <div className="font-medium tabular-nums text-gray-200">{isPrivate ? PRIVACY_MASK : `${currencySymbol}${item.avgPrice.toFixed(2)}`}</div>
        </div>

        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">Current</div>
          <div className="whitespace-nowrap font-medium tabular-nums text-gray-200">
            {currencySymbol}{item.currentPrice.toFixed(2)}
            <span className={`ml-1 text-xs ${isPositive ? 'text-gain' : 'text-loss'}`}>
              ({isPositive ? '+' : ''}{item.gainLossPct.toFixed(0)}%)
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-white/5 hover:text-white"
          aria-label="Close position details"
        >
          ×
        </button>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 sm:p-4 lg:hidden">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div
              className="h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: CHART_COLORS[selectedIndex % CHART_COLORS.length] }}
            />
            <span className="truncate text-lg font-bold text-white">{item.name}</span>
            {!isPrivate && item.currency === 'USD' && (
              <span className="truncate text-xs text-gray-500">
                €{item.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-white/5 hover:text-white"
            aria-label="Close position details"
          >
            ×
          </button>
        </div>

        <div className="mb-3 flex items-baseline justify-between gap-3">
          <span className="text-xl font-semibold text-white sm:text-2xl">
            {isPrivate ? PRIVACY_MASK : `${currencySymbol}${item.nativeValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </span>
          <div className="flex-shrink-0 text-right">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Profit & loss</div>
            <div className={`font-bold ${isPrivate ? 'text-gray-500' : isPositive ? 'text-gain' : 'text-loss'}`}>
              {isPrivate ? PRIVACY_MASK : `${isPositive ? '+' : ''}${currencySymbol}${Math.abs(item.gainLoss).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-gray-700/50 pt-3 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Shares</div>
            <div className="font-medium text-gray-200">{isPrivate ? PRIVACY_MASK : item.shares.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Avg price</div>
            <div className="font-medium text-gray-200">{isPrivate ? PRIVACY_MASK : `${currencySymbol}${item.avgPrice.toFixed(2)}`}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Current</div>
            <div className="font-medium text-gray-200">
              {currencySymbol}{item.currentPrice.toFixed(2)}
              <span className={`ml-1 text-xs ${isPositive ? 'text-gain' : 'text-loss'}`}>
                ({isPositive ? '+' : ''}{item.gainLossPct.toFixed(0)}%)
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
