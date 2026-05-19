import React, { useRef, useState, useCallback } from 'react'

interface SwipeableRowProps {
  onAction: () => void
  actionLabel?: string
  children: React.ReactNode
}

const ACTION_WIDTH = 80
const DRAG_THRESHOLD = 10

/**
 * Swipe-left-to-reveal action for mobile list rows.
 * Renders a div container with the action button behind the content.
 */
export const SwipeableRow: React.FC<SwipeableRowProps> = ({
  onAction,
  actionLabel = 'Edit',
  children,
}) => {
  const startX = useRef(0)
  const startY = useRef(0)
  const active = useRef(false)
  const locked = useRef(false)
  const [offsetX, setOffsetX] = useState(0)
  const [isOpen, setIsOpen] = useState(false)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    active.current = false
    locked.current = false
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current

    if (!active.current && !locked.current) {
      if (Math.abs(dy) > DRAG_THRESHOLD) { locked.current = true; return }
      if (Math.abs(dx) > DRAG_THRESHOLD) active.current = true
      return
    }
    if (locked.current || !active.current) return

    const base = isOpen ? -ACTION_WIDTH : 0
    setOffsetX(Math.min(0, Math.max(-ACTION_WIDTH * 1.3, base + dx)))
  }, [isOpen])

  const onTouchEnd = useCallback(() => {
    if (!active.current) return
    active.current = false

    if (offsetX < -ACTION_WIDTH / 2) {
      setOffsetX(-ACTION_WIDTH)
      setIsOpen(true)
    } else {
      setOffsetX(0)
      setIsOpen(false)
    }
  }, [offsetX])

  const handleAction = useCallback(() => {
    setOffsetX(0)
    setIsOpen(false)
    onAction()
  }, [onAction])

  return (
    <div className="relative overflow-hidden rounded-lg">
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-accent-600"
        style={{ width: ACTION_WIDTH }}
      >
        <button
          onClick={handleAction}
          className="flex flex-col items-center gap-0.5 w-full h-full justify-center text-white"
          aria-label={actionLabel}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          <span className="text-[10px] font-medium">{actionLabel}</span>
        </button>
      </div>

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: active.current ? 'none' : 'transform 0.25s ease-out',
        }}
        className="relative bg-surface-dark"
      >
        {children}
      </div>
    </div>
  )
}
