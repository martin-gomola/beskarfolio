export interface Transaction {
  id: number
  ticker: string
  type: 'buy' | 'sell' | 'dividend'
  date: string
  shares: number
  price: number
  currency: string
  total_value: number
  created_at: string
  gross_amount?: number
  withholding_tax?: number
}

export interface TransactionFormData {
  ticker: string
  type: 'buy' | 'sell' | 'dividend'
  date: string
  shares: string
  price: string
  currency: string
  gross_amount?: string
  withholding_tax?: string
}
