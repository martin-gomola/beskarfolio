import React, { useCallback } from 'react'

interface ActionRowProps {
  onAction: () => void
  actionLabel?: string
  children: React.ReactNode
}

/**
 * Mobile list row with an explicit action button.
 */
export const ActionRow: React.FC<ActionRowProps> = ({
  onAction,
  actionLabel = 'Edit',
  children,
}) => {
  const handleAction = useCallback(() => {
    onAction()
  }, [onAction])

  return (
    <div className="rounded-lg bg-surface-dark">
      <div className="flex items-center">
        <div className="min-w-0 flex-1">
          {children}
        </div>
        <button
          onClick={handleAction}
          className="mr-3 shrink-0 rounded-lg border border-accent-500/30 bg-accent-600/15 px-3 py-2 text-xs font-semibold text-accent-300 transition hover:bg-accent-600/25 hover:text-white"
          aria-label={actionLabel}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  )
}
