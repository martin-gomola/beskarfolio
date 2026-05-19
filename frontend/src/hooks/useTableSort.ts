import { useState } from 'react'

export type SortOrder = 'asc' | 'desc'

export type SortBy = 'ticker' | 'value' | 'return'

export const useTableSort = <T extends string = SortBy>(defaultSortBy: T, defaultOrder: SortOrder = 'desc') => {
  const [sortBy, setSortBy] = useState<T>(defaultSortBy)
  const [sortOrder, setSortOrder] = useState<SortOrder>(defaultOrder)

  const handleSort = (column: T) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
  }

  return {
    sortBy,
    sortOrder,
    handleSort
  }
}
