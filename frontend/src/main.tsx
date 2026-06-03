import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { ErrorBoundary, ToastProvider } from './components/common'
import { initWebMCP } from './utils/webmcp'
import './index.css'

// Register WebMCP read-only tools for in-browser AI agents (Chrome 146+ with
// chrome://flags/#enable-webmcp-testing). Feature-detected; no-ops elsewhere.
initWebMCP()

// In dev, public/sw.js still contains unresolved build-time placeholders
// (__PRECACHE_URLS__, __BUILD_VERSION__) which would crash the SW and can
// interfere with HMR. So only register in prod; in dev, also unregister any
// stale SW left over from a prior prod build on the same origin.
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('SW registered:', reg.scope)
          setInterval(() => reg.update(), 5 * 60 * 1000)
        })
        .catch((err) => {
          console.log('SW registration failed:', err)
        })
    })
  } else {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => regs.forEach((reg) => reg.unregister()))
      .catch(() => { /* ignore */ })
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)