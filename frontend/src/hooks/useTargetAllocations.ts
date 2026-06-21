import { useEffect, useState } from 'react'

import { TARGET_ALLOCATION_STORAGE_KEY } from '../utils/storageKeys'

export interface TargetAllocation {
  [ticker: string]: number
}

export function useTargetAllocations() {
  const [targetAllocations, setTargetAllocations] = useState<TargetAllocation | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(TARGET_ALLOCATION_STORAGE_KEY)
      setTargetAllocations(stored ? JSON.parse(stored) : null)
    } catch (err) {
      console.error('Failed to load target allocations:', err)
      setTargetAllocations(null)
    }
  }, [])

  return { targetAllocations }
}
