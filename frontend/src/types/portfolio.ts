export interface PortfolioSummary {
  success: boolean
  transaction_count: number
  total_value: number
  total_invested: number
  total_gain_loss: number
  total_gain_loss_pct: number
  holdings_count: number
  estimated_holdings_count?: number
}

export interface PriceStatus {
  has_prices: boolean
  last_update: string | null
  prices_count: number
  status_counts: {
    cached: number
    recent: number
    stale: number
  }
  // Only returned with ?details=true (large payload)
  prices?: Array<{
    ticker: string
    price: number
    currency: string
    updated_at: string | null
    age_hours: number
    price_date?: string
    status: 'cached' | 'recent' | 'stale'
  }>
}
