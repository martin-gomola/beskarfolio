import { useCallback, useEffect, useMemo, useState } from 'react'

import { api } from '../services'
import { TICKER_INFO_CACHE_KEY } from '../utils/storageKeys'

export interface TickerInfo {
  ticker?: string
  name?: string
  sector?: string
  industry?: string
  country?: string
  region?: string
  isETF?: boolean
  exchange?: string
  currency?: string
  source?: 'finnhub' | 'fallback'
  type?: 'stock' | 'etf' | 'unknown'
}

const TICKER_SECTORS: Record<string, string> = {
  AAPL: 'Tech', MSFT: 'Tech', GOOGL: 'Tech', GOOG: 'Tech', META: 'Tech',
  NVDA: 'Tech', AMD: 'Tech', INTC: 'Tech', ASML: 'Tech', TSM: 'Tech',
  AVGO: 'Tech', QCOM: 'Tech', CSCO: 'Tech', ORCL: 'Tech', CRM: 'Tech',
  ADBE: 'Tech', NOW: 'Tech', SNOW: 'Tech', PLTR: 'Tech', NET: 'Tech',
  JPM: 'Finance', BAC: 'Finance', WFC: 'Finance', GS: 'Finance', MS: 'Finance',
  V: 'Finance', MA: 'Finance', PYPL: 'Finance', SQ: 'Finance', NU: 'Finance',
  COIN: 'Finance', SCHW: 'Finance', BLK: 'Finance',
  AMZN: 'Consumer', TSLA: 'Consumer', NKE: 'Consumer', SBUX: 'Consumer',
  MCD: 'Consumer', HD: 'Consumer', LOW: 'Consumer', TGT: 'Consumer',
  COST: 'Consumer', WMT: 'Consumer', DIS: 'Consumer', NFLX: 'Consumer',
  JNJ: 'Healthcare', UNH: 'Healthcare', PFE: 'Healthcare', MRK: 'Healthcare',
  ABBV: 'Healthcare', LLY: 'Healthcare', TMO: 'Healthcare', ABT: 'Healthcare',
  BA: 'Cyclicals', CAT: 'Cyclicals', DE: 'Cyclicals', GE: 'Cyclicals',
  NCLH: 'Travel', CCL: 'Travel', RCL: 'Travel',
  DAL: 'Travel', UAL: 'Travel', AAL: 'Travel',
  MAR: 'Travel', HLT: 'Travel', H: 'Travel',
  XOM: 'Energy', CVX: 'Energy', COP: 'Energy', SLB: 'Energy',
  'MC.PA': 'Consumer', 'OR.PA': 'Consumer', 'AIR.PA': 'Cyclicals',
  'SAP.DE': 'Tech', 'SIE.DE': 'Cyclicals', 'ALV.DE': 'Finance',
  'ASML.AS': 'Tech',
}

const TICKER_REGIONS: Record<string, string> = {
  AAPL: 'US', MSFT: 'US', GOOGL: 'US', GOOG: 'US', META: 'US',
  NVDA: 'US', AMD: 'US', INTC: 'US', AMZN: 'US', TSLA: 'US',
  JPM: 'US', V: 'US', MA: 'US', JNJ: 'US', UNH: 'US',
  NCLH: 'US', CCL: 'US', SNOW: 'US', NU: 'US', CSCO: 'US',
  ASML: 'EU', 'ASML.AS': 'EU', 'MC.PA': 'EU', 'OR.PA': 'EU', 'AIR.PA': 'EU',
  'SAP.DE': 'EU', 'SIE.DE': 'EU', 'ALV.DE': 'EU',
  TSM: 'Asia/EM', BABA: 'Asia/EM', JD: 'Asia/EM', PDD: 'Asia/EM',
  SONY: 'Asia/EM', TM: 'Asia/EM',
}

const ETF_PATTERNS = ['.DE', 'VWCE', 'SXR', 'IWDA', 'EUNL', 'CSPX', 'VOO', 'VTI', 'QQQ', 'SPY', 'IVV']

const isETFByPattern = (ticker: string) => ETF_PATTERNS.some(pattern => ticker.toUpperCase().includes(pattern))

const getRegionFallback = (ticker: string): string => {
  if (TICKER_REGIONS[ticker]) return TICKER_REGIONS[ticker]
  if (
    ticker.endsWith('.DE') ||
    ticker.endsWith('.PA') ||
    ticker.endsWith('.AS') ||
    ticker.endsWith('.L') ||
    ticker.endsWith('.MI')
  ) return 'EU'
  if (ticker.endsWith('.HK') || ticker.endsWith('.T') || ticker.endsWith('.SS')) return 'Asia/EM'
  return 'US'
}

const getSectorFallback = (ticker: string): string => {
  if (isETFByPattern(ticker)) return 'ETF/Index'
  if (TICKER_SECTORS[ticker]) return TICKER_SECTORS[ticker]
  return 'Other'
}

const loadTickerInfoCache = (): Record<string, TickerInfo> => {
  try {
    const cached = localStorage.getItem(TICKER_INFO_CACHE_KEY)
    return cached ? JSON.parse(cached) : {}
  } catch {
    return {}
  }
}

const saveTickerInfoCache = (cache: Record<string, TickerInfo>) => {
  try {
    localStorage.setItem(TICKER_INFO_CACHE_KEY, JSON.stringify(cache))
  } catch (err) {
    console.warn('Failed to save ticker info cache:', err)
  }
}

export function useTickerProfiles(tickers: string[]) {
  const [tickerInfoCache, setTickerInfoCache] = useState<Record<string, TickerInfo>>({})
  const tickersKey = useMemo(() => [...new Set(tickers)].sort().join('|'), [tickers])

  useEffect(() => {
    const fetchMissingProfiles = async () => {
      const cache = loadTickerInfoCache()
      setTickerInfoCache(cache)

      const uniqueTickers = tickersKey ? tickersKey.split('|') : []
      const missingTickers = uniqueTickers.filter(ticker => !cache[ticker])

      if (missingTickers.length === 0) return

      try {
        const response = await api.post('/api/tickers/profiles/batch', missingTickers)
        const data = response.data

        if (data.success && data.profiles) {
          const updatedCache = { ...cache }
          for (const [ticker, profile] of Object.entries(data.profiles)) {
            updatedCache[ticker] = profile as TickerInfo
          }

          saveTickerInfoCache(updatedCache)
          setTickerInfoCache(updatedCache)
        }
      } catch (err) {
        console.warn('Failed to fetch ticker profiles:', err)
      }
    }

    fetchMissingProfiles()
  }, [tickersKey])

  const getSector = useCallback((ticker: string): string => {
    const cached = tickerInfoCache[ticker]
    if (cached?.sector) return cached.sector
    return getSectorFallback(ticker)
  }, [tickerInfoCache])

  const getRegion = useCallback((ticker: string): string => {
    const cached = tickerInfoCache[ticker]
    if (cached?.region) return cached.region
    return getRegionFallback(ticker)
  }, [tickerInfoCache])

  const isETF = useCallback((ticker: string): boolean => {
    const cached = tickerInfoCache[ticker]
    if (cached?.isETF !== undefined) return cached.isETF
    if (cached?.type === 'etf') return true
    if (cached?.type === 'stock') return false
    return isETFByPattern(ticker)
  }, [tickerInfoCache])

  return { getSector, getRegion, isETF, tickerInfoCache }
}
