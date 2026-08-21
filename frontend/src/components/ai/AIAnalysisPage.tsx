import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  Copy,
  Inbox,
  Settings,
  SlidersHorizontal,
} from 'lucide-react'
import { Holding, PortfolioSummary, TaxFreeHolding, Transaction } from '../../types'
import { usePortfolioContext } from './hooks/usePortfolioContext'
import {
  ALL_PROMPTS,
  DEFAULT_PROMPT_OPTIONS,
  PROMPTS_BY_ID,
  PromptDepth,
  PromptLens,
  PromptOptions,
  PromptOutput,
  PromptType,
} from './prompts'
import { loadAISettings } from '../../utils/aiSettings'
import { taxService } from '../../services/taxService'
import { transactionService } from '../../services/transactionService'
import { api } from '../../services/api'
import { subscribeBrowserPortfolioState } from '../../services/browserPortfolioState'
import { ExchangeRateContext } from './prompts/types'

interface AIAnalysisPageProps {
  holdings: Holding[]
  summary: PortfolioSummary | null
  onNavigateToTab?: (tab: 'settings') => void
}

const PROMPT_LIBRARY = {
  title: 'Choose a prompt',
  description: 'Pick one, review the generated text, then copy it.',
}

const DEPTH_OPTIONS: { value: PromptDepth; label: string }[] = [
  { value: 'simple', label: 'Simple' },
  { value: 'detailed', label: 'Detailed' },
]

const LENS_OPTIONS: { value: PromptLens; label: string }[] = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'conservative', label: 'Conservative' },
  { value: 'growth', label: 'Growth' },
  { value: 'income', label: 'Income' },
  { value: 'core-satellite', label: 'Core-satellite' },
]

const OUTPUT_OPTIONS: { value: PromptOutput; label: string }[] = [
  { value: 'checklist', label: 'Checklist' },
  { value: 'table', label: 'Table' },
  { value: 'summary', label: 'Summary' },
]

export const AIAnalysisPage: React.FC<AIAnalysisPageProps> = ({ holdings, summary, onNavigateToTab }) => {
  const [selectedPrompt, setSelectedPrompt] = useState<PromptType | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [taxFreeData, setTaxFreeData] = useState<TaxFreeHolding[] | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [exchangeRates, setExchangeRates] = useState<ExchangeRateContext | null>(null)
  const [selectedTicker, setSelectedTicker] = useState('')
  const [promptOptions, setPromptOptions] = useState<PromptOptions>(DEFAULT_PROMPT_OPTIONS)
  const [showPromptControls, setShowPromptControls] = useState(false)

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

  const tickerOptions = useMemo(() => {
    const tickers = new Set<string>()
    holdings.forEach(h => tickers.add(h.ticker))
    transactions.forEach(t => tickers.add(t.ticker))
    return Array.from(tickers).sort()
  }, [holdings, transactions])

  useEffect(() => {
    if (tickerOptions.length > 0 && !tickerOptions.includes(selectedTicker)) {
      setSelectedTicker(tickerOptions[0])
    }
  }, [tickerOptions, selectedTicker])

  const { promptContext } = usePortfolioContext(
    holdings,
    summary,
    settings,
    taxFreeData,
    transactions,
    exchangeRates,
    selectedTicker,
    '',
    promptOptions
  )

  const prompt = selectedPrompt && promptContext
    ? PROMPTS_BY_ID[selectedPrompt].generate(promptContext)
    : ''

  const selectedTickerTransactionCount = useMemo(() => {
    if (!selectedTicker) return 0
    return transactions.filter(t => t.ticker.toUpperCase() === selectedTicker.toUpperCase()).length
  }, [selectedTicker, transactions])

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

  const handleSelectQuestion = (id: PromptType) => {
    setSelectedPrompt(id)
  }

  const updatePromptOptions = <Key extends keyof PromptOptions>(
    key: Key,
    value: PromptOptions[Key]
  ) => {
    setPromptOptions(current => ({ ...current, [key]: value }))
  }

  const activeOptionSummary = [
    DEPTH_OPTIONS.find(option => option.value === promptOptions.depth)?.label,
    LENS_OPTIONS.find(option => option.value === promptOptions.lens)?.label,
    OUTPUT_OPTIONS.find(option => option.value === promptOptions.output)?.label,
    promptOptions.includeProfile ? 'Profile' : null,
    promptOptions.includeTax ? 'Tax' : null,
    promptOptions.includeTransactions ? 'Transactions' : null,
    promptOptions.askClarifyingQuestions ? 'Ask first' : null,
  ].filter(Boolean)

  const promptControlItems = [
    {
      key: 'includeProfile' as const,
      label: 'Investor profile',
      detail: settings.profile ? 'Use suitability context' : 'Uses assumptions if empty',
    },
    {
      key: 'includeTax' as const,
      label: 'Tax status',
      detail: hasTaxContext ? 'Include Slovak lots' : 'Use when available',
    },
    {
      key: 'includeTransactions' as const,
      label: 'Transactions',
      detail: `${transactions.length} records loaded`,
    },
    {
      key: 'askClarifyingQuestions' as const,
      label: 'Ask first',
      detail: 'Request missing inputs',
    },
  ]

  const contextSummary = [
    `${holdings.length} holdings`,
    `${transactions.length} transactions`,
    hasTaxContext ? 'tax lots ready' : 'tax lots loading',
  ].join(', ')

  const promptControls = (
    <section className="rounded-lg border border-white/10 bg-surface-dark/70">
      <button
        type="button"
        onClick={() => setShowPromptControls(current => !current)}
        aria-expanded={showPromptControls}
        className="flex w-full flex-col gap-3 p-3 text-left transition-colors hover:bg-white/[0.025] sm:flex-row sm:items-center sm:justify-between sm:p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 focus-visible:outline-offset-2"
      >
        <span className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
            <SlidersHorizontal className="h-4 w-4 text-gray-300" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-white">Prompt settings</span>
            <span className="mt-0.5 block truncate text-xs text-gray-500">
              {activeOptionSummary.join(', ')}
            </span>
          </span>
        </span>
        <span className="text-xs font-medium text-accent-300">
          {showPromptControls ? 'Hide' : 'Adjust'}
        </span>
      </button>

      <div className={`${showPromptControls ? 'block' : 'hidden'} border-t border-white/10 p-3 sm:p-4`}>
        <p className="mb-3 text-xs text-gray-500">These settings are inserted into the prompt you copy.</p>

        <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Depth</p>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
              {DEPTH_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => updatePromptOptions('depth', option.value)}
                  className={`min-h-11 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    promptOptions.depth === option.value
                      ? 'bg-accent-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label>
            <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">Investor lens</span>
            <select
              value={promptOptions.lens}
              onChange={(event) => updatePromptOptions('lens', event.target.value as PromptLens)}
              className="w-full min-h-11 rounded-lg border border-white/10 bg-surface-elevated px-3 py-2.5 text-base sm:text-sm text-white outline-none transition-colors focus:border-accent-400"
            >
              {LENS_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Output</p>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
              {OUTPUT_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => updatePromptOptions('output', option.value)}
                  className={`min-h-11 rounded-md px-1.5 py-2 text-xs sm:text-sm font-medium transition-colors ${
                    promptOptions.output === option.value
                      ? 'bg-accent-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 sm:mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
          {promptControlItems.map(option => (
            <label
              key={option.key}
              className="flex min-h-[72px] cursor-pointer items-start gap-2.5 rounded-lg border border-white/10 bg-white/[0.025] p-2.5 sm:p-3 transition-colors hover:bg-white/[0.04]"
            >
              <input
                type="checkbox"
                checked={promptOptions[option.key]}
                onChange={(event) => updatePromptOptions(option.key, event.target.checked)}
                className="mt-0.5 h-5 w-5 rounded border-white/20 bg-surface-elevated text-accent-500 focus:ring-accent-500"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-white">{option.label}</span>
                <span className="block text-[11px] sm:text-xs leading-snug text-gray-500">{option.detail}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </section>
  )

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
    const isTickerTransactionsPrompt = selectedPrompt === 'taxBacktest'
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

        {isTickerTransactionsPrompt && (
          <div className="rounded-lg border border-white/10 bg-surface-dark/80 p-3 sm:p-4">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <p className="text-sm font-semibold text-white">Ticker input</p>
                <p className="text-xs text-gray-400">
                  {promptOptions.includeTransactions
                    ? `${selectedTickerTransactionCount} transaction${selectedTickerTransactionCount === 1 ? '' : 's'} will be included.`
                    : 'Transaction history is excluded by the current options.'}
                </p>
              </div>
              <span className="rounded-full border border-accent-500/20 bg-accent-500/10 px-2.5 py-1 text-xs text-accent-300">
                Required
              </span>
            </div>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Ticker</span>
              <select
                value={selectedTicker}
                onChange={(event) => setSelectedTicker(event.target.value)}
                className="w-full min-h-11 rounded-lg border border-white/10 bg-surface-elevated px-3 py-2.5 text-base sm:text-sm text-white outline-none transition-colors focus:border-accent-400"
              >
                {tickerOptions.map(ticker => (
                  <option key={ticker} value={ticker}>{ticker}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {promptControls}

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
              Choose a prompt, review the generated context, then copy it.
            </p>
            <p className="mt-2 text-xs text-gray-500">{contextSummary}</p>
          </div>

          {onNavigateToTab && (
            <button
              onClick={() => onNavigateToTab('settings')}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-medium text-gray-200 transition-colors hover:border-accent-500/40 hover:bg-accent-500/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 focus-visible:outline-offset-2"
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
              Investor profile
            </button>
          )}
        </div>
      </section>

      {promptControls}

      <section className="space-y-3.5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">{PROMPT_LIBRARY.title}</h3>
            <p className="text-xs sm:text-sm text-gray-500">{PROMPT_LIBRARY.description}</p>
          </div>
          <p className="text-xs text-gray-500">Works with ChatGPT, Claude, Gemini, or any AI assistant</p>
        </div>

        <div className="grid gap-2.5 sm:gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ALL_PROMPTS.map((promptDefinition) => {
            const PromptIcon = promptDefinition.icon
            const isRecommended = promptDefinition.id === 'analysis'
            return (
              <button
                key={promptDefinition.id}
                onClick={() => handleSelectQuestion(promptDefinition.id)}
                className={`group min-h-[112px] rounded-lg border p-3.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 focus-visible:outline-offset-2 sm:p-4 ${
                  isRecommended
                    ? 'border-accent-500/35 bg-accent-500/[0.06] hover:border-accent-400/50 hover:bg-accent-500/[0.09]'
                    : 'border-white/10 bg-surface-dark/80 hover:border-accent-500/30 hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg border border-accent-500/20 bg-accent-500/10">
                      <PromptIcon className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-accent-300" aria-hidden="true" />
                    </span>
                    <span className="flex items-center gap-2">
                      {isRecommended && (
                        <span className="rounded-full border border-accent-500/20 bg-accent-500/10 px-2 py-0.5 text-[11px] font-medium text-accent-300">
                          Recommended
                        </span>
                      )}
                      <ArrowRight className="mt-1 h-4 w-4 text-gray-600 transition-colors group-hover:text-accent-300" aria-hidden="true" />
                    </span>
                  </div>
                  <div className="mt-3">
                    <h4 className="text-base font-semibold leading-snug text-white">{promptDefinition.question}</h4>
                    <p className="mt-1.5 sm:mt-2 text-sm leading-relaxed text-gray-400">{promptDefinition.description}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
