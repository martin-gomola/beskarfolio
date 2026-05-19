import React from 'react'
import { ImportType } from '../../types'

interface ImportTypeSelectorProps {
  value: ImportType
  onChange: (type: ImportType) => void
}

/**
 * Import Type Selector - Dropdown Design
 * Compact dropdown for better mobile experience
 */
export const ImportTypeSelector: React.FC<ImportTypeSelectorProps> = ({ value, onChange }) => {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium text-gray-500">Format:</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ImportType)}
        className="flex-1 pl-3 pr-8 py-2 bg-white/5 border border-white/5 rounded-xl text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50"
      >
        <option value="standard">Standard CSV</option>
        <option value="ibkr">IBKR AI</option>
      </select>
    </div>
  )
}
