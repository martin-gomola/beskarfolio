import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

class MemoryStorage {
  #values = new Map()

  get length() {
    return this.#values.size
  }

  clear() {
    this.#values.clear()
  }

  getItem(key) {
    return this.#values.get(String(key)) ?? null
  }

  key(index) {
    return [...this.#values.keys()][index] ?? null
  }

  removeItem(key) {
    this.#values.delete(String(key))
  }

  setItem(key, value) {
    this.#values.set(String(key), String(value))
  }
}

globalThis.localStorage = new MemoryStorage()
globalThis.window = new EventTarget()
globalThis.window.location = { hostname: 'localhost' }

let api
let backupService
let browserPortfolioState
let guestStorage
let vite

const transaction = {
  id: 1,
  ticker: 'AAPL',
  type: 'buy',
  date: '2026-01-02',
  shares: 2,
  price: 100,
  currency: 'USD',
  total_value: 200,
  created_at: '2026-01-02T10:00:00.000Z',
}

const summary = {
  success: true,
  transaction_count: 1,
  total_value: 240,
  total_invested: 200,
  total_gain_loss: 40,
  total_gain_loss_pct: 20,
  holdings_count: 1,
}

const holding = {
  ticker: 'AAPL',
  shares: 2,
  avg_buy_price: 100,
  current_price: 120,
  current_value: 240,
  invested_value: 200,
  gain_loss: 40,
  gain_loss_pct: 20,
  currency: 'USD',
  current_value_eur: 220,
  invested_value_eur: 184,
}

before(async () => {
  vite = await createServer({
    root: process.cwd(),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })
  browserPortfolioState = await vite.ssrLoadModule('/src/services/browserPortfolioState.ts')
  backupService = await vite.ssrLoadModule('/src/utils/backupService.ts')
  guestStorage = await vite.ssrLoadModule('/src/utils/guestStorage.ts')
  ;({ api } = await vite.ssrLoadModule('/src/services/api.ts'))
})

after(async () => {
  await vite.close()
})

beforeEach(() => {
  localStorage.clear()
  api.post = async () => {
    throw new Error('Unexpected backend call')
  }
})

test('returns an empty snapshot without calling the backend', async () => {
  let calls = 0
  api.post = async () => {
    calls += 1
  }

  const snapshot = await browserPortfolioState.readBrowserPortfolio()

  assert.equal(snapshot.source, 'empty')
  assert.deepEqual(snapshot.transactions, [])
  assert.equal(calls, 0)
})

test('calculates and caches a stored browser portfolio', async () => {
  guestStorage.saveGuestTransactions([transaction])
  let calls = 0
  api.post = async (path, body) => {
    calls += 1
    assert.equal(path, '/api/portfolio/calculate')
    assert.deepEqual(body, [transaction])
    return { data: { summary, holdings: [holding] } }
  }

  const calculated = await browserPortfolioState.readBrowserPortfolio()
  const cached = await browserPortfolioState.readBrowserPortfolio()

  assert.equal(calculated.source, 'backend')
  assert.equal(cached.source, 'cache')
  assert.equal(calls, 1)
})

test('replaces transactions and emits one typed change', () => {
  const changes = []
  const unsubscribe = browserPortfolioState.subscribeBrowserPortfolioState(change => changes.push(change))
  localStorage.setItem('beskarfolio_cache_summary', 'stale cache')

  browserPortfolioState.replaceBrowserTransactions([transaction], 'demo')

  unsubscribe()
  assert.deepEqual(browserPortfolioState.readBrowserTransactions(), [transaction])
  assert.equal(changes.length, 1)
  assert.equal(changes[0].kind, 'transactions-changed')
  assert.equal(changes[0].reason, 'demo')
  assert.deepEqual(changes[0].transactions, [transaction])
  assert.equal(localStorage.getItem('beskarfolio_cache_summary'), null)
  assert.notEqual(localStorage.getItem('beskarfolio_transactions_hash'), null)
})

test('creates, updates, and deletes through the browser state interface', () => {
  const reasons = []
  const unsubscribe = browserPortfolioState.subscribeBrowserPortfolioState(change => reasons.push(change.reason))

  const created = browserPortfolioState.createBrowserTransaction({
    ticker: 'VWCE.DE',
    type: 'buy',
    date: '02/01/2026',
    shares: 3,
    price: 125,
    currency: 'EUR',
  })
  const updated = browserPortfolioState.updateBrowserTransaction(created.id, { shares: 4 })
  const deleted = browserPortfolioState.deleteBrowserTransaction(created.id)

  unsubscribe()
  assert.equal(created.date, '2026-01-02')
  assert.equal(created.total_value, 375)
  assert.equal(updated?.total_value, 500)
  assert.equal(deleted, true)
  assert.deepEqual(browserPortfolioState.readBrowserTransactions(), [])
  assert.deepEqual(reasons, ['create', 'update', 'delete'])
})

test('imports a batch with one write notification', () => {
  const reasons = []
  const unsubscribe = browserPortfolioState.subscribeBrowserPortfolioState(change => reasons.push(change.reason))

  const imported = browserPortfolioState.writeBrowserTransactions([
    {
      ticker: 'AAPL',
      type: 'buy',
      date: '2026-02-01',
      shares: 1,
      price: 150,
      currency: 'USD',
    },
    {
      ticker: 'VWCE.DE',
      type: 'buy',
      date: '2026-02-02',
      shares: 2,
      price: 130,
      currency: 'EUR',
    },
  ], { mode: 'replace', reason: 'import' })

  unsubscribe()
  assert.equal(imported.length, 2)
  assert.equal(browserPortfolioState.readBrowserTransactions().length, 2)
  assert.notEqual(imported[0].id, imported[1].id)
  assert.deepEqual(reasons, ['import'])
})

test('appends an imported batch without replacing stored transactions', () => {
  guestStorage.saveGuestTransactions([transaction])
  const reasons = []
  const unsubscribe = browserPortfolioState.subscribeBrowserPortfolioState(change => reasons.push(change.reason))

  browserPortfolioState.writeBrowserTransactions([
    {
      ticker: 'VWCE.DE',
      type: 'buy',
      date: '2026-02-02',
      shares: 2,
      price: 130,
      currency: 'EUR',
    },
  ], { mode: 'append', reason: 'import' })

  unsubscribe()
  assert.deepEqual(
    browserPortfolioState.readBrowserTransactions().map(item => item.ticker),
    ['AAPL', 'VWCE.DE'],
  )
  assert.deepEqual(reasons, ['import'])
})

test('does not persist or notify for an empty append', () => {
  guestStorage.saveGuestTransactions([transaction])
  const storedBefore = localStorage.getItem('beskarfolio_guest_transactions')
  const reasons = []
  const unsubscribe = browserPortfolioState.subscribeBrowserPortfolioState(change => reasons.push(change.reason))

  const imported = browserPortfolioState.writeBrowserTransactions([], {
    mode: 'append',
    reason: 'import',
  })

  unsubscribe()
  assert.deepEqual(imported, [])
  assert.equal(localStorage.getItem('beskarfolio_guest_transactions'), storedBefore)
  assert.deepEqual(reasons, [])
})

test('materializes demo inputs that survive a backup round trip', () => {
  const stored = browserPortfolioState.writeBrowserTransactions([
    {
      ticker: 'AAPL',
      type: 'buy',
      date: '02/03/2026',
      shares: 2,
      price: 140,
      currency: 'USD',
    },
  ], { mode: 'replace', reason: 'demo' })

  const backup = backupService.createBackup('test')
  const parsed = backupService.parseBackup(JSON.stringify(backup))

  assert.equal(typeof stored[0].id, 'number')
  assert.equal(typeof stored[0].created_at, 'string')
  assert.equal(stored[0].date, '2026-03-02')
  assert.equal(stored[0].total_value, 280)
  assert.equal(parsed?.transactions.length, 1)
})

test('keeps a persisted mutation successful when a listener fails', () => {
  const observed = []
  const unsubscribeFailing = browserPortfolioState.subscribeBrowserPortfolioState(() => {
    throw new Error('listener failed')
  })
  const unsubscribeObserved = browserPortfolioState.subscribeBrowserPortfolioState(change => {
    observed.push(change.reason)
  })

  const originalConsoleError = console.error
  console.error = () => {}
  try {
    assert.doesNotThrow(() => {
      browserPortfolioState.replaceBrowserTransactions([transaction], 'replace')
    })
  } finally {
    console.error = originalConsoleError
  }

  unsubscribeFailing()
  unsubscribeObserved()
  assert.deepEqual(browserPortfolioState.readBrowserTransactions(), [transaction])
  assert.deepEqual(observed, ['replace'])
})
