/**
 * Portfolio Allocation & Rebalancing Types
 */

export interface TargetAllocation {
  [ticker: string]: number  // ticker -> weight % mapping
}

export interface AllocationData {
  ticker: string
  currency: string
  current_shares: number
  current_value_eur: number
  current_weight_pct: number
  target_weight_pct: number
  drift_pct: number
  drift_value_eur: number
  action: 'buy' | 'sell' | 'hold'
}

export interface AllocationStatus {
  success: boolean
  total_value_eur: number
  total_drift_pct: number
  needs_rebalancing: boolean
  drift_data: AllocationData[]
}

export interface RebalanceTrade {
  ticker: string
  action: 'buy' | 'sell'
  shares: number
  price: number
  eur_value: number
  tax_free: boolean | null
  tax_liability_eur: number
  tax_savings_eur: number
  reason: string
}

export interface RebalancePlan {
  success: boolean
  trades: RebalanceTrade[]
  summary: {
    total_trades: number
    total_sells_eur: number
    total_buys_eur: number
    cash_generated: number
    cash_used: number
    cash_remaining: number
    cash_needed: number  // Total cash needed for all buys (buy-only strategy)
    cash_shortfall: number  // Additional cash needed beyond what's available
    total_tax_liability: number
    tax_savings: number
  }
  needs_rebalancing: boolean
  total_drift_pct: number
}

export interface RebalancePlanRequest {
  cash_available?: number
  allow_selling?: boolean
  min_trade_value?: number
  use_tax_free_only?: boolean
  strategy?: string  // 'sell_buy' or 'buy_only'
  transactions?: any[]  // For guest mode
  target_allocations?: TargetAllocation  // For guest mode
}

