import { useState, useEffect } from 'react'
import { transactionService } from '../services'
import { Transaction } from '../types'

export const useTransactions = (ticker?: string) => {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTransactions = async () => {
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
  }

  useEffect(() => {
    fetchTransactions()
  }, [ticker])

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
