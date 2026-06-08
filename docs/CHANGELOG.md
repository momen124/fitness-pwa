# Changelog

All notable changes to the N=1 Performance Lab project will be documented in this file.

## [Unreleased]

### Added
- Expanded the Athlete OS MVP with explicit alert-ledger, phase-gate, deload, minimum-effective-dose, movement-quality, pain-trend, and nutrition-compliance decision engines.
- Added daily log fields for pain side/type/timing/action, resting HR, recovery cutoffs, movement-quality flags, HR zone minutes, pre/intra/post-workout fueling, fiber, and sugar.
- Added Supabase schema tables for movement quality logs, weekly reviews, and phase progression checks.
- Added Playwright coverage for expanded manual fields and risky Phase 1 dashboard decisions.

### Changed
- Default macrocycle now starts in `STRENGTH` to align Phase 1 with dense low-rep strength instead of pump/hypertrophy bias.
- Frontend cloud hydration now preserves the full daily JSON payload instead of only a curated subset of fields.
- Nightly sync workflow now passes Strava OAuth secrets into `sync_engine.js` when configured.

### Fixed
- Removed duplicate dashboard alert IDs from the manual log area and fixed stale heatmap click targets for the current Daily Log view.

## [2.0.1] - 2026-06-02

### Changed
- **Documentation Refresh**: Updated README, architecture notes, and the feature registry so they match the current app state, including the 10-chart analytics engine, the optional Google Fit nutrition bridge, and the current logging field names.

## [2.0.0] - 2026-06-02

### Added
- **Two-Way Supabase Sync**: The PWA frontend now connects directly to the Supabase `n1_logs` table via the official JS SDK. On app load, it fetches the trailing 30 days of cloud data (Strava, Weather) and merges it into `localStorage`. On manual save, it pushes the full daily state JSONB payload to the cloud via `upsert`.
- **Predictive Cockpit Engine**: Three new sports-science algorithms injected into the Cockpit Dashboard:
  - **Periodization Engine**: A pill-based UI selector (`Hypertrophy`, `Strength`, `Endurance`, `Deload`) that dynamically alters alert thresholds (protein minimums, ACWR limits) based on the active training block.
  - **Acute:Chronic Workload Ratio (ACWR)**: Calculates the 7-day vs. 28-day training load ratio. Alerts at >1.5x (or >2.0x during Deload). Requires 14 days of baseline data before firing to prevent false positives.
  - **Thermal Strain Shield (WBGT)**: A simplified Wet-Bulb Globe Temperature approximation using real-time OpenWeatherMap data. Triggers alerts above 28°C WBGT to drop target RPE and pre-load sodium.
- **Pharmacology & Stims UI**: New log section for tracking daily `caffeineMg` (mg) and `nsaidsTaken` (boolean toggle). NSAIDs are flagged because they blunt hypertrophy via the mTOR pathway.
- **Quarterly Biomarker Vault UI**: New log section for recording clinical bloodwork: `bioTest` (Total Testosterone ng/dL), `bioCortisol` (Awakening Cortisol), `bioHscrp` (hs-CRP inflammation marker), `bioFerritin` (Iron stores).
- **Strength Progression Chart**: Replaced the placeholder bar chart with a proper trailing-10-session line chart that tracks `liftWeight` for the primary structural lift, providing visual confirmation of progressive overload.
- **Supabase SDK**: Injected the official `@supabase/supabase-js@2` SDK into `index.html` via CDN.
- **README.md**: Comprehensive project documentation covering architecture, features, setup, and tech stack.

### Changed
- **Periodization UI**: Replaced the native `<select>` dropdown for macrocycle selection with premium glassmorphic pill buttons matching the existing design system.
- **Supabase Sync Schema**: Fixed the frontend `app.js` Supabase queries to correctly target the `date_id` primary key and the `data` JSONB column (matching the `sync_engine.js` schema), instead of incorrectly using flat column names.

### Fixed
- **Supabase Authentication**: Resolved `Unauthorized` and `Not Found` errors in GitHub Actions caused by invisible newline/carriage-return characters corrupting the `SUPABASE_ANON_KEY` secret. Fixed with `gh secret set -b` (binary mode).
- **Supabase RLS Permissions**: Resolved `403 Forbidden` errors by executing `GRANT ALL ON public.n1_logs TO anon` and creating a master `USING(true)` RLS policy for the `anon` role.
- **Sub-Nav Pill Scoping**: Fixed a JavaScript selector collision where Progress tab sub-nav pills interfered with Library tab pills by scoping selectors to `#view-progress .sub-nav-pills .pill`.

## [1.1.0] - 2026-06-02

### Added
- **Library Tab**: A new educational and reference tab mapping all training blueprints and theories.
- **Search & Filter Engine**: Interactive category pills (Pillars, Playbook, Roadmap, Rules) and real-time query filtering matching card contents dynamically.
- **Concepts Database**: Added 20 detailed concept cards covering cellular metabolism, cardiac remodeling, neuromuscular drive, 4-hour separation, post-cardio resets, daily checklists, and joint playbook exercises (isometrics, HSR, plyos, active mobility).
- **Target InBody Signature Table**: Height: 173cm, Age: 22 reference guidelines comparing baseline, Phase 1 target, and ultimate athletic targets.
- **Playwright Test Suite Integration**: Included the Library tab in automated navigation, rendering, and seeding validation tests.

## [1.0.0] - 2026-06-02

### Added
- **Cockpit Dashboard**: Real-time computed biology alerts injected into the existing Glassmorphism UI.
- **Interference Shield**: Formula that calculates recovery gap hours to warn against mTOR blunting (AMPK interference).
- **Tendon Snap Warning**: Alert logic combining subjective joint pain and objective Strava Relative Effort trends.
- **Heat & Catabolic Alert**: Warning system triggered by >90min cardio duration with <30g of intra-workout carbs.
- **Passive Engine (`sync_engine.js`)**: A Node.js background worker designed to run on GitHub Actions.
- **Intervals.icu Integration**: Successfully bypassed the Strava API subscription paywall by routing data extraction through Intervals API.
- **OpenWeatherMap Integration**: Automated fetching of local temperature and humidity for Alexandria, Egypt.
- **Supabase Integration**: Migrated the master database architecture from Google Sheets to a robust Supabase PostgreSQL backend.
- **JSON Inspector**: Added a live database inspector tab to the PWA for debugging.

### Changed
- Refactored `index.html` and `app.js` to support an exhaustive JSON schema categorized into 4 Blocks:
  - Block 1: Passive Engine (API Synced)
  - Block 2: Subjective Truth (Manual inputs: CNS Fatigue, RPE)
  - Block 3: Strength & Structure (Gym logs, Prehab, RIR)
  - Block 4: Ultra-Endurance Armor (Fueling protocols)
- Replaced local storage saving mechanism with a Supabase `upsert` architecture to allow cloud synchronization.
