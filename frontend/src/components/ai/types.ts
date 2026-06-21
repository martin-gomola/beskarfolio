import { Holding, PortfolioSummary } from '../../types'

export { AI_SETTINGS_KEY, TICKER_INFO_CACHE_KEY } from '../../utils/storageKeys'

export interface TickerInfo {
  sector?: string
  region?: string
  isETF?: boolean
  name?: string
}

export type AIProvider = 'openai' | 'anthropic' | 'google'

export type InvestmentGoal = 'growth' | 'income' | 'preservation' | 'retirement' | 'balanced'
export type InvestmentHorizon = 'short' | 'medium' | 'long' | 'very-long'

export interface InvestorProfile {
  age?: number
  horizon?: InvestmentHorizon
  goal?: InvestmentGoal
}

export interface AISettings {
  provider: AIProvider
  openaiKey?: string
  anthropicKey?: string
  googleKey?: string
  customUrl?: string
  customModel?: string
  profile?: InvestorProfile
}

export interface AIAnalysisPageProps {
  holdings: Holding[]
  summary: PortfolioSummary | null
}

export interface PortfolioHolding {
  ticker: string
  shares: number
  avgPrice: number
  currentPrice: number
  value: number
  weight: string
  gainLoss: number
  gainLossPercent: number
  currency: string
  sector: string
  region: string
}
