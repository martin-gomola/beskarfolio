import { useRef, useCallback, useState } from 'react'

interface UseSwipeToDismissOptions {
  onDismiss: () => void
  threshold?: number
}

/**
 * Swipe-down-to-dismiss for bottom-sheet modals (mobile).
 * Returns a ref for the sheet panel and the current translateY offset.
 *
 * - Tracks vertical drag from anywhere on the sheet
 * - Applies real-time translateY transform during drag
 * - Dismisses when dragged past threshold; snaps back otherwise
 * - Only allows downward drag (translateY >= 0)
 */
export const useSwipeToDismiss = ({ onDismiss, threshold = 100 }: UseSwipeToDismissOptions) => {
  const sheetRef = useRef<HTMLDivElement>(null)
  const startY = useRef(0)
  const dragging = useRef(false)
  const [offsetY, setOffsetY] = useState(0)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const el = sheetRef.current
    if (!el) return

    const scrollable = el.querySelector('[data-sheet-scroll]') as HTMLElement | null
    if (scrollable && scrollable.scrollTop > 0) return

    startY.current = e.touches[0].clientY
    dragging.current = true
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current) return
    const dy = e.touches[0].clientY - startY.current
    if (dy < 0) { setOffsetY(0); return }
    setOffsetY(dy)
  }, [])

  const onTouchEnd = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false

    if (offsetY > threshold) {
      onDismiss()
    }
    setOffsetY(0)
  }, [offsetY, threshold, onDismiss])

  const sheetProps = {
    ref: sheetRef,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    style: {
      transform: offsetY > 0 ? `translateY(${offsetY}px)` : undefined,
      transition: dragging.current ? 'none' : 'transform 0.25s ease-out',
    } as React.CSSProperties,
  }

  return { sheetProps, offsetY }
}
