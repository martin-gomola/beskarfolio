import React, { useState } from 'react'
import { transactionService } from '../../services'

/**
 * Export transactions to CSV file
 */
export const ExportButton: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    setIsExporting(true)

    try {
      const blob = await transactionService.export()

      // Create a download link
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url

      // Generate filename
      const filename = `beskarfolio_transactions_${new Date().toISOString().split('T')[0]}.csv`

      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error('Failed to export transactions:', err)
      alert(err.response?.status === 404 ? 'No transactions to export' : 'Failed to export transactions')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className="bg-accent-600 text-white px-4 py-2 rounded-lg hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-500 disabled:opacity-50 transition-colors font-medium text-sm flex items-center gap-2"
    >
      <svg className={`w-4 h-4 ${isExporting ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      {isExporting ? 'Exporting...' : 'Export CSV'}
    </button>
  )
}
