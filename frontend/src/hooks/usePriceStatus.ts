import { useState, useEffect, useRef } from 'react'
import { priceService } from '../services'
import { PriceStatus } from '../types'
import { IS_DEMO_MODE } from '../utils/constants'

const AUTO_REFRESH_MS = 30 * 60 * 1000 // 30 minutes
const STATUS_POLL_MS = 5 * 60 * 1000 // 5 minutes

export const usePriceStatus = () => {
  const [priceStatus, setPriceStatus] = useState<PriceStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchPriceStatus = async () => {
    try {
      const status = await priceService.getStatus()
      setPriceStatus(status)
    } catch (error) {
      console.error('Failed to fetch price status:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPriceStatus()

    const handlePriceUpdate = () => {
      setTimeout(fetchPriceStatus, 500)
    }
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchPriceStatus()
      }
    }
    window.addEventListener('prices-updated', handlePriceUpdate)
    window.addEventListener('focus', handleVisibilityOrFocus)
    document.addEventListener('visibilitychange', handleVisibilityOrFocus)

    if (!IS_DEMO_MODE) {
      intervalRef.current = setInterval(() => {
        window.dispatchEvent(new Event('auto-refresh-prices'))
      }, AUTO_REFRESH_MS)
    }
    statusPollRef.current = setInterval(() => {
      fetchPriceStatus()
    }, STATUS_POLL_MS)

    return () => {
      window.removeEventListener('prices-updated', handlePriceUpdate)
      window.removeEventListener('focus', handleVisibilityOrFocus)
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus)
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (statusPollRef.current) clearInterval(statusPollRef.current)
    }
  }, [])

  return {
    priceStatus,
    loading,
    refetch: fetchPriceStatus
  }
}
