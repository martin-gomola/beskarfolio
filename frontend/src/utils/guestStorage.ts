/**
 * LocalStorage utilities for guest mode
 * All guest data is stored client-side only
 *
 * Features:
 * - Data versioning for schema migrations
 * - Error boundaries for quota exceeded
 * - Backward compatibility
 */

import { Transaction } from '../types/transaction'
import { GUEST_STORAGE_KEY, GUEST_PRICES_KEY } from './constants'
import { clearAllCaches, updateTransactionsHash } from './guestCache'

// Storage version for migration support
const STORAGE_VERSION = 1

/**
 * Normalize date string to YYYY-MM-DD format
 * Handles: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
 */
export function normalizeDate(dateStr: string): string {
  if (!dateStr) return dateStr

  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr
  }

  // DD/MM/YYYY, DD-MM-YYYY, or DD.MM.YYYY format (common in EU)
  const euMatch = dateStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/)
  if (euMatch) {
    const [, day, month, year] = euMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // Fallback: try native Date parsing
  const parsed = new Date(dateStr)
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0]
  }

  return dateStr // Return as-is if unparseable
}

// Custom error classes
export class StorageQuotaExceededError extends Error {
  constructor(message: string = 'Storage quota exceeded. Please export your data and clear some transactions.') {
    super(message)
    this.name = 'StorageQuotaExceededError'
  }
}

export class StorageUnavailableError extends Error {
  constructor(message: string = 'Browser storage is unavailable. Please check your browser settings.') {
    super(message)
    this.name = 'StorageUnavailableError'
  }
}

/**
 * Check if localStorage is available
 */
function isStorageAvailable(): boolean {
  try {
    const test = '__storage_test__'
    localStorage.setItem(test, test)
    localStorage.removeItem(test)
    return true
  } catch {
    return false
  }
}

/**
 * Safely save to localStorage with error handling
 */
function safeSetItem(key: string, value: string): void {
  if (!isStorageAvailable()) {
    throw new StorageUnavailableError()
  }

  try {
    localStorage.setItem(key, value)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      throw new StorageQuotaExceededError()
    }
    throw err
  }
}

/**
 * Load transactions from localStorage
 * Handles versioning, migration, and date normalization
 */
export function loadGuestTransactions(): Transaction[] {
  try {
    const data = localStorage.getItem(GUEST_STORAGE_KEY)
    if (!data) return []

    const parsed = JSON.parse(data)
    let transactions: Transaction[]

    // Check if data has version (v1+ format)
    if (Array.isArray(parsed)) {
      // Legacy format (v0) - just an array of transactions
      transactions = parsed
    } else if (parsed.version === STORAGE_VERSION) {
      // Versioned format
      transactions = parsed.transactions || []
    } else {
      // Future: Migration logic for older versions
      console.warn(`Unknown storage version ${parsed.version}, attempting to use data as-is`)
      transactions = parsed.transactions || []
    }

    // Normalize dates to YYYY-MM-DD format (fixes legacy data)
    return transactions.map(t => ({
      ...t,
      date: normalizeDate(t.date)
    }))
  } catch (err) {
    console.error('Failed to load guest transactions:', err)
    return []
  }
}

/**
 * Save transactions to localStorage with versioning
 * Also invalidates caches when transactions change
 */
export function saveGuestTransactions(transactions: Transaction[]): void {
  try {
    const data = {
      version: STORAGE_VERSION,
      transactions,
      lastUpdated: new Date().toISOString()
    }
    safeSetItem(GUEST_STORAGE_KEY, JSON.stringify(data))
    
    // ✅ Invalidate caches when transactions change
    clearAllCaches()
    updateTransactionsHash(transactions)
  } catch (err) {
    if (err instanceof StorageQuotaExceededError || err instanceof StorageUnavailableError) {
      // Re-throw our custom errors so UI can handle them
      throw err
    }
    console.error('Failed to save guest transactions:', err)
    throw new Error('Failed to save transactions. Please try again.')
  }
}

/**
 * Add a new transaction
 * Normalizes date to YYYY-MM-DD format
 */
export function addGuestTransaction(transaction: Omit<Transaction, 'id' | 'created_at' | 'total_value'>): Transaction {
  const transactions = loadGuestTransactions()

  const totalValue = transaction.type === 'dividend'
    ? transaction.price
    : transaction.shares * transaction.price

  const newTransaction: Transaction = {
    ...transaction,
    date: normalizeDate(transaction.date),
    id: Date.now(),
    created_at: new Date().toISOString(),
    total_value: totalValue,
  }

  transactions.push(newTransaction)
  saveGuestTransactions(transactions)

  return newTransaction
}

/**
 * Delete a transaction by ID
 */
export function deleteGuestTransaction(id: number): boolean {
  const transactions = loadGuestTransactions()
  const filtered = transactions.filter(t => t.id !== id)

  if (filtered.length < transactions.length) {
    saveGuestTransactions(filtered)
    return true
  }
  return false
}

/**
 * Update a transaction
 */
export function updateGuestTransaction(id: number, updates: Partial<Transaction>): boolean {
  const transactions = loadGuestTransactions()
  const index = transactions.findIndex(t => t.id === id)

  if (index !== -1) {
    const merged = { ...transactions[index], ...updates }
    const totalValue = merged.type === 'dividend'
      ? (merged.price || 0)
      : (merged.shares || 0) * (merged.price || 0)

    transactions[index] = {
      ...merged,
      total_value: totalValue,
    }
    saveGuestTransactions(transactions)
    return true
  }
  return false
}

/**
 * Clear all guest transactions
 */
export function clearGuestTransactions(): void {
  localStorage.removeItem(GUEST_STORAGE_KEY)
  localStorage.removeItem(GUEST_PRICES_KEY)
}

export interface PriceData {
  price: number
  currency: string
  updated_at?: string  // ISO timestamp of when price was fetched
}

/**
 * Load current prices from localStorage with versioning support
 */
export function loadGuestPrices(): Record<string, PriceData> {
  try {
    const data = localStorage.getItem(GUEST_PRICES_KEY)
    if (!data) return {}

    const parsed = JSON.parse(data)

    // Legacy format (v0) - just a plain object
    if (!parsed.version) {
      return parsed
    }

    // Versioned format
    if (parsed.version === STORAGE_VERSION) {
      return parsed.prices || {}
    }

    // Unknown version - attempt to use as-is
    console.warn(`Unknown prices storage version ${parsed.version}`)
    return parsed.prices || {}
  } catch (err) {
    console.error('Failed to load guest prices:', err)
    return {}
  }
}

/**
 * Save current prices to localStorage with error handling
 */
export function saveGuestPrices(prices: Record<string, PriceData>): void {
  try {
    const data = {
      version: STORAGE_VERSION,
      prices,
      lastUpdated: new Date().toISOString()
    }
    safeSetItem(GUEST_PRICES_KEY, JSON.stringify(data))
  } catch (err) {
    if (err instanceof StorageQuotaExceededError || err instanceof StorageUnavailableError) {
      throw err
    }
    console.error('Failed to save guest prices:', err)
    throw new Error('Failed to save prices. Please try again.')
  }
}

/**
 * Update a single ticker price
 */
export function updateGuestPrice(ticker: string, price: number, currency: string): void {
  const prices = loadGuestPrices()
  prices[ticker] = { price, currency }
  saveGuestPrices(prices)
}
