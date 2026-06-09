# N=1 Performance Lab — Backlog

This document tracks upcoming features, deferred tasks, and architectural upgrades for the N=1 Performance Lab.

## ✅ Completed

- [x] **GitHub Automation Setup**
  - Pushed the local repository to GitHub.
  - Added repository secrets (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `INTERVALS_ATHLETE_ID`, `INTERVALS_API_KEY`, `OPENWEATHER_API_KEY`).
  - Activated the `.github/workflows/nightly_sync.yml` cron job to run the Passive Engine.
  - First successful run: 2026-06-02.

- [x] **Two-Way Supabase Sync**
  - Frontend PWA now fetches trailing 30 days from `n1_logs` on load and upserts on save.
  - Fixed schema mapping to use `date_id` primary key and `data` JSONB column.

- [x] **Predictive Cockpit Engine**
  - Periodization Engine (pill-based macrocycle selector).
  - ACWR (Acute:Chronic Workload Ratio) with 14-day baseline requirement.
  - Thermal Strain Shield (WBGT approximation from OpenWeatherMap data).

- [x] **Pharmacology & Stims UI**
  - Caffeine load (mg) and NSAIDs toggle added to Log tab.

- [x] **Quarterly Biomarker Vault UI**
  - Total Testosterone, Cortisol, hs-CRP, Ferritin inputs added to Log tab.

- [x] **Strength Progression Chart**
  - Replaced placeholder bar chart with trailing-10-session line chart for primary lift weight.

- [x] **Comprehensive DB Redesign (30 normalized tables)**
  - `supabase/migrations/001_comprehensive_schema.sql` — 30 tables across 8 tiers
  - `supabase/migrations/002_migrate_jsonb.sql` — migrated 15 existing days from JSONB
  - Materialized views: `mv_weekly_summaries`, `mv_gear_status`
  - Live views: `view_daily_dashboard`, `view_exercise_prs`
  - Per-user RLS policies on all tables

- [x] **Supabase Auth**
  - Login, signup, guest mode with session persistence
  - RLS policies using `auth.uid()` via `public.auth_uid()` helper
  - Logout clears all state

- [x] **Edge Functions (4 deployed)**
  - `save-daily-log` — fans out to normalized tables + n1_logs compat
  - `load-dashboard` — reads from normalized tables with user scoping
  - `sync-passive` — Strava/Intervals/Google Fit/Weather + normalized table writes
  - `strava-callback` — OAuth token exchange

- [x] **8 New Data Category UIs**
  - Supplements, Gear Tracker, Race Events, Custom Metrics
  - Wellness Check-In, Hormone Cycle, Progress Photos, Training Plans

- [x] **Production Audit (3 rounds)**
  - Fixed broken CORS imports (C4 — edge functions were silently crashing)
  - Fixed user scoping on all n1_logs fallback paths
  - Fixed gym session `.select()` so dependent writes execute
  - Fixed chart counters (WALK_JOG/CYCLING instead of ZONE2/VO2MAX)
  - Fixed CSV export (55 columns, 90-day range)
  - Cloud push for gear/races/supplements/training plans/custom metrics
  - Cloud pull on startup for all settings categories
  - Progress photos → Supabase Storage with localStorage fallback
  - SW v26 with Lucide + icon.svg caching
  - pg_cron auto-sync every 3 hours
  - Removed dead code (seedMockData, orphan fields)

---

## 🔜 Backlog

### High Priority

- [x] **Cloud-First Architecture**
  - Cloud-first read: loadData() tries cloud before localStorage cache.
  - Cloud-first write: saveData() pushes to cloud, queues on failure.
  - Sync status indicator: 🟢 synced / 🟡 syncing / 🔴 offline.
  - Pending write queue: localStorage `n1_pending_writes`, replayed on reconnect via `window.online` event.
  - Offline fallback: localStorage cache used when cloud unavailable.

- [x] **Guest Mode UUID Collision**
  - Cloud sync disabled for guest mode — all `supabaseClient` calls guarded with `!isGuest()`.
  - Guest data stays localStorage-only.
  - Guest → login migration: `migrateGuestData()` pushes last 30 days to cloud on first real login.
  - Toast updated: "Guest mode. Data stays on this device only — sign up to sync."

- [ ] **End-to-End Auth Flow Manual Test**
  - Signup → login → save data → verify in normalized tables → logout → login → data persists.
  - Test on fresh device/incognito to verify cloud pull works.
  - Test guest mode → login transition (does local data merge with cloud?).

### Medium Priority

- [x] **Shoe Mileage Alerting**
  - Gear dropdown added to cardio section of log form (`#log-gear-select`).
  - Auto-mileage: on save with gear selected, `currentKm` incremented by distance.
  - Cockpit alert card: shows gear wear status, yellow at ≥80%, red at ≥95%.
  - Cloud sync: `gear_usage_logs` insert in `save-daily-log` edge function (triggers DB `trigger_update_gear_mileage`).
  - Gear tracker exists but no cumulative alert when shoes hit 400km+.
  - Add alert in Cockpit when gear usage approaches life_km threshold.
  - Link workout sessions to gear usage for auto-mileage tracking.

- [ ] **Full Strava Streams Import**
  - Current sync imports Strava activity summaries only.
  - Future: fetch heart-rate/power/cadence streams per activity and persist normalized zone minutes.

- [ ] **Smartwatch Integration (HRV, Sleep, Resting HR)**
  - Requires hardware. Database schema and frontend already structurally ready.
  - Install Health Auto Export or similar to webhook morning metrics to Supabase.

- [ ] **Nutrition Engine (Automated Google Fit Bridge)**
  - Blocked on Google Cloud Auth configuration.
  - Action: complete `google_fit_setup.js`, add secrets to GitHub.

- [x] **Training Plan Cloud Bidirectional Sync**
  - Full CRUD via edge function: upsert-plan, delete-plan, deactivate-plan.
  - Conflict detection: server `updated_at` > client `updatedAt` → reject + auto-pull.
  - Pull on startup: full replace from cloud (server wins by timestamp).
  - Delete removes from cloud; deactivate sets `active=false` server-side.
  - Frontend: edit button (inline form with weekly structure editor), delete (confirm dialog), reactivate.
  - Plans no longer stored as `plan_data` blob — mapped to proper columns.

- [x] **Data Export Enhancement**
  - CSV export now includes 3 sections: daily logs (55 columns, 90 days), gear items (name/type/km/%), race events (countdown), progress photos (metadata).

### Low Priority

- [ ] **GitHub Pages Deployment**
  - Alternative to VPS deployment.
  - Serve at `https://momen124.github.io/fitness-pwa/`.

- [x] **Offline-First Refinement** (partial)
  - Queue writes when offline, replay on reconnect ✅
  - Show sync status indicator (online/offline/syncing) ✅
  - IndexedDB instead of localStorage for larger data capacity — not done yet.

- [x] **Performance Optimization**
  - Lazy-load Chart.js (only loads on Progress tab / sparklines) ✅
  - Defer Supabase SDK and Lucide icons ✅
  - Skeleton loading states (shimmer effect) ✅
  - Code-split app.js into modules — not done yet.

- [x] **Accessibility Audit**
  - WCAG viewport zoom fix (removed user-scalable=no) ✅
  - Tab roles: tablist/tab/tabpanel on nav + views ✅
  - Dialog semantics on biomarker modal + Escape handler ✅
  - aria-live on toast and auth-error ✅
  - Canvas aria-label on all 17 chart elements ✅
  - 111 label for= attributes for programmatic association ✅
  - sr-only labels on orphan inputs ✅
  - Joint heatmap: role=button, tabindex, dynamic aria-label ✅
  - Concept cards: keyboard support + aria-expanded ✅
  - ARIA labels on interactive elements ✅
  - Screen reader support for charts (data tables fallback) — not done yet.
