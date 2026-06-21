import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import { CHART_COLORS } from '../../utils/constants'

interface DriftData {
  ticker: string
  currentPct: number
  targetPct: number
  driftPct: number
  action: 'buy' | 'sell' | 'hold'
}

interface Alert {
  type: 'warning' | 'info' | 'danger'
  icon: string
  message: string
}

interface TargetAllocationViewProps {
  driftData: DriftData[]
  alerts: Alert[]
  hasTargets: boolean
}

const TargetIcon = ({ size = 16, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="6"/>
    <circle cx="12" cy="12" r="2"/>
  </svg>
)

export function TargetAllocationView({ driftData, alerts, hasTargets }: TargetAllocationViewProps) {
  const currentChartData = driftData.map((drift, index) => ({
    name: drift.ticker,
    value: drift.currentPct,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }))

  const targetChartData = driftData.map((drift, index) => ({
    name: drift.ticker,
    value: drift.targetPct,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }))

  const totalDrift = driftData.reduce((sum, drift) => sum + Math.abs(drift.driftPct), 0) / 2
  const maxDrift = driftData.length > 0 ? driftData[0] : null

  if (!hasTargets || driftData.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <TargetIcon size={32} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">No target allocations configured.</p>
        <p className="text-xs mt-1">Go to Allocation tab to set targets.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <TargetDonut title="Current" data={currentChartData} cellKeyPrefix="current" />
        <TargetDonut title="Target" data={targetChartData} cellKeyPrefix="target" />
      </div>

      <div className="grid grid-cols-2 gap-3 p-3 bg-gray-800/30 rounded-lg">
        <div className="text-center">
          <div className="text-gray-500 text-[10px] uppercase">Total Drift</div>
          <div className={`text-xl font-bold ${totalDrift > 10 ? 'text-red-400' : totalDrift > 5 ? 'text-amber-400' : 'text-green-400'}`}>
            {totalDrift.toFixed(1)}%
          </div>
        </div>
        <div className="text-center">
          <div className="text-gray-500 text-[10px] uppercase">Max Drift</div>
          <div className={`text-xl font-bold ${maxDrift && Math.abs(maxDrift.driftPct) > 5 ? 'text-red-400' : 'text-green-400'}`}>
            {maxDrift ? `${maxDrift.driftPct > 0 ? '+' : ''}${maxDrift.driftPct.toFixed(1)}%` : '0%'}
          </div>
          <div className="text-[10px] text-gray-500">{maxDrift?.ticker}</div>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-1.5">
          {alerts.map((alert, index) => (
            <div
              key={index}
              className={`flex items-center gap-2 p-2 rounded-lg text-xs ${
                alert.type === 'danger'
                  ? 'bg-red-500/10 border border-red-500/20 text-red-300'
                  : alert.type === 'warning'
                    ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
                    : 'bg-accent-500/10 border border-accent-500/20 text-accent-300'
              }`}
            >
              <span>{alert.icon}</span>
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 pt-2 border-t border-gray-700/50">
        {driftData.slice(0, 6).map((drift, index) => (
          <div key={drift.ticker} className="flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
            />
            <span className="text-[10px] text-gray-400">{drift.ticker}</span>
            <span className={`text-[10px] font-medium ${
              drift.driftPct > 5 ? 'text-red-400' : drift.driftPct < -5 ? 'text-green-400' : 'text-gray-300'
            }`}>
              {drift.driftPct > 0 ? '+' : ''}{drift.driftPct.toFixed(0)}%
            </span>
          </div>
        ))}
        {driftData.length > 6 && (
          <span className="text-[10px] text-gray-500">+{driftData.length - 6} more</span>
        )}
      </div>
    </div>
  )
}

function TargetDonut({
  title,
  data,
  cellKeyPrefix,
}: {
  title: string
  data: Array<{ name: string; value: number; color: string }>
  cellKeyPrefix: string
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 text-center">{title}</h4>
      <div className="relative" style={{ height: '140px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={35}
              outerRadius={60}
              paddingAngle={1}
              dataKey="value"
              animationBegin={0}
              animationDuration={600}
            >
              {data.map((entry, index) => (
                <Cell key={`${cellKeyPrefix}-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload
                  return (
                    <div className="bg-surface-elevated border border-gray-700 rounded px-2 py-1 text-xs">
                      <span className="text-white">{item.name}: {item.value.toFixed(1)}%</span>
                    </div>
                  )
                }
                return null
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
