import React from 'react'
import { ImportMode } from '../../types'

interface ImportModeSelectorProps {
  value: ImportMode
  onChange: (mode: ImportMode) => void
}

/**
 * Import Mode Selector - Compact Toggle Design
 * Redesigned for better space efficiency
 */
export const ImportModeSelector: React.FC<ImportModeSelectorProps> = ({ value, onChange }) => {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium text-gray-500 whitespace-nowrap">Mode:</label>
      <div className="flex gap-1 flex-1 bg-white/5 p-1 rounded-xl">
        <button
          onClick={() => onChange('append')}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
            value === 'append'
              ? 'bg-emerald-500 text-white shadow-sm'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <span className="hidden sm:inline">Append</span>
        </button>

        <button
          onClick={() => onChange('replace')}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
            value === 'replace'
              ? 'bg-rose-500 text-white shadow-sm'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
          <span className="hidden sm:inline">Replace</span>
        </button>
      </div>
    </div>
  )
}
