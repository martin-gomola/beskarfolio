/**
 * Allocation & Rebalancing API Service
 * LocalStorage-only architecture: All data stored in browser's localStorage
 */

import { api } from './api'
import { loadGuestTransactions } from '../utils/guestStorage'
import { TARGET_ALLOCATION_STORAGE_KEY } from '../utils/storageKeys'
import type { TargetAllocation, AllocationStatus, RebalancePlan, RebalancePlanRequest } from '../types/allocation'

// Helper functions for localStorage
const loadTargetAllocation = (): TargetAllocation | null => {
  try {
    const stored = localStorage.getItem(TARGET_ALLOCATION_STORAGE_KEY)
    if (!stored) return null
    return JSON.parse(stored)
  } catch (err) {
    console.error('Failed to load target allocation:', err)
    return null
  }
}

const saveTargetAllocation = (allocations: TargetAllocation): void => {
  try {
    localStorage.setItem(TARGET_ALLOCATION_STORAGE_KEY, JSON.stringify(allocations))
  } catch (err) {
    console.error('Failed to save target allocation:', err)
  }
}

export const allocationService = {
  /**
   * Get target allocations from localStorage
   */
  getTargets: async (): Promise<{ success: boolean; allocations: TargetAllocation; total: number }> => {
    const allocations = loadTargetAllocation() || {}
    const total = Object.values(allocations).reduce((sum, val) => sum + val, 0)
    
    return {
      success: true,
      allocations,
      total
    }
  },

  /**
   * Save target allocations to localStorage
   */
  saveTargets: async (allocations: TargetAllocation): Promise<{ success: boolean; message: string; total: number }> => {
    saveTargetAllocation(allocations)
    const total = Object.values(allocations).reduce((sum, val) => sum + val, 0)
    
    return {
      success: true,
      message: `Saved ${Object.keys(allocations).length} target allocations to localStorage`,
      total
    }
  },

  /**
   * Get allocation status (current vs. target with drift)
   * Sends transactions and target allocations to backend for calculation
   */
  getStatus: async (): Promise<AllocationStatus> => {
    const transactions = loadGuestTransactions()
    const target_allocations = loadTargetAllocation() || {}

    const response = await api.post('/api/allocation/status', {
      transactions,
      target_allocations
    })
    return response.data
  },

  /**
   * Generate rebalancing plan
   * Sends transactions and target allocations to backend for calculation
   */
  getRebalancePlan: async (request: RebalancePlanRequest = {}): Promise<RebalancePlan> => {
    const transactions = loadGuestTransactions()
    const target_allocations = loadTargetAllocation()

    if (!target_allocations || Object.keys(target_allocations).length === 0) {
      throw new Error('No target allocation configured. Please set target allocation first.')
    }

    const response = await api.post('/api/allocation/rebalance-plan', {
      ...request,
      transactions,
      target_allocations
    })
    
    // Backend returns {success: true, plan: {...}}
    // Extract the plan object
    return response.data.plan || response.data
  }
}
