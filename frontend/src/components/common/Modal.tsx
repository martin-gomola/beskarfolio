import React, { ReactNode } from 'react'
import { useSwipeToDismiss } from '../../hooks'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children,
  size = 'md'
}) => {
  const { sheetProps } = useSwipeToDismiss({ onDismiss: onClose })

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-2xl',
    xl: 'sm:max-w-5xl'
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        {...sheetProps}
        className={`bg-surface-dark w-full ${sizeClasses[size]} rounded-2xl border border-white/10 max-h-[85vh] mx-4 sm:mx-0 overflow-hidden animate-slide-up`}
      >
        <div className="w-9 h-1 rounded-full bg-white/20 mx-auto mt-2 sm:hidden" aria-hidden="true" />
        <div className="px-5 pt-4 pb-3 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white tracking-tight">{title}</h2>
          <button 
            onClick={onClose} 
            className="p-2 -mr-2 rounded-xl text-gray-500 hover:text-white hover:bg-white/5 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto max-h-[calc(85vh-64px)]" data-sheet-scroll>
          {children}
        </div>
      </div>
    </div>
  )
}
