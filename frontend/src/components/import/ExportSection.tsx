import React, { useState, useEffect, useRef } from 'react'
import { readBrowserTransactions } from '../../services/browserPortfolioState'
import { 
  exportBackup, 
  createBackup,
  parseBackup, 
  compareBackup, 
  importBackup, 
  formatBackupDate,
  getBackupSummary,
  detectDevice,
  type BackupData,
  type ImportComparison 
} from '../../utils/backupService'
import { GUEST_STORAGE_KEY } from '../../utils/constants'
import { APP_VERSION } from '../../utils/version'

interface ExportSectionProps {
  onImportComplete?: () => void
}

/**
 * Export/Import Section Component
 * JSON backup with device info, timestamps, and version checking
 */
export const ExportSection: React.FC<ExportSectionProps> = ({ onImportComplete }) => {
  const [transactions, setTransactions] = useState<any[]>([])
  const [importDialog, setImportDialog] = useState<{
    backup: BackupData
    comparison: ImportComparison
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load transactions from localStorage
  useEffect(() => {
    const txns = readBrowserTransactions()
    setTransactions(txns)
  }, [])

  const handleExportBackup = () => {
    exportBackup(APP_VERSION)
  }

  const handleExportCSV = () => {
    if (!transactions || transactions.length === 0) {
      alert('No transactions to export')
      return
    }

    const backupRows = transactions.map(txn => ({
      date: txn.date,
      ticker: txn.ticker,
      type: txn.type,
      shares: txn.shares,
      price: txn.price,
      currency: txn.currency
    }))

    const headers = Object.keys(backupRows[0])
    const rows = backupRows.map(row =>
      headers.map(header => {
        const value = (row as any)[header]
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value}"`
        }
        return value
      }).join(',')
    )
    const csv = [headers.join(','), ...rows].join('\n')
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `beskarfolio_transactions_${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
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
        alert('❌ Invalid backup file format. Use JSON backup from BeskarFolio.')
        return
      }
      
      const comparison = compareBackup(backup)
      setImportDialog({ backup, comparison })
    } catch (err) {
      alert('❌ Failed to read file')
    }
    
    e.target.value = ''
  }

  const handleConfirmImport = (mergeTransactions: boolean = false) => {
    if (!importDialog) return
    
    const result = importBackup(importDialog.backup, {
      importTransactions: true,
      importAllocations: true,
      importSettings: true,
      mergeTransactions
    })
    
    if (result.success) {
      setImportDialog(null)
      alert(`✅ Imported: ${result.imported.join(', ')}`)
      onImportComplete?.()
      window.location.reload()
    } else {
      alert('❌ Import failed')
    }
  }

  const hasTransactions = transactions && transactions.length > 0
  const backupInfo = createBackup(APP_VERSION)
  
  // Get last modified date from localStorage
  const lastModified = React.useMemo(() => {
    try {
      const stored = localStorage.getItem(GUEST_STORAGE_KEY)
      if (!stored) return null
      const parsed = JSON.parse(stored)
      return parsed.lastUpdated || null
    } catch {
      return null
    }
  }, [transactions])

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
      
      {/* Import Confirmation Dialog */}
      {importDialog && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade"
          onClick={(e) => e.target === e.currentTarget && setImportDialog(null)}
        >
          <div className="bg-surface-dark w-full sm:max-w-md rounded-2xl border border-white/10 mx-4 sm:mx-0 overflow-hidden animate-slide-up">
            <div className="px-5 pt-5 pb-3">
              <h3 className="text-lg font-semibold text-white tracking-tight font-heading">Import Backup</h3>
            </div>
            
            <div className="px-5 pb-4 space-y-4">
              {/* Backup Info */}
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
                  <span className="text-gray-500">data:</span>
                  <span className="text-gray-300">{getBackupSummary(importDialog.backup)}</span>
                </div>
              </div>
              
              {/* Warnings */}
              {importDialog.comparison.warnings.length > 0 && (
                <div className="space-y-2">
                  {importDialog.comparison.warnings.map((warning, i) => (
                    <div 
                      key={i} 
                      className={`text-sm px-3 py-2 rounded-lg ${
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
              
              {/* Comparison */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-white/5 rounded-xl p-3">
                  <div className="text-gray-500 text-xs mb-1">Current</div>
                  <div className="text-white font-mono">
                    {importDialog.comparison.currentTransactionCount} txns
                  </div>
                </div>
                <div className="bg-white/5 rounded-xl p-3">
                  <div className="text-gray-500 text-xs mb-1">Backup</div>
                  <div className="text-cyan-400 font-mono">
                    {importDialog.comparison.backupTransactionCount} txns
                  </div>
                </div>
              </div>
            </div>
            
            {/* Actions */}
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
      )}

      <div className="glass rounded-xl p-4 sm:p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 bg-accent-500/20 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-accent-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white tracking-tight">Backup & Restore</h2>
            <p className="text-sm text-gray-500">
              Sync between devices or create backups
            </p>
          </div>
        </div>

        {/* Current data info */}
        <div className="bg-white/5 rounded-xl p-3 mb-4 font-mono text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">device:</span>
            <span className="text-cyan-400">{detectDevice()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">transactions:</span>
            <span className="text-gray-300">{transactions.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">allocations:</span>
            <span className="text-gray-300">{backupInfo.targetAllocations ? 'yes' : 'no'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">modified:</span>
            <span className="text-gray-300">
              {lastModified ? formatBackupDate(lastModified) : 'never'}
            </span>
          </div>
        </div>

        {/* Export buttons */}
        <div className="space-y-2 mb-4">
          <button
            onClick={handleExportBackup}
            disabled={!hasTransactions}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent-600 hover:bg-accent-700 disabled:bg-white/5 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export Backup (JSON)
          </button>
          
          <button
            onClick={handleExportCSV}
            disabled={!hasTransactions}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 disabled:bg-white/[0.02] disabled:text-gray-600 disabled:cursor-not-allowed text-gray-300 text-sm rounded-xl transition-colors border border-white/5"
          >
            Export Transactions (CSV)
          </button>
        </div>

        {/* Import button */}
        <button
          onClick={handleImportClick}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-xl transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Import Backup (JSON)
        </button>

        <p className="mt-3 text-xs text-gray-500">
          Backup includes: transactions, allocations, settings, device info
        </p>
      </div>
    </>
  )
}
