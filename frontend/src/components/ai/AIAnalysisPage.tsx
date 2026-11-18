import React, { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  Copy,
  Inbox,
} from 'lucide-react'
import { Holding, PortfolioSummary, TaxFreeHolding, Transaction } from '../../types'
import { usePortfolioContext } from './hooks/usePortfolioContext'
import { PROMPTS_BY_ID } from './prompts'
import { loadAISettings } from '../../utils/aiSettings'
import { taxService } from '../../services/taxService'
import { transactionService } from '../../services/transactionService'
import { api } from '../../services/api'
import { subscribeBrowserPortfolioState } from '../../services/browserPortfolioState'
import { ExchangeRateContext } from './prompts/types'

interface AIAnalysisPageProps {
  holdings: Holding[]
  summary: PortfolioSummary | null
}

type PrimaryPromptType = 'analysis' | 'buffett'

const PRIMARY_PROMPT_IDS: PrimaryPromptType[] = ['analysis', 'buffett']

export const AIAnalysisPage: React.FC<AIAnalysisPageProps> = ({ holdings, summary }) => {
  const [selectedPrompt, setSelectedPrompt] = useState<PrimaryPromptType | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [taxFreeData, setTaxFreeData] = useState<TaxFreeHolding[] | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [exchangeRates, setExchangeRates] = useState<ExchangeRateContext | null>(null)

  const settings = loadAISettings()

  useEffect(() => {
    if (holdings.length > 0) {
      taxService.getTaxFreeHoldings().then(setTaxFreeData).catch(() => setTaxFreeData(null))
    }
  }, [holdings.length])

  useEffect(() => {
    let cancelled = false

    const loadExchangeRates = async () => {
      try {
        const response = await api.get('/api/exchange-rates')
        const rates = response.data?.rates
        if (!cancelled && typeof rates?.EUR_USD === 'number' && typeof rates?.USD_EUR === 'number') {
          setExchangeRates({
            eurUsd: rates.EUR_USD,
            usdEur: rates.USD_EUR,
            updatedAt: response.data?.updated_at ?? null,
            source: response.data?.source ?? 'unknown',
          })
        }
      } catch {
        if (!cancelled) setExchangeRates(null)
      }
    }

    void loadExchangeRates()

    return () => {
      cancelled = true
    }
  }, [])

  const loadTransactions = useCallback(async () => {
    try {
      const data = await transactionService.getAll()
      setTransactions(data)
    } catch {
      setTransactions([])
    }
  }, [])

  useEffect(() => {
    void loadTransactions()

    const handleTransactionsUpdated = () => {
      void loadTransactions()
    }

    const unsubscribe = subscribeBrowserPortfolioState(handleTransactionsUpdated)
    window.addEventListener('storage', handleTransactionsUpdated)

    return () => {
      unsubscribe()
      window.removeEventListener('storage', handleTransactionsUpdated)
    }
  }, [loadTransactions])

  const { promptContext } = usePortfolioContext(
    holdings,
    summary,
    settings,
    taxFreeData,
    transactions,
    exchangeRates
  )

  const prompt = selectedPrompt && promptContext
    ? PROMPTS_BY_ID[selectedPrompt].generate(promptContext)
    : ''

  const hasTaxContext = taxFreeData !== null

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

  const handleSelectQuestion = (id: PrimaryPromptType) => {
    setCopied(false)
    setCopyError(null)
    setSelectedPrompt(id)
  }

  const contextSummary = [
    `${holdings.length} holdings`,
    `${transactions.length} transactions`,
    hasTaxContext ? 'tax lots ready' : 'tax lots loading',
  ].join(', ')

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

  const selectedQuestion = selectedPrompt ? PROMPTS_BY_ID[selectedPrompt] : null

  // Question Selected - Show prompt review and copy button
  if (selectedPrompt) {
    const SelectedPromptIcon = selectedQuestion?.icon

    return (
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <button
            onClick={handleBack}
            className="min-h-11 min-w-11 p-2 -ml-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors active:scale-95 flex-shrink-0 touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 focus-visible:outline-offset-2"
            aria-label="Go back to prompt library"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-accent-600/20 border border-accent-500/25 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                {SelectedPromptIcon && <SelectedPromptIcon className="w-5 h-5 text-white" />}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-accent-300">Prompt preview</p>
                <h2 className="text-base sm:text-xl font-semibold text-white tracking-tight leading-tight">
                  {selectedQuestion?.question}
                </h2>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-gray-400 mt-2 max-w-2xl">
              Review the context, then copy the finished prompt into your preferred AI assistant.
            </p>
          </div>
        </div>

        <div className="bg-surface-dark rounded-lg border border-white/10 overflow-hidden font-mono text-sm">
          <div className="bg-black/30 px-3 sm:px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Copy className="h-4 w-4 text-gray-500" aria-hidden="true" />
              <span className="text-gray-500 text-xs sm:text-sm truncate">
                <span className="hidden sm:inline">Generated prompt</span>
                <span className="sm:hidden">prompt</span>
              </span>
            </div>
            <span className="text-gray-600 text-[10px] sm:text-xs flex-shrink-0 ml-2 tabular-nums">
              {prompt.length.toLocaleString()} chars
            </span>
          </div>

          {/* Terminal Content */}
          <div className="p-3 sm:p-4 max-h-[52dvh] sm:max-h-[60dvh] overflow-y-auto">
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
          <div className="bg-black/30 px-3 sm:px-4 py-3 border-t border-white/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-gray-400 text-xs hidden sm:block">
              Copy and paste into ChatGPT, Claude, or Gemini
            </p>
            <button
              onClick={handleCopy}
              disabled={!prompt}
              className={`w-full sm:w-auto min-h-11 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
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
              {/* Keyed so React remounts the span on state flip; combined with
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

  // Default View - Prompt Library
  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-5">
      <section className="rounded-lg border border-white/10 bg-surface-dark/80 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-accent-400" aria-hidden="true" />
              <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-white font-heading">
                AI prompts
              </h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-gray-400">
              Your current portfolio is included automatically.
            </p>
            <p className="mt-2 text-xs text-gray-500">{contextSummary}</p>
          </div>
        </div>
      </section>

      <section className="space-y-3.5">
        <div className="grid gap-2.5 sm:gap-3 md:grid-cols-2">
          {PRIMARY_PROMPT_IDS.map(id => {
            const promptDefinition = PROMPTS_BY_ID[id]
            const PromptIcon = promptDefinition.icon
            return (
              <button
                key={promptDefinition.id}
                onClick={() => handleSelectQuestion(id)}
                className="group min-h-[112px] rounded-lg border border-accent-500/25 bg-surface-dark/80 p-3.5 text-left transition-colors hover:border-accent-400/50 hover:bg-accent-500/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 focus-visible:outline-offset-2 sm:p-4"
              >
                <div className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg border border-accent-500/20 bg-accent-500/10">
                      <PromptIcon className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-accent-300" aria-hidden="true" />
                    </span>
                    <span className="flex items-center gap-2">
                      {id === 'analysis' && <span className="text-xs font-medium text-accent-300">Recommended</span>}
                      <ArrowRight className="mt-1 h-4 w-4 text-gray-600 transition-colors group-hover:text-accent-300" aria-hidden="true" />
                    </span>
                  </div>
                  <div className="mt-3">
                    <h4 className="text-base font-semibold leading-snug text-white">{promptDefinition.label}</h4>
                    <p className="mt-1.5 sm:mt-2 text-sm leading-relaxed text-gray-400">{promptDefinition.description}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-gray-400">Copy and paste into ChatGPT, Claude, Gemini, or any AI assistant.</p>
      </section>
    </div>
  )
}
