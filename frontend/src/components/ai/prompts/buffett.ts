import { User } from 'lucide-react'
import { PromptDefinition } from './types'

export const buffettPrompt: PromptDefinition = {
  id: 'buffett',
  label: 'Warren Buffett review',
  emoji: '🎩',
  icon: User,
  description: 'Review my holdings through a long-term value investing lens',
  question: 'What would Warren Buffett think?',
  category: 'popular',

  generate: (ctx) => `Review this portfolio using value-investing principles associated with Warren Buffett: durable competitive advantages, understandable businesses, disciplined valuation, and a long holding period. Present an independent review rather than claiming to speak for Buffett.

${ctx.baseContext}

---

**Your Task:** Evaluate this portfolio through a value investing lens.

**Output:**
1. A two-sentence verdict describing the portfolio's strongest quality and biggest concern.
2. A compact table covering every holding:
| Holding | Long-term quality / role | Evidence or assumption | Main concern | What to investigate |
|---------|---------------------------|------------------------|--------------|---------------------|
Treat ETFs as diversified funds and assess their portfolio role rather than assigning a business moat to the fund itself.
3. Up to three ranked improvements, with a reason and trade-off for each. Keeping a holding or the entire portfolio unchanged is a valid conclusion.

**Evaluation Criteria:**
- **Moat**: Does this company have durable competitive advantages?
- **Business Quality**: Is this a business you'd want to own for 10+ years?
- **Management**: What's known about the management quality?

**Response Guidelines:**
- Keep the answer under 500 words, excluding table rows, using plain language
- Do not comment on current valuations (no real-time data)
- Do not invent business metrics, management assessments, quotes, or numerical moat scores
- Label uncertain business claims and distinguish quality from whether today's price is attractive
- Ask up to three clarifying questions only when missing goals or risk tolerance would materially change the recommendations`
}
