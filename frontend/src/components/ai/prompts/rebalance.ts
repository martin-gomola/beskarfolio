import { Scale } from 'lucide-react'
import { PromptDefinition } from './types'
import { HORIZON_LABELS, GOAL_LABELS } from '../constants'

export const rebalancePrompt: PromptDefinition = {
  id: 'rebalance',
  label: 'Rebalancing',
  emoji: '⚖️',
  icon: Scale,
  description: 'Get suggestions for rebalancing your portfolio',
  question: 'Which holdings should I rebalance?',
  category: 'popular',

  generate: (ctx) => {
    const { profile, hasProfile, hasTaxFreeData } = ctx

    const contextDescription = hasProfile
      ? `Investor is ${profile?.age ? `${profile.age} years old, ` : ''}${profile?.horizon ? `with a ${HORIZON_LABELS[profile.horizon]} investment horizon, ` : ''}${profile?.goal ? `focused on ${GOAL_LABELS[profile.goal]}` : ''}.`.replace(/, $/, '.')
      : 'Assume moderate risk tolerance, 10+ year horizon, and growth-oriented goals. (Adjust advice if these assumptions seem misaligned with the holdings.)'

    const taxNote = hasTaxFreeData
      ? `\n\n**Tax Rule (Slovak):** Shares held >365 days are exempt from capital gains tax. When trimming positions, prefer selling tax-free lots first. The tax-free status per holding is shown in the portfolio data above.`
      : ''

    return `You are a portfolio manager specializing in asset allocation.

${ctx.baseContext}

---

**Investor Context**: ${contextDescription}${taxNote}

**Your Task:** Analyze for rebalancing opportunities.

**Rebalancing Action Plan:**
| Ticker | Current % | Target % | Action | Priority |${hasTaxFreeData ? ' Tax-Free % |' : ''}
|--------|-----------|----------|--------|----------|${hasTaxFreeData ? '------------|' : ''}
| [ticker] | X% | Y% | Trim/Add/Hold | High/Med/Low |${hasTaxFreeData ? ' X% |' : ''}

**Analysis:**
1. **Current State**: Identify positions >15% (concentration) or <3% (fragmentation)
2. **Sector Balance**: Based on recognizable tickers, assess sector concentration
3. **Specific Actions**: Concrete suggestions with exact percentages${hasTaxFreeData ? '\n4. **Tax Efficiency**: When selling, prioritize tax-free lots (held >365 days) to avoid capital gains tax' : ''}
${hasTaxFreeData ? '5' : '4'}. **Priority Order**: What to address first vs. what can wait
${hasTaxFreeData ? '6' : '5'}. **Trade-offs**: Acknowledge tax implications of selling winners

**Response Guidelines:**
- Keep response concise (500-700 words)
- Complete the action plan table for ALL holdings
- Use specific percentages, not vague advice
- Prioritize actions by urgency${hasTaxFreeData ? '\n- Factor in tax-free status when recommending sells' : ''}`
  }
}
