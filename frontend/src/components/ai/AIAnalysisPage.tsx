import React, { useState, useEffect } from 'react'
import {
  ArrowLeft,
  Bot,
  ChevronRight,
  Check,
  Copy,
  Inbox,
  User as UserIcon,
} from 'lucide-react'
import { Holding, PortfolioSummary, TaxFreeHolding } from '../../types'
import { usePortfolioContext } from './hooks/usePortfolioContext'
import { ALL_PROMPTS, PROMPTS_BY_ID, PromptType } from './prompts'
import { loadAISettings } from '../../utils/aiSettings'
import { taxService } from '../../services/taxService'

interface AIAnalysisPageProps {
  holdings: Holding[]
  summary: PortfolioSummary | null
  onNavigateToTab?: (tab: 'settings') => void
}

const QUESTIONS = ALL_PROMPTS.map(p => ({
  id: p.id as PromptType,
  question: p.question,
  Icon: p.icon,
}))

export const AIAnalysisPage: React.FC<AIAnalysisPageProps> = ({ holdings, summary, onNavigateToTab }) => {
  const [selectedPrompt, setSelectedPrompt] = useState<PromptType | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [taxFreeData, setTaxFreeData] = useState<TaxFreeHolding[] | null>(null)

  const settings = loadAISettings()

  useEffect(() => {
    if (holdings.length > 0) {
      taxService.getTaxFreeHoldings().then(setTaxFreeData).catch(() => setTaxFreeData(null))
    }
  }, [holdings.length])

  const { promptContext } = usePortfolioContext(holdings, summary, settings, taxFreeData)

  const prompt = selectedPrompt && promptContext
    ? PROMPTS_BY_ID[selectedPrompt].generate(promptContext)
    : ''

  const handleCopy = async () => {
    if (!prompt) return
    setCopyError(null)
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
      setCopyError('Could not copy to clipboard. Select the text above and copy manually.')
      setTimeout(() => setCopyError(null), 5000)
    }
  }

  const handleSelectQuestion = (id: PromptType) => {
    setSelectedPrompt(id)
  }

  const handleBack = () => {
    setSelectedPrompt(null)
  }

  // Empty state
  if (!holdings.length) {
    return (
      <div className="p-6">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-white mb-2 font-heading">
          <Bot className="w-6 h-6 text-accent-400" aria-hidden="true" />
          AI Analysis
        </h2>
        <p className="text-gray-400 mb-6">Get AI-powered insights about your portfolio</p>
        <div className="glass rounded-xl p-8 text-center">
          <Inbox className="w-10 h-10 mx-auto mb-4 text-gray-500" aria-hidden="true" />
          <p className="text-gray-400">No holdings to analyze yet.</p>
          <p className="text-gray-500 text-sm mt-2">Add some transactions to get started.</p>
        </div>
      </div>
    )
  }

  const selectedQuestion = QUESTIONS.find(q => q.id === selectedPrompt)

  // Question Selected - Show terminal prompt and copy button
  if (selectedPrompt) {
    return (
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header - Compact horizontal layout */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 rounded-xl text-gray-500 hover:text-white hover:bg-white/5 transition-colors active:scale-95 flex-shrink-0 touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 focus-visible:outline-offset-2"
            aria-label="Go back to question list"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </button>

          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-accent-600 flex items-center justify-center flex-shrink-0" aria-hidden="true">
              {selectedQuestion && <selectedQuestion.Icon className="w-5 h-5 text-white" />}
            </div>
            <h2 className="text-lg font-semibold text-white tracking-tight leading-tight">
              {selectedQuestion?.question}
            </h2>
          </div>
        </div>

        {/* Terminal Window - Prompt Preview */}
        <div className="bg-surface-dark rounded-xl border border-white/10 overflow-hidden font-mono text-sm">
          {/* Terminal Header */}
          <div className="bg-black/30 px-3 sm:px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5" aria-hidden="true">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-rose-500"></div>
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-amber-500"></div>
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-emerald-500"></div>
              </div>
              <span className="text-gray-500 ml-1 sm:ml-2 text-xs sm:text-sm truncate">
                <span className="hidden sm:inline">ai-prompt://</span>
                {selectedPrompt}
              </span>
            </div>
            <span className="text-gray-600 text-[10px] sm:text-xs flex-shrink-0 ml-2 tabular-nums">
              {prompt.length.toLocaleString()} chars
            </span>
          </div>

          {/* Terminal Content */}
          <div className="p-4 max-h-[60dvh] overflow-y-auto">
            {prompt ? (
              <pre className="text-gray-300 whitespace-pre-wrap text-xs sm:text-sm leading-relaxed">
                {prompt}
              </pre>
            ) : (
              <div className="space-y-2 animate-pulse" aria-busy="true" aria-label="Generating prompt">
                <div className="h-3 bg-white/5 rounded w-1/2"></div>
                <div className="h-3 bg-white/5 rounded w-full"></div>
                <div className="h-3 bg-white/5 rounded w-11/12"></div>
                <div className="h-3 bg-white/5 rounded w-3/4"></div>
              </div>
            )}
          </div>

          {/* Terminal Footer - Copy Button */}
          <div className="bg-black/30 px-3 sm:px-4 py-3 border-t border-white/5 flex items-center justify-between gap-3">
            <p className="text-gray-400 text-xs hidden sm:block">
              Copy and paste into ChatGPT, Claude, or Gemini
            </p>
            <button
              onClick={handleCopy}
              disabled={!prompt}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                copied
                  ? 'bg-emerald-500 text-white'
                  : 'bg-accent-600 hover:bg-accent-700 text-white'
              }`}
              aria-label={copied ? 'Prompt copied to clipboard' : 'Copy prompt to clipboard'}
            >
              {copied ? (
                <Check className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />
              ) : (
                <Copy className="w-4 h-4" aria-hidden="true" />
              )}
              {/* Keyed so React remounts the span on state flip — combined with
                  fade-in animation this produces a subtle crossfade rather than a snap.
                  aria-live ensures screen readers still announce the success state. */}
              <span
                key={copied ? 'copied' : 'idle'}
                aria-live="polite"
                aria-atomic="true"
                className="animate-fade-in"
              >
                {copied ? 'Copied!' : 'Copy Prompt'}
              </span>
            </button>
          </div>
        </div>

        {/* Copy error (visible + announced) */}
        {copyError && (
          <p role="alert" className="text-loss text-xs text-center">
            {copyError}
          </p>
        )}

        {/* Hint */}
        <p className="text-gray-400 text-xs text-center">
          Works with ChatGPT, Claude, Gemini, or any AI assistant
        </p>
      </div>
    )
  }

  // Default View - Question List
  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-xl sm:text-2xl font-bold text-white mb-1 tracking-tight font-heading">
          <Bot className="w-6 h-6 text-accent-400" aria-hidden="true" />
          What would you like to know?
        </h2>
        <p className="text-gray-400 text-sm">
          Select a question to generate a prompt for your favorite AI
        </p>
      </div>

      <div className="space-y-2">
        {QUESTIONS.map((q) => (
          <button
            key={q.id}
            onClick={() => handleSelectQuestion(q.id)}
            className="w-full text-left px-4 py-3.5 rounded-xl glass hover:bg-white/[0.04] hover:border-white/10 transition-colors touch-manipulation group flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <q.Icon className="w-5 h-5 text-accent-400 flex-shrink-0" aria-hidden="true" />
              <span className="text-white font-medium">{q.question}</span>
            </div>
            <ChevronRight
              className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0"
              aria-hidden="true"
            />
          </button>
        ))}
      </div>

      <div className="text-center pt-2 space-y-1.5">
        <p className="text-gray-400 text-xs">
          Prompts include your portfolio data{taxFreeData?.length ? ' and tax-free status' : ''} for personalized analysis
        </p>
        {onNavigateToTab && (
          <button
            onClick={() => onNavigateToTab('settings')}
            className="text-accent-400 hover:text-accent-300 text-sm transition-colors inline-flex items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 focus-visible:outline-offset-2 rounded"
          >
            <UserIcon className="w-4 h-4" aria-hidden="true" />
            Set your investor profile for tailored advice
          </button>
        )}
      </div>
    </div>
  )
}
