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
  const handleLegendClick = (index: number) => {
    onSelectedIndexChange(selectedIndex === index ? null : index)
  }

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
    <>
      <div className="flex flex-col items-center">
        <div className="relative flex-shrink-0" style={{ height: '260px', width: '260px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={120}
                paddingAngle={1}
                dataKey="value"
                onMouseEnter={(_, index) => onActiveIndexChange(index)}
                onMouseLeave={() => onActiveIndexChange(null)}
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

        <div className="grid grid-cols-2 lg:flex lg:flex-wrap lg:justify-center gap-x-4 gap-y-1.5 mt-3">
          {chartData.map((item, index) => (
            <div
              key={item.name}
              className={`flex items-center gap-1.5 px-1.5 py-1 rounded transition-all cursor-pointer min-w-0 ${
                selectedIndex === index
                  ? 'bg-accent-600/30 ring-1 ring-accent-500/50'
                  : activeIndex === index
                    ? 'bg-gray-700/80'
                    : 'hover:bg-gray-800/50'
              }`}
              onMouseEnter={() => onActiveIndexChange(index)}
              onMouseLeave={() => onActiveIndexChange(null)}
              onClick={() => handleLegendClick(index)}
            >
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
              />
              <span className="text-white text-xs font-medium truncate">{item.name}</span>
              <span className="text-white text-xs font-semibold flex-shrink-0">
                {item.percentage.toFixed(1)}%
              </span>
              {!isPrivate && (
                <span className="text-[10px] text-gray-500 flex-shrink-0 hidden xs:inline">
                  €{(item.value / 1000).toFixed(1)}k
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {selectedIndex !== null && chartData[selectedIndex] && (
        <SelectedPositionDetails
          item={chartData[selectedIndex]}
          selectedIndex={selectedIndex}
          isPrivate={isPrivate}
          onClose={() => onSelectedIndexChange(null)}
        />
      )}
    </>
  )
}

function SelectedPositionDetails({
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
    <div className="mt-3 pt-3 sm:pt-4 border-t border-gray-700/50">
      <div className="hidden lg:flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: CHART_COLORS[selectedIndex % CHART_COLORS.length] }}
          />
          <span className="text-white font-bold">{item.name}</span>
        </div>

        <div className="text-center">
          <div className="text-gray-500 text-[10px] uppercase">Value</div>
          <div className="text-white font-semibold">
            {isPrivate ? PRIVACY_MASK : (
              <>
                {currencySymbol}{item.nativeValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {item.currency === 'USD' && (
                  <span className="text-gray-500 text-xs ml-1">(€{(item.value / 1000).toFixed(1)}k)</span>
                )}
              </>
            )}
          </div>
        </div>

        <div className="text-center">
          <div className="text-gray-500 text-[10px] uppercase">Shares</div>
          <div className="text-gray-200 font-medium">{isPrivate ? PRIVACY_MASK : item.shares.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
        </div>

        <div className="text-center">
          <div className="text-gray-500 text-[10px] uppercase">Avg</div>
          <div className="text-gray-200 font-medium">{isPrivate ? PRIVACY_MASK : `${currencySymbol}${item.avgPrice.toFixed(2)}`}</div>
        </div>

        <div className="text-center">
          <div className="text-gray-500 text-[10px] uppercase">Now</div>
          <div className="text-gray-200 font-medium">
            {currencySymbol}{item.currentPrice.toFixed(2)}
            <span className={`ml-1 text-xs ${isPositive ? 'text-gain' : 'text-loss'}`}>
              ({isPositive ? '+' : ''}{item.gainLossPct.toFixed(0)}%)
            </span>
          </div>
        </div>

        <div className="text-center">
          <div className="text-gray-500 text-[10px] uppercase">P&L</div>
          <div className={`font-bold ${isPrivate ? 'text-gray-500' : isPositive ? 'text-gain' : 'text-loss'}`}>
            {isPrivate ? PRIVACY_MASK : `${isPositive ? '+' : ''}${currencySymbol}${Math.abs(item.gainLoss).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
        </div>

        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white p-1"
          aria-label="Close"
        >
          x
        </button>
      </div>

      <div className="lg:hidden">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: CHART_COLORS[selectedIndex % CHART_COLORS.length] }}
            />
            <span className="text-white font-bold text-lg">{item.name}</span>
            {!isPrivate && item.currency === 'USD' && (
              <span className="text-gray-500 text-sm">
                (€{item.value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })})
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white p-1 -mr-1"
            aria-label="Close"
          >
            x
          </button>
        </div>

        <div className="mb-2 sm:mb-3 flex items-baseline justify-between gap-2">
          <span className="text-white font-semibold text-xl sm:text-2xl">
            {isPrivate ? PRIVACY_MASK : `${currencySymbol}${item.nativeValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </span>
          <div className="text-right flex-shrink-0">
            <span className="text-gray-500 text-xs">P&L: </span>
            <span className={`font-bold text-base sm:text-lg ${isPrivate ? 'text-gray-500' : isPositive ? 'text-gain' : 'text-loss'}`}>
              {isPrivate ? PRIVACY_MASK : `${isPositive ? '+' : ''}${currencySymbol}${Math.abs(item.gainLoss).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </span>
          </div>
        </div>

        <div className="pt-2 sm:pt-3 border-t border-gray-700/50 grid grid-cols-3 gap-1 sm:gap-2 text-center">
          <div>
            <div className="text-gray-500 text-[10px] uppercase">Shares</div>
            <div className="text-gray-200 font-medium">{isPrivate ? PRIVACY_MASK : item.shares.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px] uppercase">Avg</div>
            <div className="text-gray-200 font-medium">{isPrivate ? PRIVACY_MASK : `${currencySymbol}${item.avgPrice.toFixed(2)}`}</div>
          </div>
          <div>
            <div className="text-gray-500 text-[10px] uppercase">Now</div>
            <div className="text-gray-200 font-medium">
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
