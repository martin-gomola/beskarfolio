import { useEffect, useState, useCallback } from 'react'
import { api } from '../services/api'

export interface FiftyTwoWeekRange {
  high: number
  low: number
  asOf: string
  currency: string
}

interface RawRangeItem {
  high: number
  low: number
  as_of: string
  currency: string
}

interface UseFiftyTwoWeekRangesReturn {
  ranges: Record<string, FiftyTwoWeekRange>
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Bulk 52-week high/low per ticker. Single request, refetched on
 * `prices-updated` so new prices don't silently skew the range for minutes.
 */
export function use52WeekRanges(): UseFiftyTwoWeekRangesReturn {
  const [ranges, setRanges] = useState<Record<string, FiftyTwoWeekRange>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRanges = useCallback(async () => {
    try {
      setError(null)
      const response = await api.get<Record<string, RawRangeItem>>('/api/prices/52week-range')
      const normalized: Record<string, FiftyTwoWeekRange> = {}
      for (const [ticker, item] of Object.entries(response.data || {})) {
        normalized[ticker] = {
          high: item.high,
          low: item.low,
          asOf: item.as_of,
          currency: item.currency,
        }
      }
      setRanges(normalized)
    } catch (err: any) {
      setError(err?.message || 'Failed to load 52-week ranges')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRanges()
    const onPricesUpdated = () => { fetchRanges() }
    window.addEventListener('prices-updated', onPricesUpdated)
    return () => window.removeEventListener('prices-updated', onPricesUpdated)
  }, [fetchRanges])

  return { ranges, loading, error, refetch: fetchRanges }
}
