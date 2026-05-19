import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'
import { AnnualPerformanceData, AnnualPerformanceResponse } from '../types'
import { loadGuestTransactions } from '../utils/guestStorage'
// LocalStorage-only architecture
import {
  getCachedAnnualPerformance,
  cacheAnnualPerformance,
  haveTransactionsChanged
} from '../utils/guestCache'

// Extended timeout for annual performance (can take 30-60s for multi-year portfolios)
const ANNUAL_PERF_TIMEOUT = 180000 // 3 minutes

interface UseAnnualPerformanceReturn {
  performanceData: AnnualPerformanceData | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useAnnualPerformance(): UseAnnualPerformanceReturn {
  const [performanceData, setPerformanceData] = useState<AnnualPerformanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAnnualPerformance = async () => {
    try {
      setLoading(true)
      setError(null)

      const transactions = loadGuestTransactions()  // Load from localStorage

      if (transactions.length === 0) {
        setPerformanceData({
          years: [],
          all_time: {
            start_date: '',
            end_date: '',
            beginning_balance: 0,
            ending_balance: 0,
            total_invested: 0,
            total_withdrawn: 0,
            net_deposits: 0,
            total_gain: 0,
            total_gain_pct: 0,
            trade_count: 0
          }
        })
        setLoading(false)
        return
      }

      // ✅ FAST PATH: Check cache first (avoids hash calculation)
      const cachedData = getCachedAnnualPerformance()
      if (cachedData && cachedData.years && cachedData.all_time) {
        // Cache exists and is valid, check if transactions changed
        const transactionsChanged = haveTransactionsChanged(transactions)
        
        if (!transactionsChanged) {
          // Use cached data (FAST!)
          setPerformanceData(cachedData)
          setLoading(false)
          return
        }
        // If transactions changed, cache will be cleared in usePortfolio, so just recalculate
      }
      // No cache or cache invalid → calculate fresh (normal speed)

      console.log('[useAnnualPerformance] Fetching annual performance with', transactions.length, 'transactions')

      const response = await api.post<AnnualPerformanceResponse>(
        '/api/portfolio/annual-performance',
        { transactions },
        {
          timeout: ANNUAL_PERF_TIMEOUT,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      console.log('[useAnnualPerformance] Guest annual performance received:', response.data)
      const data = {
        years: response.data.years,
        all_time: response.data.all_time
      }
      setPerformanceData(data)

      // ✅ Cache the result
      cacheAnnualPerformance(data)
      
      // ✅ CRITICAL: Set loading to false after success
      setLoading(false)
    } catch (err: any) {
      const cachedData = getCachedAnnualPerformance({ allowExpired: true })
      if (cachedData && cachedData.years && cachedData.all_time) {
        setPerformanceData(cachedData)
        setError(null)
        setLoading(false)
        console.warn('[useAnnualPerformance] Using cached performance data because the backend is unavailable.', err)
        return
      }

      const errorMsg = err.response?.data?.detail || err.message || 'Failed to calculate annual performance'
      console.error('[useAnnualPerformance] Error calculating annual performance:', errorMsg)
      setError(errorMsg)
      setLoading(false)
    }
  }

  const refetchAnnualPerformance = useCallback(async () => {
    await fetchAnnualPerformance()
  }, [])

  useEffect(() => {
    refetchAnnualPerformance()
  }, [refetchAnnualPerformance])

  // Listen for custom transaction update events
  useEffect(() => {
    const handleTransactionUpdate = () => {
      console.log('[useAnnualPerformance] Transactions updated, refetching...')
      refetchAnnualPerformance()
    }

    window.addEventListener('guestTransactionsUpdated', handleTransactionUpdate)
    return () => window.removeEventListener('guestTransactionsUpdated', handleTransactionUpdate)
  }, [refetchAnnualPerformance])

  return {
    performanceData,
    loading,
    error,
    refetch: refetchAnnualPerformance
  }
}
