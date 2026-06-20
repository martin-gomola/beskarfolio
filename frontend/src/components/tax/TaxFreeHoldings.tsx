import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Info, ShieldCheck, TimerReset } from 'lucide-react'
import { taxService } from '../../services'
import { TaxFreeHolding } from '../../types'
import { usePrivacyMode } from '../../hooks'
import { PRIVACY_MASK } from '../../hooks/usePrivacyMode'

type TaxHoldingWithDays = TaxFreeHolding & {
  daysLeft: number | null
  status: 'ready' | 'soon' | 'taxable' | 'wait'
}

type FilterMode = 'soonest' | 'ready' | 'taxable' | 'ticker'

const SOON_DAYS = 30

const formatShares = (shares: number): string => {
  if (shares >= 100) return shares.toFixed(0)
  if (shares >= 10) return shares.toFixed(1)
  return shares.toFixed(2)
}

const daysUntil = (dateStr: string): number => {
  const target = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

const formatDaysRemaining = (days: number | null): string => {
  if (days === null) return 'Ready'
  if (days <= 0) return 'Now'
  if (days === 1) return '1 day'
  if (days < 30) return `${days} days`
  if (days < 365) return `${Math.round(days / 30)} mo`
  return `${(days / 365).toFixed(1)} yr`
}

const getStatus = (holding: TaxFreeHolding, daysLeft: number | null): TaxHoldingWithDays['status'] => {
  if (holding.tax_free_pct >= 100 || !holding.next_tax_free_date) return 'ready'
  if (daysLeft !== null && daysLeft <= SOON_DAYS) return 'soon'
  if (holding.tax_free_pct < 50) return 'taxable'
  return 'wait'
}

const statusCopy: Record<TaxHoldingWithDays['status'], { label: string; className: string }> = {
  ready: { label: 'Ready', className: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/20' },
  soon: { label: 'Soon', className: 'bg-amber-500/12 text-amber-300 border-amber-500/20' },
  taxable: { label: 'Taxable', className: 'bg-rose-500/10 text-rose-300 border-rose-500/20' },
  wait: { label: 'Wait', className: 'bg-white/[0.04] text-gray-300 border-white/10' },
}

const sectionCopy: Record<TaxHoldingWithDays['status'], { title: string; description: string }> = {
  ready: {
    title: 'Ready tax-free',
    description: 'These positions have no remaining FIFO countdown.',
  },
  soon: {
    title: 'Unlocking soon',
    description: `New lots become tax-free within ${SOON_DAYS} days.`,
  },
  taxable: {
    title: 'Mostly taxable',
    description: 'Selling now would likely include newer taxable lots.',
  },
  wait: {
    title: 'Longer wait',
    description: 'Some shares are already tax-free, but the next unlock is later.',
  },
}

const filterOptions: Array<{ id: FilterMode; label: string }> = [
  { id: 'soonest', label: 'Soonest' },
  { id: 'ready', label: 'Ready' },
  { id: 'taxable', label: 'Taxable' },
  { id: 'ticker', label: 'Ticker' },
]

/**
 * Slovak tax-free holdings planner.
 * Uses FIFO accounting from the backend and presents the result as sell-planning guidance.
 */
export const TaxFreeHoldings: React.FC = () => {
  const [taxFreeData, setTaxFreeData] = useState<TaxFreeHolding[]>([])
  const [loading, setLoading] = useState(true)
  const [filterMode, setFilterMode] = useState<FilterMode>('soonest')
  const [showMethod, setShowMethod] = useState(false)
  const { isPrivate } = usePrivacyMode()

  const fetchTaxFreeData = async () => {
    try {
      setLoading(true)
      const data = await taxService.getTaxFreeHoldings()
      setTaxFreeData(data)
    } catch (error) {
      console.error('Failed to fetch tax-free data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTaxFreeData()
  }, [])

  const holdings = useMemo<TaxHoldingWithDays[]>(() => {
    return taxFreeData.map((holding) => {
      const daysLeft = holding.next_tax_free_date ? daysUntil(holding.next_tax_free_date) : null
      return {
        ...holding,
        daysLeft,
        status: getStatus(holding, daysLeft),
      }
    })
  }, [taxFreeData])

  const sortedHoldings = useMemo(() => {
    const nextDays = (holding: TaxHoldingWithDays) => holding.daysLeft ?? Number.POSITIVE_INFINITY
    return [...holdings].sort((a, b) => {
      if (filterMode === 'ready') return b.tax_free_pct - a.tax_free_pct || a.ticker.localeCompare(b.ticker)
      if (filterMode === 'taxable') return b.taxable_shares - a.taxable_shares || a.ticker.localeCompare(b.ticker)
      if (filterMode === 'ticker') return a.ticker.localeCompare(b.ticker)
      return nextDays(a) - nextDays(b) || b.taxable_shares - a.taxable_shares
    })
  }, [holdings, filterMode])

  const groupedHoldings = useMemo(() => {
    return {
      ready: sortedHoldings.filter((holding) => holding.status === 'ready'),
      soon: sortedHoldings.filter((holding) => holding.status === 'soon'),
      taxable: sortedHoldings.filter((holding) => holding.status === 'taxable'),
      wait: sortedHoldings.filter((holding) => holding.status === 'wait'),
    }
  }, [sortedHoldings])

  const totalShares = holdings.reduce((sum, holding) => sum + holding.total_shares, 0)
  const totalTaxFree = holdings.reduce((sum, holding) => sum + holding.tax_free_shares, 0)
  const totalTaxable = holdings.reduce((sum, holding) => sum + holding.taxable_shares, 0)
  const overallTaxFreePct = totalShares > 0 ? (totalTaxFree / totalShares) * 100 : 0
  const readyCount = groupedHoldings.ready.length
  const nextUpcoming = sortedHoldings.find((holding) => holding.daysLeft !== null)
  const soonShares = holdings
    .filter((holding) => holding.daysLeft !== null && holding.daysLeft <= SOON_DAYS)
    .reduce((sum, holding) => sum + holding.next_tax_free_shares, 0)
  const urgentUnlocks = sortedHoldings
    .filter((holding) => holding.daysLeft !== null)
    .slice(0, 4)

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="glass rounded-xl p-4 animate-pulse">
              <div className="h-3 w-20 rounded bg-white/5" />
              <div className="mt-4 h-8 w-24 rounded bg-white/5" />
              <div className="mt-3 h-3 w-32 rounded bg-white/5" />
            </div>
          ))}
        </div>
        <div className="glass rounded-xl p-4 animate-pulse">
          <div className="h-24 rounded-lg bg-white/5" />
        </div>
      </div>
    )
  }

  if (taxFreeData.length === 0) {
    return (
      <div className="glass rounded-xl p-6 text-center sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.04] text-gray-400">
          <ShieldCheck className="h-6 w-6" strokeWidth={1.8} />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-white">No tax data yet</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-gray-400">
          Add transactions to calculate which lots have passed the Slovak 365-day FIFO threshold.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryMetric
          label="Tax-free now"
          value={`${overallTaxFreePct.toFixed(1)}%`}
          helper={isPrivate ? PRIVACY_MASK : `${formatShares(totalTaxFree)} of ${formatShares(totalShares)} shares`}
          icon={<ShieldCheck className="h-5 w-5" strokeWidth={1.8} />}
        />
        <SummaryMetric
          label="Next unlock"
          value={nextUpcoming ? nextUpcoming.ticker : 'Done'}
          helper={
            nextUpcoming
              ? `${formatDaysRemaining(nextUpcoming.daysLeft)}, +${formatShares(nextUpcoming.next_tax_free_shares)} shares`
              : `${readyCount} holdings ready`
          }
          icon={<Clock3 className="h-5 w-5" strokeWidth={1.8} />}
          highlight={!!nextUpcoming && nextUpcoming.daysLeft !== null && nextUpcoming.daysLeft <= SOON_DAYS}
        />
        <SummaryMetric
          label={`Next ${SOON_DAYS} days`}
          value={isPrivate ? PRIVACY_MASK : formatShares(soonShares)}
          helper={soonShares > 0 ? 'shares becoming tax-free' : 'no near unlocks'}
          icon={<TimerReset className="h-5 w-5" strokeWidth={1.8} />}
        />
      </div>

      {urgentUnlocks.length > 0 && (
        <div className="glass rounded-xl p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Upcoming unlocks</h3>
              <p className="mt-0.5 text-xs text-gray-500">FIFO lots that become tax-free next.</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {urgentUnlocks.map((holding) => (
              <div key={holding.ticker} className="rounded-lg border border-white/5 bg-white/[0.025] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-accent-400">{holding.ticker}</span>
                  <span className={`text-xs font-semibold ${holding.daysLeft !== null && holding.daysLeft <= SOON_DAYS ? 'text-amber-300' : 'text-gray-300'}`}>
                    {formatDaysRemaining(holding.daysLeft)}
                  </span>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  {isPrivate ? PRIVACY_MASK : `+${formatShares(holding.next_tax_free_shares)} shares`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass overflow-hidden rounded-xl">
        <div className="border-b border-white/5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">Sell-planning view</h3>
              <p className="mt-1 text-sm text-gray-500">
                Percentages are by shares. Use this to decide what is safe to sell now or worth waiting for.
              </p>
            </div>
            <div className="grid grid-cols-4 rounded-lg border border-white/5 bg-white/[0.025] p-1">
              {filterOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFilterMode(option.id)}
                  className={`rounded-md px-2.5 py-2 text-xs font-semibold transition-colors btn-press ${
                    filterMode === option.id
                      ? 'bg-accent-600 text-white shadow-sm'
                      : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-5 p-3 sm:p-4">
          {(['soon', 'ready', 'taxable', 'wait'] as TaxHoldingWithDays['status'][]).map((status) => (
            <HoldingSection
              key={status}
              status={status}
              holdings={groupedHoldings[status]}
              isPrivate={isPrivate}
            />
          ))}

          <div className="rounded-lg border border-white/5 bg-white/[0.02]">
            <button
              type="button"
              onClick={() => setShowMethod((value) => !value)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left btn-press"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-gray-300">
                <Info className="h-4 w-4 text-gray-500" strokeWidth={1.8} />
                FIFO and Slovak 365-day rule
              </span>
              <span className="text-xs text-gray-500">{showMethod ? 'Hide' : 'Show'}</span>
            </button>
            {showMethod && (
              <div className="border-t border-white/5 px-4 pb-4 pt-3 text-sm leading-6 text-gray-400">
                Each purchase lot has its own 365-day countdown from acquisition date. Sells are interpreted using FIFO, so older lots are considered first. This view is informational and depends on transaction accuracy.
              </div>
            )}
          </div>

          {totalTaxable > 0 && (
            <div className="flex items-start gap-2 px-1 text-xs text-gray-500">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500/80" strokeWidth={1.9} />
              <span>
                {isPrivate ? PRIVACY_MASK : `${formatShares(totalTaxable)} shares`} are still taxable by FIFO. Check the underlying transaction records before making tax decisions.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface SummaryMetricProps {
  label: string
  value: string
  helper: string
  icon: React.ReactNode
  highlight?: boolean
}

const SummaryMetric: React.FC<SummaryMetricProps> = ({ label, value, helper, icon, highlight = false }) => (
  <div className={`glass rounded-xl p-4 ${highlight ? 'border-amber-400/20 bg-amber-500/[0.035]' : ''}`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</div>
        <div className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</div>
      </div>
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${highlight ? 'bg-amber-500/12 text-amber-300' : 'bg-white/[0.04] text-accent-400'}`}>
        {icon}
      </div>
    </div>
    <div className="mt-2 min-h-[1.25rem] text-sm text-gray-500">{helper}</div>
  </div>
)

interface HoldingSectionProps {
  status: TaxHoldingWithDays['status']
  holdings: TaxHoldingWithDays[]
  isPrivate: boolean
}

const HoldingSection: React.FC<HoldingSectionProps> = ({ status, holdings, isPrivate }) => {
  if (holdings.length === 0) return null

  const copy = sectionCopy[status]

  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-3 px-1">
        <div>
          <h4 className="text-sm font-semibold text-white">{copy.title}</h4>
          <p className="mt-0.5 text-xs text-gray-500">{copy.description}</p>
        </div>
        <span className="text-xs text-gray-500">{holdings.length}</span>
      </div>
      <div className="space-y-2">
        {holdings.map((holding) => (
          <HoldingRow key={holding.ticker} holding={holding} isPrivate={isPrivate} />
        ))}
      </div>
    </section>
  )
}

interface HoldingRowProps {
  holding: TaxHoldingWithDays
  isPrivate: boolean
}

const HoldingRow: React.FC<HoldingRowProps> = ({ holding, isPrivate }) => {
  const status = statusCopy[holding.status]
  const taxFreeText = isPrivate
    ? PRIVACY_MASK
    : `${formatShares(holding.tax_free_shares)} / ${formatShares(holding.total_shares)} shares`
  const taxableText = isPrivate ? PRIVACY_MASK : `${formatShares(holding.taxable_shares)} taxable`
  const unlockText = holding.next_tax_free_date
    ? `${formatDaysRemaining(holding.daysLeft)}, +${formatShares(holding.next_tax_free_shares)}`
    : 'All lots ready'

  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.025] p-3 transition-colors hover:bg-white/[0.04] sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base font-semibold text-accent-400">{holding.ticker}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>
              {status.label}
            </span>
          </div>
          <div className="mt-1 text-xs text-gray-500 sm:hidden">{taxFreeText}</div>
        </div>
        <div className="text-right">
          <div className={`text-xl font-semibold tracking-tight ${holding.tax_free_pct >= 50 ? 'text-emerald-400' : 'text-gray-300'}`}>
            {holding.tax_free_pct.toFixed(0)}%
          </div>
          <div className="text-[11px] text-gray-500">tax-free</div>
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.055]">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            holding.tax_free_pct >= 100
              ? 'bg-emerald-400'
              : holding.tax_free_pct >= 50
              ? 'bg-emerald-500'
              : holding.tax_free_pct > 0
              ? 'bg-gray-500'
              : 'bg-white/10'
          }`}
          style={{ width: `${Math.min(holding.tax_free_pct, 100)}%` }}
        />
      </div>

      <div className="mt-3 grid gap-2 text-xs text-gray-500 sm:grid-cols-3">
        <div className="hidden sm:block">
          <span className="text-gray-300">{taxFreeText}</span>
        </div>
        <div>
          <span className="text-gray-300">{taxableText}</span>
        </div>
        <div className="flex items-center gap-1.5 sm:justify-end">
          {holding.next_tax_free_date ? (
            <>
              <Clock3 className="h-3.5 w-3.5 text-amber-400/80" strokeWidth={1.8} />
              <span className={holding.daysLeft !== null && holding.daysLeft <= SOON_DAYS ? 'text-amber-300' : 'text-gray-300'}>
                {unlockText}
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" strokeWidth={1.8} />
              <span className="text-emerald-300">{unlockText}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
