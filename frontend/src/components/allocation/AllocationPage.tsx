import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  PieChart,
  RefreshCw,
  Scale,
  SlidersHorizontal,
  Target,
} from 'lucide-react'
import { allocationService } from '../../services/allocationService'
import { TargetAllocationEditor } from './TargetAllocationEditor'
import { ShareBasedRebalancingToolInline } from './ShareBasedRebalancingToolInline'
import type { AllocationData, AllocationStatus } from '../../types/allocation'

type AllocationTab = 'overview' | 'targets' | 'plan'

const CORE_HINTS = ['VWCE', 'SXR8', 'SXR', 'IWDA', 'EUNL', 'CSPX', 'VOO', 'VTI', 'SPY', 'QQQ']

const formatEur = (value: number) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  })

const getActionMeta = (item: AllocationData) => {
  if (item.action === 'buy') {
    return {
      label: 'Add',
      tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
      icon: ArrowDownRight,
    }
  }

  if (item.action === 'sell') {
    return {
      label: 'Trim',
      tone: 'text-rose-300 bg-rose-500/10 border-rose-500/20',
      icon: ArrowUpRight,
    }
  }

  return {
    label: 'Hold',
    tone: 'text-gray-300 bg-white/[0.05] border-white/[0.08]',
    icon: CheckCircle2,
  }
}

export function AllocationPage() {
  const [status, setStatus] = useState<AllocationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<AllocationTab>('overview')

  const loadStatus = async () => {
    try {
      setLoading(true)
      setError(null)

      const targets = await allocationService.getTargets()
      if (!targets.allocations || Object.keys(targets.allocations).length === 0) {
        setStatus(null)
        return
      }

      const data = await allocationService.getStatus()
      setStatus(data)
    } catch (err: any) {
      console.error('Failed to load allocation status:', err)
      setError(err.response?.data?.detail || err.message || 'Failed to load allocation status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStatus()
  }, [])

  const sortedDrift = useMemo(() => {
    return status?.drift_data
      ? [...status.drift_data].sort((a, b) => Math.abs(b.drift_pct) - Math.abs(a.drift_pct))
      : []
  }, [status])

  const biggestMove = sortedDrift[0]
  const coreTotal = sortedDrift
    .filter((item) => CORE_HINTS.some((hint) => item.ticker.includes(hint)))
    .reduce((sum, item) => sum + item.target_weight_pct, 0)
  const satelliteTotal = sortedDrift
    .filter((item) => !CORE_HINTS.some((hint) => item.ticker.includes(hint)))
    .reduce((sum, item) => sum + item.target_weight_pct, 0)

  if (loading) {
    return (
      <div className="p-4 pb-28 sm:p-6">
        <div className="glass rounded-xl p-6">
          <div className="h-7 w-56 rounded bg-white/10" />
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-28 rounded-xl bg-white/[0.04]" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 pb-28 sm:p-6">
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-rose-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-none" />
            <div>
              <p className="font-medium">Allocation could not load</p>
              <p className="mt-1 text-sm text-rose-100/80">{error}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!status && activeTab !== 'targets') {
    return (
      <div className="p-4 pb-28 sm:p-6">
        <div className="glass rounded-xl p-6 sm:p-8">
          <div className="max-w-2xl">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent-500/15 text-accent-300">
              <Target className="h-5 w-5" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">Set your target mix</h1>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              Choose simple target weights for each ticker. BeskarFolio will show drift and suggest what to add or trim.
            </p>
            <button
              type="button"
              onClick={() => setActiveTab('targets')}
              className="btn-press mt-5 inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-700"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Build targets
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!status && activeTab === 'targets') {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader activeTab={activeTab} setActiveTab={setActiveTab} />
        <div className="mt-5">
          <TargetAllocationEditor
            onSave={() => {
              setActiveTab('overview')
              loadStatus()
            }}
            currentAllocationStatus={null}
          />
        </div>
      </div>
    )
  }

  if (!status) return null

  return (
    <div className="p-4 pb-28 sm:p-6">
      <PageHeader activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="mt-5">
        {activeTab === 'overview' && (
          <div className="space-y-5">
            <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="glass rounded-xl p-5 sm:p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-400">Allocation check</p>
                    <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                      {status.needs_rebalancing ? 'Your portfolio has drifted.' : 'Your portfolio is on target.'}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
                      {biggestMove
                        ? `${biggestMove.ticker} is the biggest move at ${biggestMove.drift_pct > 0 ? '+' : ''}${biggestMove.drift_pct.toFixed(1)}% from target.`
                        : 'Every ticker is close to its target weight.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('targets')}
                    className="btn-press inline-flex items-center justify-center gap-2 rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-700"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    Adjust targets
                  </button>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <MetricCard label="Portfolio value" value={formatEur(status.total_value_eur)} icon={CircleDollarSign} />
                  <MetricCard
                    label="Total drift"
                    value={`${status.total_drift_pct.toFixed(1)}%`}
                    icon={Scale}
                    valueClassName={
                      status.total_drift_pct > 10
                        ? 'text-rose-300'
                        : status.total_drift_pct > 5
                        ? 'text-amber-300'
                        : 'text-accent-300'
                    }
                  />
                  <MetricCard
                    label="Action"
                    value={status.needs_rebalancing ? 'Review' : 'Hold'}
                    icon={status.needs_rebalancing ? RefreshCw : CheckCircle2}
                    valueClassName={status.needs_rebalancing ? 'text-amber-300' : 'text-accent-300'}
                  />
                </div>
              </div>

              <div className="glass rounded-xl p-5 sm:p-6">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <PieChart className="h-4 w-4 text-accent-400" />
                  Core and satellite
                </div>
                <div className="mt-5 space-y-4">
                  <AllocationBar label="Core target" value={coreTotal} tone="bg-accent-500" />
                  <AllocationBar label="Satellite target" value={satelliteTotal} tone="bg-amber-400" />
                </div>
                <p className="mt-5 text-sm leading-6 text-gray-400">
                  A simple core/satellite plan keeps broad funds as the base and limits single-stock concentration.
                </p>
              </div>
            </section>

            <section className="glass overflow-hidden rounded-xl">
              <div className="border-b border-white/[0.06] p-4 sm:p-5">
                <h2 className="text-lg font-semibold tracking-tight text-white">Ticker guide</h2>
                <p className="mt-1 text-sm text-gray-400">Sorted by largest drift so the first row is the first decision.</p>
              </div>
              <div className="divide-y divide-white/[0.06]">
                {sortedDrift.map((item) => (
                  <TickerAllocationRow key={item.ticker} item={item} />
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'targets' && (
          <TargetAllocationEditor
            onSave={() => {
              setActiveTab('overview')
              loadStatus()
            }}
            currentAllocationStatus={status}
          />
        )}

        {activeTab === 'plan' && <ShareBasedRebalancingToolInline />}
      </div>
    </div>
  )
}

function PageHeader({
  activeTab,
  setActiveTab,
}: {
  activeTab: AllocationTab
  setActiveTab: (tab: AllocationTab) => void
}) {
  const tabs: Array<{ id: AllocationTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'targets', label: 'Targets' },
    { id: 'plan', label: 'Trade plan' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Portfolio Allocation</h1>
        <p className="mt-1 text-sm leading-6 text-gray-400">
          Keep target weights simple, then rebalance only when drift matters.
        </p>
      </div>

      <div className="grid w-full grid-cols-3 gap-1 rounded-xl bg-white/[0.05] p-1 sm:w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`btn-press rounded-lg px-3 py-2 text-sm font-medium transition sm:px-5 ${
              activeTab === tab.id
                ? 'bg-accent-600 text-white shadow-sm'
                : 'text-gray-400 hover:bg-white/[0.04] hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  icon: Icon,
  valueClassName = 'text-white',
}: {
  label: string
  value: string
  icon: typeof CircleDollarSign
  valueClassName?: string
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.04] p-4">
      <div className="flex items-center justify-between gap-3 text-sm text-gray-400">
        <span>{label}</span>
        <Icon className="h-4 w-4 text-gray-500" />
      </div>
      <div className={`mt-3 text-xl font-semibold tracking-tight ${valueClassName}`}>{value}</div>
    </div>
  )
}

function AllocationBar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-gray-400">{label}</span>
        <span className="font-semibold text-white">{value.toFixed(1)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  )
}

function TickerAllocationRow({ item }: { item: AllocationData }) {
  const action = getActionMeta(item)
  const ActionIcon = action.icon
  const currentPrice = item.current_shares > 0 ? item.current_value_eur / item.current_shares : 0
  const sharesToTrade = currentPrice > 0 ? Math.round(Math.abs(item.drift_value_eur) / currentPrice) : 0
  const currentWidth = Math.min(Math.max(item.current_weight_pct, 0), 100)
  const targetWidth = Math.min(Math.max(item.target_weight_pct, 0), 100)

  return (
    <div className="p-4 sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[120px_minmax(0,1fr)_170px] lg:items-center">
        <div>
          <div className="font-mono text-base font-semibold text-accent-400">{item.ticker}</div>
          <div className="mt-1 text-xs text-gray-500">{formatEur(item.current_value_eur)}</div>
        </div>

        <div>
          <div className="mb-2 grid grid-cols-3 gap-3 text-xs text-gray-500">
            <span>Current {item.current_weight_pct.toFixed(1)}%</span>
            <span className="text-center">Target {item.target_weight_pct.toFixed(1)}%</span>
            <span className={`text-right ${item.drift_pct > 0 ? 'text-rose-300' : item.drift_pct < 0 ? 'text-emerald-300' : 'text-gray-400'}`}>
              {item.drift_pct > 0 ? '+' : ''}{item.drift_pct.toFixed(1)}%
            </span>
          </div>
          <div className="relative h-3 rounded-full bg-white/[0.07]">
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/15" style={{ width: `${currentWidth}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-accent-500" style={{ width: `${targetWidth}%` }} />
          </div>
        </div>

        <div className={`rounded-lg border px-3 py-2.5 ${action.tone}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 text-sm font-semibold">
              <ActionIcon className="h-4 w-4" />
              {action.label}
            </div>
            <div className="text-right font-mono text-sm">
              {item.action === 'hold' || sharesToTrade === 0 ? '0' : `${item.action === 'sell' ? '-' : '+'}${sharesToTrade}`}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
