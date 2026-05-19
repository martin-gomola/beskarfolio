import { AIProvider, AISettings, InvestmentHorizon, InvestmentGoal } from './types'

export const HORIZON_LABELS: Record<InvestmentHorizon, string> = {
  'short': '1-3 years',
  'medium': '3-10 years',
  'long': '10-20 years',
  'very-long': '20+ years'
}

export const GOAL_LABELS: Record<InvestmentGoal, string> = {
  'growth': 'capital growth',
  'income': 'dividend income',
  'preservation': 'capital preservation',
  'retirement': 'retirement planning',
  'balanced': 'balanced growth and income'
}

export const PROVIDER_CONFIG: Record<AIProvider, {
  name: string
  emoji: string
  placeholder: string
  model: string
  keyField: keyof AISettings
}> = {
  openai: { name: 'OpenAI', emoji: '🤖', placeholder: 'sk-...', model: 'gpt-4o', keyField: 'openaiKey' },
  anthropic: { name: 'Claude', emoji: '🧠', placeholder: 'sk-ant-...', model: 'claude-sonnet-4-20250514', keyField: 'anthropicKey' },
  google: { name: 'Gemini', emoji: '✨', placeholder: 'AIza...', model: 'gemini-1.5-flash', keyField: 'googleKey' }
}

// Fallback sector/region mappings for common tickers
export const TICKER_SECTORS: Record<string, string> = {
  'AAPL': 'Tech', 'MSFT': 'Tech', 'GOOGL': 'Tech', 'META': 'Tech', 'NVDA': 'Tech',
  'AMD': 'Tech', 'INTC': 'Tech', 'ASML': 'Tech', 'TSM': 'Tech', 'AVGO': 'Tech',
  'JPM': 'Finance', 'BAC': 'Finance', 'V': 'Finance', 'MA': 'Finance', 'GS': 'Finance',
  'AMZN': 'Consumer', 'TSLA': 'Consumer', 'NKE': 'Consumer', 'DIS': 'Consumer', 'NFLX': 'Consumer',
  'JNJ': 'Healthcare', 'UNH': 'Healthcare', 'PFE': 'Healthcare', 'LLY': 'Healthcare',
  'NCLH': 'Travel', 'CCL': 'Travel', 'RCL': 'Travel', 'DAL': 'Travel', 'UAL': 'Travel',
  'XOM': 'Energy', 'CVX': 'Energy', 'COP': 'Energy',
}

export const ETF_PATTERNS = ['VWCE', 'SXR', 'IWDA', 'EUNL', 'CSPX', 'VOO', 'VTI', 'QQQ', 'SPY', 'IVV']
