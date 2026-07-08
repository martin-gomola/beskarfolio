import { ClipboardList } from 'lucide-react'
import { buildGuidanceSection } from './guidance'
import { PromptDefinition } from './types'

// Primer prompt: pastes portfolio basics into any AI agent as context before
// the user asks a real follow-up question.
export const snapshotPrompt: PromptDefinition = {
  id: 'snapshot',
  label: 'Portfolio Snapshot',
  emoji: '📋',
  icon: ClipboardList,
  description: 'Share your portfolio basics with an AI agent as context',
  question: 'Here is my portfolio, please use it as context',
  category: 'popular',

  generate: (ctx) => {
    const { portfolioData, totalValue, holdingsCount } = ctx

    const rows = portfolioData.map((h) => {
      const sym = h.currency === 'USD' ? '$' : '€'
      const avgPrice = h.avgPrice.toFixed(2)
      const currentPrice = h.currentPrice.toFixed(2)
      const valueEur = h.value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      const priceStatus = h.priceStatus ?? 'unknown'
      return `| ${h.ticker} | ${h.shares} | ${sym}${avgPrice} | ${sym}${currentPrice} | ${h.currency} | ${priceStatus} | €${valueEur} | ${h.weight}% |`
    })

    const totalValueFmt = totalValue.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })

    return `Use the following portfolio snapshot as context for my next question.

## Portfolio Snapshot

**Total Value:** €${totalValueFmt}
**Holdings:** ${holdingsCount}

| Ticker | Shares | Avg Cost | Current Price | Currency | Price Status | Current Value (EUR) | % of Portfolio |
|--------|--------|----------|---------------|----------|--------------|---------------------|----------------|
${rows.join('\n')}

${ctx.dataNotesSection}

${buildGuidanceSection(ctx)}`
  },
}
