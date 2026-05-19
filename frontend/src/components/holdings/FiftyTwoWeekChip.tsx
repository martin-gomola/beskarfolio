import React from 'react'
import { FiftyTwoWeekRange } from '../../hooks/use52WeekRanges'

interface FiftyTwoWeekChipProps {
  currentPrice: number
  range: FiftyTwoWeekRange | undefined
}

/**
 * Compact chip showing where the current price sits inside its 52-week range.
 * - Near high (>= 90% of range): green, "Near high"
 * - Near low  (<= 10% of range): red, "Near low"
 * - Otherwise: neutral gray with the percentile (e.g. "52w 47%")
 *
 * Renders nothing when range data is missing or degenerate, rather than
 * showing a confusing placeholder.
 */
export const FiftyTwoWeekChip: React.FC<FiftyTwoWeekChipProps> = ({ currentPrice, range }) => {
  if (!range) return null
  const { high, low } = range
  if (!Number.isFinite(high) || !Number.isFinite(low) || high <= low) return null
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null

  const raw = (currentPrice - low) / (high - low)
  const pct = Math.max(0, Math.min(1, raw))
  const pctDisplay = Math.round(pct * 100)

  let label: string
  let classes: string
  let title: string
  const formatPrice = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

  if (pct >= 0.9) {
    label = 'Near high'
    classes = 'bg-gain/10 text-gain border-gain/20'
    title = `${pctDisplay}% of 52w range · high ${formatPrice(high)} / low ${formatPrice(low)}`
  } else if (pct <= 0.1) {
    label = 'Near low'
    classes = 'bg-loss/10 text-loss border-loss/20'
    title = `${pctDisplay}% of 52w range · high ${formatPrice(high)} / low ${formatPrice(low)}`
  } else {
    label = `52w ${pctDisplay}%`
    classes = 'bg-white/5 text-gray-400 border-white/10'
    title = `${pctDisplay}% of 52w range · high ${formatPrice(high)} / low ${formatPrice(low)}`
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none ${classes}`}
      title={title}
    >
      {label}
    </span>
  )
}
