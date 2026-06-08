# 🧬 N=1 Performance Lab - Feature Registry

This document serves as the official feature registry and architectural map for the N=1 Performance Lab Progressive Web App (PWA).

## 1. 🚀 The Grand Intersection Hub (Cockpit)

The central intelligence dashboard that aggregates data and runs the predictive rule-engine.

| Feature Name | Type | Data Sources | Description |
| :--- | :--- | :--- | :--- |
| **Periodization Engine** | Global State | `macrocycle` | Alters the sensitivity of Cockpit alerts and protein minimums based on the current block (`HYPERTROPHY`, `STRENGTH`, `ENDURANCE`, `DELOAD`). |
| **Daily Cardio Volume** | UI Summary | `manualCardioDuration`, `cardioType` | Displays the logged cardio volume and modality for the day. |
| **Daily Lift Focus** | UI Summary | `gymType` | Displays the active strength focus (`Heavy A`, `Heavy B`, `Tendon Iso`, `Hypertrophy`, `Strength`, or `Rest`). |
| **Interference Shield** | Active Alert | `gymType`, `manualCardioDuration` | Warns against heavy lifting on the same day as more than 30 minutes of cardio to reduce interference risk. |
| **Tendon Load** | Active Alert | `injuryPain`, `totalCals`, `prehabDone` | Flags tendon starvation risk when pain is elevated or when a painful day is under-fueled without prehab. |
| **Heat & Catabolic State** | Active Alert | `manualCardioDuration`, `intraCarbs` | Detects cardio sessions >= 90 minutes with inadequate fueling and warns of catabolic risk. |
| **Nutrition Adherence** | Active Alert | `totalCals`, `proG`, `macrocycle`, `gymType` | Compares intake against dynamic calorie and protein targets, then warns when the day is under-fueled or protein is too low for the active phase. |
| **Acute:Chronic Workload (ACWR)** | Active Alert | `stravaEffort` (7-day sum vs 28-day sum) | Flags high injury probability when the 7-day load exceeds the 28-day average by more than 1.5x (2.0x during Deload). Requires 14 days of baseline data. |
| **Thermal Strain Shield** | Active Alert | `tempC`, `humidity` | Calculates the Wet-Bulb Globe Temperature (WBGT) from passive weather data. If heat and humidity are critical, it drops target Aerobic RPE by 1 point and triggers sodium guidance. |
| **Athlete OS Decision Engine** | Active Recommendation | `weight`, `bodyFatPct`, readiness, pain, ACWR, nutrition, weather, strength, tendon checklist | Produces the daily green/yellow/red status, recommended session, blocked activities, nutrition target, recovery instruction, and reason codes for Phase 1. |
| **Phase 1 Running Shield** | Active Guardrail | `weight`, `injuryPain`, ACWR, tendon checklist, `cardioType` | Blocks continuous running and plyometrics above 95 kg, blocks impact progression when pain or ACWR are unsafe, and shows unlock readiness. |
| **Strength Compliance Engine** | Active Alert | `liftWeight`, `liftReps`, `liftSets`, `liftRestSeconds` | Calculates estimated 1RM/percent 1RM and warns when heavy work drifts away from 1-5 rep dense-strength rules. |
| **Weekly Review Engine** | Dashboard Review | trailing 7-14 day logs | Summarizes weight trend, ACWR, Zone 2 share, strength compliance, pain ceiling, protein compliance, tendon armor, and next action. |

---

## 2. 📝 Daily Logging & Data Ingestion (Log Tab)

The granular input matrix designed for maximum data purity.

| Feature Name | Category | Captured Metrics |
| :--- | :--- | :--- |
| **Subjective Truth** | General | `weight` (Morning Weight), `cnsFatigue` (1-5), `aerobicRpe` (1-10) |
| **Deep Recovery** | Sleep & HRV | `sleepHrs`, `sleepQual` (1-5), `hrv` (ms) |
| **Granular Injury Tracker** | Rehab | `injuryLoc` (String/Text), `injuryPain` (0-10) |
| **Strength & Structure** | Gym | `gymType`, `gymStart`, `prehabDone`, `liftName`, `liftWeight`, `liftSets`, `liftRir` |
| **Muscle Volume Matrix** | Gym | `muscleTarget`, `muscleSets` — tags work to specific muscle groups so the charts can map weekly volume against joint pain and recovery. |
| **Shoe / Gear Mileage Tracker** | Mechanical | `shoeId`, `shoeDist` — present in the schema and state, but not yet surfaced as a dedicated UI workflow. |
| **Pharmacology & Stims** | Lifestyle | `caffeineMg`, `nsaidsTaken` (Boolean), `peakEnergyWindow` — high caffeine can mask true CNS fatigue, while NSAIDs can blunt hypertrophy and mask collagen repair issues. |
| **Quarterly Biomarker Vault** | Clinical | `bioTest`, `bioCortisol`, `bioHscrp`, `bioFerritin` — a hidden form used a few times a year to manually input blood lab results and monitor endocrine / iron status. |
| **Manual Cardio** | Fallback | `cardioType` (Run/Row/Cycle), `manualCardioDuration`, `manualCardioRpe` |
| **Strava Activity Inbox** | App Phase 2 Ingestion | `importedActivities`, `rpe`, `painRegion`, `painScore`, `fueled`, `intraCarbs`, `notes` |
| **Ultra-Endurance Armor** | Fuel | `intraCarbs` (g), `preSodium` (mg), `postRefeed` (boolean) |
| **Nutrition Macros** | Fallback | `totalCals`, `proG`, `carbsG`, `fatsG`, `waterLiters`, `sodiumMg` |
| **Readiness Detail** | Recovery | `soreness0to10`, `stress0to10`, `motivation0to10`, `shutdownProtocolCompleted` |
| **Tendon Armor Checklist** | Rehab | `warmupDone`, `tendonIsometrics`, `hsrDone`, `mobilityDone` |

---

## 3. 📊 The 10-Chart Analytics Engine (Data Tab)

Professional sports-science visualizations powered by Chart.js.

| Chart Name | Chart Type | Y-Axis / Metrics | X-Axis / Timeframe | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Fatigue vs. Load** | Line Graph | `cnsFatigue` (Line) vs `stravaEffort` (Line) | Trailing 7 Days | The core recovery metric mapping subjective fatigue against objective strain. |
| **Subjective Readiness** | Radar Chart | `injuryPain`, `cnsFatigue`, `aerobicRpe` | Current Day | Spiderweb chart providing a single visual shape of current recovery state. |
| **HRV vs. Load** | Combo (Line/Bar) | `hrv` (Line) vs `manualCardioDuration` (Bar) | Trailing 30 Days | Detects parasympathetic nervous system crashes against cardio volume. |
| **Injury Tracker** | Line Graph | `injuryPain` | Trailing 30 Days | Tracks the rehabilitation trendline of a specific targeted joint. |
| **Macro Stack** | Stacked Bar | `proG`, `carbsG`, `fatsG` | Trailing 7 Days | Visual verification of daily caloric partitioning. |
| **Cardio Modality** | Doughnut | `cardioType` | Trailing 30 Days | Volumetric distribution of Zone 2 vs. VO2 Max sessions. |
| **Heavy Lifts** | Line Graph | `liftWeight` | Last 10 Sessions | Visual confirmation of progressive overload on the primary structural lift. |
| **Aerobic Decoupling (EF)** | Scatter Plot | `stravaPace` vs. `stravaHr` | Trailing 30 Days | The Holy Grail of endurance tracking. Visually proves if your Zone 2 base is actually growing. |
| **Metabolic Adaptation** | Dual Line | `weight` vs. calculated TDEE | Trailing 30 Days | Shows how metabolism speeds up or slows down in response to bodyweight and intake trends. |
| **Volume vs. Joint Pain** | Scatter Plot | `muscleSets` (X) vs `injuryPain` (Y) | Trailing 30 Days | Pinpoints the weekly volume threshold that triggers tendon flare-ups. |

---

## 4. ☁️ Enterprise Cloud & Infrastructure

The hidden architecture powering the local PWA.

| Feature Name | Technology | Description |
| :--- | :--- | :--- |
| **Two-Way Supabase Sync** | REST / `app.js` | On app load, fetches the trailing 30 days of data from `n1_logs` and merges passive fields into local state. Pushes the full day back to cloud on manual save. |
| **Automated Passive Sync** | GitHub Actions / Cron | A nightly backend worker that extracts cardio metrics via Strava or Intervals.icu, weather via OpenWeatherMap, and optional nutrition via Google Fit before writing into Supabase. |
| **Strava OAuth Bridge** | Node Worker / Supabase JSONB | Uses backend-held Strava refresh credentials to fetch recent athlete activities, normalize every activity into `importedActivities`, and keep the browser client secret-free. |
| **Time-Travel Export** | JSON / UI | A date picker allowing the user to view the exact JSON payload of any day, with a localized CSV/JSON download option. |
| **Offline Caching** | Service Worker (`sw.js`) | Enables the app to load instantly without an internet connection, storing data in `localStorage` until sync is available. |
