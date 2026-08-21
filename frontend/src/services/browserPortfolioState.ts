import { api } from './api'
import { Holding, PortfolioSummary, TaxFreeHolding, Transaction } from '../types'
import {
  loadGuestTransactions,
  normalizeDate,
  saveGuestTransactions,
} from '../utils/guestStorage'
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

export type BrowserPortfolioChangeReason =
  | 'create'
  | 'update'
  | 'delete'
  | 'replace'
  | 'import'
  | 'demo'
  | 'restore'

export interface BrowserPortfolioChange {
  kind: 'transactions-changed'
  reason: BrowserPortfolioChangeReason
  transactions: Transaction[]
}

export type BrowserTransactionInput = Omit<
  Transaction,
  'id' | 'created_at' | 'total_value'
>

export interface BrowserTransactionWriteOptions {
  mode: 'append' | 'replace'
  reason: Extract<BrowserPortfolioChangeReason, 'import' | 'demo'>
}

type BrowserPortfolioListener = (change: BrowserPortfolioChange) => void

const portfolioListeners = new Set<BrowserPortfolioListener>()

const notifyTransactionsChanged = (
  transactions: Transaction[],
  reason: BrowserPortfolioChangeReason,
): void => {
  const change: BrowserPortfolioChange = {
    kind: 'transactions-changed',
    reason,
    transactions,
  }

  portfolioListeners.forEach(listener => {
    try {
      listener(change)
    } catch (error) {
      console.error('Browser portfolio state listener failed', error)
    }
  })
  window.dispatchEvent(new Event('guestTransactionsUpdated'))
}

const persistBrowserTransactions = (
  transactions: Transaction[],
  reason: BrowserPortfolioChangeReason,
): Transaction[] => {
  saveGuestTransactions(transactions)
  notifyTransactionsChanged(transactions, reason)
  return transactions
}

const createStoredTransaction = (
  transaction: BrowserTransactionInput,
  id: number,
  createdAt: string,
): Transaction => ({
  ...transaction,
  date: normalizeDate(transaction.date),
  id,
  created_at: createdAt,
  total_value: transaction.type === 'dividend'
    ? transaction.price
    : transaction.shares * transaction.price,
})

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

export function subscribeBrowserPortfolioState(
  listener: BrowserPortfolioListener,
): () => void {
  portfolioListeners.add(listener)
  return () => portfolioListeners.delete(listener)
}

export function replaceBrowserTransactions(
  transactions: Transaction[],
  reason: BrowserPortfolioChangeReason = 'replace',
): Transaction[] {
  return persistBrowserTransactions(transactions, reason)
}

export function writeBrowserTransactions(
  transactions: BrowserTransactionInput[],
  options: BrowserTransactionWriteOptions,
): Transaction[] {
  const { mode, reason } = options
  if (mode === 'append' && transactions.length === 0) return []

  const existing = mode === 'append' ? readBrowserTransactions() : []
  const baseId = Date.now()
  const createdAt = new Date().toISOString()
  const imported = transactions.map((transaction, index) =>
    createStoredTransaction(transaction, baseId + index, createdAt)
  )

  persistBrowserTransactions([...existing, ...imported], reason)
  return imported
}

export function createBrowserTransaction(
  transaction: BrowserTransactionInput,
): Transaction {
  const created = createStoredTransaction(
    transaction,
    Date.now(),
    new Date().toISOString(),
  )
  persistBrowserTransactions([...readBrowserTransactions(), created], 'create')
  return created
}

export function updateBrowserTransaction(
  id: number,
  updates: Partial<Transaction>,
): Transaction | null {
  const transactions = readBrowserTransactions()
  const index = transactions.findIndex(transaction => transaction.id === id)
  if (index === -1) return null

  const merged = { ...transactions[index], ...updates }
  transactions[index] = {
    ...merged,
    date: normalizeDate(merged.date),
    total_value: merged.type === 'dividend'
      ? merged.price
      : merged.shares * merged.price,
  }
  persistBrowserTransactions(transactions, 'update')
  return transactions[index]
}

export function deleteBrowserTransaction(id: number): boolean {
  const transactions = readBrowserTransactions()
  const remaining = transactions.filter(transaction => transaction.id !== id)
  if (remaining.length === transactions.length) return false

  persistBrowserTransactions(remaining, 'delete')
  return true
}

export async function readBrowserTaxFreeHoldings(): Promise<TaxFreeHolding[]> {
  const transactions = readBrowserTransactions()
  if (transactions.length === 0) return []

  const response = await api.post('/api/tax-free', { transactions })
  return response.data.tax_free_holdings || []
}
