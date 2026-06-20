import { ClipboardList } from 'lucide-react'
import { Transaction } from '../../../types'
import { buildGuidanceSection } from './guidance'
import { PromptDefinition } from './types'

const formatNumber = (value: number): string =>
  value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const getTransactionValue = (transaction: Transaction): number => {
  if (transaction.type === 'dividend') {
    return transaction.gross_amount ?? transaction.price ?? 0
  }

  return (transaction.shares || 0) * (transaction.price || 0)
}

const buildTransactionRows = (transactions: Transaction[]): string => {
  if (!transactions.length) {
    return '| No transactions found for this ticker | | | | | |\n| | | | | | |'
  }

  return transactions
    .map((transaction) => {
      const value = getTransactionValue(transaction)
      return `| ${transaction.date} | ${transaction.type.toUpperCase()} | ${transaction.shares} | ${formatNumber(transaction.price)} | ${transaction.currency} | ${formatNumber(value)} |`
    })
    .join('\n')
}

export const taxBacktestPrompt: PromptDefinition = {
  id: 'taxBacktest',
  label: 'Ticker Transactions',
  emoji: '📋',
  icon: ClipboardList,
  description: 'Display transactions for a selected ticker',
  question: 'Display transactions for selected ticker',
  category: 'advanced',

  generate: (ctx) => {
    const {
      selectedTicker,
      selectedTickerTransactions,
      selectedTickerHolding,
      promptOptions,
    } = ctx

    const holdingSummary = selectedTickerHolding
      ? `Current holding: ${selectedTickerHolding.shares} shares, average cost ${formatNumber(selectedTickerHolding.avgPrice)} ${selectedTickerHolding.currency}, current price ${formatNumber(selectedTickerHolding.currentPrice)} ${selectedTickerHolding.currency}, current value EUR ${formatNumber(selectedTickerHolding.value)}.`
      : 'Current holding: no open holding is currently shown for this ticker.'

    return `You are helping me display and sanity-check transactions for one selected ticker from my portfolio.

## Selected Ticker

${selectedTicker || 'No ticker selected'}

${holdingSummary}

## Transactions for ${selectedTicker || 'Selected Ticker'}

| Date | Type | Shares | Price | Currency | Cash Value |
|------|------|--------|-------|----------|------------|
${promptOptions.includeTransactions ? buildTransactionRows(selectedTickerTransactions) : '| Transaction history excluded by prompt option | | | | | |'}

${buildGuidanceSection(ctx)}

## Your Output

1. Display the transactions for ${selectedTicker || 'the selected ticker'} in a clean table sorted by date.
2. Group or label BUY, SELL, and DIVIDEND rows so they are easy to scan.
3. Show simple totals: total bought shares, total sold shares, net shares, total buy cash value, total sell cash value, and dividend cash value if present.
4. Compare net shares from the transactions with the current holding summary and call out any mismatch.
5. Mention any missing or suspicious fields, but keep the answer focused on this ticker's transaction history.`
  },
}
