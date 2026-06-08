# 🧬 N=1 Performance Lab

The **N=1 Performance Lab** is a high-performance, sports-science driven Progressive Web App (PWA) designed for advanced hybrid athletes. It replaces the need for generic fitness apps (like MyFitnessPal or Strava Premium) by providing a personalized, clinical-grade dashboard that aggregates subjective truths (fatigue, pain, RPE) with objective metrics (training load, weather, macros).

> **"N=1"** refers to a clinical trial where **you are the sole subject**. Every data point you log is an observation in your own ongoing experiment to reach peak performance.

---

## 🚀 The Hybrid Architecture

Unlike standard applications, this project runs on a highly resilient "serverless" hybrid architecture designed to bypass expensive API paywalls and keep infrastructure costs at zero:

1. **The PWA Frontend (Offline-First)**
   - Built with Vanilla HTML/JS/CSS for maximum speed.
   - Hosted for free on GitHub Pages.
   - Uses a Service Worker (`sw.js`) to cache assets, keep the app usable offline, and persist the working state in `localStorage`.

2. **The Passive Sync Engine (Backend Worker)**
   - A Node.js script (`sync_engine.js`) that runs completely serverless via **GitHub Actions** on a nightly cron job.
   - Pulls cardio data from Strava when OAuth secrets are configured, or from the free Intervals.icu API as a fallback.
   - Scrapes hyper-local weather data from the OpenWeatherMap API.
   - Optionally pulls nutrition data from Google Fit when the OAuth secrets are configured.

3. **Two-Way Cloud Sync (Supabase)**
   - The GitHub Action pushes automated passive data into a **Supabase PostgreSQL** database (`n1_logs` table with a JSONB `data` column).
   - When the PWA opens, it fetches the trailing 30 days from Supabase via the official JS SDK, silently merging passive cloud fields with local manual entries.
   - When the user saves, it upserts the full day's state back to the cloud.

> For a deep technical dive into the data flows and Mermaid diagrams, see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## 🧠 Core Features

### 1. The Cockpit Dashboard
The central intelligence hub that runs predictive sports-science models on your data:
- **Periodization Engine:** Dynamically alters alert sensitivities based on your current training block (`Hypertrophy`, `Strength`, `Endurance`, `Deload`).
- **ACWR Engine:** Calculates the Acute:Chronic Workload Ratio. If your 7-day load exceeds your 28-day average by >1.5x, it flashes a critical injury warning. Requires 14 days of baseline data before firing.
- **Thermal Strain Shield:** Approximates Wet-Bulb Globe Temperature (WBGT) based on real-time Alexandria weather data, automatically dropping target RPEs during extreme heat.
- **Interference Shield:** Warns against heavy lifting if excessive cardio volume threatens to blunt mTOR activation.
- **Athlete OS Decision Engine:** Combines readiness, pain trend, ACWR, movement quality, running shield, fueling, thermal strain, deload pressure, and phase-gate checks into one "what should I do today and why?" answer.
- **Phase 1 Safety Rules:** Keeps continuous running and plyometrics blocked above 95 kg, prioritizes bike/row/swim/walk-jog, and flags dense-strength drift when reps/rest move toward pump work.

## Cockpit Interactions
A short reference for what the interactive controls in the Cockpit do.

- **Session Pills (`Strength & Structure`)**: Toggles `log-gym-type` between `None`, `Heavy Day A`, `Heavy Day B`, and `Tendon Isolation`. Selecting a non-`None` value auto-reveals the `gym-details` panel for quick entry (start time, primary lift, sets/weights, prehab toggle).
- **Macrocycle Pills**: Switches the app `macrocycle` (Hypertrophy / Strength / Endurance / Deload). This updates alert sensitivity and the Cockpit phase description immediately.
- **Quick Actions**:
   - **Mark Recovery Day**: Sets today's `gymType` to `NONE` and lowers `cnsFatigue`; saves state locally and (if configured) upserts to Supabase.
   - **Log NSAID**: Toggles today's `nsaidsTaken` flag and saves — used by tendon and hypertrophy risk logic.
   - **Add Biomarker**: Prompts for a biomarker key/value (e.g. `bioCortisol`) and stores it to today's log.
   - **Export Cockpit CSV**: Downloads the last 30 days of Cockpit metrics (`acwr, wbgt, tdee, fatigue`) as a CSV for offline analysis.

### 2. The 10-Chart Analytics Engine
Professional Chart.js visualizations that track specific biological markers:
- **Metabolic Adaptation (TDEE):** A 14-day rolling algorithm that calculates your real-time metabolism by cross-referencing caloric intake against moving weight averages.
- **Aerobic Decoupling Scatter:** Maps Pace vs. HR to visually prove expansion of the Zone 2 aerobic base.
- **Volume vs Joint Pain Scatter:** Maps muscle volume against joint pain to show where tendon flare-ups start.
- **Strength Progression:** Tracks your primary lift weight over the last 10 sessions to confirm progressive overload.

### 3. Comprehensive Daily Logging
Every metric from the FEATURE_REGISTRY is captured:
- **Subjective Truth:** Weight, CNS Fatigue, Aerobic RPE, Sleep, HRV.
- **Injury Tracker:** Location-specific pain tracking (0-10 scale).
- **Pain Context:** Side, type, timing, action taken, and notes so joint/tendon pain can override performance goals.
- **Strength & Structure:** Session type, primary lift, weight/sets/RIR, prehab tracking.
- **Movement Quality:** Squat/hinge/brace/run/swim flags that reduce load or block running progression before pain escalates.
- **Pharmacology & Stims:** Daily caffeine (mg) and NSAIDs toggle (mTOR blunting risk).
- **Quarterly Biomarker Vault:** Testosterone, Cortisol, hs-CRP, Ferritin for clinical correlation.
- **Ultra-Endurance Armor:** Intra-workout carbs, pre-sodium loading, post-refeed tracking.
- **Nutrition Macros:** Total calories, protein, carbs, fats.
- **Fueling Detail:** Pre-workout carbs, intra-workout carbs, post-cardio protein/carbs, fiber, sugar, sodium, and hydration for long-session and recovery checks.

### 4. The Library
An educational reference tab with 20+ concept cards covering cellular metabolism, cardiac remodeling, neuromuscular drive, joint armor theory, and more. Filterable by category (Pillars, Playbook, Roadmap, Rules).

### 5. App Phase 2: Strava Activity Inbox
The Strava tab imports passive workout rows into a post-workout inbox. Each activity keeps objective data like duration, distance, HR, power, pace, elevation, and load, then asks for the missing subjective layer: RPE, pain, fueling, carbs, and notes. Saving the check merges it back into the daily log so the Cockpit engines can use it immediately.

---

## 🛠️ Setup & Installation

### 1. Local Development
Because the app is built on Vanilla web tech, no complex build steps are required.
```bash
# Clone the repository
git clone https://github.com/momen124/fitness-pwa.git

# Navigate into the project
cd fitness-pwa

# Start a local static server
npm run serve
```

### 2. Database (Supabase) Setup
1. Create a free project on [Supabase](https://supabase.com).
2. Go to the SQL Editor and run the schema in `supabase_schema.sql` to create the `n1_logs` table.
3. Grant access: `GRANT ALL ON public.n1_logs TO anon;`
4. Configure RLS policies (see `supabase_schema.sql` for the default open policies).

### 3. Backend Sync (GitHub Actions)
Add the following **Repository Secrets** in your GitHub settings:

| Secret | Description |
| :--- | :--- |
| `SUPABASE_URL` | Your Supabase Project URL |
| `SUPABASE_ANON_KEY` | Your Supabase Anon/Public Key (no trailing newlines!) |
| `INTERVALS_ATHLETE_ID` | Your Intervals.icu Athlete ID |
| `INTERVALS_API_KEY` | Your Intervals.icu API Key |
| `OPENWEATHER_API_KEY` | Your OpenWeatherMap API Key |
| `STRAVA_CLIENT_ID` | (Optional) For direct Strava activity sync |
| `STRAVA_CLIENT_SECRET` | (Optional) For direct Strava activity sync |
| `STRAVA_REFRESH_TOKEN` | (Optional) For direct Strava activity sync |
| `GOOGLE_CLIENT_ID` | (Optional) For Google Fit nutrition sync |
| `GOOGLE_CLIENT_SECRET` | (Optional) For Google Fit nutrition sync |
| `GOOGLE_FIT_REFRESH_TOKEN` | (Optional) For Google Fit nutrition sync |

The workflow in `.github/workflows/nightly_sync.yml` runs automatically every night at 2:00 AM.

---

## 📁 Project Structure

```
fitness-pwa/
├── .github/workflows/     # GitHub Actions nightly cron job
├── index.html             # PWA shell - all views and tabs
├── app.js                 # State management, charts, Cockpit alerts, Supabase sync
├── styles.css             # Glassmorphism design system
├── sw.js                  # Service Worker for offline caching
├── sync_engine.js         # Headless backend API scraper
├── supabase_schema.sql    # PostgreSQL schema for n1_logs and normalized Athlete OS tables
├── manifest.json          # PWA metadata
├── google_fit_setup.js    # OAuth helper for Google Fit (deferred)
├── playwright_check.js    # End-to-end smoke tests
├── docs/ARCHITECTURE.md   # Data flow diagrams and system architecture
├── docs/FEATURE_REGISTRY.md # Complete feature specification
├── docs/CHANGELOG.md      # Version history
├── docs/BACKLOG.md        # Deferred features and roadmap
└── README.md              # This file
```

---

## 🎨 Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | Vanilla HTML5, CSS3 (Glassmorphism), JavaScript ES6+ |
| **Charts** | Chart.js |
| **Icons** | Lucide Icons |
| **Database** | Supabase (PostgreSQL + JSONB) |
| **Backend/CI** | Node.js, GitHub Actions |
| **Offline** | Service Worker, localStorage |

---

## 📚 Documentation

| Document | Purpose |
| :--- | :--- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System diagrams, data flow, schema reference |
| [docs/FEATURE_REGISTRY.md](docs/FEATURE_REGISTRY.md) | Complete feature specification with data sources |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Version history with detailed release notes |
| [docs/BACKLOG.md](docs/BACKLOG.md) | Deferred features and future roadmap |
