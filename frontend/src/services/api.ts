import axios, { AxiosError, AxiosRequestConfig } from 'axios'
import { API_BASE_URL, API_TIMEOUT } from '../utils/constants'

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
})

// Render free-tier services sleep after ~15 min idle and cold-start in
// 30-60s. During that window the proxy returns 502/503/504 with no CORS
// headers, which the browser surfaces as "CORS error". Retry transparently
// with exponential backoff so a first-visit demo doesn't look broken.

const RETRYABLE_STATUSES = new Set([502, 503, 504])
const MAX_RETRIES = 6
const BASE_DELAY_MS = 1500
const MAX_DELAY_MS = 8000
const WAKING_THRESHOLD_MS = 2000

type RetryConfig = AxiosRequestConfig & { _retryCount?: number; _retryStartedAt?: number }

const isRetryable = (error: AxiosError): boolean => {
  if (error.config?.url?.includes('/health')) return false
  if (!error.response) return error.code !== 'ECONNABORTED'
  if (!RETRYABLE_STATUSES.has(error.response.status)) return false
  // A structured "detail" body means the server (FastAPI) deliberately
  // returned this status — e.g. a permission/persistence error from
  // /api/prices/update. Retrying that is pointless; surface it immediately.
  const data = error.response.data as { detail?: unknown } | undefined
  if (data && typeof data.detail === 'string') return false
  return true
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

let wakingActive = false
const emitWaking = () => {
  if (wakingActive) return
  wakingActive = true
  window.dispatchEvent(new Event('backend-waking'))
}
const emitReady = () => {
  if (!wakingActive) return
  wakingActive = false
  window.dispatchEvent(new Event('backend-ready'))
}

api.interceptors.response.use(
  (response) => {
    emitReady()
    return response
  },
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined
    if (!config || !isRetryable(error)) {
      emitReady()
      return Promise.reject(error)
    }

    config._retryCount = (config._retryCount ?? 0) + 1
    config._retryStartedAt = config._retryStartedAt ?? Date.now()

    if (config._retryCount > MAX_RETRIES) {
      emitReady()
      return Promise.reject(error)
    }

    const elapsed = Date.now() - config._retryStartedAt
    if (elapsed > WAKING_THRESHOLD_MS) emitWaking()

    const delay = Math.min(BASE_DELAY_MS * 2 ** (config._retryCount - 1), MAX_DELAY_MS)
    await sleep(delay)
    return api(config)
  }
)
