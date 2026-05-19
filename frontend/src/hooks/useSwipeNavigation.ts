import { useEffect, useRef, useCallback } from 'react'

interface UseSwipeNavigationOptions {
  tabs: string[]
  activeTab: string
  onNavigate: (tab: string) => void
  threshold?: number
  edgeZone?: number
}

/**
 * Horizontal swipe navigation between tabs (mobile only).
 * Returns a ref to attach to the swipeable content container.
 *
 * - Only triggers when horizontal distance exceeds vertical (won't fight scroll)
 * - Ignores swipes starting within edgeZone px of screen edges (preserves iOS back gesture)
 * - Respects prefers-reduced-motion
 */
export const useSwipeNavigation = ({
  tabs,
  activeTab,
  onNavigate,
  threshold = 50,
  edgeZone = 20,
}: UseSwipeNavigationOptions) => {
  const startX = useRef(0)
  const startY = useRef(0)
  const swiping = useRef(false)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const x = e.touches[0].clientX
    if (x < edgeZone || x > window.innerWidth - edgeZone) return

    let el = e.target as HTMLElement | null
    while (el && el !== document.body) {
      if (el.scrollWidth > el.clientWidth + 1) return
      el = el.parentElement
    }

    startX.current = x
    startY.current = e.touches[0].clientY
    swiping.current = true
  }, [edgeZone])

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!swiping.current) return
    swiping.current = false

    const dx = e.changedTouches[0].clientX - startX.current
    const dy = e.changedTouches[0].clientY - startY.current

    if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy)) return

    const currentIndex = tabs.indexOf(activeTab)
    if (currentIndex === -1) return

    if (dx < 0 && currentIndex < tabs.length - 1) {
      onNavigate(tabs[currentIndex + 1])
    } else if (dx > 0 && currentIndex > 0) {
      onNavigate(tabs[currentIndex - 1])
    }
  }, [tabs, activeTab, onNavigate, threshold])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    if (!mq.matches) return

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchEnd])
}
