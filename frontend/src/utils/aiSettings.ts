import { AISettings, AI_SETTINGS_KEY } from '../components/ai/types'

export const loadAISettings = (): AISettings => {
  try {
    const stored = localStorage.getItem(AI_SETTINGS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        provider: parsed.provider || 'openai',
        profile: parsed.profile
      }
    }
  } catch { /* ignore */ }
  return { provider: 'openai' }
}

export const saveAISettings = (settings: AISettings) => {
  try {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings))
  } catch { /* ignore */ }
}
