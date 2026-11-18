import { useState, useEffect, useCallback } from 'react'
import { transactionService } from '../services'
import { subscribeBrowserPortfolioState } from '../services/browserPortfolioState'
import { Transaction } from '../types'

export const useTransactions = (ticker?: string) => {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true)
      const data = ticker 
        ? await transactionService.getByTicker(ticker)
        : await transactionService.getAll()
      setTransactions(data)
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch transactions')
    } finally {
      setLoading(false)
    }
  }, [ticker])

  useEffect(() => {
    void fetchTransactions()
    const refresh = () => { void fetchTransactions() }
    const unsubscribe = subscribeBrowserPortfolioState(refresh)
    window.addEventListener('storage', refresh)
    return () => {
      unsubscribe()
      window.removeEventListener('storage', refresh)
    }
  }, [fetchTransactions])

  const deleteTransaction = async (id: number) => {
    await transactionService.delete(id)
    await fetchTransactions()
  }

  return {
    transactions,
    loading,
    error,
    refetch: fetchTransactions,
    deleteTransaction
  }
}
