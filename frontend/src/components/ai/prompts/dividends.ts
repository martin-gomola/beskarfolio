import { CircleDollarSign } from 'lucide-react'
import { PromptDefinition } from './types'

export const dividendsPrompt: PromptDefinition = {
  id: 'dividends',
  label: 'Income Strategy',
  emoji: '💰',
  icon: CircleDollarSign,
  description: 'Analyze dividend potential and income optimization',
  question: 'How much dividend income will I get?',
  category: 'popular',

  generate: (ctx) => `You are a dividend investing specialist.

${ctx.baseContext}

---

**Your Task:** Analyze this portfolio from an income perspective.

**Important Instructions:**
- Only include holdings you're CONFIDENT pay dividends
- Use approximate/typical dividend yields - mark estimates with "~"
- EXCLUDE: Growth stocks without dividends, accumulating ETFs (VWCE, SXR8, CSPX, etc.)

**Dividend Income Table** (dividend payers only):
| Ticker | Shares | ~Annual Div/Share | ~Annual Income | ~Yield |
|--------|--------|-------------------|----------------|--------|
| [ticker] | X | ~$X.XX | ~$XXX | ~X.X% |
| **TOTAL** | | | **~$X,XXX** | **~X.X%** |

**Non-dividend holdings**: [list tickers]

**Analysis:**
1. **Dividend Summary**: Estimated total annual income
2. **Income vs Growth Split**: What portion pays dividends?
3. **Dividend Sustainability**: Risks to any dividends being cut?
4. **Income Optimization**: How to increase dividend income
5. **Dividend Growth**: Holdings with strong dividend growth history

**Response Guidelines:**
- Keep response concise (500-700 words)
- Complete the dividend table for ALL dividend payers
- Data is approximate - verify current yields before acting
- Clearly separate dividend payers from growth holdings`
}
