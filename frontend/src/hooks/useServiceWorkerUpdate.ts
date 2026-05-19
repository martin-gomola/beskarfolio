import { useState, useEffect, useCallback } from 'react'

/**
 * Detects when a new service worker version is active.
 * Shows an update banner so the user can reload to get the latest code.
 *
 * How it works:
 * - sw.js uses skipWaiting() + clients.claim(), so new SWs activate immediately
 * - When a new SW takes control, the 'controllerchange' event fires
 * - We distinguish first-install (no banner) from updates (show banner)
 * - main.tsx calls reg.update() every 5 min to check for new deployments
 */
export function useServiceWorkerUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let hasController = !!navigator.serviceWorker.controller

    const onControllerChange = () => {
      if (hasController) {
        setUpdateAvailable(true)
      }
      hasController = true
    }

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  const reload = () => {
    window.location.reload()
  }

  const checkForUpdate = useCallback(async (): Promise<'update' | 'current' | 'unavailable'> => {
    if (!('serviceWorker' in navigator)) return 'unavailable'
    setChecking(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      if (!reg) return 'unavailable'
      await reg.update()
      // If an update was found, controllerchange will fire and set updateAvailable.
      // Give a short window for the SW lifecycle to complete.
      await new Promise(r => setTimeout(r, 1500))
      return updateAvailable ? 'update' : 'current'
    } catch {
      return 'unavailable'
    } finally {
      setChecking(false)
    }
  }, [updateAvailable])

  return { updateAvailable, checking, reload, checkForUpdate }
}
