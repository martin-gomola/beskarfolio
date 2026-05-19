export interface TaxFreeHolding {
  ticker: string
  total_shares: number
  tax_free_shares: number
  taxable_shares: number
  tax_free_pct: number
  next_tax_free_date: string | null
  next_tax_free_shares: number
  currency: string
  oldest_lots: Array<{
    date: string
    shares: number
    days_held: number
    is_tax_free: boolean
  }>
}
