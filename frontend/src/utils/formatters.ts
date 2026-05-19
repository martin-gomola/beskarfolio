/**
 * Format currency value with appropriate symbol
 */
export const formatCurrency = (value: number, currency: string = 'EUR'): string => {
  const symbol = currency === 'USD' ? '$' : '€'
  return `${symbol}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Format date to locale string
 */
export const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString()
}

/**
 * Format exact time with month, day, hour, and minute
 */
export const formatExactTime = (isoString: string): string => {
  const date = new Date(isoString)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Format percentage with sign
 */
export const formatPercentage = (value: number): string => {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

/**
 * Format large numbers with K suffix
 */
export const formatCompact = (value: number): string => {
  return `€${(value / 1000).toFixed(1)}k`
}

/**
 * Normalize decimal input: accept both comma and dot as decimal separator,
 * strip non-numeric chars, and prevent multiple decimal points.
 */
export const normalizeDecimal = (value: string): string => {
  let v = value.replace(',', '.')
  v = v.replace(/[^\d.-]/g, '')
  const i = v.indexOf('-', 1)
  if (i > 0) v = v.slice(0, i)
  const parts = v.split('.')
  if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('')
  return v
}
