import React, { useState } from 'react'
import { ImportType, ImportMode } from '../../types'
import { ImportTypeSelector } from './ImportTypeSelector'
import { ImportModeSelector } from './ImportModeSelector'
import { IBKRImportForm } from './IBKRImportForm'
import { FileUploadForm } from './FileUploadForm'
import { ImportInstructions } from './ImportInstructions'

interface ImportSectionProps {
  onImportComplete: () => void
}

/**
 * Import Section Component
 * Main orchestrator for importing transactions from various sources
 */
export const ImportSection: React.FC<ImportSectionProps> = ({ onImportComplete }) => {
  const [importType, setImportType] = useState<ImportType>('standard')
  const [importMode, setImportMode] = useState<ImportMode>('append')
  const [showInstructions, setShowInstructions] = useState(false)

  // Auto-show instructions when switching to IBKR
  const handleImportTypeChange = (newType: ImportType) => {
    setImportType(newType)
    // Auto-expand instructions for IBKR (new feature)
    if (newType === 'ibkr') {
      setShowInstructions(true)
    }
  }

  return (
    <div className="glass rounded-xl p-4 sm:p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-shrink-0 w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
          <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-white tracking-tight font-heading">Import Transactions</h2>
          <p className="text-sm text-gray-500">
            Upload CSV from your broker or manual export
          </p>
        </div>
      </div>

      {/* Controls - Stacked for compact layout */}
      <div className="flex flex-col gap-3 mb-4 pb-4 border-b border-white/5">
        <ImportTypeSelector
          value={importType}
          onChange={handleImportTypeChange}
        />
        <ImportModeSelector
          value={importMode}
          onChange={setImportMode}
        />
      </div>

      {/* File Upload Area or Text Paste Areas */}
      <div className="space-y-4">
        {importType === 'ibkr' ? (
          <IBKRImportForm
            mode={importMode}
            onImportComplete={onImportComplete}
          />
        ) : (
          <FileUploadForm
            importType={importType}
            mode={importMode}
            onImportComplete={onImportComplete}
          />
        )}

        {/* Detailed Instructions - Expandable */}
        <ImportInstructions
          importType={importType}
          isExpanded={showInstructions}
          onToggle={() => setShowInstructions(!showInstructions)}
        />
      </div>
    </div>
  )
}
