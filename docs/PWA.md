# BeskarFolio PWA contract

BeskarFolio is an installable, mobile-first portfolio tracker. The service
worker owns only the application shell. Transactions remain browser-owned in
namespaced localStorage, and `/api/*` requests always stay network-only.

Run the automated contract before browser testing:

```bash
make check
```

## Guaranteed behavior

| Concern | Behavior |
| --- | --- |
| Install identity | Stable manifest `id: /`, standalone display, 192/512 regular icons, dedicated maskable SVG/PNG, 180px Apple icon |
| Offline shell | Built HTML, JavaScript, CSS, manifest, and icons are precached after one connected load |
| Portfolio data | Transactions remain in localStorage; cached calculations may be shown and are labelled by source |
| API behavior | `/api/*` remains network-only and failed requests use the existing recovery UI |
| Update safety | A new worker waits until the user chooses **Update now** |
| Multi-tab update | Activation claims clients and each controlled tab reloads at most once |
| Update checks | Hourly, when a visible app is overdue, and from the Settings action |
| Privacy | Robots metadata and edge headers discourage indexing but are not authentication |

## Update lifecycle

1. Vite stamps a build version and the emitted asset list into `public/sw.js`.
2. The browser installs the new worker and leaves it waiting.
3. `platform/updateLifecycle.ts` publishes the waiting worker to both app
   consumers.
4. **Update now** sends `{ type: 'SKIP_WAITING' }` to that worker.
5. Activation removes only old `beskarfolio-*` caches and claims clients.
6. Each controlled tab observes `controllerchange` and reloads once.

Do not restore unconditional `skipWaiting()` in the install handler. It can
make a new worker control JavaScript loaded from the previous release.

## Storage and offline limits

- The cached shell can open without a network connection.
- Transactions remain available because they are browser-owned.
- Current calculations and prices may be stale or unavailable offline.
- The worker must not cache API responses to disguise stale data as current.
- Browser and installed Home Screen storage may differ; export backups remain
  the recovery path.

Do not add IndexedDB synchronization, an outbox, background sync, or push
notifications unless a real feature needs server-owned mutable state.

## Release proof

Automated:

```bash
make check
```

Manual update check:

1. Open a production build in two tabs.
2. Deploy a visible frontend change without closing either tab.
3. Confirm the new worker waits and both tabs remain on the old build.
4. Choose **Update now** in one tab.
5. Confirm both tabs reload once and show the new build.

Manual installed-app check:

1. Install from the HTTPS deployment after one connected load.
2. Force-close, disconnect the network, and reopen from the Home Screen.
3. Confirm the shell and browser-owned transactions remain available.
4. Rotate the device, open transaction forms, and inspect fixed navigation
   around the keyboard and home indicator.
5. Restore the network and confirm portfolio recalculation can be retried.

A responsive desktop viewport is not proof of iPhone cold-launch, storage, or
safe-area behavior. Record that device gap when it has not been tested.
