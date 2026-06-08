-- ============================================================
-- N=1 Performance Lab — Comprehensive Database Redesign
-- Migration: 001_comprehensive_schema.sql
-- ============================================================
-- 30 normalized tables, audit trail, RLS per-user,
-- materialized views, soft deletes, proper constraints.
-- ============================================================

-- ============================================================
-- 0. EXTENSIONS & UTILITIES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Generic updated_at trigger
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generic audit trigger: logs every INSERT/UPDATE/DELETE into data_versions
CREATE OR REPLACE FUNCTION public.trigger_audit_version()
RETURNS TRIGGER AS $$
DECLARE
    audit_user_id UUID;
BEGIN
    IF TG_TABLE_SCHEMA = 'public' AND TG_TABLE_NAME = 'data_versions' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    BEGIN
        IF TG_OP = 'INSERT' THEN
            audit_user_id := NEW.user_id;
        ELSIF TG_OP = 'UPDATE' THEN
            audit_user_id := COALESCE(NEW.user_id, OLD.user_id);
        ELSIF TG_OP = 'DELETE' THEN
            audit_user_id := OLD.user_id;
        END IF;
    EXCEPTION WHEN undefined_column THEN
        audit_user_id := NULL;
    END;

    INSERT INTO public.data_versions (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        current_user::text
    );

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. TIER 1: IDENTITY
-- ============================================================

-- 1a. profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT 'Athlete',
    email TEXT,
    age INTEGER,
    height_cm NUMERIC(5,2),
    weight_kg NUMERIC(5,2),
    current_phase TEXT NOT NULL DEFAULT 'phase_1'
        CHECK (current_phase IN ('phase_1','phase_2','phase_3')),
    macrocycle TEXT NOT NULL DEFAULT 'STRENGTH'
        CHECK (macrocycle IN ('HYPERTROPHY','STRENGTH','ENDURANCE','DELOAD')),
    primary_goals TEXT[] NOT NULL DEFAULT ARRAY['fat_loss','dense_strength','endurance_base','injury_prevention'],
    sport_background TEXT,
    occupation TEXT,
    location_lat NUMERIC(9,6) DEFAULT 31.2001,
    location_lon NUMERIC(9,6) DEFAULT 29.9187,
    timezone TEXT DEFAULT 'Africa/Cairo',
    units TEXT NOT NULL DEFAULT 'metric' CHECK (units IN ('metric','imperial')),
    avatar_url TEXT,
    baseline_weight_kg NUMERIC(5,2),
    baseline_body_fat_pct NUMERIC(5,2),
    baseline_muscle_mass_kg NUMERIC(5,2),
    baseline_tbw_pct NUMERIC(5,2),
    baseline_bmr NUMERIC(8,2),
    target_weight_kg NUMERIC(5,2),
    target_body_fat_pct NUMERIC(5,2),
    kcal_target NUMERIC(8,2) DEFAULT 2000,
    protein_target_g NUMERIC(8,2) DEFAULT 200,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ
);

-- Seed default user (will be linked to auth.users after auth setup)
INSERT INTO public.profiles (
    id, display_name, email, age, height_cm, weight_kg,
    current_phase, macrocycle, primary_goals, sport_background, occupation,
    baseline_weight_kg, baseline_body_fat_pct, baseline_muscle_mass_kg,
    target_weight_kg, target_body_fat_pct
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Momen',
    'momen@example.com',
    22, 173, 115.5,
    'phase_1', 'STRENGTH',
    ARRAY['fat_loss','dense_strength','endurance_base','injury_prevention'],
    'hybrid athlete', 'software engineer',
    119.6, 37.5, 24.1,
    95, 22
) ON CONFLICT (id) DO NOTHING;

-- Add FK to auth.users when ready (run after enabling Supabase Auth):
-- ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
-- ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ============================================================
-- 2. TIER 2: DAILY LOGS (core domain)
-- ============================================================

-- 2a. daily_logs (replaces n1_logs)
CREATE TABLE IF NOT EXISTS public.daily_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    morning_weight_kg NUMERIC(5,2),
    body_fat_pct NUMERIC(5,2),
    cns_fatigue_1_5 INTEGER CHECK (cns_fatigue_1_5 >= 1 AND cns_fatigue_1_5 <= 5),
    work_stress_1_5 INTEGER NOT NULL DEFAULT 1 CHECK (work_stress_1_5 >= 1 AND work_stress_1_5 <= 5),
    peak_energy_window TIME,
    caffeine_mg INTEGER,
    nsaids_taken BOOLEAN NOT NULL DEFAULT false,
    day_notes TEXT,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','strava','intervals','google_fit','sync')),
    raw_jsonb JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ,
    UNIQUE (user_id, log_date)
);

-- 2b. recovery_logs
CREATE TABLE IF NOT EXISTS public.recovery_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    sleep_hours NUMERIC(4,2),
    sleep_quality_1_5 INTEGER CHECK (sleep_quality_1_5 >= 1 AND sleep_quality_1_5 <= 5),
    hrv_ms NUMERIC(8,2),
    resting_hr INTEGER CHECK (resting_hr > 0 AND resting_hr < 300),
    soreness_0_10 NUMERIC(4,1) CHECK (soreness_0_10 >= 0 AND soreness_0_10 <= 10),
    stress_0_10 NUMERIC(4,1) CHECK (stress_0_10 >= 0 AND stress_0_10 <= 10),
    motivation_0_10 NUMERIC(4,1) CHECK (motivation_0_10 >= 0 AND motivation_0_10 <= 10),
    caffeine_cutoff_met BOOLEAN NOT NULL DEFAULT false,
    meal_cutoff_met BOOLEAN NOT NULL DEFAULT false,
    shutdown_protocol BOOLEAN NOT NULL DEFAULT false,
    readiness_score NUMERIC(5,2) CHECK (readiness_score >= 0 AND readiness_score <= 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ,
    UNIQUE (user_id, log_date)
);

-- 2c. nutrition_logs
CREATE TABLE IF NOT EXISTS public.nutrition_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    total_cals NUMERIC(8,2),
    protein_g NUMERIC(8,2),
    carbs_g NUMERIC(8,2),
    fats_g NUMERIC(8,2),
    fiber_g NUMERIC(8,2),
    sugar_g NUMERIC(8,2),
    water_liters NUMERIC(5,2),
    sodium_mg NUMERIC(8,2),
    pre_workout_carbs_g NUMERIC(8,2),
    intra_carbs_g NUMERIC(8,2),
    pre_sodium_mg NUMERIC(8,2),
    post_refeed BOOLEAN NOT NULL DEFAULT false,
    post_protein_g NUMERIC(8,2),
    post_carbs_g NUMERIC(8,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ,
    UNIQUE (user_id, log_date)
);

-- ============================================================
-- 3. TIER 3: TRAINING
-- ============================================================

-- 3a. workout_sessions
CREATE TABLE IF NOT EXISTS public.workout_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','strava','intervals','google_fit')),
    external_id TEXT,
    session_type TEXT NOT NULL CHECK (session_type IN ('strength','cardio','mobility','recovery','mixed')),
    modality TEXT CHECK (modality IN ('none','walk_jog','cycling','rowing','swimming','running')),
    started_at TIME,
    duration_min NUMERIC(8,2),
    distance_km NUMERIC(8,3),
    avg_hr INTEGER CHECK (avg_hr > 0 AND avg_hr < 300),
    max_hr INTEGER CHECK (max_hr > 0 AND max_hr < 300),
    avg_pace_min_km NUMERIC(5,2),
    avg_power_watts NUMERIC(8,2),
    calories NUMERIC(8,2),
    elevation_gain_m NUMERIC(8,2),
    rpe NUMERIC(4,1) CHECK (rpe >= 1 AND rpe <= 10),
    impact_level TEXT CHECK (impact_level IN ('zero','low','medium','high')),
    zone1_min NUMERIC(8,2) DEFAULT 0,
    zone2_min NUMERIC(8,2) DEFAULT 0,
    zone3_min NUMERIC(8,2) DEFAULT 0,
    zone4_min NUMERIC(8,2) DEFAULT 0,
    zone5_min NUMERIC(8,2) DEFAULT 0,
    training_load NUMERIC(10,2),
    strava_effort NUMERIC(10,2),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ,
    UNIQUE (user_id, source, external_id)
);

-- 3b. strength_sets
CREATE TABLE IF NOT EXISTS public.strength_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_session_id UUID NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
    exercise_name TEXT NOT NULL,
    load_kg NUMERIC(8,2),
    reps INTEGER CHECK (reps > 0 AND reps <= 100),
    sets INTEGER CHECK (sets > 0 AND sets <= 50),
    rest_seconds INTEGER,
    tempo TEXT,
    rir NUMERIC(4,1) CHECK (rir >= 0 AND rir <= 10),
    estimated_1rm NUMERIC(8,2),
    pct_1rm NUMERIC(6,4),
    is_neural_compliant BOOLEAN NOT NULL DEFAULT false,
    warning_flags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3c. gym_sessions
CREATE TABLE IF NOT EXISTS public.gym_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    workout_session_id UUID REFERENCES public.workout_sessions(id) ON DELETE SET NULL,
    log_date DATE NOT NULL,
    gym_type TEXT NOT NULL DEFAULT 'NONE' CHECK (gym_type IN ('NONE','DAY_A','DAY_B','TENDON')),
    muscle_target TEXT,
    muscle_sets INTEGER,
    prehab_done BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ
);

-- ============================================================
-- 4. TIER 4: HEALTH & INJURY
-- ============================================================

-- 4a. pain_logs
CREATE TABLE IF NOT EXISTS public.pain_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    workout_session_id UUID REFERENCES public.workout_sessions(id) ON DELETE SET NULL,
    log_date DATE NOT NULL,
    body_region TEXT NOT NULL,
    side TEXT NOT NULL DEFAULT 'center' CHECK (side IN ('left','right','center')),
    pain_score_0_10 NUMERIC(4,1) NOT NULL CHECK (pain_score_0_10 >= 0 AND pain_score_0_10 <= 10),
    pain_type TEXT NOT NULL DEFAULT 'unknown' CHECK (pain_type IN ('joint','tendon','muscle','nerve','unknown')),
    timing TEXT NOT NULL DEFAULT 'during' CHECK (timing IN ('during','after','next_morning')),
    action_taken TEXT,
    notes TEXT,
    resolved_at DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ
);

-- 4b. body_scan_logs
CREATE TABLE IF NOT EXISTS public.body_scan_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    scan_date DATE NOT NULL,
    weight_kg NUMERIC(5,2),
    body_fat_pct NUMERIC(5,2),
    fat_mass_kg NUMERIC(5,2),
    skeletal_muscle_kg NUMERIC(5,2),
    muscle_pct NUMERIC(5,2),
    tbw_pct NUMERIC(5,2),
    bmr NUMERIC(8,2),
    visceral_fat NUMERIC(5,2),
    bmi NUMERIC(5,2),
    scan_notes TEXT,
    flags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ
);

-- 4c. biomarker_logs (NEW — extracted from JSONB)
CREATE TABLE IF NOT EXISTS public.biomarker_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    test_date DATE NOT NULL,
    testosterone_ng_dl NUMERIC(8,2),
    cortisol_am_ug_dl NUMERIC(6,2),
    hs_crp_mg_l NUMERIC(6,2),
    ferritin_ng_ml NUMERIC(8,2),
    vitamin_d_ng_ml NUMERIC(6,2),
    thyroid_tsh NUMERIC(6,4),
    iron_ug_dl NUMERIC(6,2),
    b12_pg_ml NUMERIC(8,2),
    additional_results JSONB DEFAULT '{}'::jsonb,
    lab_name TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ
);

-- ============================================================
-- 5. TIER 5: NEW DATA CATEGORIES
-- ============================================================

-- 5a. supplement_catalog
CREATE TABLE IF NOT EXISTS public.supplement_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT CHECK (category IN ('vitamin','mineral','amino_acid','herb','performance','recovery','other')),
    default_dose TEXT,
    default_timing TEXT CHECK (default_timing IN ('morning','pre_workout','post_workout','evening','bedtime')),
    active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5b. supplement_logs
CREATE TABLE IF NOT EXISTS public.supplement_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    supplement_catalog_id UUID REFERENCES public.supplement_catalog(id) ON DELETE SET NULL,
    supplement_name TEXT NOT NULL,
    dose TEXT,
    timing TEXT CHECK (timing IN ('morning','pre_workout','post_workout','evening','bedtime')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (user_id, log_date, supplement_name, timing)
);

-- 5c. gear_items
CREATE TABLE IF NOT EXISTS public.gear_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('shoe','bike','wetsuit','clothing','accessory','other')),
    brand TEXT,
    model TEXT,
    purchase_date DATE,
    initial_life_km NUMERIC(8,2),
    current_km NUMERIC(8,2) NOT NULL DEFAULT 0,
    retired BOOLEAN NOT NULL DEFAULT false,
    retired_at DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5d. gear_usage_logs
CREATE TABLE IF NOT EXISTS public.gear_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gear_item_id UUID NOT NULL REFERENCES public.gear_items(id) ON DELETE CASCADE,
    workout_session_id UUID REFERENCES public.workout_sessions(id) ON DELETE SET NULL,
    used_at DATE NOT NULL,
    distance_km NUMERIC(8,3),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5e. race_events
CREATE TABLE IF NOT EXISTS public.race_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    event_date DATE,
    event_type TEXT CHECK (event_type IN ('run','triathlon','cycling','swim','obstacle','other')),
    distance_km NUMERIC(8,3),
    location TEXT,
    goal_time TEXT,
    priority TEXT CHECK (priority IN ('A','B','C')),
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','registered','completed','DNS','DNF')),
    result_time TEXT,
    result_notes TEXT,
    taper_start_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5f. training_plans
CREATE TABLE IF NOT EXISTS public.training_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phase TEXT CHECK (phase IN ('base','build','peak','recover')),
    start_date DATE,
    end_date DATE,
    weekly_structure JSONB DEFAULT '{}'::jsonb,
    target_race_id UUID REFERENCES public.race_events(id) ON DELETE SET NULL,
    notes TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5g. training_plan_days
CREATE TABLE IF NOT EXISTS public.training_plan_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    training_plan_id UUID NOT NULL REFERENCES public.training_plans(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    week_number INTEGER NOT NULL CHECK (week_number >= 1 AND week_number <= 52),
    session_type TEXT,
    description TEXT,
    target_duration_min INTEGER,
    target_rpe NUMERIC(4,1) CHECK (target_rpe >= 1 AND target_rpe <= 10),
    planned_exercises JSONB DEFAULT '[]'::jsonb,
    UNIQUE (training_plan_id, week_number, day_of_week)
);

-- 5h. progress_photos
CREATE TABLE IF NOT EXISTS public.progress_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    photo_date DATE NOT NULL,
    photo_type TEXT NOT NULL CHECK (photo_type IN ('front','back','side_left','side_right','custom')),
    storage_path TEXT NOT NULL,
    weight_kg NUMERIC(5,2),
    body_fat_pct NUMERIC(5,2),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ
);

-- 5i. hormone_cycle_logs
CREATE TABLE IF NOT EXISTS public.hormone_cycle_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    cycle_day INTEGER CHECK (cycle_day >= 1 AND cycle_day <= 45),
    phase TEXT CHECK (phase IN ('follicular','ovulation','luteal','menstrual')),
    basal_temp_c NUMERIC(4,2),
    energy_level_1_5 INTEGER CHECK (energy_level_1_5 >= 1 AND energy_level_1_5 <= 5),
    mood TEXT,
    cramps_0_10 NUMERIC(4,1) CHECK (cramps_0_10 >= 0 AND cramps_0_10 <= 10),
    bloating BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (user_id, log_date)
);

-- 5j. wellness_questionnaires
CREATE TABLE IF NOT EXISTS public.wellness_questionnaires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    questionnaire_type TEXT NOT NULL CHECK (questionnaire_type IN ('morning','evening')),
    responses JSONB NOT NULL DEFAULT '{}'::jsonb,
    overall_score NUMERIC(5,2) CHECK (overall_score >= 0 AND overall_score <= 100),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (user_id, log_date, questionnaire_type)
);

-- 5k. custom_metric_definitions
CREATE TABLE IF NOT EXISTS public.custom_metric_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    metric_name TEXT NOT NULL,
    metric_type TEXT NOT NULL CHECK (metric_type IN ('number','boolean','text','scale','enum')),
    unit TEXT,
    min_value NUMERIC,
    max_value NUMERIC,
    enum_options TEXT[],
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (user_id, metric_name)
);

-- 5l. custom_metric_logs
CREATE TABLE IF NOT EXISTS public.custom_metric_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    metric_def_id UUID NOT NULL REFERENCES public.custom_metric_definitions(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    value_text TEXT,
    value_numeric NUMERIC,
    value_boolean BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (user_id, metric_def_id, log_date)
);

-- ============================================================
-- 6. TIER 6: EXTERNAL INTEGRATIONS
-- ============================================================

-- 6a. strava_connections
CREATE TABLE IF NOT EXISTS public.strava_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    athlete_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    scope TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (user_id, athlete_id)
);

-- 6b. external_activity_raw
CREATE TABLE IF NOT EXISTS public.external_activity_raw (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('strava','intervals','google_fit')),
    external_id TEXT NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    raw JSONB NOT NULL,
    normalized_session_id UUID REFERENCES public.workout_sessions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (source, external_id)
);

-- ============================================================
-- 7. TIER 7: SYSTEM & AUDIT
-- ============================================================

-- 7a. weather_snapshots
CREATE TABLE IF NOT EXISTS public.weather_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    snapshot_at TIMESTAMPTZ NOT NULL,
    location_lat NUMERIC(9,6),
    location_lon NUMERIC(9,6),
    temperature_c NUMERIC(5,2),
    humidity_pct NUMERIC(5,2),
    wind_speed NUMERIC(8,2),
    condition TEXT,
    heat_risk TEXT CHECK (heat_risk IN ('low','high','critical','unknown')),
    source TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7b. mobility_tendon_checklists
CREATE TABLE IF NOT EXISTS public.mobility_tendon_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    workout_session_id UUID REFERENCES public.workout_sessions(id) ON DELETE SET NULL,
    log_date DATE NOT NULL,
    warmup_done BOOLEAN NOT NULL DEFAULT false,
    isometrics_done BOOLEAN NOT NULL DEFAULT false,
    isometric_hold_seconds INTEGER,
    hsr_done BOOLEAN NOT NULL DEFAULT false,
    hsr_tempo TEXT,
    mobility_done BOOLEAN NOT NULL DEFAULT false,
    spanish_squat BOOLEAN NOT NULL DEFAULT false,
    wall_sit BOOLEAN NOT NULL DEFAULT false,
    slow_lunges BOOLEAN NOT NULL DEFAULT false,
    calf_raises BOOLEAN NOT NULL DEFAULT false,
    hip_mobility BOOLEAN NOT NULL DEFAULT false,
    thoracic_mobility BOOLEAN NOT NULL DEFAULT false,
    ankle_mobility BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7c. movement_quality_logs
CREATE TABLE IF NOT EXISTS public.movement_quality_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    workout_session_id UUID REFERENCES public.workout_sessions(id) ON DELETE SET NULL,
    log_date DATE NOT NULL,
    pattern TEXT NOT NULL CHECK (pattern IN ('squat','hinge','lunge','push','pull','row','swim','run_walk')),
    issue_flags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    quality_score_0_10 NUMERIC(4,1) CHECK (quality_score_0_10 >= 0 AND quality_score_0_10 <= 10),
    action_taken TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7d. alerts
CREATE TABLE IF NOT EXISTS public.alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    alert_date DATE NOT NULL,
    type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('green','yellow','red')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    reason_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    linked_workout_id UUID REFERENCES public.workout_sessions(id) ON DELETE SET NULL,
    resolved BOOLEAN NOT NULL DEFAULT false,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7e. data_versions (audit trail)
CREATE TABLE IF NOT EXISTS public.data_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
    old_data JSONB,
    new_data JSONB,
    changed_by TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7f. weekly_reviews
CREATE TABLE IF NOT EXISTS public.weekly_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    week_start_date DATE NOT NULL,
    week_end_date DATE NOT NULL,
    weight_trend_kg NUMERIC(6,2),
    body_fat_trend_pct NUMERIC(6,2),
    skeletal_muscle_trend_kg NUMERIC(6,2),
    acute_load NUMERIC(10,2),
    chronic_load NUMERIC(10,2),
    acwr NUMERIC(8,4),
    zone2_pct NUMERIC(5,2),
    strength_compliance_pct NUMERIC(5,2),
    pain_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    nutrition_compliance JSONB NOT NULL DEFAULT '{}'::jsonb,
    recovery_score_avg NUMERIC(5,2),
    mobility_tendon_days INTEGER,
    recommendation TEXT NOT NULL CHECK (recommendation IN (
        'continue','reduce','deload','increase_non_impact_volume',
        'hold_running_progression','adjust_calories',
        'improve_protein_fueling','improve_sleep_recovery'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (user_id, week_start_date)
);

-- 7g. phase_progression_checks
CREATE TABLE IF NOT EXISTS public.phase_progression_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    check_date DATE NOT NULL,
    current_phase TEXT NOT NULL DEFAULT 'phase_1',
    status TEXT NOT NULL CHECK (status IN ('stay_phase_1','partial_progression','unlock_phase_2')),
    weight_kg NUMERIC(5,2),
    body_fat_pct NUMERIC(5,2),
    max_pain_0_10 NUMERIC(4,1),
    acwr NUMERIC(8,4),
    tendon_armor_days INTEGER,
    walk_jog_pain_free BOOLEAN NOT NULL DEFAULT false,
    strength_stable BOOLEAN NOT NULL DEFAULT false,
    passed_checks TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    blocked_checks TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    recommendation TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (user_id, check_date, current_phase)
);

-- ============================================================
-- 8. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date ON public.daily_logs(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date_nd ON public.daily_logs(user_id, log_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_recovery_logs_user_date ON public.recovery_logs(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_nutrition_logs_user_date ON public.nutrition_logs(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_date ON public.workout_sessions(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_source ON public.workout_sessions(source, external_id);
CREATE INDEX IF NOT EXISTS idx_strength_sets_session ON public.strength_sets(workout_session_id);
CREATE INDEX IF NOT EXISTS idx_strength_sets_exercise ON public.strength_sets(exercise_name);
CREATE INDEX IF NOT EXISTS idx_gym_sessions_user_date ON public.gym_sessions(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_pain_logs_user_date_region ON public.pain_logs(user_id, log_date DESC, body_region);
CREATE INDEX IF NOT EXISTS idx_body_scan_logs_user_date ON public.body_scan_logs(user_id, scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_biomarker_logs_user_date ON public.biomarker_logs(user_id, test_date DESC);
CREATE INDEX IF NOT EXISTS idx_supplement_logs_user_date ON public.supplement_logs(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_gear_items_user ON public.gear_items(user_id, type, retired);
CREATE INDEX IF NOT EXISTS idx_gear_usage_item ON public.gear_usage_logs(gear_item_id, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_race_events_user_date ON public.race_events(user_id, event_date);
CREATE INDEX IF NOT EXISTS idx_training_plans_user ON public.training_plans(user_id, active);
CREATE INDEX IF NOT EXISTS idx_progress_photos_user_date ON public.progress_photos(user_id, photo_date DESC);
CREATE INDEX IF NOT EXISTS idx_hormone_cycle_user_date ON public.hormone_cycle_logs(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_wellness_user_date ON public.wellness_questionnaires(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_custom_metric_logs_user_date ON public.custom_metric_logs(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_user_date_severity ON public.alerts(user_id, alert_date DESC, severity);
CREATE INDEX IF NOT EXISTS idx_weather_snapshots_time ON public.weather_snapshots(snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_mobility_checklist_user_date ON public.mobility_tendon_checklists(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_movement_quality_user_date ON public.movement_quality_logs(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_reviews_user_week ON public.weekly_reviews(user_id, week_start_date DESC);
CREATE INDEX IF NOT EXISTS idx_phase_progression_user_date ON public.phase_progression_checks(user_id, check_date DESC);
CREATE INDEX IF NOT EXISTS idx_data_versions_table_record ON public.data_versions(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_data_versions_changed_at ON public.data_versions(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_versions_user ON public.data_versions(user_id, changed_at DESC);

-- JSONB GIN index on daily_logs for querying raw payload
CREATE INDEX IF NOT EXISTS idx_daily_logs_raw_jsonb ON public.daily_logs USING GIN (raw_jsonb);

-- ============================================================
-- 9. TRIGGERS
-- ============================================================

-- updated_at triggers
DO $$
DECLARE
    t TEXT;
    tables_with_updated_at TEXT[] := ARRAY[
        'profiles','daily_logs','recovery_logs','nutrition_logs',
        'workout_sessions','gym_sessions','pain_logs',
        'strava_connections','supplement_catalog','gear_items',
        'race_events','training_plans','custom_metric_definitions',
        'alerts'
    ];
    trigger_name TEXT;
BEGIN
    FOREACH t IN ARRAY tables_with_updated_at LOOP
        trigger_name := 'set_updated_at_' || t;
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = trigger_name) THEN
            EXECUTE format(
                'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE PROCEDURE public.trigger_set_updated_at()',
                trigger_name, t
            );
        END IF;
    END LOOP;
END $$;

-- Audit triggers on critical tables
DO $$
DECLARE
    t TEXT;
    audit_tables TEXT[] := ARRAY[
        'daily_logs','recovery_logs','nutrition_logs','workout_sessions',
        'strength_sets','pain_logs','body_scan_logs','biomarker_logs',
        'gym_sessions','profiles'
    ];
    trigger_name TEXT;
BEGIN
    FOREACH t IN ARRAY audit_tables LOOP
        trigger_name := 'audit_' || t;
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = trigger_name) THEN
            EXECUTE format(
                'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE PROCEDURE public.trigger_audit_version()',
                trigger_name, t
            );
        END IF;
    END LOOP;
END $$;

-- ============================================================
-- 10. ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
DO $$
DECLARE
    t TEXT;
    all_tables TEXT[] := ARRAY[
        'profiles','daily_logs','recovery_logs','nutrition_logs',
        'workout_sessions','strength_sets','gym_sessions',
        'pain_logs','body_scan_logs','biomarker_logs',
        'supplement_catalog','supplement_logs',
        'gear_items','gear_usage_logs',
        'race_events','training_plans','training_plan_days',
        'progress_photos','hormone_cycle_logs','wellness_questionnaires',
        'custom_metric_definitions','custom_metric_logs',
        'strava_connections','external_activity_raw',
        'weather_snapshots','mobility_tendon_checklists',
        'movement_quality_logs','alerts','data_versions',
        'weekly_reviews','phase_progression_checks'
    ];
BEGIN
    FOREACH t IN ARRAY all_tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END LOOP;
END $$;

-- Helper function: get current user ID from JWT
CREATE OR REPLACE FUNCTION public.auth_uid()
RETURNS UUID AS $$
BEGIN
    RETURN auth.uid();
EXCEPTION WHEN OTHERS THEN
    RETURN '00000000-0000-0000-0000-000000000001'::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

-- RLS policies: users can only access their own data
-- For each table with user_id, create SELECT/INSERT/UPDATE/DELETE policies
DO $$
DECLARE
    t TEXT;
    user_tables TEXT[] := ARRAY[
        'daily_logs','recovery_logs','nutrition_logs',
        'workout_sessions','gym_sessions',
        'pain_logs','body_scan_logs','biomarker_logs',
        'supplement_catalog','supplement_logs',
        'gear_items',
        'race_events','training_plans',
        'progress_photos','hormone_cycle_logs','wellness_questionnaires',
        'custom_metric_definitions','custom_metric_logs',
        'strava_connections','external_activity_raw',
        'mobility_tendon_checklists','movement_quality_logs',
        'alerts','weekly_reviews','phase_progression_checks'
    ];
    policy_exists BOOLEAN;
BEGIN
    FOREACH t IN ARRAY user_tables LOOP
        -- SELECT: user sees own rows
        SELECT EXISTS (
            SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'Users read own ' || t
        ) INTO policy_exists;
        IF NOT policy_exists THEN
            EXECUTE format(
                'CREATE POLICY "Users read own %s" ON public.%I FOR SELECT USING (user_id = public.auth_uid())',
                t, t
            );
        END IF;

        -- INSERT: user creates own rows
        SELECT EXISTS (
            SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'Users insert own ' || t
        ) INTO policy_exists;
        IF NOT policy_exists THEN
            EXECUTE format(
                'CREATE POLICY "Users insert own %s" ON public.%I FOR INSERT WITH CHECK (user_id = public.auth_uid())',
                t, t
            );
        END IF;

        -- UPDATE: user updates own rows
        SELECT EXISTS (
            SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'Users update own ' || t
        ) INTO policy_exists;
        IF NOT policy_exists THEN
            EXECUTE format(
                'CREATE POLICY "Users update own %s" ON public.%I FOR UPDATE USING (user_id = public.auth_uid())',
                t, t
            );
        END IF;

        -- DELETE: user deletes own rows
        SELECT EXISTS (
            SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'Users delete own ' || t
        ) INTO policy_exists;
        IF NOT policy_exists THEN
            EXECUTE format(
                'CREATE POLICY "Users delete own %s" ON public.%I FOR DELETE USING (user_id = public.auth_uid())',
                t, t
            );
        END IF;
    END LOOP;

    -- profiles: read own, update own
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users read own profile') THEN
        CREATE POLICY "Users read own profile" ON public.profiles
            FOR SELECT USING (id = public.auth_uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users update own profile') THEN
        CREATE POLICY "Users update own profile" ON public.profiles
            FOR UPDATE USING (id = public.auth_uid());
    END IF;

    -- data_versions: read own audit trail
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'data_versions' AND policyname = 'Users read own audit') THEN
        CREATE POLICY "Users read own audit" ON public.data_versions
            FOR SELECT USING (user_id = public.auth_uid());
    END IF;

    -- weather_snapshots: read all (shared weather data)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'weather_snapshots' AND policyname = 'Anyone reads weather') THEN
        CREATE POLICY "Anyone reads weather" ON public.weather_snapshots
            FOR SELECT USING (true);
    END IF;
END $$;

-- Keep n1_logs open for backwards compatibility during migration
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'n1_logs') THEN
        -- Keep existing policies, don't break the PWA
        NULL;
    END IF;
END $$;

-- ============================================================
-- 11. ANALYTICS VIEWS
-- ============================================================

-- 11a. view_daily_dashboard: single-row-per-date joining all daily data
CREATE OR REPLACE VIEW public.view_daily_dashboard AS
SELECT
    dl.user_id,
    dl.log_date,
    dl.morning_weight_kg,
    dl.body_fat_pct,
    dl.cns_fatigue_1_5,
    dl.work_stress_1_5,
    dl.caffeine_mg,
    dl.nsaids_taken,
    dl.day_notes,
    dl.source AS log_source,
    rl.sleep_hours,
    rl.sleep_quality_1_5,
    rl.hrv_ms,
    rl.resting_hr,
    rl.soreness_0_10,
    rl.stress_0_10,
    rl.motivation_0_10,
    rl.readiness_score,
    rl.caffeine_cutoff_met,
    rl.meal_cutoff_met,
    rl.shutdown_protocol,
    nl.total_cals,
    nl.protein_g,
    nl.carbs_g,
    nl.fats_g,
    nl.fiber_g,
    nl.water_liters,
    nl.sodium_mg,
    ws_count.total_workouts,
    ws_count.total_training_load,
    ws_count.total_strava_effort,
    ws_count.total_cardio_min,
    ws_count.total_distance_km,
    pl.max_pain,
    pl.pain_regions,
    ws.temperature_c AS weather_temp,
    ws.humidity_pct AS weather_humidity,
    ws.heat_risk
FROM public.daily_logs dl
LEFT JOIN public.recovery_logs rl ON dl.user_id = rl.user_id AND dl.log_date = rl.log_date AND rl.deleted_at IS NULL
LEFT JOIN public.nutrition_logs nl ON dl.user_id = nl.user_id AND dl.log_date = nl.log_date AND nl.deleted_at IS NULL
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) AS total_workouts,
        COALESCE(SUM(w.training_load), 0) AS total_training_load,
        COALESCE(SUM(w.strava_effort), 0) AS total_strava_effort,
        COALESCE(SUM(CASE WHEN w.session_type = 'cardio' THEN w.duration_min ELSE 0 END), 0) AS total_cardio_min,
        COALESCE(SUM(w.distance_km), 0) AS total_distance_km
    FROM public.workout_sessions w
    WHERE w.user_id = dl.user_id AND w.log_date = dl.log_date AND w.deleted_at IS NULL
) ws_count ON true
LEFT JOIN LATERAL (
    SELECT
        MAX(p.pain_score_0_10) AS max_pain,
        array_agg(DISTINCT p.body_region) AS pain_regions
    FROM public.pain_logs p
    WHERE p.user_id = dl.user_id AND p.log_date = dl.log_date AND p.deleted_at IS NULL
) pl ON true
LEFT JOIN LATERAL (
    SELECT temperature_c, humidity_pct, heat_risk
    FROM public.weather_snapshots w
    WHERE w.snapshot_at::date = dl.log_date
    ORDER BY w.snapshot_at DESC
    LIMIT 1
) ws ON true
WHERE dl.deleted_at IS NULL;

-- 11b. view_exercise_prs: all-time bests per exercise
CREATE OR REPLACE VIEW public.view_exercise_prs AS
SELECT DISTINCT ON (ss.exercise_name, ws.user_id)
    ws.user_id,
    ss.exercise_name,
    ss.load_kg AS best_weight,
    ss.reps AS best_reps,
    ss.estimated_1rm AS best_e1rm,
    ws.log_date AS pr_date
FROM public.strength_sets ss
JOIN public.workout_sessions ws ON ss.workout_session_id = ws.id
WHERE ws.deleted_at IS NULL
ORDER BY ss.exercise_name, ws.user_id, ss.estimated_1rm DESC NULLS LAST;

-- ============================================================
-- 12. MATERIALIZED VIEWS
-- ============================================================

-- 12a. mv_weekly_summaries
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_weekly_summaries AS
SELECT
    dl.user_id,
    date_trunc('week', dl.log_date)::date AS week_start,
    (date_trunc('week', dl.log_date) + INTERVAL '6 days')::date AS week_end,
    AVG(dl.morning_weight_kg) AS avg_weight_kg,
    (AVG(dl.morning_weight_kg) - LAG(AVG(dl.morning_weight_kg)) OVER (PARTITION BY dl.user_id ORDER BY date_trunc('week', dl.log_date))) AS weight_delta_kg,
    AVG(dl.body_fat_pct) AS avg_body_fat_pct,
    AVG(rl.readiness_score) AS avg_readiness,
    AVG(rl.sleep_hours) AS avg_sleep_hours,
    AVG(rl.hrv_ms) AS avg_hrv,
    SUM(COALESCE(ws_stats.total_training_load, 0)) AS total_weekly_load,
    SUM(COALESCE(ws_stats.total_cardio_min, 0)) AS total_cardio_min,
    SUM(COALESCE(ws_stats.total_distance_km, 0)) AS total_distance_km,
    AVG(nl.protein_g) AS avg_protein_g,
    AVG(nl.total_cals) AS avg_cals,
    COUNT(DISTINCT CASE WHEN pl.pain_exists THEN dl.log_date END) AS pain_days,
    MAX(pl.max_pain_week) AS max_pain_week,
    COUNT(DISTINCT mt.mt_exists) AS mobility_tendon_days
FROM public.daily_logs dl
LEFT JOIN public.recovery_logs rl ON dl.user_id = rl.user_id AND dl.log_date = rl.log_date AND rl.deleted_at IS NULL
LEFT JOIN public.nutrition_logs nl ON dl.user_id = nl.user_id AND dl.log_date = nl.log_date AND nl.deleted_at IS NULL
LEFT JOIN LATERAL (
    SELECT
        SUM(w.training_load) AS total_training_load,
        SUM(CASE WHEN w.session_type = 'cardio' THEN w.duration_min ELSE 0 END) AS total_cardio_min,
        SUM(w.distance_km) AS total_distance_km
    FROM public.workout_sessions w
    WHERE w.user_id = dl.user_id AND w.log_date = dl.log_date AND w.deleted_at IS NULL
) ws_stats ON true
LEFT JOIN LATERAL (
    SELECT
        TRUE AS pain_exists,
        MAX(pain_score_0_10) AS max_pain_week
    FROM public.pain_logs p
    WHERE p.user_id = dl.user_id AND p.log_date = dl.log_date AND p.deleted_at IS NULL
) pl ON true
LEFT JOIN LATERAL (
    SELECT 1 AS mt_exists
    FROM public.mobility_tendon_checklists mt
    WHERE mt.user_id = dl.user_id AND mt.log_date = dl.log_date
    LIMIT 1
) mt ON true
WHERE dl.deleted_at IS NULL
GROUP BY dl.user_id, date_trunc('week', dl.log_date)
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_weekly_user_week ON public.mv_weekly_summaries(user_id, week_start);

-- 12b. mv_gear_status
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_gear_status AS
SELECT
    gi.id AS gear_item_id,
    gi.user_id,
    gi.name,
    gi.type,
    gi.brand,
    gi.model,
    gi.initial_life_km,
    gi.current_km,
    gi.retired,
    CASE
        WHEN gi.initial_life_km > 0 THEN
            ROUND((gi.current_km / gi.initial_life_km) * 100, 1)
        ELSE NULL
    END AS life_used_pct,
    CASE
        WHEN gi.initial_life_km > 0 AND gi.current_km >= gi.initial_life_km * 0.8 THEN true
        ELSE false
    END AS needs_replacement
FROM public.gear_items gi
WHERE gi.retired = false
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_gear_item ON public.mv_gear_status(gear_item_id);

-- ============================================================
-- 13. FUNCTIONS FOR COMMON OPERATIONS
-- ============================================================

-- Calculate daily readiness score
CREATE OR REPLACE FUNCTION public.calc_readiness_score(
    p_sleep_hours NUMERIC,
    p_sleep_quality INTEGER,
    p_hrv NUMERIC,
    p_soreness NUMERIC,
    p_stress NUMERIC,
    p_cns_fatigue INTEGER,
    p_motivation NUMERIC
)
RETURNS NUMERIC AS $$
DECLARE
    score NUMERIC := 50;
BEGIN
    IF p_sleep_hours IS NOT NULL THEN
        score := score + LEAST(20, (p_sleep_hours / 8.0) * 20);
    END IF;
    IF p_sleep_quality IS NOT NULL THEN
        score := score + (p_sleep_quality / 5.0) * 10;
    END IF;
    IF p_hrv IS NOT NULL THEN
        score := score + LEAST(10, (p_hrv / 80.0) * 10);
    END IF;
    IF p_soreness IS NOT NULL THEN
        score := score - (p_soreness / 10.0) * 15;
    END IF;
    IF p_stress IS NOT NULL THEN
        score := score - (p_stress / 10.0) * 10;
    END IF;
    IF p_cns_fatigue IS NOT NULL THEN
        score := score - ((p_cns_fatigue - 1) / 4.0) * 10;
    END IF;
    IF p_motivation IS NOT NULL THEN
        score := score + (p_motivation / 10.0) * 5;
    END IF;
    RETURN GREATEST(0, LEAST(100, ROUND(score, 2)));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Calculate ACWR (Acute:Chronic Workload Ratio)
CREATE OR REPLACE FUNCTION public.calc_acwr(
    p_user_id UUID,
    p_end_date DATE
)
RETURNS TABLE (
    acute_load NUMERIC,
    chronic_load NUMERIC,
    acwr NUMERIC
) AS $$
DECLARE
    v_acute NUMERIC;
    v_chronic NUMERIC;
BEGIN
    SELECT COALESCE(SUM(training_load), 0) INTO v_acute
    FROM public.workout_sessions
    WHERE user_id = p_user_id
      AND log_date BETWEEN (p_end_date - 6) AND p_end_date
      AND deleted_at IS NULL;

    SELECT COALESCE(SUM(training_load), 0) / 4.0 INTO v_chronic
    FROM public.workout_sessions
    WHERE user_id = p_user_id
      AND log_date BETWEEN (p_end_date - 27) AND p_end_date
      AND deleted_at IS NULL;

    acute_load := v_acute;
    chronic_load := v_chronic;
    acwr := CASE WHEN v_chronic > 0 THEN v_acute / v_chronic ELSE NULL END;

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- Auto-update gear mileage when workout logged with gear
CREATE OR REPLACE FUNCTION public.trigger_update_gear_mileage()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.distance_km IS NOT NULL AND NEW.distance_km > 0 THEN
        UPDATE public.gear_items gi
        SET current_km = gi.current_km + NEW.distance_km
        FROM public.gear_usage_logs gul
        WHERE gul.gear_item_id = gi.id
          AND gul.workout_session_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_gear_on_workout ON public.workout_sessions;
CREATE TRIGGER update_gear_on_workout
    AFTER INSERT ON public.workout_sessions
    FOR EACH ROW
    EXECUTE PROCEDURE public.trigger_update_gear_mileage();

-- ============================================================
-- 14. GRANTS
-- ============================================================
-- Supabase anon and authenticated roles need access
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
-- Allowanon to insert into profiles (for registration)
GRANT INSERT ON public.profiles TO anon;

-- ============================================================
-- END OF SCHEMA
-- ============================================================
