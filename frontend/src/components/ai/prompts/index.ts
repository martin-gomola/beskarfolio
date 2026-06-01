export * from './types'

import { snapshotPrompt } from './snapshot'
import { analysisPrompt } from './analysis'
import { rebalancePrompt } from './rebalance'
import { dividendsPrompt } from './dividends'
import { buffettPrompt } from './buffett'
import { taxBacktestPrompt } from './taxBacktest'

import { PromptDefinition, PromptType } from './types'

export const ALL_PROMPTS: PromptDefinition[] = [
  snapshotPrompt,
  analysisPrompt,
  rebalancePrompt,
  dividendsPrompt,
  buffettPrompt,
  taxBacktestPrompt,
]

export const PROMPTS_BY_ID: Record<PromptType, PromptDefinition> = {
  snapshot: snapshotPrompt,
  analysis: analysisPrompt,
  rebalance: rebalancePrompt,
  dividends: dividendsPrompt,
  buffett: buffettPrompt,
  taxBacktest: taxBacktestPrompt,
}

// Kept for backwards compatibility with any external consumers of the label/emoji/description metadata.
export const PROMPT_TEMPLATES: Record<PromptType, { label: string; emoji: string; description: string }> =
  Object.fromEntries(
    ALL_PROMPTS.map(p => [p.id, { label: p.label, emoji: p.emoji, description: p.description }])
  ) as Record<PromptType, { label: string; emoji: string; description: string }>
