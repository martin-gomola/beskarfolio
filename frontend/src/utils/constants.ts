/**
 * Application constants
 */

// API Configuration
// Smart URL detection:
//   - VITE_API_URL env var (set at build time, used for Render and similar split deploys)
//   - localhost → direct backend
//   - otherwise → relative path (nginx handles routing in self-hosted Docker)
const getApiBaseUrl = (): string => {
  const buildTimeUrl = import.meta.env.VITE_API_URL as string | undefined
  if (buildTimeUrl) {
    return buildTimeUrl.replace(/\/$/, '')
  }
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8060'
    }
  }
  return ''
}

export const API_BASE_URL = getApiBaseUrl()
export const API_TIMEOUT = 120000 // 2 minutes for complex operations (imports, annual report)

// Demo Mode (Render public demo)
// When true, disables silent auto-refresh so visitor traffic doesn't burn
// the shared Twelve Data quota. Users can still trigger refresh manually.
export const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'

// Storage Keys
export const GUEST_STORAGE_KEY = 'beskarfolio_guest_transactions'
export const GUEST_PRICES_KEY = 'beskarfolio_guest_prices'

// Time Constants
export const ONE_HOUR_MS = 3600000
export const ONE_DAY_MS = 86400000

// Chart Colors
export const CHART_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ef4444', // red
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#f97316', // orange
  '#14b8a6', // teal
  '#6366f1', // indigo
  '#84cc16', // lime
]

// Import Types
export const IMPORT_TYPES = {
  STANDARD: 'standard',
  IBKR: 'ibkr',
} as const

// Transaction Types
export const TRANSACTION_TYPES = {
  BUY: 'buy',
  SELL: 'sell',
} as const

// Currency Types
export const CURRENCIES = {
  EUR: 'EUR',
  USD: 'USD',
} as const

// Slovak Tax Rule
export const TAX_FREE_DAYS = 365
