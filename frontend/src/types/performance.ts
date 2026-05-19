export interface TickerBreakdown {
  ticker: string
  currency: string
  shares_start: number
  shares_end: number
  value_start: number
  value_end: number
  invested: number
  withdrawn: number
  gain: number
  gain_pct: number
  trade_count: number
}

export interface YearPerformance {
  year: number
  is_current_year: boolean
  start_date: string
  end_date: string
  beginning_balance: number
  ending_balance: number
  total_invested: number
  total_withdrawn: number
  net_deposits: number
  total_gain: number
  total_gain_pct: number
  trade_count: number
  tickers: TickerBreakdown[]
  beginning_balance_adjusted?: boolean
  adjustment_amount?: number
}

export interface AllTimePerformance {
  start_date: string
  end_date: string
  beginning_balance: number
  ending_balance: number
  total_invested: number
  total_withdrawn: number
  net_deposits: number
  total_gain: number
  total_gain_pct: number
  trade_count: number
}

export interface AnnualPerformanceData {
  years: YearPerformance[]
  all_time: AllTimePerformance
}

export interface AnnualPerformanceResponse extends AnnualPerformanceData {
  success: boolean
}

export interface PerformanceChartPoint {
  date: string
  value: number
  invested: number
  portfolio_return_pct?: number
  benchmark_return_pct?: number
}

export interface PerformanceHistoryResponse {
  success: boolean
  data_points: PerformanceChartPoint[]
}
