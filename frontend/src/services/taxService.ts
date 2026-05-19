import { api } from './api'
import { TaxFreeHolding } from '../types'
import { loadGuestTransactions } from '../utils/guestStorage'

/**
 * Tax Service
 * LocalStorage-only architecture: Sends transactions to backend for tax calculations
 */
export const taxService = {
  /**
   * Get tax-free holdings
   * Sends transactions to backend for FIFO calculation (Slovak 365-day rule)
   */
  getTaxFreeHoldings: async (): Promise<TaxFreeHolding[]> => {
    try {
      const transactions = loadGuestTransactions()

      if (transactions.length === 0) {
        return []
      }

      const response = await api.post('/api/tax-free', { transactions })
      return response.data.tax_free_holdings || []
    } catch (error) {
      console.error('Failed to fetch tax-free data:', error)
      return []
    }
  }
}
