import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Equal,
  Lock,
  PieChart,
  RotateCcw,
  Save,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  Unlock,
} from 'lucide-react'
import { allocationService } from '../../services/allocationService'
import { usePortfolio } from '../../hooks/usePortfolio'
import type { AllocationStatus, TargetAllocation } from '../../types/allocation'

interface Props {
  onSave: () => void
  currentAllocationStatus?: AllocationStatus | null
}

type PlanId = 'core-satellite' | 'defensive-core' | 'equal' | 'current'

const CORE_HINTS = ['VWCE', 'SXR8', 'SXR', 'IWDA', 'EUNL', 'CSPX', 'VOO', 'VTI', 'SPY', 'QQQ']

const round2 = (value: number) => parseFloat(value.toFixed(2))

const clampWeight = (value: number) => Math.max(0, Math.min(100, value))

const sumAllocations = (allocations: TargetAllocation) =>
  Object.values(allocations).reduce((sum, value) => sum + value, 0)

const rebalanceRounding = (allocations: TargetAllocation): TargetAllocation => {
  const tickers = Object.keys(allocations)
  if (tickers.length === 0) return allocations

  const rounded = Object.fromEntries(
    Object.entries(allocations).map(([ticker, weight]) => [ticker, round2(clampWeight(weight))])
  ) as TargetAllocation

  const total = sumAllocations(rounded)
  const diff = round2(100 - total)
  if (Math.abs(diff) < 0.01) return rounded

  const largestTicker = Object.entries(rounded).sort(([, a], [, b]) => b - a)[0][0]
  rounded[largestTicker] = round2(clampWeight(rounded[largestTicker] + diff))
  return rounded
}

export function TargetAllocationEditor({ onSave, currentAllocationStatus }: Props) {
  const [allocations, setAllocations] = useState<TargetAllocation>({})
  const [lockedTickers, setLockedTickers] = useState<Set<string>>(new Set())
  const [loadingTargets, setLoadingTargets] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { holdings, loading: portfolioLoading } = usePortfolio()

  const tickers = useMemo(() => Object.keys(allocations).sort(), [allocations])
  const total = useMemo(() => sumAllocations(allocations), [allocations])
  const totalGap = round2(100 - total)
  const isValid = Math.abs(totalGap) < 0.01
  const coreTickers = tickers.filter((ticker) => CORE_HINTS.some((hint) => ticker.includes(hint)))
  const satelliteTickers = tickers.filter((ticker) => !coreTickers.includes(ticker))
  const coreTotal = coreTickers.reduce((sum, ticker) => sum + (allocations[ticker] || 0), 0)
  const satelliteTotal = satelliteTickers.reduce((sum, ticker) => sum + (allocations[ticker] || 0), 0)

  const currentWeights = useMemo(() => {
    if (currentAllocationStatus?.drift_data?.length) {
      const fromStatus: TargetAllocation = {}
      currentAllocationStatus.drift_data.forEach((item) => {
        if (item.current_weight_pct > 0) {
          fromStatus[item.ticker] = item.current_weight_pct
        }
      })
      return rebalanceRounding(fromStatus)
    }

    const totalValue = holdings.reduce((sum, holding) => sum + holding.current_value, 0)
    if (totalValue <= 0) return {}

    const fromHoldings: TargetAllocation = {}
    holdings.forEach((holding) => {
      fromHoldings[holding.ticker] = (holding.current_value / totalValue) * 100
    })
    return rebalanceRounding(fromHoldings)
  }, [currentAllocationStatus, holdings])

  useEffect(() => {
    const initializeTargets = async () => {
      if (portfolioLoading) return

      try {
        setLoadingTargets(true)
        const savedTargets = await allocationService.getTargets()
        const hasSavedTargets = savedTargets.allocations && Object.keys(savedTargets.allocations).length > 0
        setAllocations(hasSavedTargets ? rebalanceRounding(savedTargets.allocations) : currentWeights)
        setLockedTickers(new Set())
        setError(null)
      } catch (err: any) {
        console.error('Failed to load target allocations:', err)
        setAllocations(currentWeights)
      } finally {
        setLoadingTargets(false)
      }
    }

    initializeTargets()
  }, [portfolioLoading, currentWeights])

  const spreadAcross = (targetTickers: string[], totalWeight: number) => {
    if (targetTickers.length === 0) return {}
    const equalWeight = totalWeight / targetTickers.length
    return Object.fromEntries(targetTickers.map((ticker) => [ticker, equalWeight])) as TargetAllocation
  }

  const applyPlan = (plan: PlanId) => {
    const availableTickers = Object.keys(currentWeights)
    if (availableTickers.length === 0) return

    if (plan === 'current') {
      setAllocations(currentWeights)
      setLockedTickers(new Set())
      setError(null)
      return
    }

    if (plan === 'equal') {
      setAllocations(rebalanceRounding(spreadAcross(availableTickers, 100)))
      setLockedTickers(new Set())
      setError(null)
      return
    }

    const detectedCore = availableTickers.filter((ticker) => CORE_HINTS.some((hint) => ticker.includes(hint)))
    const detectedSatellite = availableTickers.filter((ticker) => !detectedCore.includes(ticker))

    if (detectedCore.length === 0 || detectedSatellite.length === 0) {
      setAllocations(rebalanceRounding(spreadAcross(availableTickers, 100)))
      setLockedTickers(new Set())
      setError('No clear core/satellite split found. Equal weight was applied instead.')
      return
    }

    const coreWeight = plan === 'defensive-core' ? 80 : 70
    const satelliteWeight = 100 - coreWeight
    setAllocations(
      rebalanceRounding({
        ...spreadAcross(detectedCore, coreWeight),
        ...spreadAcross(detectedSatellite, satelliteWeight),
      })
    )
    setLockedTickers(new Set())
    setError(null)
  }

  const updateAllocation = (ticker: string, nextWeight: number) => {
    const next = round2(clampWeight(nextWeight))
    setAllocations((previous) => {
      const updated = { ...previous, [ticker]: next }
      const adjustableTickers = Object.keys(updated).filter((item) => item !== ticker && !lockedTickers.has(item))
      const lockedTotal = Object.entries(updated)
        .filter(([item]) => item !== ticker && lockedTickers.has(item))
        .reduce((sum, [, value]) => sum + value, 0)
      const remaining = 100 - lockedTotal - next

      if (adjustableTickers.length === 0 || remaining < 0) {
        return updated
      }

      const previousAdjustableTotal = adjustableTickers.reduce((sum, item) => sum + (previous[item] || 0), 0)
      adjustableTickers.forEach((item) => {
        const share = previousAdjustableTotal > 0 ? (previous[item] || 0) / previousAdjustableTotal : 1 / adjustableTickers.length
        updated[item] = round2(Math.max(0, remaining * share))
      })

      return rebalanceRounding(updated)
    })
    setError(null)
  }

  const nudgeAllocation = (ticker: string, delta: number) => {
    updateAllocation(ticker, (allocations[ticker] || 0) + delta)
  }

  const toggleLock = (ticker: string) => {
    setLockedTickers((previous) => {
      const next = new Set(previous)
      if (next.has(ticker)) {
        next.delete(ticker)
      } else {
        next.add(ticker)
      }
      return next
    })
  }

  const scaleToHundred = () => {
    const currentTotal = sumAllocations(allocations)
    if (currentTotal <= 0) return

    const scaled = Object.fromEntries(
      Object.entries(allocations).map(([ticker, weight]) => [ticker, (weight / currentTotal) * 100])
    ) as TargetAllocation
    setAllocations(rebalanceRounding(scaled))
    setError(null)
  }

  const handleSave = async () => {
    if (!isValid) {
      setError(`Targets must total 100%. Adjust ${Math.abs(totalGap).toFixed(2)}% before saving.`)
      return
    }

    try {
      setSaving(true)
      setError(null)
      await allocationService.saveTargets(allocations)
      onSave()
    } catch (err: any) {
      console.error('Failed to save targets:', err)
      setError(err.response?.data?.detail || err.message || 'Failed to save targets')
      setSaving(false)
    }
  }

  if ((portfolioLoading || loadingTargets) && Object.keys(allocations).length === 0) {
    return (
      <div className="glass rounded-xl p-6">
        <div className="h-5 w-48 rounded bg-white/10" />
        <div className="mt-5 space-y-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-20 rounded-xl bg-white/[0.04]" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="glass overflow-hidden rounded-xl">
        <div className="border-b border-white/[0.06] p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-white">Build your target mix</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-400">
                Start with a plan, then fine-tune each ticker. Locked rows keep their weight while the rest adjust around them.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                onClick={() => applyPlan('core-satellite')}
                className="btn-press inline-flex items-center justify-center gap-2 rounded-lg bg-white/[0.07] px-3 py-2 text-sm font-medium text-gray-100 hover:bg-white/[0.11]"
              >
                <ShieldCheck className="h-4 w-4" />
                70/30
              </button>
              <button
                type="button"
                onClick={() => applyPlan('defensive-core')}
                className="btn-press inline-flex items-center justify-center gap-2 rounded-lg bg-white/[0.07] px-3 py-2 text-sm font-medium text-gray-100 hover:bg-white/[0.11]"
              >
                <PieChart className="h-4 w-4" />
                80/20
              </button>
              <button
                type="button"
                onClick={() => applyPlan('equal')}
                className="btn-press inline-flex items-center justify-center gap-2 rounded-lg bg-white/[0.07] px-3 py-2 text-sm font-medium text-gray-100 hover:bg-white/[0.11]"
              >
                <Equal className="h-4 w-4" />
                Equal
              </button>
              <button
                type="button"
                onClick={() => applyPlan('current')}
                className="btn-press inline-flex items-center justify-center gap-2 rounded-lg bg-white/[0.07] px-3 py-2 text-sm font-medium text-gray-100 hover:bg-white/[0.11]"
              >
                <RotateCcw className="h-4 w-4" />
                Current
              </button>
            </div>
          </div>
        </div>

        <div className="divide-y divide-white/[0.06]">
          {tickers.map((ticker) => {
            const weight = allocations[ticker] || 0
            const isLocked = lockedTickers.has(ticker)
            const current = currentWeights[ticker] || 0
            const driftFromCurrent = weight - current

            return (
              <div key={ticker} className="p-4 sm:p-5">
                <div className="grid gap-4 lg:grid-cols-[140px_minmax(0,1fr)_210px] lg:items-center">
                  <div className="flex items-center justify-between gap-3 lg:block">
                    <div>
                      <div className="font-mono text-base font-semibold text-accent-400">{ticker}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        Current {current.toFixed(1)}%
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleLock(ticker)}
                      className={`btn-press inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium transition ${
                        isLocked
                          ? 'bg-accent-500/15 text-accent-300 ring-1 ring-accent-500/30'
                          : 'bg-white/[0.06] text-gray-400 hover:bg-white/[0.1] hover:text-white'
                      }`}
                      title={isLocked ? 'Unlock ticker weight' : 'Lock ticker weight'}
                    >
                      {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                      {isLocked ? 'Locked' : 'Lock'}
                    </button>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                      <span>0%</span>
                      <span className={driftFromCurrent >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {driftFromCurrent >= 0 ? '+' : ''}{driftFromCurrent.toFixed(1)} vs current
                      </span>
                      <span>100%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="0.5"
                      value={weight}
                      onChange={(event) => updateAllocation(ticker, parseFloat(event.target.value))}
                      className="h-2 w-full accent-accent-500"
                      aria-label={`${ticker} target weight`}
                    />
                  </div>

                  <div className="grid grid-cols-[36px_minmax(88px,1fr)_36px] items-center gap-2">
                    <button
                      type="button"
                      onClick={() => nudgeAllocation(ticker, -1)}
                      className="btn-press h-10 rounded-lg bg-white/[0.06] text-gray-300 hover:bg-white/[0.1]"
                      aria-label={`Decrease ${ticker}`}
                    >
                      -
                    </button>
                    <label className="relative block">
                      <span className="sr-only">{ticker} percent</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max="100"
                        step="0.5"
                        value={weight}
                        onChange={(event) => updateAllocation(ticker, parseFloat(event.target.value) || 0)}
                        onFocus={(event) => event.target.select()}
                        className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#121a16] px-3 pr-8 text-right font-mono text-sm text-white outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">%</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => nudgeAllocation(ticker, 1)}
                      className="btn-press h-10 rounded-lg bg-white/[0.06] text-gray-300 hover:bg-white/[0.1]"
                      aria-label={`Increase ${ticker}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <aside className="space-y-4">
        <section className="glass rounded-xl p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
            <SlidersHorizontal className="h-4 w-4 text-accent-400" />
            Plan health
          </div>
          <div className="mt-5">
            <div className={`text-4xl font-semibold tracking-tight ${isValid ? 'text-white' : 'text-amber-300'}`}>
              {total.toFixed(1)}%
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className={`h-full rounded-full ${isValid ? 'bg-accent-500' : 'bg-amber-400'}`}
                style={{ width: `${Math.min(total, 100)}%` }}
              />
            </div>
            <div className="mt-3 flex items-start gap-2 text-sm leading-5">
              {isValid ? (
                <>
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-accent-400" />
                  <span className="text-gray-300">Targets add up to 100%. This plan is ready to save.</span>
                </>
              ) : (
                <>
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-amber-300" />
                  <span className="text-gray-300">
                    {totalGap > 0
                      ? `${totalGap.toFixed(2)}% still needs a home.`
                      : `${Math.abs(totalGap).toFixed(2)}% must be removed.`}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-white/[0.04] p-3">
              <div className="text-xs text-gray-500">Core</div>
              <div className="mt-1 text-lg font-semibold text-white">{coreTotal.toFixed(1)}%</div>
            </div>
            <div className="rounded-lg bg-white/[0.04] p-3">
              <div className="text-xs text-gray-500">Satellite</div>
              <div className="mt-1 text-lg font-semibold text-white">{satelliteTotal.toFixed(1)}%</div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={scaleToHundred}
              disabled={total <= 0 || isValid}
              className="btn-press inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white/[0.07] px-4 py-2.5 text-sm font-medium text-white hover:bg-white/[0.11] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Scale className="h-4 w-4" />
              Fit to 100%
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!isValid || saving || tickers.length === 0}
              className="btn-press inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent-600 px-4 py-3 text-sm font-semibold text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving' : 'Save targets'}
            </button>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm leading-5 text-amber-200">
              {error}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-accent-500/20 bg-accent-500/10 p-5">
          <h3 className="text-sm font-semibold text-accent-200">Simple rule</h3>
          <p className="mt-2 text-sm leading-6 text-gray-300">
            Keep broad ETFs as the core, then give individual stocks smaller satellite weights. Rebalance when drift becomes meaningful.
          </p>
        </section>
      </aside>
    </div>
  )
}
