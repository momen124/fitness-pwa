-- ============================================================
-- N=1 Performance Lab — Data Migration: JSONB → Normalized Tables
-- Migration: 002_migrate_jsonb_to_normalized.sql
-- ============================================================
-- Reads from n1_logs.data (JSONB) and fans out into:
-- daily_logs, recovery_logs, nutrition_logs, workout_sessions,
-- pain_logs, body_scan_logs, biomarker_logs, gym_sessions,
-- mobility_tendon_checklists, movement_quality_logs
-- ============================================================
-- Run AFTER 001_comprehensive_schema.sql
-- Uses default user_id: 00000000-0000-0000-0000-000000000001
-- ============================================================

DO $$
DECLARE
    default_user_id UUID := '00000000-0000-0000-0000-000000000001'::UUID;
    log_row RECORD;
    d JSONB;
    session_id UUID;
    gym_session_id UUID;
    migrated_count INTEGER := 0;
    skipped_count INTEGER := 0;
    total_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting JSONB migration from n1_logs...';

    FOR log_row IN
        SELECT date_id, data
        FROM public.n1_logs
        WHERE data IS NOT NULL
        ORDER BY date_id ASC
    LOOP
        total_count := total_count + 1;
        d := log_row.data;

        BEGIN
            -- ============================================================
            -- 1. daily_logs
            -- ============================================================
            INSERT INTO public.daily_logs (
                user_id, log_date,
                morning_weight_kg, body_fat_pct,
                cns_fatigue_1_5, work_stress_1_5,
                peak_energy_window, caffeine_mg,
                nsaids_taken, day_notes, source, raw_jsonb
            ) VALUES (
                default_user_id,
                log_row.date_id::date,
                NULLIF(d->>'weight', '')::NUMERIC,
                NULLIF(d->>'bodyFatPct', '')::NUMERIC,
                NULLIF(d->>'cnsFatigue', '')::INTEGER,
                COALESCE(NULLIF(d->>'workStress', '')::INTEGER, 1),
                NULLIF(d->>'peakEnergyWindow', '')::TIME,
                NULLIF(d->>'caffeineMg', '')::INTEGER,
                COALESCE((d->>'nsaidsTaken')::BOOLEAN, false),
                NULLIF(d->>'dayNotes', ''),
                COALESCE(d->>'source', 'manual'),
                d
            ) ON CONFLICT (user_id, log_date) DO UPDATE SET
                morning_weight_kg = EXCLUDED.morning_weight_kg,
                body_fat_pct = EXCLUDED.body_fat_pct,
                cns_fatigue_1_5 = EXCLUDED.cns_fatigue_1_5,
                work_stress_1_5 = EXCLUDED.work_stress_1_5,
                caffeine_mg = EXCLUDED.caffeine_mg,
                nsaids_taken = EXCLUDED.nsaids_taken,
                raw_jsonb = EXCLUDED.raw_jsonb,
                updated_at = timezone('utc'::text, now());

            -- ============================================================
            -- 2. recovery_logs
            -- ============================================================
            INSERT INTO public.recovery_logs (
                user_id, log_date,
                sleep_hours, sleep_quality_1_5,
                hrv_ms, resting_hr,
                soreness_0_10, stress_0_10, motivation_0_10,
                caffeine_cutoff_met, meal_cutoff_met, shutdown_protocol
            ) VALUES (
                default_user_id,
                log_row.date_id::date,
                NULLIF(d->>'sleepHrs', '')::NUMERIC,
                NULLIF(d->>'sleepQual', '')::INTEGER,
                NULLIF(d->>'hrv', '')::NUMERIC,
                NULLIF(d->>'restingHR', '')::INTEGER,
                NULLIF(d->>'soreness0to10', '')::NUMERIC,
                NULLIF(d->>'stress0to10', '')::NUMERIC,
                NULLIF(d->>'motivation0to10', '')::NUMERIC,
                COALESCE((d->>'caffeineCutoffMet')::BOOLEAN, false),
                COALESCE((d->>'mealCutoffMet')::BOOLEAN, false),
                COALESCE((d->>'shutdownProtocolCompleted')::BOOLEAN, false)
            ) ON CONFLICT (user_id, log_date) DO UPDATE SET
                sleep_hours = EXCLUDED.sleep_hours,
                sleep_quality_1_5 = EXCLUDED.sleep_quality_1_5,
                hrv_ms = EXCLUDED.hrv_ms,
                resting_hr = EXCLUDED.resting_hr,
                soreness_0_10 = EXCLUDED.soreness_0_10,
                stress_0_10 = EXCLUDED.stress_0_10,
                motivation_0_10 = EXCLUDED.motivation_0_10,
                updated_at = timezone('utc'::text, now());

            -- ============================================================
            -- 3. nutrition_logs
            -- ============================================================
            INSERT INTO public.nutrition_logs (
                user_id, log_date,
                total_cals, protein_g, carbs_g, fats_g,
                fiber_g, sugar_g, water_liters, sodium_mg,
                pre_workout_carbs_g, intra_carbs_g, pre_sodium_mg,
                post_refeed, post_protein_g, post_carbs_g
            ) VALUES (
                default_user_id,
                log_row.date_id::date,
                NULLIF(d->>'totalCals', '')::NUMERIC,
                NULLIF(d->>'proG', '')::NUMERIC,
                NULLIF(d->>'carbsG', '')::NUMERIC,
                NULLIF(d->>'fatsG', '')::NUMERIC,
                NULLIF(d->>'fiberG', '')::NUMERIC,
                NULLIF(d->>'sugarG', '')::NUMERIC,
                NULLIF(d->>'waterLiters', '')::NUMERIC,
                NULLIF(d->>'sodiumMg', '')::NUMERIC,
                NULLIF(d->>'preWorkoutCarbsG', '')::NUMERIC,
                NULLIF(d->>'intraCarbs', '')::NUMERIC,
                NULLIF(d->>'preSodium', '')::NUMERIC,
                COALESCE((d->>'postRefeed')::BOOLEAN, false),
                NULLIF(d->>'postWorkoutProteinG', '')::NUMERIC,
                NULLIF(d->>'postWorkoutCarbsG', '')::NUMERIC
            ) ON CONFLICT (user_id, log_date) DO UPDATE SET
                total_cals = EXCLUDED.total_cals,
                protein_g = EXCLUDED.protein_g,
                carbs_g = EXCLUDED.carbs_g,
                fats_g = EXCLUDED.fats_g,
                updated_at = timezone('utc'::text, now());

            -- ============================================================
            -- 4. workout_sessions (cardio)
            -- ============================================================
            IF d->>'cardioType' IS NOT NULL AND d->>'cardioType' != 'NONE' THEN
                session_id := gen_random_uuid();
                INSERT INTO public.workout_sessions (
                    id, user_id, log_date, source, session_type, modality,
                    started_at, duration_min, distance_km,
                    avg_hr, max_hr, avg_pace_min_km, avg_power_watts,
                    calories, rpe, elevation_gain_m,
                    zone1_min, zone2_min, zone3_min, zone4_min, zone5_min,
                    training_load, strava_effort, notes
                ) VALUES (
                    session_id,
                    default_user_id,
                    log_row.date_id::date,
                    COALESCE(d->>'source', 'manual'),
                    'cardio',
                    CASE d->>'cardioType'
                        WHEN 'WALK_JOG' THEN 'walk_jog'
                        WHEN 'CYCLING' THEN 'cycling'
                        WHEN 'ROWING' THEN 'rowing'
                        WHEN 'SWIMMING' THEN 'swimming'
                        WHEN 'RUNNING' THEN 'running'
                        ELSE NULL
                    END,
                    NULLIF(d->>'cardioStart', '')::TIME,
                    NULLIF(d->>'manualCardioDuration', '')::NUMERIC,
                    NULLIF(d->>'distanceKm', '')::NUMERIC,
                    NULLIF(d->>'avgHR', '')::INTEGER,
                    NULLIF(d->>'maxHR', '')::INTEGER,
                    NULLIF(d->>'stravaPace', '')::NUMERIC,
                    NULLIF(d->>'avgPower', '')::NUMERIC,
                    NULLIF(d->>'caloriesBurned', '')::NUMERIC,
                    NULLIF(d->>'manualCardioRpe', '')::NUMERIC,
                    NULLIF(d->>'elevationGain', '')::NUMERIC,
                    COALESCE(NULLIF(d->>'zone1Min', '')::NUMERIC, 0),
                    COALESCE(NULLIF(d->>'zone2Min', '')::NUMERIC, 0),
                    COALESCE(NULLIF(d->>'zone3Min', '')::NUMERIC, 0),
                    COALESCE(NULLIF(d->>'zone4Min', '')::NUMERIC, 0),
                    COALESCE(NULLIF(d->>'zone5Min', '')::NUMERIC, 0),
                    NULLIF(d->>'trainingLoad', '')::NUMERIC,
                    NULLIF(d->>'stravaEffort', '')::NUMERIC,
                    NULLIF(d->>'cardioNotes', '')
                ) ON CONFLICT (user_id, source, external_id) DO NOTHING;
            END IF;

            -- ============================================================
            -- 5. gym_sessions + workout_sessions (strength)
            -- ============================================================
            IF d->>'gymType' IS NOT NULL AND d->>'gymType' != 'NONE' THEN
                IF session_id IS NULL THEN
                    session_id := gen_random_uuid();
                END IF;

                INSERT INTO public.workout_sessions (
                    id, user_id, log_date, source, session_type, started_at
                ) VALUES (
                    session_id,
                    default_user_id,
                    log_row.date_id::date,
                    'manual',
                    'strength',
                    NULLIF(d->>'gymStart', '')::TIME
                ) ON CONFLICT DO NOTHING;

                gym_session_id := gen_random_uuid();
                INSERT INTO public.gym_sessions (
                    id, user_id, workout_session_id, log_date,
                    gym_type, muscle_target, muscle_sets, prehab_done
                ) VALUES (
                    gym_session_id,
                    default_user_id,
                    session_id,
                    log_row.date_id::date,
                    d->>'gymType',
                    NULLIF(d->>'muscleTarget', ''),
                    NULLIF(d->>'muscleSets', '')::INTEGER,
                    COALESCE((d->>'prehabDone')::BOOLEAN, false)
                ) ON CONFLICT DO NOTHING;

                -- Strength set (primary lift)
                IF d->>'liftName' IS NOT NULL AND d->>'liftName' != '' THEN
                    INSERT INTO public.strength_sets (
                        workout_session_id, exercise_name, load_kg,
                        reps, sets, rest_seconds, rir,
                        estimated_1rm
                    ) VALUES (
                        session_id,
                        d->>'liftName',
                        NULLIF(d->>'liftWeight', '')::NUMERIC,
                        NULLIF(d->>'liftReps', '')::INTEGER,
                        NULLIF(d->>'liftSets', '')::INTEGER,
                        NULLIF(d->>'liftRestSeconds', '')::INTEGER,
                        NULLIF(d->>'liftRir', '')::NUMERIC,
                        CASE
                            WHEN d->>'liftWeight' IS NOT NULL AND d->>'liftReps' IS NOT NULL
                                 AND d->>'liftWeight' != '' AND d->>'liftReps' != ''
                            THEN (d->>'liftWeight')::NUMERIC * (1 + (d->>'liftReps')::NUMERIC / 30.0)
                            ELSE NULL
                        END
                    );
                END IF;
            END IF;

            -- ============================================================
            -- 6. pain_logs
            -- ============================================================
            IF d->>'injuryLoc' IS NOT NULL AND d->>'injuryLoc' != ''
               AND d->>'injuryPain' IS NOT NULL AND d->>'injuryPain' != '' THEN
                INSERT INTO public.pain_logs (
                    user_id, workout_session_id, log_date,
                    body_region, side, pain_score_0_10,
                    pain_type, timing, action_taken, notes
                ) VALUES (
                    default_user_id,
                    session_id,
                    log_row.date_id::date,
                    d->>'injuryLoc',
                    COALESCE(d->>'painSide', 'center'),
                    (d->>'injuryPain')::NUMERIC,
                    COALESCE(d->>'painType', 'unknown'),
                    COALESCE(d->>'painTiming', 'during'),
                    NULLIF(d->>'painActionTaken', ''),
                    NULLIF(d->>'painNotes', '')
                );
            END IF;

            -- ============================================================
            -- 7. body_scan_logs (InBody)
            -- ============================================================
            IF d->>'inbodyDate' IS NOT NULL AND d->>'inbodyDate' != '' THEN
                INSERT INTO public.body_scan_logs (
                    user_id, scan_date,
                    weight_kg, body_fat_pct,
                    skeletal_muscle_kg, tbw_pct, bmr, bmi
                ) VALUES (
                    default_user_id,
                    (d->>'inbodyDate')::date,
                    NULLIF(d->>'inbodyWeight', '')::NUMERIC,
                    NULLIF(d->>'inbodyBf', '')::NUMERIC,
                    NULLIF(d->>'inbodySmm', '')::NUMERIC,
                    NULLIF(d->>'inbodyTbw', '')::NUMERIC,
                    NULLIF(d->>'inbodyBmr', '')::NUMERIC,
                    NULLIF(d->>'inbodyBmi', '')::NUMERIC
                ) ON CONFLICT DO NOTHING;
            END IF;

            -- ============================================================
            -- 8. biomarker_logs
            -- ============================================================
            IF (d->>'bioTest' IS NOT NULL AND d->>'bioTest' != '')
               OR (d->>'bioCortisol' IS NOT NULL AND d->>'bioCortisol' != '')
               OR (d->>'bioHscrp' IS NOT NULL AND d->>'bioHscrp' != '')
               OR (d->>'bioFerritin' IS NOT NULL AND d->>'bioFerritin' != '') THEN
                INSERT INTO public.biomarker_logs (
                    user_id, test_date,
                    testosterone_ng_dl, cortisol_am_ug_dl,
                    hs_crp_mg_l, ferritin_ng_ml
                ) VALUES (
                    default_user_id,
                    log_row.date_id::date,
                    NULLIF(d->>'bioTest', '')::NUMERIC,
                    NULLIF(d->>'bioCortisol', '')::NUMERIC,
                    NULLIF(d->>'bioHscrp', '')::NUMERIC,
                    NULLIF(d->>'bioFerritin', '')::NUMERIC
                ) ON CONFLICT DO NOTHING;
            END IF;

            -- ============================================================
            -- 9. mobility_tendon_checklists
            -- ============================================================
            IF (d->>'warmupDone' IS NOT NULL AND (d->>'warmupDone')::BOOLEAN = true)
               OR (d->>'tendonIsometrics' IS NOT NULL AND (d->>'tendonIsometrics')::BOOLEAN = true)
               OR (d->>'hsrDone' IS NOT NULL AND (d->>'hsrDone')::BOOLEAN = true)
               OR (d->>'mobilityDone' IS NOT NULL AND (d->>'mobilityDone')::BOOLEAN = true) THEN
                INSERT INTO public.mobility_tendon_checklists (
                    user_id, workout_session_id, log_date,
                    warmup_done, isometrics_done, hsr_done, mobility_done
                ) VALUES (
                    default_user_id,
                    session_id,
                    log_row.date_id::date,
                    COALESCE((d->>'warmupDone')::BOOLEAN, false),
                    COALESCE((d->>'tendonIsometrics')::BOOLEAN, false),
                    COALESCE((d->>'hsrDone')::BOOLEAN, false),
                    COALESCE((d->>'mobilityDone')::BOOLEAN, false)
                ) ON CONFLICT DO NOTHING;
            END IF;

            -- ============================================================
            -- 10. movement_quality_logs
            -- ============================================================
            IF d->>'movementNotes' IS NOT NULL AND d->>'movementNotes' != '' THEN
                INSERT INTO public.movement_quality_logs (
                    user_id, workout_session_id, log_date,
                    pattern, issue_flags, notes
                ) VALUES (
                    default_user_id,
                    session_id,
                    log_row.date_id::date,
                    'squat',
                    ARRAY_REMOVE(ARRAY[
                        CASE WHEN (d->>'squatKneeCave')::BOOLEAN = true THEN 'knee_cave' END,
                        CASE WHEN (d->>'hingeBackRounds')::BOOLEAN = true THEN 'back_rounds' END,
                        CASE WHEN (d->>'shoulderPainFlag')::BOOLEAN = true THEN 'shoulder_pain' END,
                        CASE WHEN (d->>'poorBrace')::BOOLEAN = true THEN 'poor_brace' END,
                        CASE WHEN (d->>'overstriding')::BOOLEAN = true THEN 'overstriding' END,
                        CASE WHEN (d->>'lowCadence')::BOOLEAN = true THEN 'low_cadence' END,
                        CASE WHEN (d->>'swimShoulderMechanics')::BOOLEAN = true THEN 'swim_shoulder' END
                    ], NULL),
                    d->>'movementNotes'
                );
            END IF;

            migrated_count := migrated_count + 1;
            session_id := NULL;
            gym_session_id := NULL;

        EXCEPTION WHEN OTHERS THEN
            skipped_count := skipped_count + 1;
            RAISE WARNING 'Failed to migrate date %: %', log_row.date_id, SQLERRM;
            session_id := NULL;
            gym_session_id := NULL;
        END;
    END LOOP;

    RAISE NOTICE 'Migration complete. Total: %, Migrated: %, Skipped: %',
        total_count, migrated_count, skipped_count;
END $$;

-- ============================================================
-- Verify migration counts
-- ============================================================
DO $$
DECLARE
    n1_count INTEGER;
    daily_count INTEGER;
    recovery_count INTEGER;
    nutrition_count INTEGER;
    workout_count INTEGER;
    pain_count INTEGER;
    scan_count INTEGER;
    bio_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO n1_count FROM public.n1_logs;
    SELECT COUNT(*) INTO daily_count FROM public.daily_logs WHERE deleted_at IS NULL;
    SELECT COUNT(*) INTO recovery_count FROM public.recovery_logs WHERE deleted_at IS NULL;
    SELECT COUNT(*) INTO nutrition_count FROM public.nutrition_logs WHERE deleted_at IS NULL;
    SELECT COUNT(*) INTO workout_count FROM public.workout_sessions WHERE deleted_at IS NULL;
    SELECT COUNT(*) INTO pain_count FROM public.pain_logs WHERE deleted_at IS NULL;
    SELECT COUNT(*) INTO scan_count FROM public.body_scan_logs WHERE deleted_at IS NULL;
    SELECT COUNT(*) INTO bio_count FROM public.biomarker_logs WHERE deleted_at IS NULL;

    RAISE NOTICE '===== MIGRATION VERIFICATION =====';
    RAISE NOTICE 'n1_logs (source):         %', n1_count;
    RAISE NOTICE 'daily_logs:               %', daily_count;
    RAISE NOTICE 'recovery_logs:            %', recovery_count;
    RAISE NOTICE 'nutrition_logs:           %', nutrition_count;
    RAISE NOTICE 'workout_sessions:         %', workout_count;
    RAISE NOTICE 'pain_logs:                %', pain_count;
    RAISE NOTICE 'body_scan_logs:           %', scan_count;
    RAISE NOTICE 'biomarker_logs:           %', bio_count;
    RAISE NOTICE '=================================';
END $$;
