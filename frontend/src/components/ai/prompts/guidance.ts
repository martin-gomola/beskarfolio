import { PromptContext, PromptLens, PromptOutput } from './types'

const lensLabels: Record<PromptLens, string> = {
  balanced: 'balanced long-term investor',
  conservative: 'capital preservation and risk control',
  growth: 'long-term growth',
  income: 'income and cash-flow reliability',
  'core-satellite': 'core-satellite allocation discipline',
}

const outputLabels: Record<PromptOutput, string> = {
  summary: 'short plain-English summary',
  table: 'table-first answer with brief notes',
  checklist: 'ranked action checklist',
}

export const buildGuidanceSection = (ctx: PromptContext): string => {
  const options = ctx.promptOptions
  const depthInstruction = options.depth === 'detailed'
    ? 'Use a detailed answer with evidence, caveats, and a short final action plan.'
    : 'Keep the answer simple, direct, and easy for a non-expert to follow.'

  return `## Response Guidance

- Investor lens: ${lensLabels[options.lens]}.
- Output format: ${outputLabels[options.output]}.
- Depth: ${depthInstruction}
- Use only the portfolio data provided here plus clearly labeled general market knowledge.
- Do not invent missing prices, dividend yields, valuations, or tax facts.
- Call out stale, missing, or assumed data before making a recommendation.
- Separate facts from assumptions.
- Avoid presenting buy or sell actions as certainty.
- End with what I should verify before acting.
${options.includeProfile && ctx.hasProfile ? '- Use the investor profile when judging risk and suitability.' : '- If investor profile is missing or excluded, state the risk assumptions you are using.'}
${options.includeTax && ctx.hasTaxFreeData ? '- Include Slovak tax-free lot status when it changes the decision.' : '- Do not make tax-specific claims unless the provided data supports them.'}
${options.includeTransactions ? '- Use transaction history when it is relevant to the selected question.' : '- Ignore transaction history unless the question explicitly asks for it.'}
${options.askClarifyingQuestions ? '- Before final recommendations, ask up to 3 clarifying questions if the missing answer would materially change the advice.' : '- If assumptions are needed, state them and continue without a long interview.'}`
}
