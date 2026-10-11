import React, { useEffect, useState } from 'react'
import { ChevronDown, ShieldCheck } from 'lucide-react'
import { taxService } from '../../services'
import { TaxFreeHolding } from '../../types'
import { usePrivacyMode } from '../../hooks'
import { PRIVACY_MASK } from '../../hooks/usePrivacyMode'

const formatShares = (shares: number): string =>
  shares.toLocaleString('en-GB', { maximumFractionDigits: 4 })

const formatDate = (date: string): string => {
  const parsed = new Date(`${date}T00:00:00`)
  return Number.isNaN(parsed.getTime())
    ? 'Date unavailable'
    : parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const getSummary = (holdings: TaxFreeHolding[]): string => {
  const waitingCount = holdings.filter(holding => holding.taxable_shares > 0).length
  if (holdings.length === 1) {
    return waitingCount === 0
      ? 'Your investment meets the holding-period requirement.'
      : 'Your investment still has shares waiting.'
  }
  if (waitingCount === 0) return `All ${holdings.length} investments meet the holding-period requirement.`
  if (holdings.every(holding => holding.tax_free_shares === 0)) {
    return `All ${holdings.length} investments are still waiting to meet the holding-period requirement.`
  }
  return `${waitingCount} of ${holdings.length} investments still have shares waiting.`
}

/** Presents the backend's holding-period results without making a sell recommendation. */
export const TaxFreeHoldings: React.FC = () => {
  const [holdings, setHoldings] = useState<TaxFreeHolding[]>([])
  const [loading, setLoading] = useState(true)
  const { isPrivate } = usePrivacyMode()

  useEffect(() => {
    let cancelled = false
    void taxService.getTaxFreeHoldings()
      .then(data => { if (!cancelled) setHoldings(data) })
      .catch(error => console.error('Failed to fetch holding-period data:', error))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="glass rounded-xl p-4 sm:p-5">
        <span className="text-sm text-gray-300">Checking your purchase dates…</span>
        <div aria-hidden="true" className="mt-4 space-y-3 motion-safe:animate-pulse">
          {[0, 1, 2].map(item => <div key={item} className="h-14 rounded-lg bg-white/[0.04]" />)}
        </div>
      </div>
    )
  }

  if (holdings.length === 0) {
    return (
      <div className="glass rounded-xl p-6 text-center sm:p-8">
        <ShieldCheck className="mx-auto h-8 w-8 text-gray-400" aria-hidden="true" />
        <h3 className="mt-3 text-lg font-semibold text-white">No investments to check</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gray-400">
          Add purchase transactions in Transactions to see eligible shares and qualifying dates.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section aria-label="Investment holding periods" className="glass overflow-hidden rounded-xl">
        <div className="border-b border-white/10 px-4 py-4 sm:px-5">
          <h3 className="text-base font-semibold leading-relaxed text-white sm:text-lg">{getSummary(holdings)}</h3>
        </div>
        <div aria-hidden="true" className="hidden gap-4 border-b border-white/5 px-5 py-3 text-xs font-medium text-gray-400 md:grid md:grid-cols-[1fr_1.3fr_1fr_1.8fr]">
          <span>Investment</span>
          <span>Eligible now</span>
          <span>Still waiting</span>
          <span>Next qualifying date</span>
        </div>
        <ul className="divide-y divide-white/5">
          {holdings.map(holding => (
            <li key={holding.ticker} className="px-4 py-4 sm:px-5 md:grid md:grid-cols-[1fr_1.3fr_1fr_1.8fr] md:items-start md:gap-4">
              <h4 className="break-words font-mono text-base font-semibold text-accent-400">{holding.ticker}</h4>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 md:contents">
                <div>
                  <dt className="mb-1 text-xs text-gray-400 md:sr-only">Eligible now</dt>
                  <dd className="text-sm font-medium tabular-nums text-gray-100">
                    {isPrivate ? PRIVACY_MASK : `${formatShares(holding.tax_free_shares)} of ${formatShares(holding.total_shares)} shares`}
                  </dd>
                </div>
                <div>
                  <dt className="mb-1 text-xs text-gray-400 md:sr-only">Still waiting</dt>
                  <dd className={`text-sm tabular-nums ${holding.taxable_shares > 0 ? 'text-amber-300' : 'text-gray-400'}`}>
                    {isPrivate ? PRIVACY_MASK : `${formatShares(holding.taxable_shares)} shares`}
                  </dd>
                </div>
                <div className={`col-span-2 md:col-span-1 ${holding.taxable_shares === 0 ? 'hidden md:block' : ''}`}>
                  <dt className="mb-1 text-xs text-gray-400 md:sr-only">Next qualifying date</dt>
                  <dd className="text-sm text-gray-200">
                    {holding.taxable_shares === 0 ? (
                      <><span aria-hidden="true">—</span><span className="sr-only">No shares waiting</span></>
                    ) : isPrivate ? PRIVACY_MASK : holding.next_tax_free_date ? (
                      <>
                        <time dateTime={holding.next_tax_free_date}>{formatDate(holding.next_tax_free_date)}</time>
                        <span className="ml-2 text-gray-400">+{formatShares(holding.next_tax_free_shares)} shares</span>
                      </>
                    ) : 'Date unavailable'}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      <details className="group rounded-xl border border-white/10 bg-white/[0.02]">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium text-gray-300 hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
          How this works
          <ChevronDown className="h-4 w-4 flex-shrink-0 group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="space-y-2 border-t border-white/5 px-4 py-4 text-sm leading-relaxed text-gray-400">
          <p>Each purchase is checked using the app’s 365-day holding period. When a sale is recorded, oldest purchases are counted first (FIFO).</p>
          <p>“Eligible now” means the shares meet this holding-period check. Tax exemption also depends on other conditions, including the security’s market listing and whether it was business property.</p>
          <p>This view depends on complete, accurate transactions and does not recommend selling.</p>
          <a href="https://podpora.financnasprava.sk/798719-Oslobodenie-pr%C3%ADjmov-z-predaja-cenn%C3%BDch-papierov" target="_blank" rel="noopener noreferrer" className="inline-block rounded text-accent-400 underline underline-offset-4 hover:text-accent-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 focus-visible:outline-offset-2">Slovak tax guidance (in Slovak)</a>
        </div>
      </details>
    </div>
  )
}
