import { useState, useEffect, useCallback, useRef } from 'react'

type ScrollDirection = 'up' | 'down' | null

/**
 * Hook to detect scroll direction
 * Returns 'up' when scrolling up, 'down' when scrolling down
 * Includes threshold to prevent jitter on small scrolls
 */
export function useScrollDirection(threshold = 10): ScrollDirection {
  const [scrollDirection, setScrollDirection] = useState<ScrollDirection>(null)
  const lastScrollY = useRef(0)
  const ticking = useRef(false)

  const updateScrollDirection = useCallback(() => {
    const scrollY = window.scrollY

    // At top of page, always show
    if (scrollY < 50) {
      setScrollDirection('up')
      lastScrollY.current = scrollY
      ticking.current = false
      return
    }

    const diff = scrollY - lastScrollY.current

    // Only update if scrolled more than threshold
    if (Math.abs(diff) > threshold) {
      setScrollDirection(diff > 0 ? 'down' : 'up')
      lastScrollY.current = scrollY
    }

    ticking.current = false
  }, [threshold])

  useEffect(() => {
    const onScroll = () => {
      if (!ticking.current) {
        window.requestAnimationFrame(updateScrollDirection)
        ticking.current = true
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [updateScrollDirection])

  return scrollDirection
}
