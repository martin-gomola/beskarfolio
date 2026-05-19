import React from 'react'

/**
 * Skeleton Loader Component
 * Provides visual loading placeholders that match the layout
 */

// Dashboard skeleton with tiles
export const DashboardSkeleton: React.FC = () => {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-8 bg-gray-800 rounded w-64"></div>
        <div className="h-4 bg-gray-800 rounded w-96"></div>
      </div>

      {/* Tiles Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-gray-800 rounded-lg p-5 border border-gray-700">
            <div className="h-4 bg-gray-700 rounded w-20 mb-3"></div>
            <div className="h-8 bg-gray-700 rounded w-32"></div>
          </div>
        ))}
      </div>

      {/* Asset Allocation Chart */}
      <div className="bg-surface-elevated rounded-lg p-5 border border-gray-800">
        <div className="h-6 bg-gray-800 rounded w-40 mb-4"></div>
        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
          {/* Chart placeholder */}
          <div className="h-[320px] bg-gray-800 rounded-lg"></div>
          {/* Legend placeholder */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-gray-800 rounded-lg p-3 h-20"></div>
            ))}
          </div>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="bg-surface-elevated rounded-lg border border-gray-800 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-800">
          <div className="h-6 bg-gray-800 rounded w-32"></div>
        </div>
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-gray-800 rounded"></div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Holdings table skeleton
export const HoldingsTableSkeleton: React.FC = () => {
  return (
    <div className="bg-surface-elevated rounded-lg border border-gray-800 overflow-hidden animate-pulse">
      <div className="px-4 sm:px-6 py-4 border-b border-gray-800">
        <div className="h-6 bg-gray-800 rounded w-32 mb-3"></div>
        <div className="h-10 bg-gray-800 rounded"></div>
      </div>
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="h-16 bg-gray-800 rounded"></div>
        ))}
      </div>
    </div>
  )
}

// Performance chart skeleton
export const PerformanceChartSkeleton: React.FC = () => {
  return (
    <div className="bg-surface-elevated rounded-lg p-5 border border-gray-800 animate-pulse">
      <div className="h-6 bg-gray-800 rounded w-48 mb-4"></div>
      <div className="h-[400px] bg-gray-800 rounded-lg"></div>
    </div>
  )
}

// Card skeleton (generic)
export const CardSkeleton: React.FC<{ height?: string }> = ({ height = 'h-32' }) => {
  return (
    <div className={`bg-gray-800 rounded-lg p-5 border border-gray-700 animate-pulse ${height}`}>
      <div className="h-4 bg-gray-700 rounded w-24 mb-3"></div>
      <div className="h-6 bg-gray-700 rounded w-36"></div>
    </div>
  )
}

// Tile skeleton (matches portfolio overview tiles)
export const TileSkeleton: React.FC = () => {
  return (
    <div className="bg-gray-800 rounded-lg p-5 border border-gray-700 animate-pulse">
      <div className="h-4 bg-gray-700 rounded w-20 mb-3"></div>
      <div className="h-10 bg-gray-700 rounded w-32"></div>
    </div>
  )
}
