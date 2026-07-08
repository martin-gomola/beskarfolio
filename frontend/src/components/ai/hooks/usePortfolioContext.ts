import { useMemo } from 'react'
import { Holding, PortfolioSummary, TaxFreeHolding, Transaction } from '../../../types'
import { TickerInfo, AISettings, PortfolioHolding, TICKER_INFO_CACHE_KEY } from '../types'
import { TICKER_SECTORS, ETF_PATTERNS, HORIZON_LABELS, GOAL_LABELS } from '../constants'
import { DEFAULT_PROMPT_OPTIONS, ExchangeRateContext, PromptContext, PromptOptions } from '../prompts/types'

const loadTickerInfoCache = (): Record<string, TickerInfo> => {
  try {
    const cached = localStorage.getItem(TICKER_INFO_CACHE_KEY)
    return cached ? JSON.parse(cached) : {}
  } catch {
    return {}
  }
}

const getSector = (ticker: string, cache: Record<string, TickerInfo>): string => {
  if (cache[ticker]?.sector) return cache[ticker].sector!
  if (ETF_PATTERNS.some(p => ticker.toUpperCase().includes(p))) return 'ETF/Index'
  if (ticker.endsWith('.DE') && ETF_PATTERNS.some(p => ticker.includes(p))) return 'ETF/Index'
  return TICKER_SECTORS[ticker] || 'Other'
}

const getRegion = (ticker: string, cache: Record<string, TickerInfo>): string => {
  if (cache[ticker]?.region) return cache[ticker].region!
  if (ticker.endsWith('.DE') || ticker.endsWith('.PA') || ticker.endsWith('.AS')) return 'EU'
  if (ticker.endsWith('.HK') || ticker.endsWith('.T')) return 'Asia'
  return 'US'
}

const buildTaxFreeSection = (taxFreeData: TaxFreeHolding[]): string => {
  if (!taxFreeData.length) return ''

  const lines = taxFreeData.map(t => {
    const pct = t.tax_free_pct.toFixed(0)
    const nextDate = t.next_tax_free_date
      ? `, next ${t.next_tax_free_shares} shares tax-free on ${t.next_tax_free_date}`
      : ''
    return `- ${t.ticker}: ${t.tax_free_shares}/${t.total_shares} shares tax-free (${pct}%)${nextDate}`
  })

  return `### Tax-Free Status (Slovak 365-day rule, FIFO):
${lines.join('\n')}`
}

const buildDataNotesSection = (exchangeRates: ExchangeRateContext | null): string => {
  const exchangeRateLine = exchangeRates
    ? `- FX rate: USD -> EUR ${exchangeRates.usdEur.toFixed(4)}, EUR -> USD ${exchangeRates.eurUsd.toFixed(4)}${exchangeRates.updatedAt ? `, updated ${exchangeRates.updatedAt}` : ''} (source: ${exchangeRates.source}).`
    : '- FX rate: The exact EUR/USD rate used to convert US holdings is missing; do not estimate it and verify it before doing currency-sensitive calculations.'

  return `### Data Notes / Assumptions:
- Current market prices: The table includes each holding's current price in its native currency, but prices may be cached, stale, or estimated; verify exact live market prices before trading.
${exchangeRateLine}`
}

export function usePortfolioContext(
  holdings: Holding[],
  summary: PortfolioSummary | null,
  settings: AISettings,
  taxFreeData?: TaxFreeHolding[] | null,
  transactions: Transaction[] = [],
  exchangeRates: ExchangeRateContext | null = null,
  selectedTicker = '',
  replacementTicker = '',
  promptOptions: PromptOptions = DEFAULT_PROMPT_OPTIONS
): { portfolioData: PortfolioHolding[] | null; promptContext: PromptContext | null } {

  const portfolioData = useMemo(() => {
    if (!holdings.length) return null

    const tickerCache = loadTickerInfoCache()
    const totalValue = holdings.reduce((sum, h) => sum + (h.current_value_eur || 0), 0)

    return holdings
      .map(h => ({
        ticker: h.ticker,
        shares: h.shares,
        avgPrice: h.avg_buy_price || 0,
        currentPrice: h.current_price || 0,
        value: h.current_value_eur || 0,
        weight: totalValue > 0 ? ((h.current_value_eur || 0) / totalValue * 100).toFixed(1) : '0',
        gainLoss: h.gain_loss || 0,
        gainLossPercent: h.gain_loss_pct || 0,
        currency: h.currency || 'EUR',
        sector: getSector(h.ticker, tickerCache),
        region: getRegion(h.ticker, tickerCache),
        priceStatus: h.price_status,
        priceNote: h.price_note,
      }))
      .sort((a, b) => b.value - a.value)
  }, [holdings])

  const promptContext = useMemo((): PromptContext | null => {
    if (!portfolioData || !summary) return null

    const holdingsTable = portfolioData
      .map(h => {
        const sym = h.currency === 'USD' ? '$' : '€'
        const avgPrice = h.avgPrice.toFixed(2)
        const currentPrice = h.currentPrice.toFixed(2)
        const pnl = `${h.gainLossPercent >= 0 ? '+' : ''}${h.gainLossPercent.toFixed(0)}%`
        const priceStatus = h.priceStatus ? `, price status: ${h.priceStatus}${h.priceNote ? ` (${h.priceNote})` : ''}` : ''
        return `- ${h.ticker} [${h.sector}, ${h.region}]: ${h.shares}x @ ${sym}${avgPrice} avg → ${sym}${currentPrice} now (${h.weight}%, ${pnl}${priceStatus})`
      })
      .join('\n')

    const sectorBreakdown: Record<string, number> = {}
    const regionBreakdown: Record<string, number> = {}
    portfolioData.forEach(h => {
      const weight = parseFloat(h.weight)
      sectorBreakdown[h.sector] = (sectorBreakdown[h.sector] || 0) + weight
      regionBreakdown[h.region] = (regionBreakdown[h.region] || 0) + weight
    })

    const sectorSummary = Object.entries(sectorBreakdown)
      .sort(([, a], [, b]) => b - a)
      .map(([sector, weight]) => `${sector}: ${weight.toFixed(0)}%`)
      .join(', ')

    const regionSummary = Object.entries(regionBreakdown)
      .sort(([, a], [, b]) => b - a)
      .map(([region, weight]) => `${region}: ${weight.toFixed(0)}%`)
      .join(', ')

    const totalValue = summary.total_value || 0
    const totalGainLoss = summary.total_gain_loss || 0
    const totalReturn = summary.total_gain_loss_pct || 0
    const dataNotesSection = buildDataNotesSection(exchangeRates)

    const profile = settings.profile
    const hasProfile = !!(profile?.age || profile?.horizon || profile?.goal)
    const shouldIncludeProfile = promptOptions.includeProfile && hasProfile
    const profileSection = hasProfile ? `
### Investor Profile:
${profile?.age ? `- **Age:** ${profile.age} years old` : ''}
${profile?.horizon ? `- **Investment Horizon:** ${HORIZON_LABELS[profile.horizon]}` : ''}
${profile?.goal ? `- **Primary Goal:** ${GOAL_LABELS[profile.goal]}` : ''}
`.trim() : ''

    const hasTaxFreeData = !!(taxFreeData && taxFreeData.length > 0)
    const shouldIncludeTax = promptOptions.includeTax && hasTaxFreeData
    const taxFreeSection = hasTaxFreeData ? buildTaxFreeSection(taxFreeData!) : ''
    const normalizedSelectedTicker = selectedTicker.toUpperCase()
    const normalizedReplacementTicker = replacementTicker.trim().toUpperCase()
    const selectedTickerTransactions = transactions
      .filter(t => t.ticker.toUpperCase() === normalizedSelectedTicker)
      .sort((a, b) => a.date.localeCompare(b.date))
    const selectedTickerHolding = portfolioData.find(h => h.ticker.toUpperCase() === normalizedSelectedTicker)
    const selectedTickerTaxFree = taxFreeData?.find(t => t.ticker.toUpperCase() === normalizedSelectedTicker)
    const selectedTickerTaxFreeSection = selectedTickerTaxFree
      ? buildTaxFreeSection([selectedTickerTaxFree])
      : ''

    const baseContext = `
## My Portfolio
${shouldIncludeProfile ? `\n${profileSection}\n` : ''}
**Total Value:** €${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
**Total P&L:** €${totalGainLoss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%)
**Number of Holdings:** ${holdings.length}

### Sector Breakdown:
${sectorSummary}

### Geographic Breakdown:
${regionSummary}

### Holdings (sorted by value):
${holdingsTable}
${dataNotesSection ? `\n${dataNotesSection}` : ''}
${shouldIncludeTax ? `\n${taxFreeSection}` : ''}
`.trim()

    return {
      holdingsTable,
      sectorSummary,
      regionSummary,
      totalValue,
      totalGainLoss,
      totalReturn,
      holdingsCount: holdings.length,
      portfolioData,
      dataNotesSection,
      profile,
      hasProfile,
      profileSection,
      taxFreeSection,
      hasTaxFreeData,
      transactions,
      selectedTicker: normalizedSelectedTicker,
      replacementTicker: normalizedReplacementTicker,
      selectedTickerTransactions,
      selectedTickerHolding,
      selectedTickerTaxFreeSection: promptOptions.includeTax ? selectedTickerTaxFreeSection : '',
      promptOptions,
      baseContext,
    }
  }, [portfolioData, summary, settings.profile, holdings.length, taxFreeData, transactions, exchangeRates, selectedTicker, replacementTicker, promptOptions])

  return { portfolioData, promptContext }
}
