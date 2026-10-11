import React, { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { useTransactions, usePrivacyMode } from '../../hooks'
import { PRIVACY_MASK } from '../../hooks/usePrivacyMode'
import { Transaction } from '../../types'
import { subscribeBrowserPortfolioState } from '../../services/browserPortfolioState'
import { formatCurrency, getEffectiveCurrencyForTicker } from '../../utils'
import { LoadingSpinner } from '../common'
import { EditTransactionModal } from './EditTransactionModal'

const PAGE_SIZE = 25
const activity = {
  buy: { title: 'Bought', amount: 'Total paid', search: 'buy buys bought purchase purchases' },
  sell: { title: 'Sold', amount: 'Sale proceeds', search: 'sell sells sold sale sales' },
  dividend: { title: 'Dividend from', amount: 'Net dividend received', search: 'dividend dividends income' },
}
const dateValue = (date: string) => new Date(`${date.slice(0, 10)}T00:00:00`)
const displayDate = (date: string) => dateValue(date).toLocaleDateString('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric',
})

interface AllTransactionsTableProps {
  onUpdate: () => void
  updating?: boolean
}

/** A chronological record of completed activity, using the existing transaction service. */
export const AllTransactionsTable: React.FC<AllTransactionsTableProps> = ({ onUpdate, updating = false }) => {
  const { transactions, loading, error, refetch, deleteTransaction } = useTransactions()
  const { isPrivate } = usePrivacyMode()
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [query, setQuery] = useState('')
  const [selectedTicker, setSelectedTicker] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [message, setMessage] = useState('')

  useEffect(() => subscribeBrowserPortfolioState(change => {
    if (change.reason === 'create') {
      setQuery('')
      setSelectedTicker('')
      setVisibleCount(PAGE_SIZE)
      setMessage('Transaction saved.')
    }
  }), [])

  const filteredTransactions = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return transactions.filter(transaction => {
      if (selectedTicker && transaction.ticker !== selectedTicker) return false
      const month = dateValue(transaction.date).toLocaleDateString('en-GB', { month: 'long' })
      const text = `${transaction.ticker} ${activity[transaction.type].search} ${transaction.date} ${displayDate(transaction.date)} ${month}`.toLowerCase()
      return terms.every(term => text.includes(term))
    }).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  }, [transactions, query, selectedTicker])

  const tickerOptions = [...new Set(transactions.map(transaction => transaction.ticker))].sort()

  const visibleTransactions = filteredTransactions.slice(0, visibleCount)
  const countLabel = query.trim() || selectedTicker
    ? `${filteredTransactions.length} matching transaction${filteredTransactions.length === 1 ? '' : 's'}`
    : `${transactions.length} transaction${transactions.length === 1 ? '' : 's'}`
  const historyLabel = updating ? 'Updating portfolio totals…'
    : loading ? 'Loading transaction history…'
    : error ? 'History unavailable' : `${countLabel} · Most recent first`
  const groups = new Map<string, Transaction[]>()
  visibleTransactions.forEach(transaction => {
    const month = transaction.date.slice(0, 7)
    groups.set(month, [...(groups.get(month) ?? []), transaction])
  })

  const changeQuery = (value: string) => {
    setQuery(value)
    setVisibleCount(PAGE_SIZE)
  }

  const clearFilters = () => {
    changeQuery('')
    setSelectedTicker('')
  }

  const handleSave = async () => {
    await refetch()
    onUpdate()
    setMessage('Transaction updated.')
  }

  return (
    <>
      <div className="glass overflow-hidden rounded-xl" aria-busy={loading || updating}>
        <div className="space-y-3 border-b border-white/10 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.5fr)]">
            <div>
              <label htmlFor="transaction-search" className="mb-2 block text-sm font-medium text-gray-300">Find a transaction</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <input
                  id="transaction-search"
                  type="search"
                  value={query}
                  onChange={event => changeQuery(event.target.value)}
                  placeholder="Symbol, activity, or date"
                  className="min-h-11 w-full rounded-lg border border-white/10 bg-white/[0.025] py-2.5 pl-10 pr-12 text-base text-white placeholder:text-gray-400 focus:border-accent-400 focus:outline-none sm:text-sm [&::-webkit-search-cancel-button]:appearance-none"
                />
                {query && (
                  <button type="button" onClick={() => changeQuery('')} aria-label="Clear transaction search" className="absolute right-0 top-0 flex h-full min-w-11 items-center justify-center rounded-lg text-gray-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
            <div>
              <label htmlFor="transaction-investment-filter" className="mb-2 block text-sm font-medium text-gray-300">Investment</label>
              <div className="relative">
                <select
                  id="transaction-investment-filter"
                  value={selectedTicker}
                  onChange={event => { setSelectedTicker(event.target.value); setVisibleCount(PAGE_SIZE) }}
                  className="min-h-11 w-full appearance-none rounded-lg border border-white/10 bg-surface-elevated py-2.5 pl-3 pr-12 text-base text-white focus:border-accent-400 focus:outline-none sm:text-sm [color-scheme:dark]"
                >
                  <option value="">All investments</option>
                  {tickerOptions.map(ticker => <option key={ticker} value={ticker}>{ticker}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              </div>
            </div>
          </div>
          <p aria-live="polite" className="text-xs text-gray-400">
            {historyLabel}
          </p>
          {message && <p role="status" className="text-sm text-accent-300">{message}</p>}
        </div>

        {loading && transactions.length === 0 ? (
          <div role="status" className="p-6"><LoadingSpinner message="Loading your transaction history…" /></div>
        ) : error ? (
          <div role="alert" className="p-5 text-sm text-gray-300">
            <p>Could not load your transaction history.</p>
            <button type="button" onClick={() => void refetch()} className="mt-3 min-h-11 rounded-lg border border-white/10 px-4 text-accent-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400">Try again</button>
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-6 text-center sm:p-8">
            <h3 className="text-base font-semibold text-white">No transactions yet</h3>
            <p className="mt-2 text-sm text-gray-400">Use Add transaction to record a completed buy, sale, or dividend.</p>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="p-6 text-center">
            <h3 className="text-base font-semibold text-white">No matching transactions</h3>
            <button type="button" onClick={clearFilters} className="mt-2 min-h-11 rounded-lg px-3 text-sm text-accent-300 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400">Clear filters</button>
          </div>
        ) : (
          Array.from(groups, ([month, monthTransactions]) => (
            <section key={month} aria-label={dateValue(`${month}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}>
              <h3 className="border-y border-white/5 bg-white/[0.02] px-4 py-2.5 text-xs font-medium text-gray-400 sm:px-5">
                {dateValue(`${month}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              </h3>
              <ul className="divide-y divide-white/5">
                {monthTransactions.map(transaction => {
                  const currency = getEffectiveCurrencyForTicker(transaction.ticker, transaction.currency)
                  const type = activity[transaction.type]
                  const amount = transaction.total_value ?? (transaction.type === 'dividend' ? transaction.price : transaction.shares * transaction.price)
                  return (
                    <li key={transaction.id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-5 sm:px-5">
                      <div className="col-span-2 min-w-0 sm:col-span-1">
                        <h4 className="text-sm font-medium text-gray-100">{type.title} <span className="break-words font-mono text-accent-400">{transaction.ticker}</span></h4>
                        <p className="mt-1 text-xs leading-relaxed text-gray-400">
                          <time dateTime={transaction.date}>{displayDate(transaction.date)}</time>
                          {transaction.type !== 'dividend' && <span> · {isPrivate ? PRIVACY_MASK : `${transaction.shares.toLocaleString('en-GB', { maximumFractionDigits: 20 })} ${transaction.shares === 1 ? 'share' : 'shares'} at ${formatCurrency(transaction.price, currency)}`}</span>}
                        </p>
                      </div>
                      <div className="min-w-0 sm:text-right">
                        <p className="break-words text-sm font-semibold tabular-nums text-white">{isPrivate ? PRIVACY_MASK : formatCurrency(amount, currency)}</p>
                        <p className="mt-0.5 text-xs text-gray-400">{type.amount}</p>
                      </div>
                      <button
                        type="button"
                        disabled={loading || updating}
                        onClick={() => { setMessage(''); setEditingTransaction(transaction) }}
                        aria-label={`Edit ${transaction.type} for ${transaction.ticker} on ${displayDate(transaction.date)}`}
                        className="min-h-11 self-center rounded-lg border border-white/10 px-3 text-sm font-medium text-gray-300 hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-wait"
                      >Edit</button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        )}

        {visibleCount < filteredTransactions.length && (
          <div className="border-t border-white/10 px-4 py-3 sm:px-5">
            <button type="button" onClick={() => setVisibleCount(count => count + PAGE_SIZE)} className="min-h-11 w-full rounded-lg text-sm font-medium text-accent-300 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400">
              Show {Math.min(PAGE_SIZE, filteredTransactions.length - visibleCount)} more transactions
            </button>
          </div>
        )}
      </div>

      {editingTransaction && (
        <EditTransactionModal
          transaction={editingTransaction}
          onClose={() => setEditingTransaction(null)}
          onSave={handleSave}
          onDelete={async () => {
            await deleteTransaction(editingTransaction.id)
            onUpdate()
            setMessage('Transaction deleted.')
          }}
        />
      )}
    </>
  )
}
