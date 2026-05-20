import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'

// Services
import { api, priceService } from './services'

// Hooks
import {
  usePortfolio,
  useScrollDirection,
  usePullToRefresh,
  useServiceWorkerUpdate,
  usePrivacyMode,
  PrivacyProvider,
  useSwipeNavigation
} from './hooks'
import { clearAllCaches, updateTransactionsHash } from './utils/guestCache'

// Common Components (always loaded - small)
import { LocalStorageBanner } from './components/common/LocalStorageBanner'
import { DashboardSkeleton, BackupDropdown, BackendWakingOverlay } from './components/common'
import { ToolsMenu } from './components/tools/ToolsMenu'

// Dashboard Components (always loaded - main view)
import { PortfolioSummary as PortfolioCard, TopPerformersStrip } from './components/portfolio'

// Lazy load chart (recharts is 160KB - defer until visible)
const AssetAllocationChart = lazy(() => import('./components/portfolio/AssetAllocationChart').then(m => ({ default: m.AssetAllocationChart })))
import { HoldingsTable } from './components/holdings'
import { AddTransactionModal } from './components/transactions'

// Lazy-loaded Components (loaded on demand)
const AllTransactionsTable = lazy(() => import('./components/transactions/AllTransactionsTable').then(m => ({ default: m.AllTransactionsTable })))
const DemoSection = lazy(() => import('./components/import/DemoSection').then(m => ({ default: m.DemoSection })))
const ImportSection = lazy(() => import('./components/import/ImportSection').then(m => ({ default: m.ImportSection })))
const TaxFreeHoldings = lazy(() => import('./components/tax/TaxFreeHoldings').then(m => ({ default: m.TaxFreeHoldings })))
const DividendSummaryCard = lazy(() => import('./components/dividends/DividendSummaryCard').then(m => ({ default: m.DividendSummaryCard })))
const AnnualPerformanceReport = lazy(() => import('./components/performance/AnnualPerformanceReport').then(m => ({ default: m.AnnualPerformanceReport })))
const AllocationPage = lazy(() => import('./components/allocation/AllocationPage').then(m => ({ default: m.AllocationPage })))
const SettingsPage = lazy(() => import('./components/settings/SettingsPage').then(m => ({ default: m.SettingsPage })))
const AIAnalysisPage = lazy(() => import('./components/ai/AIAnalysisPage').then(m => ({ default: m.AIAnalysisPage })))

// Loading fallback for lazy components (memoized to prevent re-renders)
const TabLoader = React.memo(() => (
  <div className="flex items-center justify-center py-12">
    <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
  </div>
))

type TabType = 'dashboard' | 'performance' | 'allocation' | 'transactions' | 'import-export' | 'tax' | 'ai' | 'settings'

const VALID_TABS: TabType[] = ['dashboard', 'performance', 'allocation', 'transactions', 'import-export', 'tax', 'ai', 'settings']

// Modern minimalist SVG icons for navigation
// size: 'sm' for desktop (16px), 'md' for mobile (20px)
const NavIcons = {
  dashboard: (active: boolean, size: 'sm' | 'md' = 'md') => (
    <svg className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  performance: (active: boolean, size: 'sm' | 'md' = 'md') => (
    <svg className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 20h18" />
      <path d="M6 16l4-6 4 4 4-8" />
    </svg>
  ),
  allocation: (active: boolean, size: 'sm' | 'md' = 'md') => (
    <svg className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v9l6.36 3.68" />
    </svg>
  ),
  tax: (active: boolean, size: 'sm' | 'md' = 'md') => (
    <svg className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h8" />
    </svg>
  ),
  transactions: (active: boolean, size: 'sm' | 'md' = 'md') => (
    <svg className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3l4 4-4 4" />
      <path d="M3 11h18" />
      <path d="M7 21l-4-4 4-4" />
      <path d="M21 13H3" />
    </svg>
  ),
  import: (active: boolean, size: 'sm' | 'md' = 'md') => (
    <svg className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  ),
  ai: (active: boolean, size: 'sm' | 'md' = 'md') => (
    <svg className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a4 4 0 014 4v2a4 4 0 01-8 0V6a4 4 0 014-4z" />
      <path d="M8 14h8" />
      <path d="M12 14v6" />
      <circle cx="8" cy="18" r="2" />
      <circle cx="16" cy="18" r="2" />
    </svg>
  ),
  settings: (active: boolean, size: 'sm' | 'md' = 'md') => (
    <svg className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
    </svg>
  ),
}

// Tab configuration for navigation - single source of truth
interface TabConfig {
  id: TabType
  label: string
  shortLabel?: string
  icon: string // emoji for desktop
  iconKey: keyof typeof NavIcons // SVG icon key for mobile
  showInDesktopNav?: boolean
  showInMobileNav?: boolean
  showInMobileMenu?: boolean
}

const TAB_CONFIG: TabConfig[] = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', icon: '📊', iconKey: 'dashboard', showInDesktopNav: true, showInMobileNav: true },
  { id: 'performance', label: 'Performance', shortLabel: 'Perf', icon: '📈', iconKey: 'performance', showInDesktopNav: true, showInMobileNav: true },
  { id: 'allocation', label: 'Allocation', shortLabel: 'Alloc', icon: '🎯', iconKey: 'allocation', showInDesktopNav: true, showInMobileNav: true },
  { id: 'transactions', label: 'Transactions', shortLabel: 'Txns', icon: '💳', iconKey: 'transactions', showInDesktopNav: true, showInMobileNav: true },
  { id: 'import-export', label: 'Import', shortLabel: 'Import', icon: '📥', iconKey: 'import', showInDesktopNav: true, showInMobileMenu: true },
  { id: 'tax', label: 'Tax', icon: '🧾', iconKey: 'tax', showInDesktopNav: true, showInMobileMenu: true },
  { id: 'ai', label: 'AI', shortLabel: 'AI', icon: '🤖', iconKey: 'ai', showInDesktopNav: true, showInMobileMenu: true },
  { id: 'settings', label: 'Settings', icon: '⚙️', iconKey: 'settings', showInMobileMenu: true },
]

// Tabs shown in different navigation locations
const DESKTOP_NAV_TABS = TAB_CONFIG.filter(t => t.showInDesktopNav)
const MOBILE_NAV_TABS = TAB_CONFIG.filter(t => t.showInMobileNav)
const MOBILE_MENU_TABS = TAB_CONFIG.filter(t => t.showInMobileMenu)
const MOBILE_SWIPE_TAB_IDS = MOBILE_NAV_TABS.map(t => t.id)

// Privacy toggle button for header
const PrivacyToggle: React.FC = () => {
  const { isPrivate, togglePrivacy } = usePrivacyMode()
  return (
    <button
      onClick={togglePrivacy}
      className={`p-2 transition-colors ${isPrivate ? 'text-amber-400 hover:text-amber-300' : 'text-gray-400 hover:text-white'}`}
      aria-label={isPrivate ? 'Show sensitive data' : 'Hide sensitive data'}
      title={isPrivate ? 'Privacy mode ON - click to show data' : 'Privacy mode OFF - click to hide data'}
    >
      {isPrivate ? (
        // Eye-off icon (privacy ON)
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        // Eye icon (privacy OFF)
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  )
}

const getTabFromHash = (): TabType => {
  const hash = window.location.hash.slice(1) // Remove #
  return VALID_TABS.includes(hash as TabType) ? (hash as TabType) : 'dashboard'
}

const App: React.FC = () => {
  // Use custom hook for portfolio data management
  const { summary, holdings, loading, refetch: handleDataUpdate } = usePortfolio()
  const [activeTab, setActiveTab] = useState<TabType>(getTabFromHash)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  
  // Scroll direction for hiding/showing bottom nav
  const scrollDirection = useScrollDirection(15)

  // PWA update detection
  const { updateAvailable, reload: reloadForUpdate } = useServiceWorkerUpdate()

  // Pull-to-refresh for mobile PWA
  const { isPulling, isRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: handleDataUpdate,
    threshold: 80
  })

  // Swipe between mobile nav tabs
  useSwipeNavigation({
    tabs: MOBILE_SWIPE_TAB_IDS,
    activeTab,
    onNavigate: (tab) => { setActiveTab(tab as TabType); window.location.hash = tab },
  })

  // Sync tab with URL hash
  const navigateToTab = (tab: TabType) => {
    setActiveTab(tab)
    window.location.hash = tab
  }

  // Listen for hash changes (back/forward browser navigation)
  useEffect(() => {
    const handleHashChange = () => {
      setActiveTab(getTabFromHash())
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // Auto-refresh prices every 30 min (silent, no UI disruption)
  const autoRefreshRunning = useRef(false)
  const handleAutoRefresh = useCallback(async () => {
    if (autoRefreshRunning.current) return
    autoRefreshRunning.current = true
    try {
      const raw = localStorage.getItem('beskarfolio_guest_transactions')
      if (!raw) return
      const txns = JSON.parse(raw)
      const tickers = [...new Set(txns.map((t: any) => t.ticker))] as string[]
      if (tickers.length === 0) return
      await priceService.updatePrices(tickers)
      window.dispatchEvent(new Event('prices-updated'))
      handleDataUpdate()
    } catch { /* silent */ } finally {
      autoRefreshRunning.current = false
    }
  }, [handleDataUpdate])

  useEffect(() => {
    const listener = () => { handleAutoRefresh() }
    window.addEventListener('auto-refresh-prices', listener)
    return () => window.removeEventListener('auto-refresh-prices', listener)
  }, [handleAutoRefresh])

  // Keyboard shortcuts for escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showAddModal) {
        setShowAddModal(false)
      }
      if (e.key === 'Escape' && showMobileMenu) {
        setShowMobileMenu(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showAddModal, showMobileMenu])

  const handleTransactionAdded = async () => {
    await handleDataUpdate()
    setShowAddModal(false)
  }

  if (loading) {
    return (
      <PrivacyProvider>
        <BackendWakingOverlay />
        <div className="min-h-screen">
          {/* Header Skeleton */}
          <header className="glass-nav border-b border-white/[0.06] sticky top-0 z-30">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="h-8 w-48 bg-gray-800 rounded animate-pulse"></div>
                <div className="h-10 w-32 bg-gray-800 rounded animate-pulse"></div>
              </div>
            </div>
          </header>
          
          {/* Main Content Skeleton */}
          <main className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
            <DashboardSkeleton />
          </main>
        </div>
      </PrivacyProvider>
    )
  }

  return (
    <PrivacyProvider>
    <BackendWakingOverlay />
    <div className="min-h-screen">
      {/* Pull-to-refresh indicator (mobile only) */}
      {(isPulling || isRefreshing) && (
        <div
          className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none sm:hidden"
          style={{
            transform: `translateY(${Math.min(pullDistance, 60) - 40}px)`,
            opacity: Math.min(pullDistance / 40, 1)
          }}
        >
          <div className="bg-surface-elevated rounded-full p-2 shadow-lg border border-gray-700">
            <div
              className={`w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full ${
                isRefreshing ? 'animate-spin' : ''
              }`}
              style={{
                transform: isRefreshing ? 'none' : `rotate(${pullDistance * 4}deg)`
              }}
            />
          </div>
        </div>
      )}

      {/* LocalStorage Information Banner */}
      <LocalStorageBanner />

      {/* PWA Update Banner */}
      {updateAvailable && (
        <div className="bg-accent-600 text-white text-center text-sm px-4 pb-2.5 flex items-center justify-center gap-3 pt-[max(env(safe-area-inset-top),0.625rem)]">
          <span>A new version is available</span>
          <button
            onClick={reloadForUpdate}
            className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-md font-medium text-xs transition-colors"
          >
            Reload
          </button>
        </div>
      )}
      
      {/* Header - Single row: menu/tabs | actions */}
      <header className="glass-nav border-b border-white/[0.06] sticky top-0 z-30">
        <div className={`max-w-7xl mx-auto px-4 sm:px-6 py-2 ${!updateAvailable ? 'pt-[max(env(safe-area-inset-top),0.5rem)] sm:pt-2' : ''}`}>
          <div className="flex items-center justify-between gap-3">
            {/* Mobile menu moved to the primary toolbar position */}
            <button
              onClick={() => setShowMobileMenu(true)}
              className={`flex h-11 w-11 items-center justify-center rounded-xl border transition-all sm:hidden ${
                MOBILE_MENU_TABS.some(t => t.id === activeTab)
                  ? 'border-accent-500/30 bg-accent-600/80 text-white shadow-lg shadow-accent-600/20'
                  : 'border-white/[0.06] bg-white/[0.03] text-gray-400 hover:bg-white/[0.06] hover:text-white'
              }`}
              aria-label="Open menu"
              aria-expanded={showMobileMenu}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h16" />
              </svg>
            </button>

            {/* Tab Navigation - Hidden on Mobile, left-aligned on desktop */}
            <nav className="hidden sm:flex gap-1 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06]">
              {DESKTOP_NAV_TABS.map(tab => {
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => navigateToTab(tab.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive 
                        ? 'bg-accent-600/90 text-white shadow-lg shadow-accent-600/20' 
                        : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]'
                    }`}
                  >
                    {NavIcons[tab.iconKey](isActive, 'sm')}
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </nav>

            {/* Tools, Backup, Privacy & Settings */}
            <div className="flex items-center flex-shrink-0">
              <BackupDropdown onDataImported={handleDataUpdate} />
              <ToolsMenu />
              <PrivacyToggle />
              <button
                onClick={() => navigateToTab('settings')}
                className="hidden sm:block text-gray-400 hover:text-white p-2 transition-colors"
                aria-label="Open settings"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-fade-in">
            <PortfolioCard summary={summary} />

            {summary && summary.transaction_count > 0 && holdings.length > 0 && (
              <TopPerformersStrip holdings={holdings} />
            )}

            {summary && summary.transaction_count > 0 && holdings.length > 0 && (
              <Suspense fallback={<div className="h-64 bg-surface-elevated rounded-lg animate-pulse" />}>
                <AssetAllocationChart holdings={holdings} totalValue={summary.total_value} />
              </Suspense>
            )}

            <HoldingsTable holdings={holdings} onUpdate={handleDataUpdate} />

            {summary && summary.transaction_count > 0 && (
              <Suspense fallback={<div className="h-32 bg-surface-elevated rounded-lg animate-pulse" />}>
                <DividendSummaryCard />
              </Suspense>
            )}

            {/* Empty state for new users */}
            {(!summary || summary.transaction_count === 0) && (
              <div className="bg-surface-elevated rounded-lg p-6 sm:p-12 border border-gray-800 text-center">
                <div className="max-w-md mx-auto">
                  <div className="text-5xl sm:text-6xl mb-3 sm:mb-4">📊</div>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-100 mb-2 font-heading">Welcome to BeskarFolio</h2>
                  <p className="text-gray-400 text-sm sm:text-base mb-4 sm:mb-6">
                    Start tracking your portfolio by adding your first transaction.
                  </p>
                  
                  {/* Primary Actions */}
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center mb-4">
                    <button
                      onClick={() => setShowAddModal(true)}
                      className="bg-accent-600 text-white px-5 sm:px-6 py-2.5 sm:py-3 rounded-lg hover:bg-accent-700 transition-all font-medium flex items-center justify-center gap-2 text-sm sm:text-base btn-press"
                    >
                      <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Add Transaction
                    </button>
                    <button
                      onClick={() => navigateToTab('import-export')}
                      className="bg-gray-700 text-white px-5 sm:px-6 py-2.5 sm:py-3 rounded-lg hover:bg-gray-600 transition-colors font-medium text-sm sm:text-base"
                    >
                      Import CSV
                    </button>
                  </div>
                  
                  {/* Demo Option */}
                  <div className="pt-3 sm:pt-4 border-t border-gray-700/50">
                    <p className="text-gray-500 text-xs mb-2">Or try it out first:</p>
                    <button
                      onClick={async () => {
                        if (!confirm('Load demo portfolio (~€15k, 5 holdings) to try the app?')) return
                        try {
                          clearAllCaches()

                          const { data } = await api.post('/api/import/demo?mode=replace')
                          if (data.success && data.transactions) {
                            const transactions = data.transactions.map((txn: any, i: number) => ({
                              ...txn,
                              id: `demo-${txn.date}-${txn.ticker}-${i}`,
                              total_value: txn.shares * txn.price
                            }))
                            localStorage.setItem('beskarfolio_guest_transactions', JSON.stringify(transactions))
                            updateTransactionsHash(transactions)
                            window.dispatchEvent(new Event('guestTransactionsUpdated'))
                            handleDataUpdate()
                          }
                        } catch (e) {
                          console.error('Demo import error:', e)
                          alert('Failed to load demo')
                        }
                      }}
                      className="text-purple-400 hover:text-purple-300 text-sm font-medium flex items-center justify-center gap-1.5 mx-auto"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Load Demo Portfolio
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Performance Tab */}
        {activeTab === 'performance' && (
          <Suspense fallback={<TabLoader />}>
            <AnnualPerformanceReport />
          </Suspense>
        )}

        {/* Allocation Tab */}
        {activeTab === 'allocation' && (
          <Suspense fallback={<TabLoader />}>
            <AllocationPage />
          </Suspense>
        )}

        {/* Transactions Tab */}
        {activeTab === 'transactions' && (
          <div className="space-y-4 sm:space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-100 font-heading">Transaction Management</h2>
                {/* <p className="text-gray-400 mt-1">View, edit, and manage all your transactions</p> */}
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="bg-accent-600 text-white px-4 py-3 sm:py-2 rounded-lg hover:bg-accent-700 transition-all font-medium flex items-center justify-center gap-2 text-base sm:text-sm w-full sm:w-auto btn-press"
              >
                <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Transaction
              </button>
            </div>

            <Suspense fallback={<TabLoader />}>
              <AllTransactionsTable onUpdate={handleDataUpdate} />
            </Suspense>
          </div>
        )}

        {/* Tax Tab */}
        {activeTab === 'tax' && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-2xl font-bold text-gray-100 font-heading">Tax-Free Holdings Analysis</h2>
            </div>

            <Suspense fallback={<TabLoader />}>
              <TaxFreeHoldings />
            </Suspense>
          </div>
        )}

        {/* Import Tab */}
        {activeTab === 'import-export' && (
          <div className="space-y-4 sm:space-y-6 animate-fade-in">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-100 font-heading">Import Transactions</h2>
              <p className="text-sm text-gray-400 mt-1">Import from CSV files or try demo data</p>
            </div>
            <Suspense fallback={<TabLoader />}>
              <ImportSection onImportComplete={handleDataUpdate} />
              <DemoSection onImportComplete={handleDataUpdate} />
            </Suspense>
          </div>
        )}

        {/* AI Analysis Tab */}
        {activeTab === 'ai' && (
          <Suspense fallback={<TabLoader />}>
            <AIAnalysisPage
              holdings={holdings}
              summary={summary}
              onNavigateToTab={navigateToTab}
            />
          </Suspense>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <Suspense fallback={<TabLoader />}>
            <SettingsPage
              onDataCleared={handleDataUpdate}
            />
          </Suspense>
        )}

      </main>

      {/* Add Transaction Modal */}
      {showAddModal && (
        <AddTransactionModal
          onClose={() => setShowAddModal(false)}
          onTransactionAdded={handleTransactionAdded}
        />
      )}

      {/* Mobile Menu Drawer - For extra items */}
      {showMobileMenu && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40 sm:hidden"
            onClick={() => setShowMobileMenu(false)}
          />

          {/* Drawer - All navigation items */}
          <div
            className="fixed inset-y-0 left-0 w-72 max-w-[86vw] bg-surface-dark/80 backdrop-blur-2xl border-r border-white/[0.06] z-50 sm:hidden overflow-y-auto"
            style={{
              paddingTop: 'max(env(safe-area-inset-top), 0.75rem)',
              paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/[0.06]">
              <h2 className="text-lg font-bold text-gray-100 font-heading">Menu</h2>
              <button
                onClick={() => setShowMobileMenu(false)}
                className="text-gray-400 hover:text-white p-2"
                aria-label="Close menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* All navigation items */}
            <nav className="p-4 space-y-1.5">
              {TAB_CONFIG.map(tab => {
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      navigateToTab(tab.id)
                      setShowMobileMenu(false)
                    }}
                    className={`w-full text-left px-4 py-3 rounded-xl font-medium transition-all duration-200 flex items-center gap-4 ${
                      isActive
                        ? 'bg-accent-600/90 text-white shadow-lg shadow-accent-600/20'
                        : 'text-gray-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <div className={`transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}>
                      {NavIcons[tab.iconKey](isActive)}
                    </div>
                    <span className="tracking-wide">{tab.label}</span>
                  </button>
                )
              })}
            </nav>
          </div>
        </>
      )}

      {/* Mobile Floating Bottom Navigation - Glass pill */}
      <nav 
        className={`fixed left-3 right-3 bg-surface-dark/60 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-lg shadow-black/50 z-40 sm:hidden transition-transform duration-300 ${
          scrollDirection === 'down' ? 'pointer-events-none' : ''
        }`}
        style={{
          bottom: 'max(12px, env(safe-area-inset-bottom))',
          transform: scrollDirection === 'down'
            ? 'translateY(calc(100% + max(16px, env(safe-area-inset-bottom)) + 4px))'
            : 'translateY(0)',
        }}
      >
        <div className="flex items-center justify-around px-4 py-2">
          {MOBILE_NAV_TABS.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => navigateToTab(tab.id)}
                className={`relative flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-2xl transition-all duration-200 ${
                  isActive 
                    ? 'text-white bg-accent-600/80 shadow-lg shadow-accent-600/25' 
                    : 'text-gray-500 hover:text-gray-300 active:scale-95'
                }`}
              >
                <div className={`transition-transform duration-200 ${isActive ? 'scale-105' : ''}`}>
                  {NavIcons[tab.iconKey](isActive)}
                </div>
                <span className="text-[10px] leading-none font-medium">{tab.shortLabel || tab.label}</span>
              </button>
            )
          })}

        </div>
      </nav>

      {/* Bottom padding spacer for mobile to prevent content being hidden behind floating nav */}
      <div className="h-24 sm:hidden" />

      {/* Legal Disclaimer Footer */}
      <footer className="text-center text-[10px] text-gray-600 py-3 sm:py-4 border-t border-gray-800/50 mt-6 sm:mt-8 mb-2 sm:mb-0">
        <p>For informational purposes only. Not financial advice.</p>
      </footer>
    </div>
    </PrivacyProvider>
  )
}

export default App
