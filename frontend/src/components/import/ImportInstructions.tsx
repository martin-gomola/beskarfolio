import React from 'react'
import { ImportType } from '../../types'

interface ImportInstructionsProps {
  importType: ImportType
  isExpanded: boolean
  onToggle: () => void
}

/**
 * Import Instructions Component
 * Expandable detailed instructions for each import type
 */
export const ImportInstructions: React.FC<ImportInstructionsProps> = ({
  importType,
  isExpanded,
  onToggle
}) => {
  return (
    <div className="bg-surface rounded-lg border border-gray-800">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-800/30 transition-colors rounded-lg"
      >
        <span className="text-sm font-medium text-gray-300">
          📖 How to get {importType === 'standard' ? 'CSV data' : 'IBKR data'}
        </span>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-800 pt-4 mt-2">
          {importType === 'standard' ? (
            <>
              <p className="text-sm font-medium text-gray-300 mb-3">CSV Format Requirements:</p>
              <div className="bg-gray-900 rounded p-3 mb-3">
                <code className="text-xs text-green-400 block">
                  ticker,type,date,shares,price,currency<br/>
                  AAPL,buy,2024-01-15,10,150.00,EUR<br/>
                  GOOGL,sell,2024-02-20,5,140.00,USD
                </code>
              </div>
              <ul className="text-xs text-gray-400 space-y-1">
                <li>• <strong>ticker</strong>: Stock symbol (e.g., AAPL, GOOGL)</li>
                <li>• <strong>type</strong>: buy or sell</li>
                <li>• <strong>date</strong>: YYYY-MM-DD format</li>
                <li>• <strong>shares</strong>: Number of shares</li>
                <li>• <strong>price</strong>: Price per share</li>
                <li>• <strong>currency</strong>: EUR or USD</li>
              </ul>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-300 mb-3">How to Import IBKR Transactions:</p>
              <div className="bg-orange-900/10 border border-orange-800 rounded-lg p-4 mb-4">
                <p className="text-sm font-medium text-orange-400 mb-2">🚀 Quick Method (Recommended)</p>
                <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside ml-2">
                  <li>
                    <strong>Go to IBKR AI Chat</strong>
                    <p className="text-xs text-gray-400 ml-6 mt-1">Log in to Interactive Brokers and open AI Chat</p>
                  </li>
                  <li>
                    <strong>Get Buy Transactions</strong>
                    <p className="text-xs text-gray-400 ml-6 mt-1">Ask: <code className="bg-gray-800 px-2 py-1 rounded text-green-400">"Show me all buy trades in the portfolio"</code></p>
                  </li>
                  <li>
                    <strong>Copy & Paste</strong>
                    <p className="text-xs text-gray-400 ml-6 mt-1">Select the entire table → Copy → Paste into the "Buy Transactions" text area above</p>
                  </li>
                  <li>
                    <strong>Get Sell Transactions</strong>
                    <p className="text-xs text-gray-400 ml-6 mt-1">Ask: <code className="bg-gray-800 px-2 py-1 rounded text-green-400">"Show me all sell trades in the portfolio"</code></p>
                  </li>
                  <li>
                    <strong>Copy & Paste</strong>
                    <p className="text-xs text-gray-400 ml-6 mt-1">Select the entire table → Copy → Paste into the "Sell Transactions" text area above</p>
                  </li>
                  <li>
                    <strong>Click Import</strong>
                    <p className="text-xs text-gray-400 ml-6 mt-1">The system will automatically validate and import your transactions</p>
                  </li>
                  <li>
                    <strong>Update Prices</strong>
                    <p className="text-xs text-gray-400 ml-6 mt-1">After import, click <strong>"Update Prices"</strong> to refresh prices (only fetches if older than 1h)</p>
                  </li>
                </ol>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
