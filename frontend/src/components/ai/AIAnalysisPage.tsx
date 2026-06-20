import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Inbox,
  Library,
  Settings,
  Sparkles,
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

interface AIAnalysisPageProps {
  holdings: Holding[]
  summary: PortfolioSummary | null
  onNavigateToTab?: (tab: 'settings') => void
}

const PROMPT_GROUPS = [
  {
    id: 'popular' as const,
    title: 'Most useful',
    description: 'Quick reads for everyday portfolio decisions.',
  },
  {
    id: 'advanced' as const,
    title: 'Focused tools',
    description: 'Narrow prompts when you need one clean answer.',
  },
]

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
  const [selectedTicker, setSelectedTicker] = useState('')
  const [promptOptions, setPromptOptions] = useState<PromptOptions>(DEFAULT_PROMPT_OPTIONS)

  const settings = loadAISettings()

  useEffect(() => {
    if (holdings.length > 0) {
      taxService.getTaxFreeHoldings().then(setTaxFreeData).catch(() => setTaxFreeData(null))
    }
  }, [holdings.length])

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

    window.addEventListener('guestTransactionsUpdated', handleTransactionsUpdated)
    window.addEventListener('storage', handleTransactionsUpdated)

    return () => {
      window.removeEventListener('guestTransactionsUpdated', handleTransactionsUpdated)
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

  const promptGroups = useMemo(() => (
    PROMPT_GROUPS.map(group => ({
      ...group,
      prompts: ALL_PROMPTS.filter(promptDefinition => promptDefinition.category === group.id),
    }))
  ), [])

  const recommendedPrompt = PROMPTS_BY_ID.analysis
  const hasTaxContext = taxFreeData !== null

  const contextStats = [
    {
      label: 'Holdings',
      value: holdings.length.toString(),
      detail: 'Current positions',
      Icon: Database,
    },
    {
      label: 'Transactions',
      value: transactions.length.toString(),
      detail: 'Local history',
      Icon: Library,
    },
    {
      label: 'Tax lots',
      value: hasTaxContext ? 'Ready' : 'Pending',
      detail: hasTaxContext ? 'Included in prompts' : 'Loaded when available',
      Icon: CheckCircle2,
    },
  ]

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

  const promptControls = (
    <section className="rounded-lg border border-white/10 bg-surface-dark/80 p-3 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-white">Prompt controls</h3>
            <span className="rounded-full border border-accent-500/20 bg-accent-500/10 px-2 py-0.5 text-xs font-medium text-accent-300">
              Applied live
            </span>
          </div>
          <p className="text-sm text-gray-500">These settings are inserted into the prompt you copy.</p>
        </div>

        <div className="flex flex-wrap gap-1.5 sm:justify-end">
          {activeOptionSummary.map(option => (
            <span
              key={option}
              className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] font-medium text-gray-300"
            >
              {option}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 sm:mt-4 grid gap-3 sm:gap-4 lg:grid-cols-3">
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
              <div className="flex gap-1.5" aria-hidden="true">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-rose-500"></div>
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-amber-500"></div>
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-emerald-500"></div>
              </div>
              <span className="text-gray-500 ml-1 sm:ml-2 text-xs sm:text-sm truncate">
                <span className="hidden sm:inline">ready prompt</span>
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
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-white/10 bg-surface-dark/80 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-2 sm:mb-3 inline-flex items-center gap-2 rounded-full border border-accent-500/20 bg-accent-500/10 px-3 py-1 text-xs font-medium text-accent-300">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Portfolio AI workspace
              </div>
              <h2 className="flex items-center gap-2 text-xl sm:text-3xl font-bold text-white mb-1.5 sm:mb-2 tracking-tight font-heading">
                <Bot className="w-6 h-6 sm:w-7 sm:h-7 text-accent-400" aria-hidden="true" />
                Ask better questions
              </h2>
              <p className="text-gray-400 text-sm sm:text-base leading-relaxed max-w-[34rem]">
                Choose a ready prompt, review the portfolio context, then copy it into the assistant you trust.
              </p>
            </div>

            {onNavigateToTab && (
              <button
                onClick={() => onNavigateToTab('settings')}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-medium text-gray-200 transition-colors hover:border-accent-500/40 hover:bg-accent-500/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 focus-visible:outline-offset-2"
              >
                <Settings className="w-4 h-4" aria-hidden="true" />
                Investor profile
              </button>
            )}
          </div>

          <div className="mt-4 sm:mt-6 grid grid-cols-3 gap-2 sm:gap-3">
            {contextStats.map(({ label, value, detail, Icon }) => (
              <div key={label} className="rounded-lg border border-white/10 bg-white/[0.025] p-2.5 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-gray-500 truncate">{label}</p>
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent-400 flex-shrink-0" aria-hidden="true" />
                </div>
                <p className="mt-1.5 sm:mt-2 text-base sm:text-xl font-semibold text-white tabular-nums truncate">{value}</p>
                <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-gray-500 truncate">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-accent-500/20 bg-accent-500/[0.07] p-4 sm:p-5">
          <div className="flex items-center gap-2 text-accent-300">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            <p className="text-sm font-semibold">Recommended first</p>
          </div>
          <h3 className="mt-3 sm:mt-4 text-lg sm:text-xl font-semibold text-white leading-snug">{recommendedPrompt.question}</h3>
          <p className="mt-2 text-sm leading-relaxed text-gray-400">{recommendedPrompt.description}</p>
          <button
            onClick={() => handleSelectQuestion(recommendedPrompt.id)}
            className="mt-4 sm:mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 focus-visible:outline-offset-2"
          >
            Build this prompt
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </section>
      </div>

      {promptControls}

      <div className="space-y-4 sm:space-y-6">
        {promptGroups.map(group => (
          <section key={group.id} className="space-y-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{group.title}</h3>
                <p className="text-xs sm:text-sm text-gray-500">{group.description}</p>
              </div>
            </div>

            <div className="grid gap-2.5 sm:gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.prompts.map((promptDefinition) => {
                const PromptIcon = promptDefinition.icon
                return (
                  <button
                    key={promptDefinition.id}
                    onClick={() => handleSelectQuestion(promptDefinition.id)}
                    className="group min-h-[124px] sm:min-h-[160px] rounded-lg border border-white/10 bg-surface-dark/80 p-3.5 sm:p-4 text-left transition-colors hover:border-accent-500/35 hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 focus-visible:outline-offset-2"
                  >
                    <div className="flex h-full flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <span className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg border border-accent-500/20 bg-accent-500/10">
                          <PromptIcon className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-accent-300" aria-hidden="true" />
                        </span>
                        <ArrowRight className="mt-1 h-4 w-4 text-gray-600 transition-colors group-hover:text-accent-300" aria-hidden="true" />
                      </div>
                      <div className="mt-3 sm:mt-4 flex-1">
                        <h4 className="text-base font-semibold leading-snug text-white">{promptDefinition.question}</h4>
                        <p className="mt-1.5 sm:mt-2 text-sm leading-relaxed text-gray-400">{promptDefinition.description}</p>
                      </div>
                      <p className="mt-3 sm:mt-4 text-xs font-medium uppercase tracking-wide text-gray-600">
                        {promptDefinition.category === 'popular' ? 'Everyday' : 'Advanced'}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="rounded-lg border border-white/10 bg-surface-dark/70 p-4 text-center">
        <p className="text-gray-400 text-xs">
          Prompts include portfolio data{hasTaxContext ? ', tax-free status,' : ''} and investor profile when available.
        </p>
      </div>
    </div>
  )
}
