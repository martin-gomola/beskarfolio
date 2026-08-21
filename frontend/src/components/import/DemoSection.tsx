import React, { useState } from 'react'
import { api, writeBrowserTransactions } from '../../services'

interface DemoSectionProps {
  onImportComplete: () => void
}

/**
 * Demo Portfolio Section
 * Loads a sample portfolio for testing and demonstration
 */
export const DemoSection: React.FC<DemoSectionProps> = ({ onImportComplete }) => {
  const [isLoading, setIsLoading] = useState(false)

  const loadDemoPortfolio = async () => {
    if (!confirm('This will clear your browser data and load a demo portfolio (~€50k) into localStorage. Continue?')) {
      return
    }

    setIsLoading(true)

    try {
      console.log('📦 Loading demo portfolio to localStorage')
      
      const response = await api.post('/api/import/demo?mode=replace')
      
      if (response.data.success && response.data.transactions) {
        console.log(`💾 Saving ${response.data.transactions.length} demo transactions to localStorage`)
        writeBrowserTransactions(response.data.transactions, {
          mode: 'replace',
          reason: 'demo',
        })
        
        console.log('✅ Demo portfolio loaded successfully!')
        alert(`✅ Demo portfolio loaded! ${response.data.imported_count} transactions imported to localStorage.`)
        
        // Refresh the portfolio display
        onImportComplete()
      } else {
        throw new Error('No transactions received from backend')
      }
    } catch (error: any) {
      console.error('Demo import error:', error)
      const message = error.response?.data?.detail || 'Failed to load demo portfolio'
      alert(`❌ ${message}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="bg-surface-elevated rounded-lg p-4 border border-gray-700">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-purple-600/20 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">Try Demo Portfolio</h3>
            <p className="text-xs text-gray-400">5 holdings, ~€15k, 12 months DCA</p>
          </div>
        </div>
        <button
          onClick={loadDemoPortfolio}
          disabled={isLoading}
          className="px-4 py-2 bg-accent-600 hover:bg-accent-700 disabled:bg-accent-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="hidden sm:inline">Loading...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Load Demo</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
