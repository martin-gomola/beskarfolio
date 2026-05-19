import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Collect the final dist file list so the service worker can precache
 * the actual production bundle, including hashed chunks emitted by Vite.
 */
function collectDistFiles(dir: string, rootDir = dir): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.')) return []

    const absolutePath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return collectDistFiles(absolutePath, rootDir)
    }

    const relativePath = path.relative(rootDir, absolutePath).split(path.sep).join('/')
    return [relativePath]
  })
}

/**
 * Injects a build timestamp plus a generated precache list into sw.js
 * so offline mode includes the real production shell.
 */
function swMetadataPlugin(): Plugin {
  return {
    name: 'sw-metadata',
    writeBundle(options) {
      const outDir = options.dir || 'dist'
      const swPath = path.resolve(outDir, 'sw.js')
      if (fs.existsSync(swPath)) {
        const precacheUrls = collectDistFiles(outDir)
          .filter((file) => file !== 'sw.js' && !file.endsWith('.map') && file !== 'stats.html')
          .map((file) => `/${file}`)

        const content = fs.readFileSync(swPath, 'utf-8')
        const patchedContent = content
          .replaceAll('__BUILD_VERSION__', Date.now().toString())
          .replaceAll('__PRECACHE_URLS__', JSON.stringify(precacheUrls, null, 2))

        fs.writeFileSync(swPath, patchedContent)
      }
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Build stats can be expensive; opt-in via ANALYZE=true
    process.env.ANALYZE === 'true'
      ? visualizer({
          filename: 'stats.html',
          open: false,  // Don't auto-open (CI-friendly)
          gzipSize: true,
          brotliSize: true,
        })
      : null,
    // Inject build version and production asset list into service worker
    swMetadataPlugin(),
  ].filter(Boolean) as Plugin[],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // Optimize production builds
    target: 'es2020',
    minify: 'esbuild',  // Use esbuild (faster than terser, built-in)
    cssMinify: true,
    rollupOptions: {
      output: {
        // Manual chunking for better caching
        manualChunks(id) {
          if (id.includes('node_modules/recharts')) return 'chart-vendor'
          return undefined
        },
      },
    },
    // Increase chunk size warning limit (we have large chart dependencies)
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 5173,
    host: true, // Listen on all network interfaces (enables mobile access)
    // In Docker Desktop (especially on macOS), file system events can be flaky.
    // Allow forcing polling + stable HMR websocket settings via env vars from docker-compose.dev.yml.
    watch: process.env.VITE_USE_POLLING === 'true'
      ? { usePolling: true, interval: Number(process.env.CHOKIDAR_INTERVAL || 300) }
      : undefined,
    hmr: (process.env.VITE_HMR_HOST || process.env.VITE_HMR_CLIENT_PORT)
      ? {
          host: process.env.VITE_HMR_HOST || 'localhost',
          clientPort: Number(process.env.VITE_HMR_CLIENT_PORT || 3000),
        }
      : undefined,
    proxy: {
      '/api': {
        // Use Docker service name in containers, localhost otherwise
        target: process.env.VITE_API_URL || 'http://localhost:8060',
        changeOrigin: true,
      },
    },
    // Add HTTP headers to block search engines and enhance privacy
    headers: {
      'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet, noimageindex',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-cache, no-store, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  },
})
