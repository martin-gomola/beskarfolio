import React, { useEffect, useRef, useState } from 'react'

export const BackendWakingOverlay: React.FC = () => {
  const [visible, setVisible] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef<number | null>(null)
  const tickRef = useRef<number | null>(null)

  useEffect(() => {
    const handleWaking = () => {
      startRef.current = Date.now()
      setElapsed(0)
      setVisible(true)
      if (tickRef.current === null) {
        tickRef.current = window.setInterval(() => {
          if (startRef.current !== null) {
            setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
          }
        }, 500)
      }
    }
    const handleReady = () => {
      setVisible(false)
      startRef.current = null
      if (tickRef.current !== null) {
        clearInterval(tickRef.current)
        tickRef.current = null
      }
    }
    window.addEventListener('backend-waking', handleWaking)
    window.addEventListener('backend-ready', handleReady)
    return () => {
      window.removeEventListener('backend-waking', handleWaking)
      window.removeEventListener('backend-ready', handleReady)
      if (tickRef.current !== null) clearInterval(tickRef.current)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)] pointer-events-none"
    >
      <div className="glass-nav border border-white/[0.08] rounded-xl px-4 py-3 shadow-2xl pointer-events-auto">
        <div className="flex items-center gap-3">
          <div className="relative w-5 h-5 flex-shrink-0">
            <div className="absolute inset-0 rounded-full border-2 border-white/10" />
            <div className="absolute inset-0 rounded-full border-2 border-t-blue-400 border-r-blue-400 border-b-transparent border-l-transparent animate-spin" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white">Waking demo backend…</div>
            <div className="text-xs text-gray-400 mt-0.5">
              Free tier sleeps after 15 min idle. First load takes ~30s.
              {elapsed > 0 && <span className="ml-1">({elapsed}s)</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
