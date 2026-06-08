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

---

## 🔜 Deferred / Low Priority

- [ ] **Normalized Athlete OS Write-Through**
  - The Supabase schema now includes domain tables for profile, workouts, strength sets, pain, nutrition, recovery, weather, alerts, movement quality, weekly reviews, and phase checks.
  - Current PWA sync still writes the full daily operating payload through `n1_logs` for offline-first simplicity.
  - Future action: add backend/PWA write-through from `n1_logs` into normalized tables once auth and migration testing are in place.

- [ ] **Full Strava Streams Import**
  - Current sync imports Strava activity summaries and stores raw activity payloads when OAuth secrets are configured.
  - Future action: fetch heart-rate/power/cadence streams per activity and persist normalized zone minutes when Strava stream permissions and rate limits allow it.

- [ ] **The Nutrition Engine (Automated Google Fit Bridge)**
  - *Reason for deferral: Google Cloud Auth friction.*
  - Action: Execute `google_fit_setup.js` and add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_FIT_REFRESH_TOKEN` to GitHub Secrets once Google Cloud Test Users are properly configured.
  - Note: Until this is done, macros are inputted manually via the "Nutrition (Manual)" section in the PWA Cockpit.

- [ ] **Smartwatch Integration (HRV, Sleep, Resting HR)**
  - *Reason for deferral: Hardware not currently available.*
  - Future Action: When a smartwatch is acquired, install an iOS/Android bridge app (like **Health Auto Export**) to configure a webhook that posts morning health metrics directly to the Supabase `n1_logs` table.
  - Note: The database schema and PWA frontend are already structurally ready to accept this data.

- [ ] **Supabase Auth & PIN Lock**
  - *Reason for deferral: Low risk for personal single-user app.*
  - Currently using open `USING(true)` RLS policies with the anon key. Future upgrade: add a simple PIN-based auth layer so data is not publicly accessible.

- [ ] **GitHub Pages Deployment**
  - *Reason for deferral: Testing locally first.*
  - Action: Enable GitHub Pages on the `master` branch to serve the PWA at `https://momen124.github.io/fitness-pwa/`.

- [ ] **Shoe Mileage Alerting**
  - The `shoeId` and `shoeDist` fields exist in the schema but are not yet wired to a cumulative alert (warn at 400km+ to protect Achilles tendons from degraded EVA foam).
