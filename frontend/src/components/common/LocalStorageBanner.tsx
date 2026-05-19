/**
 * LocalStorage Information Banner
 * 
 * Dismissible banner that informs users about localStorage-only architecture
 * Shows once per browser, can be dismissed permanently
 */

import { useState, useEffect } from 'react'

const BANNER_DISMISSED_KEY = 'beskarfolio_localStorage_banner_dismissed'

export function LocalStorageBanner() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Check if banner was previously dismissed
    try {
      const dismissed = localStorage.getItem(BANNER_DISMISSED_KEY)
      console.log('[LocalStorageBanner] Dismissed state:', dismissed)
      if (!dismissed) {
        console.log('[LocalStorageBanner] Showing banner')
        setIsVisible(true)
      } else {
        console.log('[LocalStorageBanner] Banner was dismissed, not showing')
      }
    } catch (err) {
      console.error('[LocalStorageBanner] Error checking localStorage:', err)
      // If localStorage is unavailable, show the banner as a safety measure
      setIsVisible(true)
    }
  }, [])

  const handleDismiss = () => {
    localStorage.setItem(BANNER_DISMISSED_KEY, 'true')
    setIsVisible(false)
  }

  if (!isVisible) return null

  return (
    <div className="bg-accent-500/10 border-b border-accent-500/30 pt-[env(safe-area-inset-top)]">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-start gap-3">
          {/* Database Icon */}
          <div className="flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  {/* Info Icon */}
                  <svg className="w-4 h-4 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-semibold text-accent-300">
                    LocalStorage-Only Architecture
                  </span>
                </div>
                <p className="text-xs text-gray-300 mt-1">
                  <strong>Your data is stored in your browser's localStorage.</strong>
                  {' '}Transactions are sent to our server for calculations but never stored there (stateless backend).<br></br>
                  {' '}<strong className="text-yellow-300">Important:</strong> Data will be lost if you clear your browser cache or use a different browser.
                  {' '}Export your data regularly to avoid loss.
                </p>
              </div>

              {/* Dismiss button with X icon */}
              <button
                onClick={handleDismiss}
                className="flex-shrink-0 p-1 hover:bg-gray-700/50 rounded transition text-gray-400 hover:text-white"
                aria-label="Dismiss banner"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
