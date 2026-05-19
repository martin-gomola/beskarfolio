export interface Holding {
  ticker: string
  shares: number
  avg_buy_price: number
  current_price: number
  current_value: number
  invested_value: number
  gain_loss: number
  gain_loss_pct: number
  currency: string
  current_value_eur: number
  invested_value_eur: number
  price_status?: 'current' | 'stale' | 'estimated'
  price_note?: string | null
}
