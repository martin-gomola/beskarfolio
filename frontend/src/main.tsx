import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { startUpdateLifecycle } from './platform/updateLifecycle'
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
    window.addEventListener('load', startUpdateLifecycle)
  } else {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => regs.forEach((reg) => reg.unregister()))
      .catch(() => { /* ignore */ })
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
