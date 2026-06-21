import { TaxFreeHolding } from '../types'
import { readBrowserTaxFreeHoldings } from './browserPortfolioState'

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
      return await readBrowserTaxFreeHoldings()
    } catch (error) {
      console.error('Failed to fetch tax-free data:', error)
      return []
    }
  }
}
