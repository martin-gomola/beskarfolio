import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useSwipeToDismiss } from '../../hooks'
import { PctChangeCalc } from './PctChangeCalc'
import { BreakEvenCalc } from './BreakEvenCalc'
import { PositionSizeCalc } from './PositionSizeCalc'

type ActiveTool = null | 'pct-change' | 'break-even' | 'position-size'

const TOOLS = [
  {
    id: 'pct-change' as const,
    label: '% Change',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="5" x2="5" y2="19" />
        <circle cx="6.5" cy="6.5" r="2.5" />
        <circle cx="17.5" cy="17.5" r="2.5" />
      </svg>
    ),
  },
  {
    id: 'break-even' as const,
    label: 'Break-Even',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12h18" />
        <path d="M8 7l-5 5 5 5" />
        <path d="M16 7l5 5-5 5" />
      </svg>
    ),
  },
  {
    id: 'position-size' as const,
    label: 'Position Size',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <path d="M12 12h.01" />
        <path d="M17 12h.01" />
        <path d="M7 12h.01" />
      </svg>
    ),
  },
]

export const ToolsMenu: React.FC = () => {
  const [activeTool, setActiveTool] = useState<ActiveTool>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  const isOpen = menuOpen || activeTool !== null

  const handleClose = () => {
    setActiveTool(null)
    setMenuOpen(false)
  }

  const { sheetProps } = useSwipeToDismiss({ onDismiss: handleClose })

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeTool) setActiveTool(null)
        else setMenuOpen(false)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, activeTool])

  const handleToolSelect = (toolId: ActiveTool) => {
    setMenuOpen(false)
    setActiveTool(toolId)
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => {
          if (activeTool) { setActiveTool(null); return }
          setMenuOpen(o => !o)
        }}
        className={`p-2 transition-colors ${isOpen ? 'text-accent-400' : 'text-gray-400 hover:text-white'}`}
        aria-label="Quick tools"
        title="Quick Tools"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
        </svg>
      </button>

      {isOpen && createPortal(
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <div
            {...sheetProps}
            className="bg-surface-dark w-full sm:max-w-sm rounded-2xl border border-white/10 mx-4 sm:mx-0 overflow-hidden animate-slide-up"
          >
            {/* Swipe handle (mobile only) */}
            <div className="w-9 h-1 rounded-full bg-white/20 mx-auto mt-2 sm:hidden" />

            {/* Tool menu (no tool selected) */}
            {menuOpen && !activeTool && (
              <>
                <div className="px-5 pt-4 pb-3 flex items-center justify-between">
                  <span className="text-lg font-semibold text-white tracking-tight font-heading">Quick Tools</span>
                  <button onClick={handleClose} className="p-2 -mr-2 rounded-xl text-gray-500 hover:text-white hover:bg-white/5 transition-all">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="px-3 pb-4 space-y-1">
                  {TOOLS.map(tool => (
                    <button
                      key={tool.id}
                      onClick={() => handleToolSelect(tool.id)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-gray-300 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.1] transition-all text-left"
                    >
                      <span className="text-accent-400">{tool.icon}</span>
                      <span className="text-sm font-medium">{tool.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Active tool panels */}
            {activeTool === 'pct-change' && <PctChangeCalc onClose={handleClose} />}
            {activeTool === 'break-even' && <BreakEvenCalc onClose={handleClose} />}
            {activeTool === 'position-size' && <PositionSizeCalc onClose={handleClose} />}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
