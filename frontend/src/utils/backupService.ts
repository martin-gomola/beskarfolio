/**
 * Backup Service - Export/Import portfolio data
 * 
 * Features:
 * - Versioned backup format (v3)
 * - Device/platform detection
 * - Data comparison on import
 * - Warning for older backups
 */

import { Transaction } from '../types/transaction'
import { loadGuestTransactions, saveGuestTransactions, loadGuestPrices, saveGuestPrices, normalizeDate, type PriceData } from './guestStorage'
import { GUEST_STORAGE_KEY } from './constants'

// Current backup format version
export const BACKUP_VERSION = 3

// Storage keys for export
const ALLOCATION_KEY = 'beskarfolio_guest_target_allocation'
const HOLDINGS_COLUMNS_KEY = 'beskarfolio_holdings_visible_columns'
const ALLOCATION_COLUMNS_KEY = 'beskarfolio_allocation_visible_columns'
const TICKER_INFO_CACHE_KEY = 'beskarfolio_ticker_info_cache'

// ============================================================================
// Types
// ============================================================================

export interface BackupMetadata {
  version: number
  updatedAt: string  // ISO timestamp
  device: string     // Device name/type
  appVersion?: string
  transactionCount: number
  totalValue?: number
}

export interface BackupData {
  // Metadata
  version: number
  updatedAt: string
  device: string
  appVersion?: string
  
  // User data
  transactions: Transaction[]
  targetAllocations: Record<string, number> | null
  prices: Record<string, PriceData> | null
  tickerProfiles: Record<string, BackupTickerProfile> | null
  
  // Settings
  settings?: {
    holdingsVisibleColumns?: BackupHoldingsVisibleColumns
    allocationVisibleColumns?: BackupAllocationVisibleColumns
  }
}

export interface BackupTickerProfile {
  ticker?: string
  name?: string
  sector?: string
  industry?: string
  country?: string
  region?: string
  isETF?: boolean
  exchange?: string
  currency?: string
  source?: 'finnhub' | 'fallback'
  type?: 'stock' | 'etf' | 'unknown'
}

export interface BackupHoldingsVisibleColumns {
  shares?: boolean
  avgPrice?: boolean
  invested?: boolean
  currentPrice?: boolean
  value?: boolean
  return?: boolean
}

export interface BackupAllocationVisibleColumns {
  shares?: boolean
  valueEur?: boolean
  driftEur?: boolean
  sharesToTrade?: boolean
  action?: boolean
}

export interface ImportComparison {
  isOlder: boolean
  isNewer: boolean
  isSameDevice: boolean
  backupDate: Date
  currentDate: Date | null
  backupTransactionCount: number
  currentTransactionCount: number
  backupDevice: string
  warnings: string[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isPriceData(value: unknown): value is PriceData {
  return (
    isObject(value) &&
    isNumber(value.price) &&
    isString(value.currency) &&
    (value.updated_at === undefined || isString(value.updated_at))
  )
}

function isPriceMap(value: unknown): value is Record<string, PriceData> {
  return isObject(value) && Object.values(value).every(isPriceData)
}

function isTickerProfile(value: unknown): value is BackupTickerProfile {
  return (
    isObject(value) &&
    (value.ticker === undefined || isString(value.ticker)) &&
    (value.name === undefined || isString(value.name)) &&
    (value.sector === undefined || isString(value.sector)) &&
    (value.industry === undefined || isString(value.industry)) &&
    (value.country === undefined || isString(value.country)) &&
    (value.region === undefined || isString(value.region)) &&
    (value.isETF === undefined || isBoolean(value.isETF)) &&
    (value.exchange === undefined || isString(value.exchange)) &&
    (value.currency === undefined || isString(value.currency)) &&
    (value.source === undefined || value.source === 'finnhub' || value.source === 'fallback') &&
    (value.type === undefined || value.type === 'stock' || value.type === 'etf' || value.type === 'unknown')
  )
}

function isTickerProfileMap(value: unknown): value is Record<string, BackupTickerProfile> {
  return isObject(value) && Object.values(value).every(isTickerProfile)
}

function isHoldingsVisibleColumns(value: unknown): value is BackupHoldingsVisibleColumns {
  return (
    isObject(value) &&
    (value.shares === undefined || isBoolean(value.shares)) &&
    (value.avgPrice === undefined || isBoolean(value.avgPrice)) &&
    (value.invested === undefined || isBoolean(value.invested)) &&
    (value.currentPrice === undefined || isBoolean(value.currentPrice)) &&
    (value.value === undefined || isBoolean(value.value)) &&
    (value.return === undefined || isBoolean(value.return))
  )
}

function isAllocationVisibleColumns(value: unknown): value is BackupAllocationVisibleColumns {
  return (
    isObject(value) &&
    (value.shares === undefined || isBoolean(value.shares)) &&
    (value.valueEur === undefined || isBoolean(value.valueEur)) &&
    (value.driftEur === undefined || isBoolean(value.driftEur)) &&
    (value.sharesToTrade === undefined || isBoolean(value.sharesToTrade)) &&
    (value.action === undefined || isBoolean(value.action))
  )
}

function isTransaction(value: unknown): value is Transaction {
  return (
    isObject(value) &&
    isNumber(value.id) &&
    isString(value.ticker) &&
    (value.type === 'buy' || value.type === 'sell') &&
    isString(value.date) &&
    isNumber(value.shares) &&
    isNumber(value.price) &&
    isString(value.currency) &&
    isString(value.created_at) &&
    isNumber(value.total_value)
  )
}

function sanitizeBackupData(data: unknown): BackupData | null {
  if (!isObject(data)) {
    console.error('Invalid backup: root payload must be an object')
    return null
  }

  if (!isNumber(data.version) || !Array.isArray(data.transactions)) {
    console.error('Invalid backup: missing required fields')
    return null
  }

  const sanitizedTransactions = data.transactions.filter(isTransaction)
  if (sanitizedTransactions.length !== data.transactions.length) {
    console.warn(`Skipped ${data.transactions.length - sanitizedTransactions.length} malformed transaction(s) from backup`)
  }

  let targetAllocations: Record<string, number> | null = null
  if (data.targetAllocations !== undefined && data.targetAllocations !== null) {
    if (isObject(data.targetAllocations) && Object.values(data.targetAllocations).every(isNumber)) {
      targetAllocations = data.targetAllocations as Record<string, number>
    } else {
      console.warn('Skipping malformed target allocations section in backup')
    }
  }

  let prices: Record<string, PriceData> | null = null
  if (data.prices !== undefined && data.prices !== null) {
    if (isPriceMap(data.prices)) {
      prices = data.prices
    } else {
      console.warn('Skipping malformed prices section in backup')
    }
  }

  let tickerProfiles: Record<string, BackupTickerProfile> | null = null
  if (data.tickerProfiles !== undefined && data.tickerProfiles !== null) {
    if (isTickerProfileMap(data.tickerProfiles)) {
      tickerProfiles = data.tickerProfiles
    } else {
      console.warn('Skipping malformed ticker profiles section in backup')
    }
  }

  let settings: BackupData['settings'] | undefined
  if (data.settings !== undefined && data.settings !== null) {
    if (isObject(data.settings)) {
      const nextSettings: BackupData['settings'] = {}

      if (data.settings.holdingsVisibleColumns !== undefined) {
        if (isHoldingsVisibleColumns(data.settings.holdingsVisibleColumns)) {
          nextSettings.holdingsVisibleColumns = data.settings.holdingsVisibleColumns
        } else {
          console.warn('Skipping malformed holdingsVisibleColumns section in backup')
        }
      }

      if (data.settings.allocationVisibleColumns !== undefined) {
        if (isAllocationVisibleColumns(data.settings.allocationVisibleColumns)) {
          nextSettings.allocationVisibleColumns = data.settings.allocationVisibleColumns
        } else {
          console.warn('Skipping malformed allocationVisibleColumns section in backup')
        }
      }

      if (Object.keys(nextSettings).length > 0) {
        settings = nextSettings
      }
    } else {
      console.warn('Skipping malformed settings section in backup')
    }
  }

  return {
    version: data.version,
    updatedAt: isString(data.updatedAt) ? data.updatedAt : new Date().toISOString(),
    device: isString(data.device) ? data.device : 'Unknown Device',
    appVersion: isString(data.appVersion) ? data.appVersion : undefined,
    transactions: sanitizedTransactions,
    targetAllocations,
    prices,
    tickerProfiles,
    settings,
  }
}

// ============================================================================
// Device Detection
// ============================================================================

export function detectDevice(): string {
  const ua = navigator.userAgent
  
  // Mobile devices
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) {
    if (/Mobile/i.test(ua)) return 'Android Phone'
    return 'Android Tablet'
  }
  
  // Desktop
  if (/Macintosh/i.test(ua)) return 'Mac'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Linux/i.test(ua)) return 'Linux'
  
  return 'Unknown Device'
}

// ============================================================================
// Export Functions
// ============================================================================

export function createBackup(appVersion?: string): BackupData {
  // Load and normalize transactions (ensure YYYY-MM-DD dates)
  const rawTransactions = loadGuestTransactions()
  const transactions = rawTransactions.map(t => ({
    ...t,
    date: normalizeDate(t.date)
  }))
  const prices = loadGuestPrices()
  
  // Load target allocations
  let targetAllocations: Record<string, number> | null = null
  try {
    const stored = localStorage.getItem(ALLOCATION_KEY)
    if (stored) targetAllocations = JSON.parse(stored)
  } catch (e) {
    console.warn('Failed to load target allocations:', e)
  }
  
  // Load ticker profiles (sector, region, isETF cache)
  let tickerProfiles: Record<string, BackupTickerProfile> | null = null
  try {
    const stored = localStorage.getItem(TICKER_INFO_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (isTickerProfileMap(parsed)) {
        tickerProfiles = parsed
      } else {
        console.warn('Skipping malformed ticker profile cache while creating backup')
      }
    }
  } catch (e) {
    console.warn('Failed to load ticker profiles:', e)
  }
  
  // Load settings
  const settings: BackupData['settings'] = {}
  try {
    const holdingsColumns = localStorage.getItem(HOLDINGS_COLUMNS_KEY)
    if (holdingsColumns) settings.holdingsVisibleColumns = JSON.parse(holdingsColumns)
    
    const allocationColumns = localStorage.getItem(ALLOCATION_COLUMNS_KEY)
    if (allocationColumns) settings.allocationVisibleColumns = JSON.parse(allocationColumns)
  } catch (e) {
    console.warn('Failed to load settings:', e)
  }
  
  return {
    version: BACKUP_VERSION,
    updatedAt: new Date().toISOString(),
    device: detectDevice(),
    appVersion,
    transactions,
    targetAllocations,
    prices: Object.keys(prices).length > 0 ? prices : null,
    tickerProfiles: tickerProfiles && Object.keys(tickerProfiles).length > 0 ? tickerProfiles : null,
    settings: Object.keys(settings).length > 0 ? settings : undefined
  }
}

export function exportBackup(appVersion?: string): void {
  const backup = createBackup(appVersion)
  
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  
  const date = new Date().toISOString().split('T')[0]
  const device = backup.device.toLowerCase().replace(/\s+/g, '-')
  const filename = `beskarfolio-backup-${date}-${device}.json`
  
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  
  URL.revokeObjectURL(url)
}

// ============================================================================
// Import Functions
// ============================================================================

export function parseBackup(jsonString: string): BackupData | null {
  try {
    const parsed = JSON.parse(jsonString)
    const data = sanitizeBackupData(parsed)
    if (!data) return null
    
    // Handle older versions
    if (data.version < BACKUP_VERSION) {
      console.log(`Upgrading backup from v${data.version} to v${BACKUP_VERSION}`)
      // Future: migration logic here
    }
    
    return data as BackupData
  } catch (e) {
    console.error('Failed to parse backup:', e)
    return null
  }
}

export function compareBackup(backup: BackupData): ImportComparison {
  const currentTransactions = loadGuestTransactions()
  const warnings: string[] = []
  
  // Get current data's last update time
  let currentDate: Date | null = null
  try {
    const stored = localStorage.getItem(GUEST_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.lastUpdated) {
        currentDate = new Date(parsed.lastUpdated)
      }
    }
  } catch (e) {
    // Ignore
  }
  
  const backupDate = new Date(backup.updatedAt)
  const isOlder = currentDate ? backupDate < currentDate : false
  const isNewer = currentDate ? backupDate > currentDate : true
  const isSameDevice = backup.device === detectDevice()
  
  // Generate warnings
  if (isOlder) {
    const daysDiff = Math.floor((currentDate!.getTime() - backupDate.getTime()) / (1000 * 60 * 60 * 24))
    warnings.push(`⚠️ This backup is ${daysDiff} day${daysDiff !== 1 ? 's' : ''} older than your current data`)
  }
  
  if (currentTransactions.length > 0 && backup.transactions.length < currentTransactions.length) {
    warnings.push(`⚠️ Backup has fewer transactions (${backup.transactions.length}) than current data (${currentTransactions.length})`)
  }
  
  if (!isSameDevice) {
    warnings.push(`ℹ️ Backup was created on ${backup.device}`)
  }
  
  if (backup.version < BACKUP_VERSION) {
    warnings.push(`ℹ️ Backup format is older (v${backup.version}), will be upgraded to v${BACKUP_VERSION}`)
  }
  
  return {
    isOlder,
    isNewer,
    isSameDevice,
    backupDate,
    currentDate,
    backupTransactionCount: backup.transactions.length,
    currentTransactionCount: currentTransactions.length,
    backupDevice: backup.device,
    warnings
  }
}

export interface ImportOptions {
  importTransactions?: boolean
  importAllocations?: boolean
  importPrices?: boolean
  importTickerProfiles?: boolean  // Ticker info cache (sector, region, isETF)
  importSettings?: boolean
  mergeTransactions?: boolean  // true = merge, false = replace
}

export function importBackup(backup: BackupData, options: ImportOptions = {}): { success: boolean; imported: string[] } {
  const {
    importTransactions = true,
    importAllocations = true,
    importPrices = false,  // Prices are usually refetched anyway
    importTickerProfiles = true,  // Ticker info is valuable (sector, region)
    importSettings = true,
    mergeTransactions = false
  } = options

  const imported: string[] = []

  // Normalize transactions: fix type case, date format, and regenerate unique IDs
  // Handles old backups that might have 'Sell', 'SELL', 'Buy', 'BUY', etc.
  // Also fixes duplicate ID issue from old backups
  // Normalizes dates to YYYY-MM-DD format
  const normalizeTransactions = (transactions: Transaction[]): Transaction[] => {
    const baseId = Date.now()
    return transactions.map((t, index) => {
      const typeNormalized = String(t.type || '').toLowerCase()
      const validType = typeNormalized === 'sell' ? 'sell' : typeNormalized === 'buy' ? 'buy' : null
      
      if (!validType) {
        console.warn(`⚠️ Transaction ${index} has invalid type "${t.type}", defaulting to 'buy'. Ticker: ${t.ticker}`)
      }
      
      return {
        ...t,
        id: baseId + index,  // Regenerate unique sequential IDs
        date: normalizeDate(t.date),  // Ensure YYYY-MM-DD format
        type: validType || 'buy'  // Fallback for corrupt backups, but warn user
      }
    })
  }

  try {
    // Import transactions
    if (importTransactions && backup.transactions) {
      const normalizedTransactions = normalizeTransactions(backup.transactions)
      if (mergeTransactions) {
        const current = loadGuestTransactions()
        const existingIds = new Set(current.map(t => t.id))
        const newTransactions = normalizedTransactions.filter(t => !existingIds.has(t.id))
        saveGuestTransactions([...current, ...newTransactions])
        imported.push(`${newTransactions.length} new transactions (merged)`)
      } else {
        saveGuestTransactions(normalizedTransactions)
        imported.push(`${backup.transactions.length} transactions`)
      }
    }
    
    // Import allocations
    if (importAllocations && backup.targetAllocations) {
      localStorage.setItem(ALLOCATION_KEY, JSON.stringify(backup.targetAllocations))
      imported.push('target allocations')
    }
    
    // Import prices (optional)
    if (importPrices && backup.prices) {
      saveGuestPrices(backup.prices)
      imported.push('cached prices')
    }
    
    // Import ticker profiles (sector, region, isETF cache)
    if (importTickerProfiles && backup.tickerProfiles) {
      localStorage.setItem(TICKER_INFO_CACHE_KEY, JSON.stringify(backup.tickerProfiles))
      imported.push(`${Object.keys(backup.tickerProfiles).length} ticker profiles`)
    }
    
    // Import settings
    if (importSettings && backup.settings) {
      if (backup.settings.holdingsVisibleColumns) {
        localStorage.setItem(HOLDINGS_COLUMNS_KEY, JSON.stringify(backup.settings.holdingsVisibleColumns))
        imported.push('holdings column settings')
      }
      if (backup.settings.allocationVisibleColumns) {
        localStorage.setItem(ALLOCATION_COLUMNS_KEY, JSON.stringify(backup.settings.allocationVisibleColumns))
        imported.push('allocation column settings')
      }
    }
    
    // Notify app of changes
    window.dispatchEvent(new Event('guestTransactionsUpdated'))
    
    return { success: true, imported }
  } catch (e) {
    console.error('Failed to import backup:', e)
    return { success: false, imported }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

export function formatBackupDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function getBackupSummary(backup: BackupData): string {
  const parts = [
    `${backup.transactions.length} transactions`,
    backup.targetAllocations ? 'allocations' : null,
    backup.tickerProfiles ? `${Object.keys(backup.tickerProfiles).length} profiles` : null,
    backup.prices ? 'prices' : null,
    backup.settings ? 'settings' : null
  ].filter(Boolean)
  
  return parts.join(', ')
}
