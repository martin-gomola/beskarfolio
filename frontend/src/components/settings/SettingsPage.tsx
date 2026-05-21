import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { priceService, api } from '../../services'
import { APP_VERSION } from '../../utils/version'
import { formatBackupDate, detectDevice } from '../../utils/backupService'
import { GUEST_STORAGE_KEY } from '../../utils/constants'
import { loadAISettings, saveAISettings } from '../../utils/aiSettings'
import { Terminal, useTerminal } from '../common/Terminal'
import { useServiceWorkerUpdate } from '../../hooks/useServiceWorkerUpdate'
import type { InvestmentGoal, InvestmentHorizon, AISettings } from '../ai/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HORIZON_OPTIONS: Record<InvestmentHorizon, { label: string }> = {
  'short': { label: '< 3 years' },
  'medium': { label: '3-10 years' },
  'long': { label: '10-20 years' },
  'very-long': { label: '20+ years' }
}

const GOAL_OPTIONS: Record<InvestmentGoal, { label: string; emoji: string; description: string }> = {
  'growth': { label: 'Growth', emoji: '📈', description: 'Maximize long-term capital appreciation' },
  'income': { label: 'Income', emoji: '💰', description: 'Generate regular dividend income' },
  'preservation': { label: 'Preservation', emoji: '🛡️', description: 'Protect capital, minimize risk' },
  'retirement': { label: 'Retirement', emoji: '🏖️', description: 'Build nest egg for retirement' },
  'balanced': { label: 'Balanced', emoji: '⚖️', description: 'Mix of growth and income' }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HistoricalTickerStatus = {
  ticker: string
  has_csv: boolean
  rows?: number
  csv_earliest_date?: string
  csv_latest_date?: string
  file_size_kb?: number
  price_age_hours?: number | null
  price_source?: string
}

type HistoricalStatusResponse = {
  success: boolean
  mode: 'guest' | 'database'
  portfolio: HistoricalTickerStatus[]
  csv_only: HistoricalTickerStatus[]
}

// ---------------------------------------------------------------------------
// Shared UI primitives
// ---------------------------------------------------------------------------

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface-dark rounded-xl border border-white/[0.06] p-4 sm:p-5 ${className}`}>
      {children}
    </div>
  )
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-gray-300 mb-3 tracking-wide uppercase">{children}</h3>
}

function StatRow({ label, value, valueClass = 'text-gray-300' }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className={`text-sm tabular-nums ${valueClass}`}>{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const DATE_FMT = new Intl.DateTimeFormat(undefined, { year: '2-digit', month: 'short', day: 'numeric' })

function TickerTable({ rows }: { rows: HistoricalTickerStatus[] }) {
  const [expanded, setExpanded] = useState(false)

  if (!rows.length) return null

  const formatAge = (hours: number | null | undefined) => {
    if (hours === null || hours === undefined) return '—'
    if (hours < 1) return '<1h'
    if (hours < 24) return `${Math.round(hours)}h`
    return `${Math.floor(hours / 24)}d`
  }

  const formatDate = (iso: string | undefined) => {
    if (!iso) return '—'
    return DATE_FMT.format(new Date(iso))
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors w-full text-left py-1"
        aria-expanded={expanded}
      >
        <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`} aria-hidden="true">▸</span>
        {rows.length} tickers tracked
      </button>

      {expanded && (
        <div className="mt-2 bg-white/[0.02] rounded-lg border border-white/5 overflow-hidden">
          {/* Mobile */}
          <div className="sm:hidden max-h-48 overflow-y-auto">
            <div className="grid grid-cols-3 gap-1 p-2 text-xs tabular-nums">
              {rows.map((r) => {
                const isStale = r.price_age_hours != null && r.price_age_hours >= 24
                return (
                  <div key={r.ticker} className={`flex items-center gap-1 px-1.5 py-1 rounded ${isStale ? 'bg-amber-500/10' : 'bg-white/5'}`}>
                    <span className="text-gray-300 truncate min-w-0">{r.ticker.replace('.DE', '').replace('.PA', '')}</span>
                    <span className={`ml-auto text-[10px] ${isStale ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {formatAge(r.price_age_hours)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
          {/* Desktop */}
          <div className="hidden sm:block">
            <div className="grid grid-cols-4 gap-2 px-3 py-1.5 text-gray-600 text-[11px] uppercase tracking-wider border-b border-white/5">
              <span>ticker</span>
              <span>range</span>
              <span className="text-right">rows</span>
              <span className="text-right">age</span>
            </div>
            <div className="divide-y divide-white/5 tabular-nums">
              {rows.map((r) => {
                const isStale = r.price_age_hours != null && r.price_age_hours >= 24
                return (
                  <div key={r.ticker} className={`grid grid-cols-4 gap-2 px-3 py-1.5 text-xs ${isStale ? 'bg-amber-500/5' : ''}`}>
                    <span className="text-accent-400 font-mono">{r.ticker}</span>
                    <span className="text-gray-500">{formatDate(r.csv_earliest_date)} → {formatDate(r.csv_latest_date)}</span>
                    <span className="text-gray-400 text-right">{r.rows?.toLocaleString()}</span>
                    <span className={`text-right ${isStale ? 'text-amber-400' : 'text-emerald-400'}`}>{formatAge(r.price_age_hours)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InvestorProfile({ settings, onChange, showSaved }: {
  settings: AISettings
  onChange: (u: Partial<AISettings>) => void
  showSaved: boolean
}) {
  const [localAge, setLocalAge] = useState(String(settings.profile?.age ?? ''))

  const handleAgeBlur = () => {
    const num = parseInt(localAge, 10)
    if (isNaN(num)) {
      onChange({ profile: { ...settings.profile, age: undefined } })
      return
    }
    const clamped = Math.min(100, Math.max(18, num))
    setLocalAge(String(clamped))
    onChange({ profile: { ...settings.profile, age: clamped } })
  }

  return (
    <div className="space-y-3">
      {/* Age */}
      <div>
        <label htmlFor="investor-age" className="text-gray-500 text-xs mb-1 block">Age</label>
        <div className="flex items-center gap-2">
          <input
            id="investor-age"
            type="number"
            inputMode="numeric"
            name="investor_age"
            min={18}
            max={100}
            autoComplete="off"
            spellCheck={false}
            value={localAge}
            onChange={(e) => setLocalAge(e.target.value)}
            onBlur={handleAgeBlur}
            placeholder="35"
            className="w-24 px-3 py-1.5 bg-white/5 border border-white/5 rounded-lg text-gray-200 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-accent-500 tabular-nums"
          />
          <span className="text-gray-600 text-xs">years old</span>
        </div>
      </div>

      {/* Horizon */}
      <div>
        <div className="text-gray-500 text-xs mb-1.5">Horizon</div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Investment horizon">
          {(Object.entries(HORIZON_OPTIONS) as [InvestmentHorizon, typeof HORIZON_OPTIONS[InvestmentHorizon]][]).map(([key, config]) => (
            <button
              key={key}
              role="radio"
              aria-checked={settings.profile?.horizon === key}
              onClick={() => onChange({ profile: { ...settings.profile, horizon: key } })}
              className={`px-2.5 py-1 rounded-lg text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                settings.profile?.horizon === key
                  ? 'bg-accent-600 text-white'
                  : 'bg-white/5 text-gray-400 hover:text-white border border-white/5'
              }`}
            >
              {config.label}
            </button>
          ))}
        </div>
      </div>

      {/* Goal */}
      <div>
        <div className="text-gray-500 text-xs mb-1.5">Goal</div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Investment goal">
          {(Object.entries(GOAL_OPTIONS) as [InvestmentGoal, typeof GOAL_OPTIONS[InvestmentGoal]][]).map(([key, config]) => (
            <button
              key={key}
              role="radio"
              aria-checked={settings.profile?.goal === key}
              onClick={() => onChange({ profile: { ...settings.profile, goal: key } })}
              className={`px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                settings.profile?.goal === key
                  ? 'bg-accent-600 text-white'
                  : 'bg-white/5 text-gray-400 hover:text-white border border-white/5'
              }`}
              title={config.description}
            >
              <span aria-hidden="true">{config.emoji}</span>
              {config.label}
            </button>
          ))}
        </div>
      </div>

      {/* Saved indicator */}
      {showSaved && (
        <div className="text-accent-400 text-xs animate-fade-in" aria-live="polite">Saved</div>
      )}

      <p className="text-gray-600 text-xs">Used by AI analysis for personalized recommendations.</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface SettingsPageProps {
  onDataCleared: () => void
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onDataCleared }) => {
  const [exchangeRates, setExchangeRates] = useState<any>(null)
  const [loadingRates, setLoadingRates] = useState(false)
  const [historyStatus, setHistoryStatus] = useState<HistoricalStatusResponse | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [aiSettings, setAiSettings] = useState<AISettings>(loadAISettings)
  const [showSaved, setShowSaved] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [updateCheckResult, setUpdateCheckResult] = useState<string | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const terminal = useTerminal()
  const { checkForUpdate, checking: checkingUpdate, updateAvailable } = useServiceWorkerUpdate()

  const dataInfo = useMemo(() => {
    try {
      const stored = localStorage.getItem(GUEST_STORAGE_KEY)
      if (!stored) return { transactions: 0, lastUpdated: null }
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) return { transactions: parsed.length, lastUpdated: null }
      return {
        transactions: parsed.transactions?.length || 0,
        lastUpdated: parsed.lastUpdated || null,
      }
    } catch {
      return { transactions: 0, lastUpdated: null }
    }
  }, [terminal.isRunning])

  // Fetchers
  const fetchExchangeRates = async () => {
    setLoadingRates(true)
    try {
      const response = await api.get('/api/exchange-rates')
      setExchangeRates(response.data)
    } catch {
      setExchangeRates(null)
    } finally {
      setLoadingRates(false)
    }
  }

  const fetchStatus = async () => {
    setLoadingStatus(true)
    setHistoryError(null)
    try {
      const data = await priceService.getHistoricalStatus([], false)
      setHistoryStatus(data)
    } catch (e: any) {
      setHistoryError(e?.message || 'Failed to load')
      setHistoryStatus(null)
    } finally {
      setLoadingStatus(false)
    }
  }

  useEffect(() => {
    fetchExchangeRates()
    fetchStatus()
  }, [])

  // Computed
  const staleCount = useMemo(() =>
    (historyStatus?.csv_only || []).filter(r =>
      r.price_source === 'stale_cache' || (r.price_age_hours != null && r.price_age_hours >= 24)
    ).length, [historyStatus])

  const freshCount = useMemo(() =>
    (historyStatus?.csv_only || []).filter(r =>
      r.price_age_hours != null && r.price_age_hours < 24
    ).length, [historyStatus])

  const allCsvRows = useMemo(() => {
    if (!historyStatus?.csv_only) return []
    return [...historyStatus.csv_only].sort((a, b) => a.ticker.localeCompare(b.ticker))
  }, [historyStatus])

  const csvSummary = useMemo(() => {
    if (!allCsvRows.length) return null
    let totalSizeKb = 0
    allCsvRows.forEach(r => { if (r.file_size_kb) totalSizeKb += r.file_size_kb })
    return { total: allCsvRows.length, totalSizeKb }
  }, [allCsvRows])

  const formatRelativeTime = (dateStr: string) => {
    const diffHours = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60)
    if (diffHours < 1) return 'just now'
    if (diffHours < 24) return `${Math.round(diffHours)}h ago`
    return `${Math.floor(diffHours / 24)}d ago`
  }

  // Handlers
  const handleAISettingsChange = useCallback((updates: Partial<AISettings>) => {
    setAiSettings(prev => {
      const next = { ...prev, ...updates }
      saveAISettings(next)
      return next
    })
    setShowSaved(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setShowSaved(false), 1500)
  }, [])

  const handleCheckForUpdate = async () => {
    setUpdateCheckResult(null)
    const result = await checkForUpdate()
    if (result === 'update') {
      setUpdateCheckResult('update')
    } else if (result === 'current') {
      setUpdateCheckResult('current')
      setTimeout(() => setUpdateCheckResult(null), 4000)
    } else {
      setUpdateCheckResult('unavailable')
      setTimeout(() => setUpdateCheckResult(null), 4000)
    }
  }

  const [scriptDone, setScriptDone] = useState(false)

  const handleUpdatePrices = async () => {
    let tickers: string[] = []
    try {
      const txData = localStorage.getItem('beskarfolio_guest_transactions')
      if (txData) {
        const parsed = JSON.parse(txData)
        const txList = parsed.transactions || parsed || []
        tickers = [...new Set(txList.map((t: any) => t.ticker))] as string[]
      }
    } catch { /* ignore */ }

    setScriptDone(false)
    await terminal.run(async () => {
      terminal.addLine('$ ./update_prices.sh', 'command')
      await terminal.sleep(200)
      terminal.addLine(`  → ${tickers.length} tickers: ${tickers.slice(0, 4).join(', ')}${tickers.length > 4 ? '...' : ''}`)
      await terminal.sleep(300)
      terminal.addLine('')
      terminal.addLine('Fetching prices...')
      await terminal.sleep(200)

      try {
        const response = await api.post('/api/prices/update', { tickers, force: false })
        const data = response.data
        terminal.addLine('')
        const tickerResults = data.ticker_results || []
        const cached = tickerResults.filter((r: any) => r.status === 'cached')
        const updated = tickerResults.filter((r: any) => r.status === 'updated')
        const failed = tickerResults.filter((r: any) => r.status === 'failed' || r.status === 'stale')

        if (cached.length > 0) {
          terminal.addLine(`  💾 ${cached.length} cached (< 4h old)`, 'info')
          await terminal.sleep(100)
        }
        if (updated.length > 0) {
          terminal.addLine(`  ✓ ${updated.length} fetched from API`, 'success')
          await terminal.sleep(100)
        }
        if (failed.length > 0) {
          terminal.addLine(`  ⚠ ${failed.length} issues`, 'warning')
          await terminal.sleep(100)
        }

        terminal.addLine('')
        await terminal.sleep(200)
        await fetchStatus()

        if (data.failed_count === 0) {
          terminal.addLine(`✓ All ${tickers.length} tickers updated`, 'success')
        } else {
          terminal.addLine(`✓ Updated ${data.updated_count + data.cached_count}/${tickers.length}`, 'success')
        }
        window.dispatchEvent(new Event('prices-updated'))
      } catch (err: any) {
        terminal.addLine('')
        const detail = err?.response?.data?.detail
        const status = err?.response?.status
        if (status === 503 && typeof detail === 'string') {
          terminal.addLine('✗ Server could not persist prices', 'error')
          terminal.addLine(`  ${detail}`, 'error')
        } else {
          terminal.addLine(`✗ ERROR: ${err.message || 'Failed'}`, 'error')
        }
      }

      await terminal.sleep(400)
      setScriptDone(true)
    })
  }

  const handleClearData = async () => {
    const allKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.startsWith('beskarfolio_') || key === 'guestBannerDismissed')) {
        allKeys.push(key)
      }
    }
    setConfirmingClear(false)
    setScriptDone(false)

    await terminal.run(async () => {
      terminal.addLine('$ sudo rm -rf ~/beskarfolio/data/*', 'command')
      await terminal.sleep(400)
      terminal.addLine('[sudo] password: ********', 'muted')
      await terminal.sleep(600)
      terminal.addLine('')
      terminal.addLine(`Found ${allKeys.length} keys...`)
      await terminal.sleep(300)
      for (const key of allKeys) {
        const value = localStorage.getItem(key)
        let info = ''
        if (value) {
          try {
            const parsed = JSON.parse(value)
            if (Array.isArray(parsed)) info = `(${parsed.length} items)`
            else if (typeof parsed === 'object') info = `(${Object.keys(parsed).length} keys)`
            else info = `(${value.length} bytes)`
          } catch {
            info = `(${value.length} bytes)`
          }
        }
        terminal.addLine(`  rm ${key.replace('beskarfolio_', '')} ${info}`, 'error')
        await terminal.sleep(100)
        localStorage.removeItem(key)
      }
      terminal.addLine('')
      await terminal.sleep(200)
      terminal.addLine(`✓ Cleared ${allKeys.length} keys`, 'success')
      await terminal.sleep(300)
      setScriptDone(true)
      onDataCleared()
    })
  }

  const dismissTerminal = useCallback(() => {
    terminal.clear()
    setScriptDone(false)
  }, [terminal])

  useEffect(() => {
    if (!scriptDone) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismissTerminal() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [scriptDone, dismissTerminal])

  // ── Terminal overlay (price update / clear data output) ──
  if (terminal.isRunning) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight font-heading">Settings</h2>
          <p className="text-gray-500 mt-1 text-sm">System status &amp; configuration</p>
        </div>
        <Terminal
          title="beskarfolio://settings"
          subtitle={`v${APP_VERSION}`}
          lines={terminal.lines}
          showCursor={!scriptDone}
          minHeight="400px"
        >
          {scriptDone && (
            <button
              onClick={dismissTerminal}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-accent-400 text-xs font-mono flex items-center gap-2 border border-white/5 transition-colors focus-visible:ring-2 focus-visible:ring-accent-500 outline-none"
              autoFocus
            >
              <span aria-hidden="true">↩</span> Dismiss (Esc)
            </button>
          )}
        </Terminal>
      </div>
    )
  }

  // ── Main settings view ──
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight font-heading">Settings</h2>
        <p className="text-gray-500 mt-1 text-sm">System status &amp; configuration</p>
      </div>

      {/* ── Card 1: App Info ── */}
      <Card>
        <div className="text-white font-semibold">BeskarFolio <span className="text-gray-500 font-normal text-sm">v{APP_VERSION}</span></div>
        <div className="text-gray-500 text-xs mt-0.5">{detectDevice()} · localStorage · {dataInfo.transactions} transactions</div>
        {dataInfo.lastUpdated && (
          <div className="text-gray-600 text-xs">Modified {formatBackupDate(dataInfo.lastUpdated)}</div>
        )}
      </Card>

      {/* ── Card 2: Price Data ── */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <CardTitle>Price Data</CardTitle>
          <button
            onClick={handleUpdatePrices}
            disabled={terminal.isRunning}
            className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs flex items-center gap-1.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            <span aria-hidden="true">↻</span> Update Prices
          </button>
        </div>

        <div className="space-y-0.5">
          {/* Exchange rates */}
          {loadingRates ? (
            <StatRow label="EUR/USD" value={<span className="text-amber-400">Loading...</span>} />
          ) : exchangeRates?.success ? (
            <>
              <StatRow label="EUR → USD" value={`$${exchangeRates.rates?.EUR_USD?.toFixed(4)}`} valueClass="text-emerald-400" />
              <StatRow label="USD → EUR" value={`€${exchangeRates.rates?.USD_EUR?.toFixed(4)}`} valueClass="text-emerald-400" />
              {exchangeRates.updated_at && (
                <StatRow label="Rates updated" value={formatRelativeTime(exchangeRates.updated_at)} valueClass="text-gray-500" />
              )}
            </>
          ) : (
            <StatRow label="Exchange rates" value="Failed to load" valueClass="text-rose-400" />
          )}

          {/* CSV summary */}
          {loadingStatus ? (
            <StatRow label="Price files" value={<span className="text-amber-400">Scanning...</span>} />
          ) : historyError ? (
            <StatRow label="Price files" value={historyError} valueClass="text-rose-400" />
          ) : csvSummary && (
            <>
              <div className="border-t border-white/5 my-2" />
              <StatRow label="Price files" value={csvSummary.total} valueClass="text-accent-400" />
              <StatRow label="Total size" value={`${(csvSummary.totalSizeKb / 1024).toFixed(1)} MB`} valueClass="text-gray-300" />
              <StatRow label="Fresh" value={freshCount} valueClass="text-emerald-400" />
              {staleCount > 0 && (
                <StatRow label="Stale" value={staleCount} valueClass="text-amber-400" />
              )}
            </>
          )}
        </div>

        {/* Collapsible ticker list */}
        {allCsvRows.length > 0 && (
          <div className="mt-3 pt-2 border-t border-white/5">
            <TickerTable rows={allCsvRows} />
          </div>
        )}

        <p className="text-gray-600 text-xs mt-3">
          Cron updates all tickers daily at 8:30 AM. Use the button for an immediate refresh.
        </p>
      </Card>

      {/* ── Card 3: Investor Profile ── */}
      <Card>
        <CardTitle>Investor Profile</CardTitle>
        <InvestorProfile settings={aiSettings} onChange={handleAISettingsChange} showSaved={showSaved} />
      </Card>

      {/* ── Card 4: App & Danger Zone ── */}
      <Card>
        <CardTitle>Maintenance</CardTitle>
        <div className="space-y-3">
          {/* Check for updates */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-300">App version</div>
              <div className="text-xs text-gray-500">Check if a newer PWA build is available</div>
            </div>
            {updateAvailable || updateCheckResult === 'update' ? (
              <button
                onClick={() => window.location.reload()}
                className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-700 text-white text-xs flex items-center gap-1.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              >
                Reload to update
              </button>
            ) : (
              <button
                onClick={handleCheckForUpdate}
                disabled={checkingUpdate}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 text-gray-300 text-xs flex items-center gap-1.5 border border-white/5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              >
                {checkingUpdate ? 'Checking...' : 'Check for updates'}
              </button>
            )}
          </div>
          {updateCheckResult === 'current' && (
            <div className="text-emerald-400 text-xs animate-fade-in" aria-live="polite">You're on the latest version.</div>
          )}
          {updateCheckResult === 'unavailable' && (
            <div className="text-gray-500 text-xs animate-fade-in" aria-live="polite">Service worker not available (dev mode or unsupported browser).</div>
          )}

          {/* Clear data */}
          <div className="border-t border-white/5 pt-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-300">Clear all data</div>
                <div className="text-xs text-gray-500">Remove transactions, allocations, and settings</div>
              </div>
              {confirmingClear ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleClearData}
                    disabled={terminal.isRunning}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                    autoFocus
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmingClear(false)}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingClear(true)}
                  disabled={terminal.isRunning}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-rose-400 text-xs border border-rose-500/20 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                >
                  Clear data
                </button>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
