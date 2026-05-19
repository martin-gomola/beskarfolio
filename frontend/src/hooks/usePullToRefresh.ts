import { useState, useEffect, useCallback, useRef } from 'react'

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>
  threshold?: number  // pixels to pull before triggering refresh
  disabled?: boolean
}

interface PullToRefreshState {
  isPulling: boolean
  isRefreshing: boolean
  pullDistance: number
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  disabled = false
}: UsePullToRefreshOptions): PullToRefreshState {
  const [state, setState] = useState<PullToRefreshState>({
    isPulling: false,
    isRefreshing: false,
    pullDistance: 0
  })

  const startY = useRef(0)
  const currentY = useRef(0)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Only enable when scrolled to top
    if (window.scrollY > 0 || disabled || state.isRefreshing) return

    startY.current = e.touches[0].clientY
    setState(prev => ({ ...prev, isPulling: true }))
  }, [disabled, state.isRefreshing])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!state.isPulling || disabled || state.isRefreshing) return

    currentY.current = e.touches[0].clientY
    const distance = Math.max(0, currentY.current - startY.current)

    // Apply resistance (diminishing returns as you pull further)
    const pullDistance = Math.min(distance * 0.5, threshold * 1.5)

    setState(prev => ({ ...prev, pullDistance }))

    // Prevent scroll if pulling down
    if (distance > 10) {
      e.preventDefault()
    }
  }, [state.isPulling, disabled, state.isRefreshing, threshold])

  const handleTouchEnd = useCallback(async () => {
    if (!state.isPulling || disabled) return

    if (state.pullDistance >= threshold) {
      setState(prev => ({ ...prev, isRefreshing: true, pullDistance: threshold * 0.5 }))

      try {
        await onRefresh()
      } finally {
        setState({ isPulling: false, isRefreshing: false, pullDistance: 0 })
      }
    } else {
      setState({ isPulling: false, isRefreshing: false, pullDistance: 0 })
    }
  }, [state.isPulling, state.pullDistance, threshold, onRefresh, disabled])

  useEffect(() => {
    const options: AddEventListenerOptions = { passive: false }

    document.addEventListener('touchstart', handleTouchStart, options)
    document.addEventListener('touchmove', handleTouchMove, options)
    document.addEventListener('touchend', handleTouchEnd, options)

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  return state
}
