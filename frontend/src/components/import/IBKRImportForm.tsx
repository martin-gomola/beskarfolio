import React, { useState } from 'react'
import { transactionService } from '../../services'
import { ImportMode, PasteValidation } from '../../types'
import { validateIBKRPaste } from '../../utils/validators'

interface IBKRImportFormProps {
  mode: ImportMode
  onImportComplete: () => void
}

/**
 * IBKR Import Form
 * Paste-based interface for importing from IBKR AI Chat
 */
export const IBKRImportForm: React.FC<IBKRImportFormProps> = ({ mode, onImportComplete }) => {
  const [ibkrBuyText, setIbkrBuyText] = useState('')
  const [ibkrSellText, setIbkrSellText] = useState('')
  const [pasteValidation, setPasteValidation] = useState<PasteValidation>({ buy: null, sell: null })
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleBuyTextChange = (text: string) => {
    setIbkrBuyText(text)
    const validation = validateIBKRPaste(text)
    setPasteValidation(prev => ({ ...prev, buy: validation.message }))
  }

  const handleSellTextChange = (text: string) => {
    setIbkrSellText(text)
    const validation = validateIBKRPaste(text)
    setPasteValidation(prev => ({ ...prev, sell: validation.message }))
  }

  const processIbkrText = async () => {
    if (!ibkrBuyText.trim() && !ibkrSellText.trim()) {
      setError('Please paste at least buy or sell transactions')
      return
    }

    setIsImporting(true)
    setError('')
    setSuccess('')

    try {
      // Combine buy and sell text
      const combinedText = [ibkrBuyText, ibkrSellText].filter(t => t.trim()).join('\n\n')

      // Create a blob and file from the text
      const blob = new Blob([combinedText], { type: 'text/plain' })
      const file = new File([blob], 'ibkr_transactions.txt', { type: 'text/plain' })

      // Use transactionService which handles guest mode localStorage
      const data = await transactionService.importCSV(file, mode, '/api/import/ibkr')

      const imported = data.imported_count || 0
      const skipped = data.skipped_count || 0
      const deleted = data.deleted_count || 0
      const responseMode = data.mode || 'append'
      const stats = data.stats || {}

      // Build success message
      let message = ''
      if (responseMode === 'replace' && deleted > 0) {
        message = `Replaced ${deleted} existing transactions with ${imported} new transactions from IBKR`
      } else {
        message = `Imported ${imported} transaction(s) from IBKR`
        if (skipped > 0) {
          message += ` (${skipped} duplicate(s) skipped)`
        }
      }

      if (stats.skipped_currency > 0) {
        message += `. ${stats.skipped_currency} currency conversion(s) excluded`
      }

      setSuccess(message)

      // Clear text areas after successful import
      setIbkrBuyText('')
      setIbkrSellText('')
      setPasteValidation({ buy: null, sell: null })

      // Refresh data after successful import
      await onImportComplete()

      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(''), 5000)
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to import transactions'
      setError(errorMessage)
      console.error('Import error:', err)
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* <p className="text-gray-400 text-sm mb-4">
        📋 Copy tables directly from IBKR AI Chat and paste below:
      </p> */}

      {/* Status Messages */}
      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-400 px-4 py-3 rounded-lg text-sm">
          ❌ {error}
        </div>
      )}

      {success && (
        <div className="bg-green-900/20 border border-green-800 text-green-400 px-4 py-3 rounded-lg text-sm">
          ✅ {success}
        </div>
      )}

      {/* Buy and Sell Transactions - Side by Side on Desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Buy Transactions Text Area */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            1️⃣ Buy Transactions
          </label>
          <textarea
            value={ibkrBuyText}
            onChange={(e) => handleBuyTextChange(e.target.value)}
            placeholder="Ask: Show me all buy trades in the portfolio &#10;&#10;  Paste buy transactions table from IBKR here...&#10;&#10;Should include columns: Date, Transaction type, Security name, Symbol, Net quantity, Average price, Total amount"
            className="w-full h-32 px-4 py-3 bg-surface border-2 border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:border-orange-600 focus:ring-1 focus:ring-orange-600 focus:outline-none font-mono text-xs resize-y"
            disabled={isImporting}
          />
          {pasteValidation.buy && (
            <div className={`text-xs px-3 py-2 rounded ${
              pasteValidation.buy.startsWith('✅')
                ? 'bg-green-900/20 border border-green-800 text-green-400'
                : 'bg-yellow-900/20 border border-yellow-800 text-yellow-400'
            }`}>
              {pasteValidation.buy}
            </div>
          )}
        </div>

        {/* Sell Transactions Text Area */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            2️⃣ Sell Transactions
          </label>
          <textarea
            value={ibkrSellText}
            onChange={(e) => handleSellTextChange(e.target.value)}
            placeholder="Ask: Show me all sell trades in the portfolio &#10;&#10;  Paste sell transactions table from IBKR here...&#10;&#10;Should include columns: Date, Transaction type, Security name, Symbol, Net quantity, Average price, Total amount"
            className="w-full h-32 px-4 py-3 bg-surface border-2 border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:border-orange-600 focus:ring-1 focus:ring-orange-600 focus:outline-none font-mono text-xs resize-y"
            disabled={isImporting}
          />
          {pasteValidation.sell && (
            <div className={`text-xs px-3 py-2 rounded ${
              pasteValidation.sell.startsWith('✅')
                ? 'bg-green-900/20 border border-green-800 text-green-400'
                : 'bg-yellow-900/20 border border-yellow-800 text-yellow-400'
            }`}>
              {pasteValidation.sell}
            </div>
          )}
        </div>
      </div>

      {/* Import Button */}
      <button
        onClick={processIbkrText}
        disabled={isImporting || (!ibkrBuyText.trim() && !ibkrSellText.trim())}
        className={`w-full px-6 py-4 border border-transparent text-sm font-medium rounded-lg text-white transition-colors ${
          isImporting || (!ibkrBuyText.trim() && !ibkrSellText.trim())
            ? 'bg-gray-600 cursor-not-allowed'
            : 'bg-orange-600 hover:bg-orange-700'
        }`}
      >
        {isImporting ? 'Importing...' : 'Import IBKR Transactions'}
      </button>
    </div>
  )
}
