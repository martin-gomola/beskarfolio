import { api } from './api'
import { Transaction, TransactionFormData } from '../types'
import {
  createBrowserTransaction,
  deleteBrowserTransaction,
  readBrowserTransactions,
  updateBrowserTransaction,
  writeBrowserTransactions,
  type BrowserTransactionInput,
} from './browserPortfolioState'
import { getEffectiveCurrencyForTicker } from '../utils'

/**
 * Transaction Service
 * LocalStorage-only architecture: All data stored in browser's localStorage
 */
export const transactionService = {
  /**
   * Get all transactions from localStorage
   */
  getAll: async (): Promise<Transaction[]> => {
    return readBrowserTransactions()
  },

  /**
   * Get transactions for a specific ticker
   */
  getByTicker: async (ticker: string): Promise<Transaction[]> => {
    const all = await transactionService.getAll()
    return all.filter((t: Transaction) => t.ticker === ticker)
  },

  /**
   * Create a new transaction in localStorage
   */
  create: async (data: Partial<TransactionFormData>): Promise<Transaction> => {
    const type = data.type?.toLowerCase()
    if (type !== 'buy' && type !== 'sell' && type !== 'dividend') {
      throw new Error(`Invalid transaction type: "${data.type}". Must be 'buy', 'sell', or 'dividend'.`)
    }

    const ticker = data.ticker?.toUpperCase() || ''
    const currency = getEffectiveCurrencyForTicker(ticker, data.currency)

    const transactionData: any = {
      ticker,
      type: type as 'buy' | 'sell' | 'dividend',
      date: data.date || new Date().toISOString().split('T')[0],
      shares: type === 'dividend' ? 1 : parseFloat(data.shares || '0'),
      price: parseFloat(data.price || '0'),
      currency,
    }

    if (type === 'dividend') {
      if (data.gross_amount) transactionData.gross_amount = parseFloat(data.gross_amount)
      if (data.withholding_tax) transactionData.withholding_tax = parseFloat(data.withholding_tax)
    }

    return createBrowserTransaction(transactionData)
  },

  /**
   * Update an existing transaction in localStorage
   */
  update: async (id: number, data: Partial<TransactionFormData>): Promise<Transaction> => {
    const ticker = data.ticker?.toUpperCase()
    const currency = ticker
      ? getEffectiveCurrencyForTicker(ticker, data.currency)
      : data.currency

    const updates: Partial<Transaction> = {
      ticker,
      type: data.type as 'buy' | 'sell' | 'dividend',
      date: data.date,
      shares: data.type === 'dividend' ? 1 : (data.shares ? parseFloat(data.shares) : undefined),
      price: data.price ? parseFloat(data.price) : undefined,
      currency,
      gross_amount: data.gross_amount ? parseFloat(data.gross_amount) : undefined,
      withholding_tax: data.withholding_tax ? parseFloat(data.withholding_tax) : undefined,
    }

    const updated = updateBrowserTransaction(id, updates)
    if (updated) return updated
    throw new Error('Transaction not found')
  },

  /**
   * Delete a transaction from localStorage
   */
  delete: async (id: number): Promise<void> => {
    deleteBrowserTransaction(id)
  },

  /**
   * Export transactions to CSV from localStorage
   */
  export: async (): Promise<Blob> => {
    const transactions = readBrowserTransactions()
    const csv = [
      'date,ticker,shares,price,type,currency,gross_amount,withholding_tax',
      ...transactions.map(t =>
        `${t.date},${t.ticker},${t.shares},${t.price},${t.type},${t.currency},${t.gross_amount ?? ''},${t.withholding_tax ?? ''}`
      )
    ].join('\n')
    return new Blob([csv], { type: 'text/csv' })
  },

  /**
   * Import transactions from CSV
   * 
   * For standard CSV: Parse client-side and save to localStorage
   * For IBKR: Send to backend for parsing, then save to localStorage
   */
  importCSV: async (file: File, mode: 'append' | 'replace', endpoint: string): Promise<any> => {
    // For standard CSV import, parse client-side
    if (endpoint === '/api/transactions/import') {
      console.log('📄 Parsing standard CSV client-side')

      // Read CSV file
      const text = await file.text()
      const lines = text.split('\n')
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase())

      // Parse transactions
      const transactionInputs: BrowserTransactionInput[] = []
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue

        const values = line.split(',')
        const txn: any = {}
        headers.forEach((header, index) => {
          txn[header] = values[index]?.trim()
        })

        // Support both 'type' and 'transaction_type' column names
        // Normalize to lowercase for case-insensitive comparison
        const type = String(txn.type || txn.transaction_type || '').toLowerCase()

        if (type !== 'buy' && type !== 'sell' && type !== 'dividend') {
          console.warn(`⚠️ Skipping row ${i}: Invalid type "${type}". Must be 'buy', 'sell', or 'dividend'.`)
          continue
        }

        if (txn.date && txn.ticker && (txn.shares || type === 'dividend') && txn.price) {
          const transaction: BrowserTransactionInput = {
            date: txn.date,
            ticker: txn.ticker.toUpperCase(),
            type: type as 'buy' | 'sell' | 'dividend',
            shares: type === 'dividend' ? 1 : parseFloat(txn.shares),
            price: parseFloat(txn.price),
            currency: txn.currency || 'EUR',
            ...(type === 'dividend' && txn.gross_amount ? { gross_amount: parseFloat(txn.gross_amount) } : {}),
            ...(type === 'dividend' && txn.withholding_tax ? { withholding_tax: parseFloat(txn.withholding_tax) } : {}),
          }

          transactionInputs.push(transaction)
        }
      }

      const newTransactions = writeBrowserTransactions(transactionInputs, {
        mode,
        reason: 'import',
      })
      console.log(`✅ Standard CSV: Saved ${newTransactions.length} transactions to localStorage`)

      return {
        status: 'success',
        imported_count: newTransactions.length,
        message: `Imported ${newTransactions.length} transactions to localStorage`
      }
    } else {
      // For IBKR, send to backend for parsing, then save to localStorage
      console.log('📄 Using backend to parse IBKR format')

      const formData = new FormData()
      formData.append('file', file)
      const response = await api.post(endpoint, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        params: { mode }
      })

      // Backend parsed the transactions, now save them to localStorage
      const parsedTransactions = response.data.transactions || []

      console.log(`💾 Saving ${parsedTransactions.length} transactions to localStorage...`)
      let skippedCount = 0
      const transactionInputs: BrowserTransactionInput[] = []
      parsedTransactions.forEach((txn: any, index: number) => {
        const type = String(txn.type || '').toLowerCase()
        if (type !== 'buy' && type !== 'sell' && type !== 'dividend') {
          console.warn(`⚠️ Skipping transaction ${index}: Invalid type "${txn.type}". Must be 'buy', 'sell', or 'dividend'.`)
          skippedCount++
          return
        }

        const transaction: BrowserTransactionInput = {
          date: txn.date,
          ticker: txn.ticker.toUpperCase(),
          type: type as 'buy' | 'sell' | 'dividend',
          shares: type === 'dividend' ? 1 : parseFloat(txn.shares),
          price: parseFloat(txn.price),
          currency: txn.currency || 'EUR',
          ...(type === 'dividend' && txn.gross_amount ? { gross_amount: parseFloat(txn.gross_amount) } : {}),
          ...(type === 'dividend' && txn.withholding_tax ? { withholding_tax: parseFloat(txn.withholding_tax) } : {}),
        }
        transactionInputs.push(transaction)
      })

      const importedTransactions = writeBrowserTransactions(transactionInputs, {
        mode,
        reason: 'import',
      })
      if (skippedCount > 0) {
        console.warn(`⚠️ Skipped ${skippedCount} transactions with invalid type`)
      }

      const savedTransactions = readBrowserTransactions()
      console.log(`✅ Saved ${savedTransactions.length} transactions to localStorage`)

      return {
        ...response.data,
        imported_count: importedTransactions.length,
        message: `Imported ${importedTransactions.length} transactions to localStorage`
      }
    }
  }
}
