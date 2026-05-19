import React, { useEffect, useRef, useCallback } from 'react'

export type TerminalLineType = 'command' | 'success' | 'error' | 'warning' | 'info' | 'muted' | 'highlight'

export interface TerminalLine {
  text: string
  type?: TerminalLineType
}

interface TerminalProps {
  /** Terminal window title (e.g., "beskarfolio://app-settings") */
  title: string
  /** Lines to display in the terminal */
  lines: TerminalLine[]
  /** Optional subtitle in header right side */
  subtitle?: string
  /** Minimum height of terminal content area */
  minHeight?: string
  /** Show blinking cursor at the end */
  showCursor?: boolean
  /** Show "press to continue" message and make clickable */
  showContinuePrompt?: boolean
  /** Callback when terminal is clicked (for dismissing) */
  onDismiss?: () => void
  /** Additional content to render (like buttons) */
  children?: React.ReactNode
  /** Additional class names */
  className?: string
}

/**
 * Reusable Terminal component with macOS-style chrome
 * 
 * @example
 * ```tsx
 * <Terminal
 *   title="my-app://status"
 *   lines={[
 *     { text: '$ npm install', type: 'command' },
 *     { text: 'Installing packages...', type: 'info' },
 *     { text: '✓ Done!', type: 'success' }
 *   ]}
 *   showCursor
 * />
 * ```
 */
export const Terminal: React.FC<TerminalProps> = ({
  title,
  lines,
  subtitle,
  minHeight = '200px',
  showCursor = true,
  showContinuePrompt = false,
  onDismiss,
  children,
  className = ''
}) => {
  const contentRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new lines are added
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [lines])

  const getLineColor = (type?: TerminalLineType): string => {
    switch (type) {
      case 'command': return 'text-gray-300'
      case 'success': return 'text-green-400'
      case 'error': return 'text-red-400'
      case 'warning': return 'text-yellow-400'
      case 'info': return 'text-accent-400'
      case 'muted': return 'text-gray-600'
      case 'highlight': return 'text-cyan-400'
      default: return 'text-gray-400'
    }
  }

  const handleClick = () => {
    if (showContinuePrompt && onDismiss) {
      onDismiss()
    }
  }

  return (
    <div className={`bg-surface-dark rounded-lg border border-gray-700 overflow-hidden font-mono text-sm ${className}`}>
      {/* Terminal Header - macOS style */}
      <div className="bg-[#0f1c14] px-4 py-2.5 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
          </div>
          <span className="text-gray-300 font-medium">{title}</span>
        </div>
        {subtitle && (
          <div className="text-gray-500 text-xs">{subtitle}</div>
        )}
      </div>

      {/* Terminal Content */}
      <div 
        ref={contentRef}
        className={`p-4 overflow-y-auto ${showContinuePrompt ? 'cursor-pointer' : ''}`}
        style={{ minHeight }}
        onClick={handleClick}
      >
        <div className="space-y-1">
          {lines.map((line, i) => (
            <div 
              key={i} 
              className={`${getLineColor(line.type)} ${line.type === 'highlight' && showContinuePrompt ? 'animate-pulse' : ''}`}
            >
              {line.text || '\u00A0'}
            </div>
          ))}
          
          {/* Blinking cursor */}
          {showCursor && !showContinuePrompt && (
            <div className="text-gray-500 flex items-center gap-1 pt-2">
              <span className="text-green-400">$</span>
              <span className="animate-pulse">▊</span>
            </div>
          )}
        </div>

        {/* Custom content (buttons, etc.) */}
        {children && (
          <div className="mt-4">
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Hook for managing terminal lines with animations
 */
export const useTerminal = () => {
  const [lines, setLines] = React.useState<TerminalLine[]>([])
  const [isRunning, setIsRunning] = React.useState(false)

  const addLine = useCallback((text: string, type?: TerminalLineType) => {
    setLines(prev => [...prev, { text, type }])
  }, [])

  const clear = useCallback(() => {
    setLines([])
    setIsRunning(false)
  }, [])

  const sleep = useCallback((ms: number) => new Promise(r => setTimeout(r, ms)), [])

  const run = useCallback(async (script: () => Promise<void>) => {
    setIsRunning(true)
    setLines([])
    try {
      await script()
    } finally {
      // Don't set isRunning to false here - let the caller decide
    }
  }, [])

  const finish = useCallback(() => {
    setIsRunning(false)
  }, [])

  return {
    lines,
    isRunning,
    addLine,
    clear,
    sleep,
    run,
    finish,
    setIsRunning
  }
}

export default Terminal
