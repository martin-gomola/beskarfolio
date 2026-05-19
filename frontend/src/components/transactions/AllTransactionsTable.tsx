import React, { useState, useMemo } from 'react'
import { useTransactions, usePrivacyMode, useTableSort } from '../../hooks'
import { PRIVACY_MASK } from '../../hooks/usePrivacyMode'
import { Transaction } from '../../types'
import { formatCurrency, getEffectiveCurrencyForTicker } from '../../utils'
import { LoadingSpinner } from '../common'
import { SwipeableRow } from '../common/SwipeableRow'
import { EditTransactionModal } from './EditTransactionModal'

type TxSortKey = 'date' | 'ticker' | 'type' | 'shares' | 'price' | 'total'

const PAGE_SIZE = 25

interface AllTransactionsTableProps {
  onUpdate: () => void
}

/**
 * Table showing all transactions across all tickers
 * Includes filtering by type and search
 */
export const AllTransactionsTable: React.FC<AllTransactionsTableProps> = ({ onUpdate }) => {
  const { transactions, loading, refetch, deleteTransaction } = useTransactions()
  const { isPrivate } = usePrivacyMode()
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [selectedTicker, setSelectedTicker] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'buy' | 'sell' | 'dividend'>('all')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const { sortBy, sortOrder, handleSort } = useTableSort<TxSortKey>('date', 'desc')

  const handleDelete = async (transactionId: number) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return

    try {
      await deleteTransaction(transactionId)
      await onUpdate()
    } catch (error) {
      console.error('Error deleting transaction:', error)
      alert('Failed to delete transaction')
    }
  }

  const handleSave = async () => {
    await refetch()
    await onUpdate()
  }

  const uniqueTickers = useMemo(() => {
    return [...new Set(transactions.map(t => t.ticker))].sort()
  }, [transactions])

  const filteredTransactions = useMemo(() => {
    const filtered = transactions
      .filter(t => filterType === 'all' || t.type.toLowerCase() === filterType)
      .filter(t => !selectedTicker || t.ticker === selectedTicker)

    return [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortBy) {
        case 'date':    cmp = a.date.localeCompare(b.date); break
        case 'ticker':  cmp = a.ticker.localeCompare(b.ticker); break
        case 'type':    cmp = a.type.localeCompare(b.type); break
        case 'shares':  cmp = a.shares - b.shares; break
        case 'price':   cmp = a.price - b.price; break
        case 'total':   cmp = (a.total_value ?? a.shares * a.price) - (b.total_value ?? b.shares * b.price); break
      }
      return sortOrder === 'asc' ? cmp : -cmp
    })
  }, [transactions, filterType, selectedTicker, sortBy, sortOrder])

  const visibleTransactions = filteredTransactions.slice(0, visibleCount)
  const hasMore = visibleCount < filteredTransactions.length

  if (loading) {
    return (
      <div className="glass rounded-xl p-6">
        <LoadingSpinner message="Loading transactions..." />
      </div>
    )
  }

  return (
    <>
      <div className="glass rounded-xl overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-white/5">
          <div className="flex flex-col gap-3">
            <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight">All Transactions</h2>

            {/* Filter by type - Segmented Control */}
            <div className="flex gap-1 bg-white/5 p-1 rounded-xl w-full">
                <button
                  onClick={() => { setFilterType('all'); setVisibleCount(PAGE_SIZE) }}
                  className={`flex-1 px-3 py-2 sm:py-1.5 rounded-lg text-sm sm:text-xs font-medium transition-all ${
                    filterType === 'all' ? 'bg-accent-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => { setFilterType('buy'); setVisibleCount(PAGE_SIZE) }}
                  className={`flex-1 px-3 py-2 sm:py-1.5 rounded-lg text-sm sm:text-xs font-medium transition-all ${
                    filterType === 'buy' ? 'bg-emerald-500 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Buy
                </button>
                <button
                  onClick={() => { setFilterType('sell'); setVisibleCount(PAGE_SIZE) }}
                  className={`flex-1 px-3 py-2 sm:py-1.5 rounded-lg text-sm sm:text-xs font-medium transition-all ${
                    filterType === 'sell' ? 'bg-rose-500 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Sell
                </button>
                <button
                  onClick={() => { setFilterType('dividend'); setVisibleCount(PAGE_SIZE) }}
                  className={`flex-1 px-3 py-2 sm:py-1.5 rounded-lg text-sm sm:text-xs font-medium transition-all ${
                    filterType === 'dividend' ? 'bg-violet-500 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Div
                </button>
            </div>

            {/* Ticker filter dropdown */}
            <select
              value={selectedTicker}
              onChange={(e) => { setSelectedTicker(e.target.value); setVisibleCount(PAGE_SIZE) }}
              className="w-48 px-3 py-1.5 text-sm bg-white/5 border border-white/5 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500/50 text-gray-100 appearance-none cursor-pointer"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%236b7280' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10l-5 5z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center' }}
            >
              <option value="">All tickers</option>
              {uniqueTickers.map(ticker => (
                <option key={ticker} value={ticker}>{ticker}</option>
              ))}
            </select>

            <span className="text-sm text-gray-500">{filteredTransactions.length} of {transactions.length}</span>
          </div>
        </div>

        {/* Mobile: Swipeable list (swipe left to edit) */}
        <div className="sm:hidden divide-y divide-white/5">
          {visibleTransactions.length === 0 ? (
            <div className="py-8 text-center text-gray-500">No transactions found</div>
          ) : (
            visibleTransactions.map((transaction) => {
              const effectiveCurrency = getEffectiveCurrencyForTicker(transaction.ticker, transaction.currency)
              return (
                <SwipeableRow key={transaction.id} onAction={() => setEditingTransaction(transaction)}>
                  <div className="w-full flex items-center gap-3 px-4 py-3">
                  
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-sm text-accent-400">{transaction.ticker}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          transaction.type === 'buy' ? 'bg-emerald-500/10 text-emerald-400'
                          : transaction.type === 'dividend' ? 'bg-violet-500/10 text-violet-400'
                          : 'bg-rose-500/10 text-rose-400'
                        }`}>
                          {transaction.type === 'dividend' ? 'DIV' : transaction.type.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {new Date(transaction.date).toLocaleDateString()} · {isPrivate ? PRIVACY_MASK : `${transaction.shares} shares`}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium text-white whitespace-nowrap block">
                        {isPrivate ? PRIVACY_MASK : formatCurrency(transaction.total_value, effectiveCurrency)}
                      </span>
                      <span className="text-xs text-gray-500 whitespace-nowrap block">
                        {isPrivate ? PRIVACY_MASK : `@ ${formatCurrency(transaction.price, effectiveCurrency)}`}
                      </span>
                    </div>
                  </div>
                </SwipeableRow>
              )
            })
          )}
        </div>

        {/* Desktop: Full table with sorting */}
        <div className="overflow-x-auto hidden sm:block">
          <table className="w-full">
            <thead>
              <tr className="bg-black/20 border-b border-white/5">
                {([
                  { key: 'date' as TxSortKey, label: 'Date', align: 'left', hide: '' },
                  { key: 'ticker' as TxSortKey, label: 'Ticker', align: 'left', hide: '' },
                  { key: 'type' as TxSortKey, label: 'Type', align: 'left', hide: '' },
                  { key: 'shares' as TxSortKey, label: 'Shares', align: 'right', hide: '' },
                  { key: 'price' as TxSortKey, label: 'Price', align: 'right', hide: '' },
                  { key: 'total' as TxSortKey, label: 'Total', align: 'right', hide: '' },
                ]).map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`${col.align === 'right' ? 'text-right' : 'text-left'} py-3 px-5 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-300 transition-colors ${col.hide}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sortBy === col.key && (
                        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                          {sortOrder === 'asc'
                            ? <path d="M6 2l4 5H2z" />
                            : <path d="M6 10L2 5h8z" />}
                        </svg>
                      )}
                    </span>
                  </th>
                ))}
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {visibleTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-500">
                    No transactions found
                  </td>
                </tr>
              ) : (
                visibleTransactions.map((transaction) => {
                  const effectiveCurrency = getEffectiveCurrencyForTicker(transaction.ticker, transaction.currency)
                  return (
                  <tr key={transaction.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-5 text-sm text-gray-400">
                      {new Date(transaction.date).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-5">
                      <span className="font-mono font-medium text-sm text-accent-400">{transaction.ticker}</span>
                    </td>
                    <td className="py-3 px-5">
                      <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium ${
                        transaction.type === 'buy'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : transaction.type === 'dividend'
                          ? 'bg-violet-500/10 text-violet-400'
                          : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {transaction.type === 'dividend' ? 'DIV' : transaction.type.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-right text-sm text-gray-300">{isPrivate ? PRIVACY_MASK : transaction.shares}</td>
                    <td className="py-3 px-5 text-right text-sm text-gray-400">
                      {isPrivate ? PRIVACY_MASK : formatCurrency(transaction.price, effectiveCurrency)}
                    </td>
                    <td className="py-3 px-5 text-right text-sm text-white font-medium">
                      {isPrivate ? PRIVACY_MASK : formatCurrency(transaction.total_value, effectiveCurrency)}
                    </td>
                    <td className="py-3 px-5">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setEditingTransaction(transaction)}
                          className="p-1.5 text-accent-400 hover:bg-accent-500/10 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(transaction.id)}
                          className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            <line x1="10" y1="11" x2="10" y2="17"/>
                            <line x1="14" y1="11" x2="14" y2="17"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )})
              )}
            </tbody>
          </table>
        </div>

        {hasMore && (
          <div className="px-4 sm:px-5 py-3 border-t border-white/5 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Showing {visibleCount} of {filteredTransactions.length}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                className="px-3 py-1.5 text-xs font-medium text-accent-400 hover:bg-accent-500/10 rounded-lg transition-colors"
              >
                Show more
              </button>
              <button
                onClick={() => setVisibleCount(filteredTransactions.length)}
                className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-white/5 rounded-lg transition-colors"
              >
                Show all
              </button>
            </div>
          </div>
        )}
      </div>

      {editingTransaction && (
        <EditTransactionModal
          transaction={editingTransaction}
          onClose={() => setEditingTransaction(null)}
          onSave={handleSave}
        />
      )}
    </>
  )
}
