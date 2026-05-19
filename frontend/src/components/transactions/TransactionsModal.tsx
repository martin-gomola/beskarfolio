import React, { useState } from 'react'
import { useTransactions } from '../../hooks'
import { Transaction } from '../../types'
import { formatCurrency, getEffectiveCurrencyForTicker } from '../../utils'
import { Modal } from '../common'
import { EditTransactionModal } from './EditTransactionModal'

interface TransactionsModalProps {
  ticker: string
  onClose: () => void
  onUpdate: () => void
}

/**
 * Modal displaying all transactions for a specific ticker
 */
export const TransactionsModal: React.FC<TransactionsModalProps> = ({ 
  ticker, 
  onClose, 
  onUpdate 
}) => {
  const { transactions, loading, refetch, deleteTransaction } = useTransactions(ticker)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const effectiveCurrencies = Array.from(
    new Set(transactions.map((transaction) => getEffectiveCurrencyForTicker(transaction.ticker, transaction.currency)))
  )
  const currencyLabel = effectiveCurrencies.length === 1 ? effectiveCurrencies[0] : 'Mixed'

  const handleDelete = async (transactionId: number) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return

    try {
      await deleteTransaction(transactionId)
      setHasChanges(true)
      setSuccessMessage('Transaction deleted successfully')
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (error) {
      console.error('Error deleting transaction:', error)
      alert('Failed to delete transaction')
    }
  }

  const handleSave = async () => {
    await refetch()
    setHasChanges(true)
    setSuccessMessage('Transaction updated successfully')
    setTimeout(() => setSuccessMessage(''), 3000)
  }

  const handleClose = () => {
    onClose()
    // Update portfolio data after modal closes, if any changes were made
    if (hasChanges) {
      setTimeout(() => onUpdate(), 100)
    }
  }

  return (
    <>
      <Modal isOpen={true} onClose={handleClose} title={`${ticker} Transactions`} size="xl">
        <div>
          {/* Badge showing currency */}
          <div className="px-5 pt-3 flex items-center gap-3">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-accent-500/10 text-accent-400 border border-accent-500/20">
              {currencyLabel}
            </span>
          </div>

          {successMessage && (
            <div className="mx-5 mt-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {successMessage}
            </div>
          )}

          <div className="p-5">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent-500 border-t-transparent mx-auto"></div>
                <p className="mt-4 text-gray-500 text-sm">Loading transactions...</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No transactions found for {ticker}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Shares</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                      <th className="w-24"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {transactions.map((transaction) => {
                      const effectiveCurrency = getEffectiveCurrencyForTicker(transaction.ticker, transaction.currency)

                      return (
                      <tr key={transaction.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 px-4 text-gray-300 text-sm">
                          {new Date(transaction.date).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium ${
                            transaction.type === 'buy'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-rose-500/10 text-rose-400'
                          }`}>
                            {transaction.type.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-gray-300 text-sm">{transaction.shares}</td>
                        <td className="py-3 px-4 text-right text-gray-300 text-sm">{formatCurrency(transaction.price, effectiveCurrency)}</td>
                        <td className="py-3 px-4 text-right text-white font-medium text-sm">
                          {formatCurrency(transaction.total_value, effectiveCurrency)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => setEditingTransaction(transaction)}
                              className="p-1.5 text-accent-400 hover:bg-accent-500/10 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(transaction.id)}
                              className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Modal>

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
