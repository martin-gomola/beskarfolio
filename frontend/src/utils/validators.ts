/**
 * Validation utilities
 */

/**
 * Validate IBKR paste format
 */
export const validateIBKRPaste = (text: string): { valid: boolean; message: string; transactionCount: number } => {
  if (!text.trim()) {
    return { valid: false, message: '', transactionCount: 0 }
  }

  const lines = text.trim().split('\n')
  const hasTabSeparators = lines.some(line => line.includes('\t'))
  const hasDatePattern = lines.some(line => /\d{4}-\d{2}-\d{2}/.test(line))

  if (!hasTabSeparators) {
    return {
      valid: false,
      message: '⚠️ Data should be tab-separated. Did you copy the full table from IBKR?',
      transactionCount: 0
    }
  }

  if (!hasDatePattern) {
    return {
      valid: false,
      message: '⚠️ No dates found. Make sure you copied the transaction table (not summary).',
      transactionCount: 0
    }
  }

  const transactionLines = lines.filter(line =>
    line.includes('\t') && /\d{4}-\d{2}-\d{2}/.test(line) && !line.includes('Date')
  ).length

  return {
    valid: true,
    message: `✅ Looks good! Found ~${transactionLines} transaction(s)`,
    transactionCount: transactionLines
  }
}

/**
 * Validate file type
 */
export const validateFileType = (fileName: string, allowedExtensions: string[]): boolean => {
  const extension = fileName.split('.').pop()?.toLowerCase()
  return extension ? allowedExtensions.includes(extension) : false
}

/**
 * Validate ticker symbol
 */
export const validateTicker = (ticker: string): boolean => {
  return /^[A-Z0-9.]{1,10}$/i.test(ticker)
}
