/**
 * WebMCP client-side integration for BeskarFolio.
 *
 * Registers read-only "tools" that an in-browser AI agent (Gemini-in-Chrome,
 * the Model Context Tool Inspector extension, etc.) can call against the
 * CURRENT visitor's portfolio. Because BeskarFolio keeps all transactions in
 * localStorage (never on the server), these client-side tools can expose the
 * user's actual holdings — something the server-side `.well-known/webmcp`
 * manifest and the local MCP server fundamentally cannot do.
 *
 * Spec: W3C Web Machine Learning CG draft, `navigator.modelContext` (Chrome 146+
 * behind chrome://flags/#enable-webmcp-testing). This uses the production
 * `registerTool({ name, description, inputSchema, execute })` shape — each
 * `execute()` returns MCP content blocks `{ content: [{ type, text }] }`.
 *
 * Safety:
 * - Read-only. No tool mutates transactions/prices or triggers paid API calls.
 * - Operates only on this browser's own localStorage; no cross-user surface.
 * - Feature-detected: no-ops in SSR and any browser without the API. No deps.
 *
 * Testing: enable the flag in Chrome Canary/Dev 146+, install the
 * "Model Context Tool Inspector" extension, open the app, and the side panel
 * will list/execute these tools.
 */
import { api } from '../services/api'
import { loadGuestTransactions } from './guestStorage'
import type { Holding } from '../types/holding'
import type { PortfolioSummary } from '../types/portfolio'

interface ToolContentBlock {
  type: 'text'
  text: string
}

interface ToolResult {
  content: ToolContentBlock[]
}

interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (args: Record<string, unknown>) => Promise<ToolResult>
}

interface ModelContextLike {
  registerTool?: (tool: ToolDefinition) => void
}

interface CalculateResponse {
  summary: PortfolioSummary
  holdings: Holding[]
}

/** Wrap any JSON-serializable value as an MCP text content block. */
function jsonResult(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] }
}

/**
 * Compute the visitor's holdings + summary via the existing stateless backend.
 * Reuses the same endpoint the app itself uses so the agent sees identical,
 * FIFO-accurate numbers without re-implementing the math here.
 */
async function calculatePortfolio(): Promise<CalculateResponse> {
  const transactions = loadGuestTransactions()
  if (transactions.length === 0) {
    return {
      summary: {
        success: true,
        transaction_count: 0,
        total_value: 0,
        total_invested: 0,
        total_gain_loss: 0,
        total_gain_loss_pct: 0,
        holdings_count: 0,
      },
      holdings: [],
    }
  }
  const response = await api.post('/api/portfolio/calculate', transactions)
  return {
    summary: response.data.summary,
    holdings: response.data.holdings || [],
  }
}

function buildTools(): ToolDefinition[] {
  return [
    {
      name: 'get_portfolio_summary',
      description:
        "Get the current visitor's portfolio summary: total value, total " +
        'invested, total gain/loss (absolute and percent), and counts of ' +
        'holdings and transactions. Reflects localStorage data in this browser.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        const { summary } = await calculatePortfolio()
        return jsonResult(summary)
      },
    },
    {
      name: 'get_holdings',
      description:
        "List the current visitor's holdings with shares, average buy price, " +
        'current price, current value, invested value, and gain/loss per ticker. ' +
        "Pass a ticker to filter. Reads from this browser's localStorage.",
      inputSchema: {
        type: 'object',
        properties: {
          ticker: {
            type: 'string',
            description: 'Optional. Filter to a single ticker, e.g. AAPL.',
          },
        },
      },
      execute: async (args) => {
        const { holdings } = await calculatePortfolio()
        const ticker = typeof args.ticker === 'string' ? args.ticker : ''
        if (ticker) {
          const want = ticker.toUpperCase().trim()
          return jsonResult(holdings.filter((h) => h.ticker.toUpperCase() === want))
        }
        return jsonResult(holdings)
      },
    },
    {
      name: 'get_transactions',
      description:
        "List the current visitor's individual buy/sell/dividend transactions, " +
        'most recent first. Each item has ticker, type, date, shares, price, ' +
        'currency, and total_value. Use this to answer questions like "what was ' +
        'my latest purchase?". Pass a ticker to filter and limit to cap results ' +
        "(default 20). Reads from this browser's localStorage.",
      inputSchema: {
        type: 'object',
        properties: {
          ticker: {
            type: 'string',
            description: 'Optional. Filter to a single ticker, e.g. AAPL.',
          },
          limit: {
            type: 'number',
            description: 'Optional. Max transactions to return (default 20).',
          },
        },
      },
      execute: async (args) => {
        const transactions = loadGuestTransactions()
        const ticker = typeof args.ticker === 'string' ? args.ticker.toUpperCase().trim() : ''
        const limit =
          typeof args.limit === 'number' && args.limit > 0 ? Math.floor(args.limit) : 20

        const sorted = [...transactions]
          .filter((t) => !ticker || t.ticker.toUpperCase() === ticker)
          // Most recent first: by trade date, then creation time as a tiebreaker.
          .sort((a, b) => {
            if (a.date !== b.date) return a.date < b.date ? 1 : -1
            return (a.created_at || '') < (b.created_at || '') ? 1 : -1
          })
          .slice(0, limit)
          .map((t) => ({
            ticker: t.ticker,
            type: t.type,
            date: t.date,
            shares: t.shares,
            price: t.price,
            currency: t.currency,
            total_value: t.total_value,
          }))

        return jsonResult(sorted)
      },
    },
    {
      name: 'get_app_context',
      description:
        'Get structured context about BeskarFolio: what it does, how data is ' +
        'stored, and which metrics it computes. Useful for an agent describing ' +
        'the app to a user.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () =>
        jsonResult({
          name: 'BeskarFolio',
          summary:
            'Minimal, privacy-first stock portfolio tracker. Transactions live ' +
            'in the browser; the backend is stateless and only computes.',
          storage: 'Browser localStorage (transactions) + server-cached CSV prices',
          metrics: [
            'Holdings & unrealized gain/loss',
            'Time-weighted return (TWR)',
            'Slovak 365-day tax-free shares (FIFO)',
            'Allocation by sector/region',
          ],
          currencies: ['EUR', 'USD'],
        }),
    },
  ]
}

/**
 * Register WebMCP tools if the browser exposes navigator.modelContext.
 * Safe to call unconditionally and once at startup; it no-ops outside a browser
 * or on any browser without the (flag-gated) API.
 */
export function initWebMCP(): void {
  if (typeof navigator === 'undefined') return

  const ctx = (navigator as unknown as { modelContext?: ModelContextLike })
    .modelContext
  if (!ctx?.registerTool) return

  try {
    for (const tool of buildTools()) {
      ctx.registerTool(tool)
    }
  } catch (e) {
    // Swallow: the API is still flag-gated and may change before it ships.
    if (import.meta.env.DEV) console.debug('[webmcp] registerTool failed:', e)
  }
}
