import { PieChart } from 'lucide-react'
import { PromptDefinition } from './types'

export const analysisPrompt: PromptDefinition = {
  id: 'analysis',
  label: 'Optimize my portfolio',
  emoji: '📊',
  icon: PieChart,
  description: 'Get three prioritized improvements with benefits, trade-offs, and next steps',
  question: 'How could I improve my portfolio?',
  category: 'popular',

  generate: (ctx) => `Act as a careful, independent investment research assistant. Help me assess how I could improve this portfolio. Do not assume that trading more is better.

${ctx.baseContext}

---

**Your Task:** Suggest a practical portfolio improvement plan based on the information provided.

Use exactly this structure:
1. **Portfolio verdict**: Two sentences covering the main strength and biggest risk. Reference the actual holdings and weights. Do not use a letter grade.
2. **Top priorities**: A table with up to three rows, ranked by importance:
| Priority | Observation and evidence | Suggested change | Benefit | Trade-off / what to verify |
|----------|--------------------------|------------------|---------|----------------------------|
Focus on concentration, asset allocation, ETF overlap, currency exposure, and fit with my stated goals. Distinguish a fund's listing location from its underlying geographic exposure. Do not infer detailed ETF overlap without constituent data.
3. **Next step**: One concrete step I can take or investigate. Consider redirecting new contributions before selling existing holdings, and use the provided tax-lot status when relevant. Keeping the current portfolio is a valid conclusion.
4. **Missing inputs**: Ask up to three short questions only when answers would materially change the plan (for example, risk tolerance, time horizon, cash needs, or monthly contributions). Offer a provisional assessment of observable risks while deferring target weights or trades that depend on those answers.

**Response Guidelines:**
- Keep the response under 500 words in plain English
- Reference actual holdings by ticker
- Separate facts in the provided snapshot from assumptions and general research
- Do not claim to know live prices, current valuations, or tax outcomes unless reliable current data is supplied
- Do not invent target weights, expected returns, volatility, correlations, or an efficient frontier. Mathematical optimization requires suitable return data and explicit assumptions
- Do not promise returns or present suggestions as personalized financial advice
- Use clear language and explain trade-offs`
}
