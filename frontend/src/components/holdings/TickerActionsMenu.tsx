import React, { useState, useRef } from 'react'

interface TickerActionsMenuProps {
  ticker: string
  onViewTransactions: () => void
  onViewPriceHistory: () => void
  onHoldingRemoved: () => void
}

/**
 * Three-dot actions menu for holdings table
 */
export const TickerActionsMenu: React.FC<TickerActionsMenuProps> = ({
  ticker,
  onViewTransactions,
  onViewPriceHistory,
  onHoldingRemoved
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const handleRemoveHolding = async () => {
    if (!confirm(`Are you sure you want to delete all transactions for ${ticker}?

This will permanently remove this holding from your portfolio.`)) {
      return
    }

    setIsDeleting(true)
    setIsOpen(false)

    try {
      // LocalStorage mode: Delete individual transactions instead
      alert('To remove a holding, delete all its transactions from the Transactions tab.')
      onHoldingRemoved()
    } catch (err: any) {
      console.error('Error removing holding:', err)
      const message = err.response?.data?.detail || 'Failed to remove holding'
      alert(message)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleToggle = () => {
    if (!isOpen && buttonRef.current) {
      // Check if button is in bottom half of viewport
      const rect = buttonRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const shouldOpenUpward = rect.bottom > viewportHeight * 0.6
      setOpenUpward(shouldOpenUpward)
    }
    setIsOpen(!isOpen)
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        disabled={isDeleting}
        className="p-2 hover:bg-surface rounded-lg transition-colors text-gray-400 hover:text-gray-200 disabled:opacity-50"
      >
        {isDeleting ? (
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className={`absolute right-0 w-56 bg-surface-elevated rounded-lg shadow-lg border border-gray-700 z-20 ${
            openUpward ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}>
            <div className="py-1">
              <button
                onClick={() => {
                  onViewTransactions()
                  setIsOpen(false)
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-300 hover:bg-surface transition-colors flex items-center gap-3"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View Transactions
              </button>

              <button
                onClick={() => {
                  onViewPriceHistory()
                  setIsOpen(false)
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-300 hover:bg-surface transition-colors flex items-center gap-3"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
                Price History
              </button>

              <div className="border-t border-gray-700 my-1" />

              <button
                onClick={handleRemoveHolding}
                className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-900/20 transition-colors flex items-center gap-3"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Remove Holding
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
