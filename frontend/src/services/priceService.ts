import { api } from './api'
import { PriceStatus } from '../types'

// Type for optimized /latest endpoint response
export type LatestPrices = Record<string, {
  price: number
  date: string
  currency: string
}>

export const priceService = {
  /**
   * Get all latest prices in one request (FASTEST)
   * 
   * Use this for initial load and price updates.
   * Minimal payload, no calculations - just price/date/currency.
   * 
   * @returns {ticker: {price, date, currency}}
   */
  getLatest: async (): Promise<LatestPrices> => {
    try {
      const response = await api.get<LatestPrices>('/api/prices/latest', {
        params: { _ts: Date.now() },
        headers: { 'Cache-Control': 'no-store' },
      })
      return response.data
    } catch (error) {
      console.error('Failed to fetch latest prices:', error)
      return {}
    }
  },

  /**
   * Get price status (with age_hours, freshness calculations)
   * Used by PortfolioSummary to show price freshness indicators.
   */
  getStatus: async (): Promise<PriceStatus | null> => {
    try {
      const response = await api.get('/api/prices/status', {
        params: { _ts: Date.now() },
        headers: { 'Cache-Control': 'no-store' },
      })
      return response.data
    } catch (error) {
      console.error('Failed to fetch price status:', error)
      return null
    }
  },

  /**
   * Get historical CSV status/coverage for portfolio tickers.
   * Always served by backend (guest mode returns disk-only CSV list).
   * 
   * @param tickers - List of tickers to check
   * @param refreshOnly - If true, only returns portfolio ticker status (faster)
   */
  getHistoricalStatus: async (tickers?: string[], refreshOnly?: boolean): Promise<any> => {
    const params = new URLSearchParams()
    
    if (tickers && tickers.length > 0) {
      params.append('tickers', tickers.join(','))
    }
    
    if (refreshOnly) {
      params.append('refresh_only', 'true')
    }
    
    const qs = params.toString() ? `?${params.toString()}` : ''
    const response = await api.get(`/api/prices/historical-status${qs}`)
    return response.data
  },

  /**
   * Get historical prices for a ticker within date range.
   * Use this for charts, TWR calculations, etc.
   * 
   * @param ticker - Stock ticker (e.g., AAPL)
   * @param fromDate - Start date (YYYY-MM-DD)
   * @param toDate - End date (YYYY-MM-DD), defaults to today
   * @returns Array of {date, close}
   */
  /**
   * Trigger a backend price update for the given tickers.
   * Used by auto-refresh and manual update flows.
   */
  updatePrices: async (tickers: string[]): Promise<any> => {
    try {
      const response = await api.post('/api/prices/update', { tickers, force: false })
      return response.data
    } catch (error) {
      console.error('Failed to update prices:', error)
      return null
    }
  },

  getRange: async (
    ticker: string, 
    fromDate: string, 
    toDate?: string
  ): Promise<Array<{ date: string; close: number }>> => {
    try {
      const params = new URLSearchParams({ from_date: fromDate })
      if (toDate) params.append('to_date', toDate)
      
      const response = await api.get(`/api/prices/${ticker}/range?${params}`)
      return response.data
    } catch (error) {
      console.error(`Failed to fetch price range for ${ticker}:`, error)
      return []
    }
  },

}
