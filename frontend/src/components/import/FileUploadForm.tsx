import React, { useState } from 'react'
import { transactionService } from '../../services'
import { ImportType, ImportMode } from '../../types'

interface FileUploadFormProps {
  importType: ImportType
  mode: ImportMode
  onImportComplete: () => void
}

/**
 * File Upload Form
 * Drag-and-drop file upload for CSV and IBKR imports
 */
export const FileUploadForm: React.FC<FileUploadFormProps> = ({ importType, mode, onImportComplete }) => {
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [selectedFile, setSelectedFile] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  const processFile = async (file: File) => {
    if (!file) return

    // Validate file type based on import type
    if (importType === 'ibkr') {
      // IBKR accepts .txt, .csv, or .tsv
      if (!file.name.match(/\.(txt|csv|tsv)$/i)) {
        setError('Please upload a .txt, .csv, or .tsv file for IBKR import')
        return
      }
    } else {
      // Standard CSV only accepts .csv
      if (!file.name.endsWith('.csv')) {
        setError('Please upload a CSV file')
        return
      }
    }

    setSelectedFile(file.name)
    setIsImporting(true)
    setError('')
    setSuccess('')

    try {
      const endpoint = importType === 'standard'
        ? '/api/transactions/import'
        : '/api/import/ibkr'

      // Use transactionService which handles guest mode localStorage
      const data = await transactionService.importCSV(file, mode, endpoint)

      const imported = data.imported_count || 0
      const skipped = data.skipped_count || 0
      const deleted = data.deleted_count || 0
      const responseMode = data.mode || 'append'
      const stats = data.stats || {}

      // Build success message
      let message = ''
      if (responseMode === 'replace' && deleted > 0) {
        const source = importType === 'ibkr' ? ' from IBKR' : ''
        message = `Replaced ${deleted} existing transactions with ${imported} new transactions${source}`
      } else {
        const source = importType === 'ibkr' ? ' from IBKR' : ''
        message = `Imported ${imported} transaction(s)${source}`

        if (skipped > 0) {
          message += ` (${skipped} duplicate(s) skipped)`
        }
      }

      if (importType === 'ibkr') {
        if (stats.skipped_currency > 0) {
          message += `. ${stats.skipped_currency} currency conversion(s) excluded`
        }
        if (stats.mapped_symbols > 0) {
          message += `. ${stats.mapped_symbols} symbol(s) auto-mapped to correct tickers`
        }
      }

      setSuccess(message)

      // Refresh data after successful import
      await onImportComplete()

      // Clear success message after 5 seconds
      setTimeout(() => {
        setSuccess('')
        setSelectedFile('')
      }, 5000)
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to import transactions'
      setError(errorMessage)
      console.error('Import error:', err)
    } finally {
      setIsImporting(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      await processFile(file)
      e.target.value = '' // Reset file input
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      await processFile(files[0])
    }
  }

  return (
    <div className="space-y-4">

      {/* Status Messages */}
      {selectedFile && !success && !error && (
        <div className="bg-accent-500/10 border border-accent-500/20 text-accent-400 px-4 py-3 rounded-xl text-sm">
          📄 Selected: {selectedFile}
        </div>
      )}

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-xl text-sm">
          {success}
        </div>
      )}

      {/* Drag & Drop Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
          isDragging
            ? 'border-accent-500 bg-accent-500/10 scale-[1.02]'
            : 'border-white/10 hover:border-white/20'
        }`}
      >
        <input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          disabled={isImporting}
          className="hidden"
          id="csv-upload"
        />

        {isDragging ? (
          <div className="pointer-events-none">
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-accent-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-accent-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <p className="text-lg font-medium text-white mb-2">Drop your CSV file here</p>
            <p className="text-sm text-gray-500">Release to upload</p>
          </div>
        ) : (
          <div>
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-white/5 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
              </svg>
            </div>
            <label
              htmlFor="csv-upload"
              className={`cursor-pointer inline-flex items-center px-6 py-3 text-sm font-medium rounded-xl text-white transition-colors ${
                isImporting
                  ? 'bg-white/10'
                  : 'bg-accent-600 hover:bg-accent-700'
              }`}
            >
              {isImporting ? 'Importing...' : 'Choose CSV File'}
            </label>
            <p className="text-sm text-gray-500 mt-4">or drag and drop your CSV file here</p>
          </div>
        )}
      </div>
    </div>
  )
}
