-- Supabase Schema for N=1 Performance Lab

-- 1. Create the master logs table
CREATE TABLE public.n1_logs (
    date_id TEXT PRIMARY KEY, -- Stores the date as YYYY-MM-DD
    data JSONB NOT NULL DEFAULT '{}'::jsonb, -- Stores the daily metrics payload
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Setup Row Level Security (RLS)
-- For a personal N=1 lab, we will allow anonymous access if you are using just the Anon Key.
-- WARNING: If you want this secure, you should use Supabase Auth and restrict it. 
-- For MVP speed, we are allowing the PWA to read/insert using the Anon key.
ALTER TABLE public.n1_logs ENABLE ROW LEVEL SECURITY;

-- Allow read access to anyone with the Anon Key
CREATE POLICY "Enable read access for all users" ON public.n1_logs
    FOR SELECT USING (true);

-- Allow insert/upsert access to anyone with the Anon Key
CREATE POLICY "Enable insert for all users" ON public.n1_logs
    FOR INSERT WITH CHECK (true);

-- Allow update access to anyone with the Anon Key
CREATE POLICY "Enable update for all users" ON public.n1_logs
    FOR UPDATE USING (true);

-- 3. Create a trigger to auto-update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_n1_logs_updated_at
    BEFORE UPDATE ON public.n1_logs
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- 4. Normalized Athlete OS tables
-- These tables are additive. The PWA can keep using n1_logs for offline-first
-- sync while backend jobs and future screens migrate toward domain tables.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    age INTEGER,
    height_cm NUMERIC(5,2),
    weight_kg NUMERIC(5,2),
    current_phase TEXT NOT NULL DEFAULT 'phase_1',
    primary_goals TEXT[] NOT NULL DEFAULT ARRAY['fat_loss', 'dense_strength', 'endurance_base', 'injury_prevention'],
    sport_background TEXT,
    occupation TEXT,
    baseline_weight_kg NUMERIC(5,2),
    baseline_body_fat_percent NUMERIC(5,2),
    baseline_muscle_mass_kg NUMERIC(5,2),
    baseline_total_body_water_percent NUMERIC(5,2),
    baseline_bmr NUMERIC(8,2),
    target_weight_kg NUMERIC(5,2),
    target_body_fat_percent NUMERIC(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

INSERT INTO public.user_profiles (
    id, name, age, height_cm, weight_kg, current_phase, primary_goals,
    sport_background, occupation, baseline_weight_kg, baseline_body_fat_percent,
    baseline_muscle_mass_kg, baseline_total_body_water_percent, baseline_bmr,
    target_weight_kg, target_body_fat_percent
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Momen',
    22,
    173,
    115.5,
    'phase_1',
    ARRAY['fat_loss', 'dense_strength', 'endurance_base', 'injury_prevention'],
    'hybrid athlete',
    'software engineer',
    119.6,
    37.5,
    24.1,
    NULL,
    NULL,
    95,
    22
) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.body_scan_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    scan_date DATE NOT NULL,
    weight_kg NUMERIC(5,2),
    body_fat_percent NUMERIC(5,2),
    fat_mass_kg NUMERIC(5,2),
    skeletal_muscle_mass_kg NUMERIC(5,2),
    muscle_percent NUMERIC(5,2),
    total_body_water_percent NUMERIC(5,2),
    bmr NUMERIC(8,2),
    visceral_fat NUMERIC(5,2),
    scan_condition_notes TEXT,
    flags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.workout_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'strava', 'intervals', 'google_fit')),
    external_activity_id TEXT,
    type TEXT NOT NULL CHECK (type IN ('strength', 'bike', 'row', 'swim', 'run_walk', 'mobility', 'recovery')),
    modality TEXT,
    date_time_start TIMESTAMP WITH TIME ZONE,
    date_time_end TIMESTAMP WITH TIME ZONE,
    duration_min NUMERIC(8,2),
    distance_km NUMERIC(8,3),
    avg_hr INTEGER,
    max_hr INTEGER,
    avg_pace TEXT,
    avg_power NUMERIC(8,2),
    calories_burned NUMERIC(8,2),
    elevation_gain NUMERIC(8,2),
    rpe NUMERIC(4,1),
    impact_level TEXT CHECK (impact_level IN ('zero', 'low', 'medium', 'high')),
    zone1_min NUMERIC(8,2) DEFAULT 0,
    zone2_min NUMERIC(8,2) DEFAULT 0,
    zone3_min NUMERIC(8,2) DEFAULT 0,
    zone4_min NUMERIC(8,2) DEFAULT 0,
    zone5_min NUMERIC(8,2) DEFAULT 0,
    training_load NUMERIC(10,2),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (source, external_activity_id)
);

CREATE TABLE IF NOT EXISTS public.strength_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_session_id UUID NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
    exercise_name TEXT NOT NULL,
    load_kg NUMERIC(8,2),
    reps INTEGER,
    sets INTEGER,
    rest_seconds INTEGER,
    tempo TEXT,
    estimated_1rm NUMERIC(8,2),
    percent_1rm NUMERIC(6,4),
    rpe NUMERIC(4,1),
    is_neural_strength_compliant BOOLEAN DEFAULT false,
    warning_flags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.pain_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    workout_session_id UUID REFERENCES public.workout_sessions(id) ON DELETE SET NULL,
    log_date DATE NOT NULL,
    body_region TEXT NOT NULL,
    side TEXT NOT NULL DEFAULT 'center' CHECK (side IN ('left', 'right', 'center')),
    pain_score_0_to_10 NUMERIC(4,1) NOT NULL CHECK (pain_score_0_to_10 >= 0 AND pain_score_0_to_10 <= 10),
    pain_type TEXT NOT NULL DEFAULT 'unknown' CHECK (pain_type IN ('joint', 'tendon', 'muscle', 'nerve', 'unknown')),
    timing TEXT NOT NULL DEFAULT 'during' CHECK (timing IN ('during', 'after', 'next_morning')),
    action_taken TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.nutrition_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    calories NUMERIC(8,2),
    protein_g NUMERIC(8,2),
    carbs_g NUMERIC(8,2),
    fat_g NUMERIC(8,2),
    fiber_g NUMERIC(8,2),
    sugar_g NUMERIC(8,2),
    water_liters NUMERIC(5,2),
    sodium_mg NUMERIC(8,2),
    pre_workout_carbs_g NUMERIC(8,2),
    intra_workout_carbs_g NUMERIC(8,2),
    post_workout_protein_g NUMERIC(8,2),
    post_workout_carbs_g NUMERIC(8,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, log_date)
);

CREATE TABLE IF NOT EXISTS public.recovery_readiness_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    sleep_hours NUMERIC(4,2),
    sleep_quality_0_to_10 NUMERIC(4,1),
    hrv NUMERIC(8,2),
    resting_hr INTEGER,
    soreness_0_to_10 NUMERIC(4,1),
    stress_0_to_10 NUMERIC(4,1),
    motivation_0_to_10 NUMERIC(4,1),
    cns_fatigue_0_to_10 NUMERIC(4,1),
    caffeine_cutoff_met BOOLEAN DEFAULT false,
    meal_cutoff_met BOOLEAN DEFAULT false,
    shutdown_protocol_completed BOOLEAN DEFAULT false,
    readiness_score NUMERIC(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, log_date)
);

CREATE TABLE IF NOT EXISTS public.weather_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_at TIMESTAMP WITH TIME ZONE NOT NULL,
    location TEXT NOT NULL,
    temperature_c NUMERIC(5,2),
    humidity_percent NUMERIC(5,2),
    wind_speed NUMERIC(8,2),
    heat_risk TEXT CHECK (heat_risk IN ('low', 'high', 'critical', 'unknown')),
    source TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    alert_date DATE NOT NULL,
    type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('green', 'yellow', 'red')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    reason_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    linked_workout_id UUID REFERENCES public.workout_sessions(id) ON DELETE SET NULL,
    resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.strava_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    athlete_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    scope TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, athlete_id)
);

CREATE TABLE IF NOT EXISTS public.strava_activities_raw (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    strava_activity_id TEXT NOT NULL UNIQUE,
    fetched_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    raw JSONB NOT NULL,
    normalized_workout_session_id UUID REFERENCES public.workout_sessions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.mobility_tendon_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    workout_session_id UUID REFERENCES public.workout_sessions(id) ON DELETE SET NULL,
    log_date DATE NOT NULL,
    spanish_squat_hold BOOLEAN DEFAULT false,
    wall_sit BOOLEAN DEFAULT false,
    slow_lunges BOOLEAN DEFAULT false,
    calf_raises BOOLEAN DEFAULT false,
    hip_mobility BOOLEAN DEFAULT false,
    thoracic_mobility BOOLEAN DEFAULT false,
    ankle_mobility BOOLEAN DEFAULT false,
    warmup_compliance BOOLEAN DEFAULT false,
    isometric_hold_seconds INTEGER,
    hsr_tempo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.movement_quality_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    workout_session_id UUID REFERENCES public.workout_sessions(id) ON DELETE SET NULL,
    log_date DATE NOT NULL,
    pattern TEXT NOT NULL CHECK (pattern IN ('squat', 'hinge', 'lunge', 'push', 'pull', 'row', 'swim', 'run_walk')),
    issue_flags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    quality_score_0_to_10 NUMERIC(4,1) CHECK (quality_score_0_to_10 >= 0 AND quality_score_0_to_10 <= 10),
    action_taken TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.weekly_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    week_start_date DATE NOT NULL,
    week_end_date DATE NOT NULL,
    weight_trend_kg NUMERIC(6,2),
    body_fat_trend_percent NUMERIC(6,2),
    skeletal_muscle_trend_kg NUMERIC(6,2),
    total_body_water_trend_percent NUMERIC(6,2),
    acute_load NUMERIC(10,2),
    chronic_load NUMERIC(10,2),
    acwr NUMERIC(8,4),
    zone2_percent NUMERIC(5,2),
    strength_compliance_percent NUMERIC(5,2),
    pain_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    nutrition_compliance JSONB NOT NULL DEFAULT '{}'::jsonb,
    recovery_score_avg NUMERIC(5,2),
    mobility_tendon_days INTEGER,
    recommendation TEXT NOT NULL CHECK (recommendation IN ('continue', 'reduce', 'deload', 'increase_non_impact_volume', 'hold_running_progression', 'adjust_calories', 'improve_protein_fueling', 'improve_sleep_recovery')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, week_start_date)
);

CREATE TABLE IF NOT EXISTS public.phase_progression_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    check_date DATE NOT NULL,
    current_phase TEXT NOT NULL DEFAULT 'phase_1',
    status TEXT NOT NULL CHECK (status IN ('stay_phase_1', 'partial_progression', 'unlock_phase_2')),
    weight_kg NUMERIC(5,2),
    body_fat_percent NUMERIC(5,2),
    max_pain_0_to_10 NUMERIC(4,1),
    acwr NUMERIC(8,4),
    tendon_armor_days INTEGER,
    walk_jog_pain_free BOOLEAN DEFAULT false,
    strength_stable BOOLEAN DEFAULT false,
    passed_checks TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    blocked_checks TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    recommendation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, check_date, current_phase)
);

CREATE INDEX IF NOT EXISTS idx_body_scan_logs_user_date ON public.body_scan_logs(user_id, scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_start ON public.workout_sessions(user_id, date_time_start DESC);
CREATE INDEX IF NOT EXISTS idx_pain_logs_user_date_region ON public.pain_logs(user_id, log_date DESC, body_region);
CREATE INDEX IF NOT EXISTS idx_nutrition_logs_user_date ON public.nutrition_logs(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_logs_user_date ON public.recovery_readiness_logs(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_user_date_severity ON public.alerts(user_id, alert_date DESC, severity);
CREATE INDEX IF NOT EXISTS idx_weather_snapshots_location_time ON public.weather_snapshots(location, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_movement_quality_user_date ON public.movement_quality_logs(user_id, log_date DESC, pattern);
CREATE INDEX IF NOT EXISTS idx_weekly_reviews_user_week ON public.weekly_reviews(user_id, week_start_date DESC);
CREATE INDEX IF NOT EXISTS idx_phase_progression_user_date ON public.phase_progression_checks(user_id, check_date DESC);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_profiles_updated_at') THEN
        CREATE TRIGGER update_user_profiles_updated_at
            BEFORE UPDATE ON public.user_profiles
            FOR EACH ROW
            EXECUTE PROCEDURE update_updated_at_column();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_strava_connections_updated_at') THEN
        CREATE TRIGGER update_strava_connections_updated_at
            BEFORE UPDATE ON public.strava_connections
            FOR EACH ROW
            EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;

DO $$
DECLARE
    tbl TEXT;
    athlete_tables TEXT[] := ARRAY[
        'user_profiles',
        'body_scan_logs',
        'workout_sessions',
        'strength_sets',
        'pain_logs',
        'nutrition_logs',
        'recovery_readiness_logs',
        'weather_snapshots',
        'alerts',
        'strava_connections',
        'strava_activities_raw',
        'mobility_tendon_checklists',
        'movement_quality_logs',
        'weekly_reviews',
        'phase_progression_checks'
    ];
BEGIN
    FOREACH tbl IN ARRAY athlete_tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = tbl AND policyname = 'Enable read access for all users'
        ) THEN
            EXECUTE format('CREATE POLICY "Enable read access for all users" ON public.%I FOR SELECT USING (true)', tbl);
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = tbl AND policyname = 'Enable insert for all users'
        ) THEN
            EXECUTE format('CREATE POLICY "Enable insert for all users" ON public.%I FOR INSERT WITH CHECK (true)', tbl);
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = tbl AND policyname = 'Enable update for all users'
        ) THEN
            EXECUTE format('CREATE POLICY "Enable update for all users" ON public.%I FOR UPDATE USING (true)', tbl);
        END IF;
    END LOOP;
END $$;
