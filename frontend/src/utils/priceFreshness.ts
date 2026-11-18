/**
 * Prices are previous-trading-day closes, fetched by a morning refresh.
 * Returns the moment after which a fetch already contains the newest close
 * the user can expect right now:
 * - a refresh on day D carries the close of the trading day before D;
 * - before REFRESH_GRACE_HOUR, today's refresh may not have run yet;
 * - on weekends and Mondays the newest close is Friday's, so any fetch since
 *   Saturday 00:00 is current.
 * ponytail: ignores exchange holidays (one-day false "stale" after a holiday);
 * add a holiday calendar if that becomes annoying.
 */
const REFRESH_GRACE_HOUR = 10

export const expectedFreshSince = (now: Date): Date => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (now.getHours() < REFRESH_GRACE_HOUR) d.setDate(d.getDate() - 1)
  // Walk back while the previous day is not a trading day (Sat/Sun).
  for (;;) {
    const prev = new Date(d)
    prev.setDate(prev.getDate() - 1)
    const day = prev.getDay()
    if (day !== 0 && day !== 6) return d
    d.setDate(d.getDate() - 1)
  }
}

export const isPriceFetchStale = (fetchedAt: Date, now: Date = new Date()): boolean =>
  fetchedAt.getTime() < expectedFreshSince(now).getTime()
