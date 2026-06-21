import { api } from './api'
import { Holding, PortfolioSummary, TaxFreeHolding, Transaction } from '../types'
import { loadGuestTransactions } from '../utils/guestStorage'
import {
  cacheSummary,
  clearAllCaches,
  getCachedSummary,
  haveTransactionsChanged,
  updateTransactionsHash,
} from '../utils/guestCache'

export type BrowserPortfolioSource = 'empty' | 'cache' | 'backend' | 'expired-cache'

export interface BrowserPortfolioReadOptions {
  forceRefresh?: boolean
  allowExpiredFallback?: boolean
}

export interface BrowserPortfolioSnapshot {
  summary: PortfolioSummary
  holdings: Holding[]
  transactions: Transaction[]
  source: BrowserPortfolioSource
}

const emptySummary = (): PortfolioSummary => ({
  success: true,
  transaction_count: 0,
  total_value: 0,
  total_invested: 0,
  total_gain_loss: 0,
  total_gain_loss_pct: 0,
  holdings_count: 0,
})

const emptySnapshot = (): BrowserPortfolioSnapshot => ({
  summary: emptySummary(),
  holdings: [],
  transactions: [],
  source: 'empty',
})

const fromCache = (
  transactions: Transaction[],
  source: Extract<BrowserPortfolioSource, 'cache' | 'expired-cache'>,
): BrowserPortfolioSnapshot | null => {
  const cachedData = getCachedSummary({ allowExpired: source === 'expired-cache' })
  if (!cachedData) return null

  return {
    summary: cachedData.summary,
    holdings: cachedData.holdings || [],
    transactions,
    source,
  }
}

/**
 * Read this browser's portfolio state.
 *
 * This module owns the seam between browser localStorage, the portfolio cache,
 * and the stateless backend calculation endpoint. Callers should not need to
 * know cache invalidation or offline fallback rules.
 */
export async function readBrowserPortfolio(
  options: BrowserPortfolioReadOptions = {},
): Promise<BrowserPortfolioSnapshot> {
  const { forceRefresh = false, allowExpiredFallback = true } = options
  const transactions = loadGuestTransactions()

  if (transactions.length === 0) {
    return emptySnapshot()
  }

  if (forceRefresh) {
    if (import.meta.env.DEV) console.log('Force refresh requested, clearing all caches')
    clearAllCaches()
  } else {
    const cachedSnapshot = fromCache(transactions, 'cache')
    if (cachedSnapshot && !haveTransactionsChanged(transactions)) {
      return cachedSnapshot
    }

    if (cachedSnapshot) {
      if (import.meta.env.DEV) console.log('Transactions changed, clearing caches')
      clearAllCaches()
    }
  }

  try {
    if (import.meta.env.DEV) console.log('Sending browser transactions to backend for portfolio calculation')
    const response = await api.post('/api/portfolio/calculate', transactions)
    const snapshot: BrowserPortfolioSnapshot = {
      summary: response.data.summary,
      holdings: response.data.holdings || [],
      transactions,
      source: 'backend',
    }

    cacheSummary({
      summary: snapshot.summary,
      holdings: snapshot.holdings,
    })
    updateTransactionsHash(transactions)

    if (import.meta.env.DEV) console.log('Portfolio calculated and cached')
    return snapshot
  } catch (error) {
    if (allowExpiredFallback) {
      const expiredSnapshot = fromCache(transactions, 'expired-cache')
      if (expiredSnapshot) {
        console.warn('Using cached portfolio data because the backend is unavailable.', error)
        return expiredSnapshot
      }
    }

    throw error
  }
}

export function readBrowserTransactions(): Transaction[] {
  return loadGuestTransactions()
}

export async function readBrowserTaxFreeHoldings(): Promise<TaxFreeHolding[]> {
  const transactions = readBrowserTransactions()
  if (transactions.length === 0) return []

  const response = await api.post('/api/tax-free', { transactions })
  return response.data.tax_free_holdings || []
}
