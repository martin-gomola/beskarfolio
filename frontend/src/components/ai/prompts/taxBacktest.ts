import { Calculator } from 'lucide-react'
import { Transaction } from '../../../types'
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
  label: 'Tax and Backtest',
  emoji: '🧮',
  icon: Calculator,
  description: 'Generate a ticker-specific tax-free and backtest prompt',
  question: 'Calculate tax-free dates and backtest a ticker swap',
  category: 'advanced',

  generate: (ctx) => {
    const {
      selectedTicker,
      replacementTicker,
      selectedTickerTransactions,
      selectedTickerHolding,
      selectedTickerTaxFreeSection,
    } = ctx

    const holdingSummary = selectedTickerHolding
      ? `Current holding: ${selectedTickerHolding.shares} shares, average cost ${formatNumber(selectedTickerHolding.avgPrice)} ${selectedTickerHolding.currency}, current price ${formatNumber(selectedTickerHolding.currentPrice)} ${selectedTickerHolding.currency}, current value EUR ${formatNumber(selectedTickerHolding.value)}.`
      : 'Current holding: no open holding is currently shown for this ticker.'

    const replacementInstruction = replacementTicker
      ? `Use ${replacementTicker} as the replacement ticker for the backtest.`
      : 'Before running the backtest, ask me which replacement ticker to compare against.'

    return `You are helping me analyze one ticker from my portfolio for Slovak tax-free holding dates and a ticker-swap backtest.

## Selected Ticker

${selectedTicker || 'No ticker selected'}

${holdingSummary}

${selectedTickerTaxFreeSection || 'No precomputed tax-free status is available for this ticker.'}

## Transactions for ${selectedTicker || 'Selected Ticker'}

| Date | Type | Shares | Price | Currency | Cash Value |
|------|------|--------|-------|----------|------------|
${buildTransactionRows(selectedTickerTransactions)}

## Tax-Free Rules to Apply

- Jurisdiction: Slovakia.
- Shares held for 365 days are treated as tax-free for capital gains.
- Use FIFO lot accounting.
- BUY transactions create lots.
- SELL transactions consume the oldest open lots first.
- DIVIDEND transactions do not affect share lots.

## Backtest Rules

${replacementInstruction}

For the ticker-swap backtest:
1. For each BUY of ${selectedTicker || 'the selected ticker'}, invest the same cash value on the same date into the replacement ticker.
2. Use adjusted close prices where possible. If the market was closed on a transaction date, use the next available trading day and state that adjustment.
3. For SELL transactions, mirror the same FIFO cash-flow logic and clearly state your assumption for how replacement shares are sold.
4. Compare the actual ${selectedTicker || 'selected ticker'} path against the replacement ticker path through today.
5. Show total invested, current value or final value, gain/loss, gain/loss %, and key caveats.

## Your Output

1. Current open FIFO lots with buy date, remaining shares, days held, tax-free date, and current tax status.
2. Next tax-free date and how many shares become tax-free then.
3. Backtest table by transaction date.
4. Final comparison between ${selectedTicker || 'selected ticker'} and the replacement ticker.
5. Plain-English conclusion with assumptions and data gaps.`
  },
}
