/**
 * Custom hook for managing portfolio data
 * LocalStorage-only architecture: Transactions in localStorage, backend for calculations (with caching)
 */
import { useState, useEffect, useCallback } from 'react'
import { PortfolioSummary } from '../types/portfolio'
import { Holding } from '../types/holding'
import { readBrowserPortfolio, type BrowserPortfolioSource } from '../services/browserPortfolioState'

interface UsePortfolioReturn {
  summary: PortfolioSummary | null
  holdings: Holding[]
  loading: boolean
  error: string | null
  source: BrowserPortfolioSource
  calculatedAt: number | null
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
  const [source, setSource] = useState<BrowserPortfolioSource>('empty')
  const [calculatedAt, setCalculatedAt] = useState<number | null>(null)

  // Fetch portfolio data - memoized to prevent unnecessary re-renders
  // forceRefresh = true bypasses cache (for manual refresh/pull-to-refresh)
  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true)
    setError(null)

    try {
      const snapshot = await readBrowserPortfolio({ forceRefresh })
      setSummary(snapshot.summary)
      setHoldings(snapshot.holdings)
      setSource(snapshot.source)
      setCalculatedAt(snapshot.calculatedAt)
      setLoading(false)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to calculate portfolio'
      setError(message)
      setSource(previous => previous === 'empty' ? previous : 'expired-cache')
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
    source,
    calculatedAt,
    // Manual refresh always forces fresh prices
    refetch: () => fetchData(true),
  }
}
