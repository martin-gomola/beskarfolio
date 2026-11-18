# Stephen Few review — all screens

Date: 2026-11-18 · Build: `main` @ `9de9cc2`, `make dev` (Vite on :3000) · Data: built-in demo portfolio
(5 holdings, 23 transactions); Allocation reviewed with equal 20% sample targets.
Screenshots: [`screens/`](screens/) (`<tab>-desktop-full`, `<tab>-mobile-fold`, `<tab>-mobile-full`; 1440×900 and 375×812).

**Scope limits**

- **Light mode does not exist.** The app is dark-only (no `darkMode` in `tailwind.config.js`, no `dark:` variants), so every
  finding is for the dark theme. "Works in both themes" cannot be assessed; adding light mode is out of scope here.
- **Tax** could not be seen in its taxable state: every demo lot is older than 365 days.
- **AI / Import / Settings** are mostly forms and display little data, so few of Few's principles apply.

---

## Ranked top 10 (impact ÷ effort)

**Status:** #1–#5 fixed on 2026-11-18. #3 was fixed by labelling the two metrics, not merging them: Dashboard shows
*unrealized* P&L/return on open positions, and Performance shows total gain *including realized* sales. Both are
correct, just different. #4 fixed only the sign; `tabular-nums` coverage is still open.

| # | Screen | Fix | Impact | Effort |
|---|--------|-----|--------|--------|
| 1 | Allocation | Draw drift as a bullet graph (current bar + target tick); current is drawn **under** target today, so underweight rows look identical | High | S |
| 2 | Dashboard | Convert holdings Value/Invested/Return to EUR (or add an EUR column); USD and EUR are mixed and sorted together | High | S |
| 3 | Dashboard ↔ Performance | Reconcile or label the two "return" figures (45.77% vs 45.34%, €5,865 vs €5,972, invested €12,815 vs net flow €12,708) | High | M |
| 4 | Shared | Fix `formatCurrency` sign placement (`$-182.30` → `−$182.30`) and use tabular numerals everywhere | High | S |
| 5 | Performance | Use a real time axis for the chart (it is categorical now, so time is distorted); straight lines instead of `monotone` | High | S |
| 6 | Shared | Use color only for meaning: stop greening tickers, BUY pills, net flow, FX rates, and "Fresh 0" | Med | S |
| 7 | Dashboard | Rank the KPIs: Value as the hero next to a comparison; the other five as a compact secondary row | Med | S |
| 8 | Shared | Turn the LocalStorage banner into a one-line, dismissible-forever notice (it fills 20% of the mobile fold) | Med | S |
| 9 | Tax | When everything is tax-free, collapse the five full-green cards into one summary line plus a compact table | Med | S |
| 10 | Shared | Use one date format (`toLocaleDateString()` gives `1/8/2025`, the chart shows `2024-03-15`) and one decimal separator (`17,11` in Targets) | Med | S |

---

## Patterns across screens (fix once in shared code)

1. **Number formatting is not centralized.** `utils/formatters.ts` `formatCurrency` puts the sign after the symbol, hard-codes
   `en-US`, and is bypassed in at least a dozen places (`€{x.toLocaleString()}` in `allocation/ShareBasedRebalancingToolInline.tsx`,
   raw `toFixed` in `AllocationPage.tsx`). Add `formatSignedCurrency`, `formatSignedPct`, and a single `formatDate`, and use
   them everywhere. Apply `tabular-nums` to every numeric column (it appears in only ~25 places).
2. **Green is the brand, the "gain" color, and the "selected" color at once.** Tickers (`font-mono text-accent-400`), BUY pills,
   active tabs, primary buttons, gains, progress fills, and Settings values are all green. A green number therefore tells the user
   nothing. Proposed rule: neutral gray/white for data; green and red **only** for signed P&L or return; amber only for stale or
   warning states; brand green only for navigation and primary actions.
3. **Red/green is the only gain/loss cue.** Pair every colored value with an explicit sign (already mostly done) and avoid
   red/green fills as the sole encoding (return pills, Trim/Add boxes). Prefer a blue/orange-safe accent for the donut
   categories, and never use red as a category color (MSFT is red in the donut).
4. **Decorative ink.** There is an icon in every KPI card (`VALUE` wallet, `RETURN` sparkle, tax shield/clock), card-in-card
   borders (Performance hero), emoji in goal chips and errors, and dashed full grids. Drop the icons from data cards, use one
   border level, and use light horizontal gridlines only.
5. **Numbers without context.** Dashboard Value, Tax "Next 30 days 0.00", Allocation "Total drift 34.4%", and Settings counts are
   shown with no comparison, unit, or threshold. Each needs a comparator (previous period, benchmark, target, or limit) or a unit.
6. **Freshness is contradictory.** Dashboard says "Updated just now" next to "Last price update: 79d ago". Settings says
   "Rates updated 184d ago", "Fresh 0", "Stale 22". Show one freshness timestamp, in a consistent place (header), with amber
   when stale. "Updated just now" should mean the prices, not the cache.
7. **Mobile fold.** The LocalStorage banner (~160px) plus the header leave about 60% of an iPhone fold for data. On
   Performance the chart is three screens down; on Dashboard per-holding returns are behind "View all 5".

---

## Dashboard (`#dashboard`)

**Should answer:** What is my portfolio worth, is it doing well against what I put in or the market, and which positions drive it?

| Sev | Principle → observation → fix | File |
|-----|-------------------------------|------|
| High | *Consistency/accuracy* → the holdings table mixes `$` and `€` in Value/Invested/Return and sorts across currencies (GOOGL `$6,238.62` sits above VWCE `€5,014.20`; the composition table shows GOOGL as `€5,671`). → Show EUR values (native price stays in Current Price), or add a native column and sort by EUR. | `holdings/HoldingsTable.tsx` |
| High | *Formatting* → `$-182.30`. → Put the sign first and use a true minus (`−$182.30`). | `utils/formatters.ts` |
| Med | *Visual hierarchy* → six KPI cards at equal size and weight. Value and Return compete, and Invested gets as much space as Return. → One hero row: Value (large) + P&L/Return paired. Secondary row: YTD, Annual, Invested in smaller text. Remove the icons. | `portfolio/PortfolioSummary.tsx` |
| Med | *Context* → no comparison on Value or Return. Performance computes the benchmark delta (+16.48%), but Dashboard doesn't show it. → Add "vs S&P 500 +16.5 pp" under Return and a YTD sparkline. | `portfolio/PortfolioSummary.tsx` |
| Med | *Chart choice* → a donut for five parts, with a red slice for one holding. The table next to it already gives the weights. → Replace with a horizontal bar per position (sorted by weight) inside the table rows, or drop the donut and keep a weight bar column. | `portfolio/AllocationDonutView.tsx`, `portfolio/AssetAllocationChart.tsx` |
| Med | *Redundancy* → "Portfolio composition" and "Holdings details" show the same five rows with overlapping columns (weight, value, return). → Merge: add Weight to Holdings details and drop the composition table. | `portfolio/AllocationDonutView.tsx`, `holdings/HoldingsTable.tsx` |
| Low | *Data-ink* → the Return % pills have a colored fill, duplicating the colored Return column next to them. → Plain signed text. | `holdings/HoldingsTable.tsx` |
| Low | *Clarity* → the `52w 77%` chip is cryptic. → A tiny 52-week range bar (low–high with a dot) instead of the percentage. | `holdings/FiftyTwoWeekChip.tsx` |
| Low | *Mobile* → per-holding returns are hidden behind "View all 5", and the donut legend drops value and return. → Show the top 5 rows inline (ticker, value, return). | `holdings/HoldingsTable.tsx` |

## Performance (`#performance`)

**Should answer:** How has my return developed over time, and am I beating the benchmark?

| Sev | Principle → observation → fix | File |
|-----|-------------------------------|------|
| High | *Honest time axis* → `XAxis dataKey="date"` is categorical, so irregular sample dates are evenly spaced (`2024-03-15, 04-15, 06-01 … 2025-06-01, 2025-10-01`). Time is compressed and stretched. → `type="number" scale="time"` with timestamps and evenly spaced tick labels (`Mar '24`). | `performance/PerformanceChart.tsx` |
| High | *Accuracy* → `type="monotone"` smooths the lines between points, inventing values (the flat lines after the last update read as real data). → `type="linear"`, and mark the stale-price period. | `performance/PerformanceChart.tsx` |
| High | *Consistency* → All-time return here is 45.34% / €5,972, Dashboard says 45.77% / €5,865, and Best contributor GOOGL +56.37% vs +103.70% in Holdings. → Use one definition, or label each ("money-weighted", "incl. realized"). | `performance/AnnualPerformanceReport.tsx`, `portfolio/PortfolioSummary.tsx` |
| Med | *Redundancy* → +45.34% appears twice (hero + Portfolio card) and €18,680.06 twice (Period value + Value). → Keep the hero and drop the duplicates. | `performance/AnnualPerformanceReport.tsx` |
| Med | *Meaningless encoding* → the progress bars under Portfolio/Benchmark/Delta have no scale (what does a full bar mean for +45%?). → A single bullet or bar pair on a shared 0-based axis (portfolio vs benchmark), or plain numbers. | `performance/AnnualPerformanceReport.tsx` |
| Med | *Data-ink* → dashed vertical and horizontal grid, axis lines, and a legend below the chart. → Light horizontal gridlines only, and direct-label the line ends ("Portfolio +45%", "S&P 500 +29%"). | `performance/PerformanceChart.tsx` |
| Low | *Color meaning* → Net flow `€12,708.02` is green, but a deposit is not a gain. → Neutral. | `performance/AnnualPerformanceReport.tsx` |
| Low | *Mobile* → the fold shows only the hero. The chart, which is the main content, is ~3 screens down. → Put the chart right after a compact hero on mobile. | `performance/AnnualPerformanceReport.tsx` |

## Allocation (`#allocation`)

**Should answer:** How far is each position from its target, and what should I trade?

| Sev | Principle → observation → fix | File |
|-----|-------------------------------|------|
| High | *Correct encoding* → the drift bar draws the target fill **on top of** current, so any underweight position (MSFT 11.4% vs 20%) looks exactly like the others. The `Target 20.0%` label floats in the middle, not at the target. → Bullet graph: current as the bar, target as a vertical tick, drift as signed text. | `allocation/AllocationPage.tsx` (lines ~357–379) |
| Med | *Color meaning* → overweight drift and Trim are red (rose), underweight and Add are green. Neither is a loss or gain. → Neutral bars, with direction shown by sign and the arrow icon. | `allocation/AllocationPage.tsx` |
| Med | *Context* → "Total drift 34.4%" in red, with no definition or threshold. → Name it ("sum of absolute drift") and show the rebalance threshold, e.g. "34.4% · threshold 10%". | `allocation/AllocationPage.tsx` |
| Med | *Units* → Trim `−6`, Add `+5` have no unit. → "−6 sh (≈€1,890)". | `allocation/AllocationPage.tsx` |
| Low | *Comparison* → Core/Satellite shows the targets (40/60) as bars, but not the actual split. → A current-vs-target bullet for each. | `allocation/AllocationPage.tsx` |
| Low | *Consistency* → Targets shows `Current 17.1%` and `17,11` (decimal comma) for AAPL, while Dashboard shows 16.5%. → Same weight source and the same separator. | `allocation/TargetAllocationEditor.tsx` |

## Transactions (`#transactions`)

**Should answer:** What did I trade, when, and at what price?

| Sev | Principle → observation → fix | File |
|-----|-------------------------------|------|
| Med | *Data-ink / color* → every ticker is green monospace, every row has a green BUY pill, and there are 46 colored edit/delete icons. → Neutral ticker, plain "Buy" text with only Sell/Div highlighted, and gray icons that become colored on row hover. | `transactions/AllTransactionsTable.tsx` |
| Med | *Formatting* → dates come from `toLocaleDateString()` (`1/8/2025` in en-US, `08/01/2025` elsewhere), so the same day reads differently by locale. → `2025-01-08` or `8 Jan 2025` via the shared formatter. | `transactions/AllTransactionsTable.tsx`, `utils/formatters.ts` |
| Low | *Consistency* → USD and EUR totals sit in one column. → Keep native, but add a muted EUR value. | `transactions/AllTransactionsTable.tsx` |
| Low | *Proportion* → the All/Buy/Sell/Div control spans the full width, so four words get 1,200px. → Compact segmented control next to the ticker filter. | `transactions/AllTransactionsTable.tsx` |

## Import (`#import-export`)

**Should answer:** How do I get my data in?

| Sev | Principle → observation → fix | File |
|-----|-------------------------------|------|
| Low | *Accuracy* → the demo card says "~€15k", the confirm dialog says "~€50k", and the demo actually invests €12.8k. → One correct figure. | `import/DemoSection.tsx` |
| Low | *Emphasis* → Append is a bright filled button, louder than the primary "Choose CSV File" action. → Neutral selected state. | `import/ImportModeSelector.tsx` |

## Tax (`#tax`)

**Should answer:** What can I sell tax-free now, and when does the rest unlock?

| Sev | Principle → observation → fix | File |
|-----|-------------------------------|------|
| Med | *Data density* → when all positions are 100% tax-free, there are five tall cards with full green bars. That is ~700px saying one fact. → One line ("All 5 holdings tax-free") plus a compact table (ticker, shares, tax-free %, next unlock date). Keep the bars only for partial positions. | `tax/TaxFreeHoldings.tsx` |
| Med | *Units* → "Next 30 days 0.00" and "0.00 taxable" have no unit. → "0 shares", "€0", or "—". "Next unlock: Done" → "—" or "All unlocked". | `tax/TaxFreeHoldings.tsx` |
| Low | *Formatting* → `10.0 / 10.0` vs `6.00 / 6.00` shares. → Same decimals (integers when whole). | `tax/TaxFreeHoldings.tsx` |
| Low | *Data-ink* → icons in the KPI cards. → Remove. | `tax/TaxFreeHoldings.tsx` |

## AI (`#ai`)

**Should answer:** Which prompt should I copy?

| Sev | Principle → observation → fix | File |
|-----|-------------------------------|------|
| Low | *Data-ink* → each of the six cards has a large icon tile plus an arrow. → A plain list of prompts with a one-line description. | `ai/AIAnalysisPage.tsx` |

## Settings (`#settings`)

**Should answer:** Is my price data fresh, and is the app healthy?

| Sev | Principle → observation → fix | File |
|-----|-------------------------------|------|
| Med | *Color meaning (inverted)* → "Fresh 0" is green, "Price files 22" is green, and the FX rates are green, while "Stale 22" is amber. The alarming fact looks calm. → Neutral values. Amber or red only on "0 fresh / 22 stale" and "184d ago". | `settings/SettingsPage.tsx` |
| Low | *Comparison* → Fresh and Stale are two separate rows. → One "0 of 22 fresh" with a mini bar. | `settings/SettingsPage.tsx` |
| Low | *Data-ink* → emoji in the Goal chips. → Text only. | `settings/SettingsPage.tsx` |

---

## Side note (not a Few finding)

The Transactions screen crashes the whole app (ErrorBoundary: "reading 'toLocaleString'") when a stored transaction has no
`total_value`. I triggered it by seeding raw demo rows. Imports through the UI add the field, but older or hand-edited data
would crash it. `transactions/AllTransactionsTable.tsx:170` and `:250` pass `transaction.total_value` straight to
`formatCurrency`, while the sort on line 65 already falls back to `shares * price`. Use the same fallback when rendering.
