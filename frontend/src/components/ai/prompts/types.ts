import { LucideIcon } from 'lucide-react'
import { Transaction } from '../../../types'
import { InvestorProfile, PortfolioHolding } from '../types'

export type PromptDepth = 'simple' | 'detailed'
export type PromptLens = 'balanced' | 'conservative' | 'growth' | 'income' | 'core-satellite'
export type PromptOutput = 'summary' | 'table' | 'checklist'

export interface PromptOptions {
  depth: PromptDepth
  lens: PromptLens
  output: PromptOutput
  includeProfile: boolean
  includeTax: boolean
  includeTransactions: boolean
  askClarifyingQuestions: boolean
}

export const DEFAULT_PROMPT_OPTIONS: PromptOptions = {
  depth: 'simple',
  lens: 'balanced',
  output: 'checklist',
  includeProfile: true,
  includeTax: true,
  includeTransactions: true,
  askClarifyingQuestions: false,
}

// Context passed to each prompt generator
export interface PromptContext {
  // Portfolio data
  holdingsTable: string
  sectorSummary: string
  regionSummary: string
  totalValue: number
  totalGainLoss: number
  totalReturn: number
  holdingsCount: number
  portfolioData: PortfolioHolding[]

  // Investor profile
  profile?: InvestorProfile
  hasProfile: boolean
  profileSection: string

  // Tax-free data (Slovak 365-day rule)
  taxFreeSection: string
  hasTaxFreeData: boolean

  // Selected ticker transaction context
  transactions: Transaction[]
  selectedTicker: string
  replacementTicker: string
  selectedTickerTransactions: Transaction[]
  selectedTickerHolding?: PortfolioHolding
  selectedTickerTaxFreeSection: string
  promptOptions: PromptOptions

  // Pre-built base context string
  baseContext: string
}

// Each prompt exports this structure
export interface PromptDefinition {
  id: PromptType
  label: string
  // Kept for backwards compatibility (PROMPT_TEMPLATES, any future text-only consumer).
  // The UI renders `icon` instead.
  emoji: string
  icon: LucideIcon
  description: string
  question: string
  category: 'popular' | 'advanced'
  generate: (ctx: PromptContext) => string
}

// All available prompt types
export type PromptType =
  | 'snapshot'
  | 'analysis'
  | 'rebalance'
  | 'dividends'
  | 'buffett'
  | 'taxBacktest'
