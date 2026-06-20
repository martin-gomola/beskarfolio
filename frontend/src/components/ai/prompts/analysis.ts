import { PieChart } from 'lucide-react'
import { buildGuidanceSection } from './guidance'
import { PromptDefinition } from './types'

export const analysisPrompt: PromptDefinition = {
  id: 'analysis',
  label: 'Portfolio Analysis',
  emoji: '📊',
  icon: PieChart,
  description: 'Get a comprehensive analysis of your portfolio',
  question: 'How is my portfolio doing overall?',
  category: 'popular',

  generate: (ctx) => `You are a professional financial analyst. Analyze this investment portfolio.

${ctx.baseContext}

---

${buildGuidanceSection(ctx)}

**Your Task:** Provide a comprehensive portfolio analysis.

**Executive Summary** (2-3 sentences): Overall portfolio health grade (A-F) and the single most important action to consider.

Then analyze:
1. **Portfolio Overview**: Comment on diversification across the holdings shown. Note: infer sector/geography only from well-known tickers; state assumptions clearly.
2. **Strengths**: What's working well? (high performers, reasonable allocation)
3. **Weaknesses**: What could be improved? (concentration, gaps, missing sectors)
4. **Observations**: Based on known public info about these companies (do NOT estimate specific metrics like P/E unless you're confident in current data)
5. **Recommendations**: 2-3 actionable, specific suggestions

**Response Guidelines:**
- Keep response concise (600-900 words)
- Reference actual holdings by ticker
- Use bullet points over paragraphs
- Clearly state when making assumptions`
}
