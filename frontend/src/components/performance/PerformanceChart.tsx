import React, { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface PerformanceChartProps {
  data: Array<{
    date: string
    value: number
    invested: number
    portfolio_return_pct?: number
    benchmark_return_pct?: number
  }>
}

export const PerformanceChart: React.FC<PerformanceChartProps> = ({ data }) => {
  const [viewMode, setViewMode] = useState<'value' | 'performance'>('performance')
  
  // Guard: Return early if no valid data
  if (!data || !Array.isArray(data) || data.length === 0) {
    return null
  }
  
  // Check if benchmark data is available
  const hasBenchmarkData = data && data.length > 0 && data[0]?.portfolio_return_pct !== undefined
  
  // Debug logging
  React.useEffect(() => {
    console.log('📊 Chart data received:', {
      dataPoints: data?.length || 0,
      hasBenchmarkData,
      firstPoint: data?.[0],
      viewMode
    })
  }, [data, hasBenchmarkData, viewMode])
  
  // Custom tooltip for value view
  const ValueTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-surface border border-gray-700 rounded-lg p-3 shadow-xl">
          <p className="text-gray-400 text-xs mb-2">{payload[0].payload.date}</p>
          <div className="space-y-1">
            <p className="text-gain text-sm font-medium">
              Value: €{payload[0].value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-accent-400 text-sm font-medium">
              Invested: €{payload[1].value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className={`text-sm font-medium ${payload[0].value - payload[1].value >= 0 ? 'text-gain' : 'text-loss'}`}>
              Gain: {payload[0].value - payload[1].value >= 0 ? '+' : ''}€{(payload[0].value - payload[1].value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )
    }
    return null
  }
  
  // Custom tooltip for performance view
  const PerformanceTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const portfolioReturn = payload[0]?.value || 0
      const benchmarkReturn = payload[1]?.value || 0
      const outperformance = portfolioReturn - benchmarkReturn
      
      return (
        <div className="bg-surface border border-gray-700 rounded-lg p-3 shadow-xl">
          <p className="text-gray-400 text-xs mb-2">{payload[0].payload.date}</p>
          <div className="space-y-1">
            <p className="text-gain text-sm font-medium">
              Portfolio: {portfolioReturn >= 0 ? '+' : ''}{portfolioReturn.toFixed(2)}%
            </p>
            <p className="text-gray-400 text-sm font-medium">
              S&P 500: {benchmarkReturn >= 0 ? '+' : ''}{benchmarkReturn.toFixed(2)}%
            </p>
            <p className={`text-sm font-medium ${outperformance >= 0 ? 'text-gain' : 'text-loss'}`}>
              {outperformance >= 0 ? 'Outperforming' : 'Underperforming'}: {outperformance >= 0 ? '+' : ''}{outperformance.toFixed(2)}%
            </p>
          </div>
        </div>
      )
    }
    return null
  }
  
  return (
    <div className="glass rounded-xl p-4 sm:p-6">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg sm:text-xl font-semibold text-white font-heading">Portfolio Performance</h3>
          <p className="text-sm text-gray-400 mt-1">
            {viewMode === 'performance' ? 'Normalized returns vs benchmark' : 'Historical value and invested capital'}
          </p>
        </div>
        
        {/* View mode toggle */}
        {hasBenchmarkData && (
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('performance')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                viewMode === 'performance'
                  ? 'bg-accent-600 text-white'
                  : 'bg-surface text-gray-400 hover:text-gray-200'
              }`}
            >
              Performance %
            </button>
            <button
              onClick={() => setViewMode('value')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                viewMode === 'value'
                  ? 'bg-accent-600 text-white'
                  : 'bg-surface text-gray-400 hover:text-gray-200'
              }`}
            >
              Value €
            </button>
          </div>
        )}
      </div>
      
      <div className="w-full h-[300px] sm:h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          {viewMode === 'performance' && hasBenchmarkData ? (
            // Performance View (Normalized Returns %)
            <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="date" 
                stroke="#9CA3AF"
                style={{ fontSize: '12px' }}
                tick={{ fill: '#9CA3AF' }}
              />
              <YAxis 
                stroke="#9CA3AF"
                style={{ fontSize: '12px' }}
                tick={{ fill: '#9CA3AF' }}
                tickFormatter={(value) => `${value >= 0 ? '+' : ''}${value.toFixed(0)}%`}
              />
              <Tooltip content={<PerformanceTooltip />} />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="line"
                formatter={(value) => <span style={{ color: '#9CA3AF' }}>{value}</span>}
              />
              <Line 
                type="monotone" 
                dataKey="portfolio_return_pct" 
                stroke="#10B981" 
                strokeWidth={2}
                dot={false}
                name="Portfolio"
                activeDot={{ r: 6 }}
              />
              <Line 
                type="monotone" 
                dataKey="benchmark_return_pct" 
                stroke="#6B7280" 
                strokeWidth={2}
                dot={false}
                name="S&P 500 (SXR8)"
                activeDot={{ r: 6 }}
              />
            </LineChart>
          ) : (
            // Value View (Portfolio Value vs Invested)
            <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="date" 
                stroke="#9CA3AF"
                style={{ fontSize: '12px' }}
                tick={{ fill: '#9CA3AF' }}
              />
              <YAxis 
                stroke="#9CA3AF"
                style={{ fontSize: '12px' }}
                tick={{ fill: '#9CA3AF' }}
                tickFormatter={(value) => `€${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<ValueTooltip />} />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="line"
                formatter={(value) => <span style={{ color: '#9CA3AF' }}>{value}</span>}
              />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="#10B981" 
                strokeWidth={2}
                dot={false}
                name="Portfolio Value"
                activeDot={{ r: 6 }}
              />
              <Line 
                type="monotone" 
                dataKey="invested" 
                stroke="#3B82F6" 
                strokeWidth={2}
                dot={false}
                name="Total Invested"
                strokeDasharray="5 5"
                activeDot={{ r: 6 }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
