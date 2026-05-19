import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { loadGuestTransactions } from '../../utils/guestStorage'
import { 
  exportBackup, 
  parseBackup, 
  compareBackup, 
  importBackup,
  formatBackupDate,
  detectDevice,
  type BackupData,
  type ImportComparison
} from '../../utils/backupService'
import { GUEST_STORAGE_KEY } from '../../utils/constants'
import { APP_VERSION } from '../../utils/version'

interface BackupDropdownProps {
  onDataImported?: () => void
}

/**
 * Header Backup Dropdown
 * Quick access to backup/restore functionality
 */
export const BackupDropdown: React.FC<BackupDropdownProps> = ({ onDataImported }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [transactions, setTransactions] = useState<any[]>([])
  const [lastModified, setLastModified] = useState<string | null>(null)
  const [importDialog, setImportDialog] = useState<{
    backup: BackupData
    comparison: ImportComparison
  } | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load data info
  useEffect(() => {
    const loadData = () => {
      const txns = loadGuestTransactions()
      setTransactions(txns)
      
      try {
        const stored = localStorage.getItem(GUEST_STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored)
          setLastModified(parsed.lastUpdated || null)
        }
      } catch {
        setLastModified(null)
      }
    }
    
    loadData()
    
    // Listen for transaction updates
    const handleUpdate = () => loadData()
    window.addEventListener('guestTransactionsUpdated', handleUpdate)
    return () => window.removeEventListener('guestTransactionsUpdated', handleUpdate)
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleExport = () => {
    exportBackup(APP_VERSION)
    setIsOpen(false)
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    try {
      const text = await file.text()
      const backup = parseBackup(text)
      
      if (!backup) {
        alert('❌ Invalid backup file')
        return
      }
      
      const comparison = compareBackup(backup)
      setImportDialog({ backup, comparison })
      setIsOpen(false)
    } catch {
      alert('❌ Failed to read file')
    }
    
    e.target.value = ''
  }

  const handleConfirmImport = (merge: boolean) => {
    if (!importDialog) return
    
    const result = importBackup(importDialog.backup, {
      importTransactions: true,
      importAllocations: true,
      importSettings: true,
      mergeTransactions: merge
    })
    
    if (result.success) {
      setImportDialog(null)
      onDataImported?.()
      window.location.reload()
    } else {
      alert('❌ Import failed')
    }
  }

  const formatShortDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Import Confirmation Dialog (portaled to body to escape header stacking context) */}
      {importDialog && createPortal(
        <div
          className="fixed inset-0 z-[60] overflow-y-auto bg-black/60 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setImportDialog(null)}
        >
          <div className="min-h-full flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && setImportDialog(null)}>
          <div className="bg-surface-dark w-full max-w-md rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
            <div className="px-5 pt-5 pb-3">
              <h3 className="text-lg font-semibold text-white tracking-tight font-heading">Import Backup</h3>
            </div>
            
            <div className="px-5 pb-4 space-y-4">
              <div className="bg-surface-elevated rounded-xl p-3 space-y-2 font-mono text-sm border border-white/5">
                <div className="flex justify-between">
                  <span className="text-gray-500">from:</span>
                  <span className="text-cyan-400">{importDialog.backup.device}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">date:</span>
                  <span className="text-gray-300">{formatBackupDate(importDialog.backup.updatedAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">transactions:</span>
                  <span className="text-gray-300">{importDialog.backup.transactions.length}</span>
                </div>
              </div>
              
              {importDialog.comparison.warnings.length > 0 && (
                <div className="space-y-2">
                  {importDialog.comparison.warnings.map((warning, i) => (
                    <div 
                      key={i} 
                      className={`text-sm px-3 py-2 rounded-xl ${
                        warning.startsWith('⚠️') 
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                          : 'bg-accent-500/10 text-accent-400 border border-accent-500/20'
                      }`}
                    >
                      {warning}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="px-5 pb-5 flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => setImportDialog(null)}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <div className="flex-1" />
              {importDialog.comparison.currentTransactionCount > 0 && (
                <button
                  onClick={() => handleConfirmImport(true)}
                  className="px-4 py-2.5 rounded-xl bg-accent-600 hover:bg-accent-700 text-white text-sm font-medium transition-colors"
                >
                  Merge
                </button>
              )}
              <button
                onClick={() => handleConfirmImport(false)}
                className={`px-4 py-2.5 rounded-xl text-white text-sm font-medium transition-colors ${
                  importDialog.comparison.isOlder
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-accent-600 hover:bg-accent-700'
                }`}
              >
                {importDialog.comparison.currentTransactionCount > 0 ? 'Replace' : 'Import'}
              </button>
            </div>
          </div>
          </div>
        </div>,
        document.body
      )}

      {/* Dropdown */}
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 text-gray-400 hover:text-white px-2 py-1.5 rounded-md hover:bg-gray-800/50 transition-colors"
          aria-label="Backup options"
          title={`${transactions.length} transactions${lastModified ? ` • ${formatShortDate(lastModified)}` : ''}`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          <span className="hidden sm:inline text-sm font-medium">Backup</span>
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute right-0 mt-2 w-64 bg-surface-elevated rounded-lg border border-gray-700 shadow-xl z-50 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-[#0f1c14] border-b border-gray-700 flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"></span>
              <span className="text-white font-medium">{detectDevice()}</span>
              <span className="text-gray-500">•</span>
              <span className="text-gray-400">{transactions.length} txns</span>
              {lastModified && (
                <>
                  <span className="text-gray-500">•</span>
                  <span className="text-gray-500">{formatShortDate(lastModified)}</span>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="p-2">
              <button
                onClick={handleExport}
                disabled={transactions.length === 0}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-700/50 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export Backup
              </button>
              
              <button
                onClick={handleImportClick}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-700/50 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Import Backup
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
