const STRONG_EUR_SUFFIXES = ['.DE', '.PA']

const normalizeTicker = (ticker?: string): string => (ticker || '').trim().toUpperCase()

export const isStrongEurTicker = (ticker?: string): boolean => {
  const normalizedTicker = normalizeTicker(ticker)
  return STRONG_EUR_SUFFIXES.some((suffix) => normalizedTicker.endsWith(suffix))
}

/**
 * Withholding tax rates by ticker suffix (source-country treaty rates for Slovak residents).
 * Rates from dane-priznanie project / official DTC treaties.
 */
const WITHHOLDING_BY_SUFFIX: Record<string, { pct: number; label: string }> = {
  '.PA': { pct: 12.8, label: '12.8% FR' },
  '.AS': { pct: 15, label: '15% NL' },
  '.IR': { pct: 25, label: '25% IE' },
  '.DE': { pct: 0, label: '' },
}

const US_WITHHOLDING = { pct: 15, label: '15% W-8BEN' }

export const getDefaultWithholding = (ticker?: string): { pct: number; label: string } => {
  const t = normalizeTicker(ticker)
  for (const [suffix, info] of Object.entries(WITHHOLDING_BY_SUFFIX)) {
    if (t.endsWith(suffix)) return info
  }
  return US_WITHHOLDING
}

export const getDefaultWithholdingPct = (ticker?: string): number =>
  getDefaultWithholding(ticker).pct

export const getEffectiveCurrencyForTicker = (
  ticker?: string,
  preferredCurrency?: string
): string => {
  if (isStrongEurTicker(ticker)) {
    return 'EUR'
  }

  const normalizedCurrency = (preferredCurrency || '').trim().toUpperCase()
  return normalizedCurrency || 'USD'
}
