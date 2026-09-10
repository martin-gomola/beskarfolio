import { useState, useEffect, useCallback } from 'react'
import {
  applyWaitingUpdate,
  checkForUpdate as checkForServiceWorkerUpdate,
  subscribeToUpdateLifecycle,
} from '../platform/updateLifecycle'

/**
 * Exposes the shared waiting-worker lifecycle to the app UI.
 */
export function useServiceWorkerUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    return subscribeToUpdateLifecycle((worker) => setUpdateAvailable(worker !== null))
  }, [])

  const applyUpdate = useCallback(() => applyWaitingUpdate(), [])

  const checkForUpdate = useCallback(async (): Promise<'update' | 'current' | 'unavailable'> => {
    setChecking(true)
    try {
      const result = await checkForServiceWorkerUpdate()
      return result === 'update-found' ? 'update' : result
    } catch {
      return 'unavailable'
    } finally {
      setChecking(false)
    }
  }, [])

  return { updateAvailable, checking, applyUpdate, checkForUpdate }
}
