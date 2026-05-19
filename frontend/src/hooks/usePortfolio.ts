/**
 * Custom hook for managing portfolio data
 * LocalStorage-only architecture: Transactions in localStorage, backend for calculations (with caching)
 */
import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'
import { PortfolioSummary } from '../types/portfolio'
import { Holding } from '../types/holding'
import { loadGuestTransactions } from '../utils/guestStorage'
import {
  getCachedSummary,
  cacheSummary,
  haveTransactionsChanged,
  updateTransactionsHash,
  clearAllCaches
} from '../utils/guestCache'

interface UsePortfolioReturn {
  summary: PortfolioSummary | null
  holdings: Holding[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Hook to fetch and manage portfolio data
 *
 * Architecture:
 * - All transactions stored in localStorage (browser-local)
 * - Portfolio calculations done by backend (stateless)
 * - Results cached in localStorage for fast loading
 * - Prices fetched from backend for live updates
 */
export function usePortfolio(): UsePortfolioReturn {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch portfolio data - memoized to prevent unnecessary re-renders
  // forceRefresh = true bypasses cache (for manual refresh/pull-to-refresh)
  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true)
    setError(null)

    try {
      const transactions = loadGuestTransactions()

      if (transactions.length === 0) {
        setSummary({
          success: true,
          transaction_count: 0,
          total_value: 0,
          total_invested: 0,
          total_gain_loss: 0,
          total_gain_loss_pct: 0,
          holdings_count: 0
        })
        setHoldings([])
        setLoading(false)
        return
      }

      // ✅ Force refresh: Clear cache and fetch fresh prices
      if (forceRefresh) {
        if (import.meta.env.DEV) console.log('🔄 Force refresh requested, clearing all caches')
        clearAllCaches()
      } else {
        // ✅ FAST PATH: Check cache first (avoids hash calculation)
        const cachedData = getCachedSummary()
        if (cachedData) {
          // Cache exists and is valid, check if transactions changed
          const transactionsChanged = haveTransactionsChanged(transactions)
          
          if (!transactionsChanged) {
            // Use cached data (FAST!)
            setSummary(cachedData.summary)
            setHoldings(cachedData.holdings || [])
            setLoading(false)
            return
          } else {
            // Transactions changed → clear caches and recalculate
            if (import.meta.env.DEV) console.log('🔄 Transactions changed, clearing caches')
            clearAllCaches()
          }
        }
      }
      // No cache or cache invalid → calculate fresh

      // Calculate fresh data (accurate FIFO-based calculations)
      if (import.meta.env.DEV) console.log('🔄 Sending transactions to backend for calculation...')
      const response = await api.post('/api/portfolio/calculate', transactions)

      setSummary(response.data.summary)
      setHoldings(response.data.holdings || [])

      // ✅ Cache the result
      cacheSummary({
        summary: response.data.summary,
        holdings: response.data.holdings || []
      })
      updateTransactionsHash(transactions)

      setLoading(false)
      if (import.meta.env.DEV) console.log('✅ Portfolio calculated and cached')
    } catch (err: unknown) {
      const cachedData = getCachedSummary({ allowExpired: true })
      if (cachedData) {
        setSummary(cachedData.summary)
        setHoldings(cachedData.holdings || [])
        setError(null)
        setLoading(false)
        console.warn('Using cached portfolio data because the backend is unavailable.', err)
        return
      }

      const message = err instanceof Error ? err.message : 'Failed to calculate portfolio'
      setError(message)
      console.error('Error calculating portfolio:', err)
      setLoading(false)
    }
  }, []) // Empty deps - uses state setters which are stable

  useEffect(() => {
    fetchData(false) // Initial load uses cache
  }, [fetchData])

  return {
    summary,
    holdings,
    loading,
    error,
    // Manual refresh always forces fresh prices
    refetch: () => fetchData(true),
  }
}
