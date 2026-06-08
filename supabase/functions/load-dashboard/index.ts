import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CORS_HEADERS } from '../_shared/cors.ts';

const corsHeaders = CORS_HEADERS;

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;
        const sb = createClient(supabaseUrl, supabaseKey);

        const url = new URL(req.url);
        const userId = req.headers.get('x-user-id') || url.searchParams.get('userId') || DEFAULT_USER_ID;
        const days = parseInt(url.searchParams.get('days') || '120');

        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - days * 86400000);
        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];

        const logs: Record<string, Record<string, unknown>> = {};

        // 1. Fetch daily_logs
        const { data: dailyLogs, error: dlErr } = await sb
            .from('daily_logs')
            .select('*')
            .eq('user_id', userId)
            .gte('log_date', startStr)
            .lte('log_date', endStr)
            .is('deleted_at', null)
            .order('log_date', { ascending: false });

        if (dlErr) throw dlErr;

        for (const row of (dailyLogs || [])) {
            const dateKey = row.log_date;
            if (!logs[dateKey]) logs[dateKey] = {};
            Object.assign(logs[dateKey], {
                weight: row.morning_weight_kg,
                bodyFatPct: row.body_fat_pct,
                cnsFatigue: row.cns_fatigue_1_5,
                workStress: row.work_stress_1_5,
                peakEnergyWindow: row.peak_energy_window,
                caffeineMg: row.caffeine_mg,
                nsaidsTaken: row.nsaids_taken,
                dayNotes: row.day_notes,
                source: row.source
            });
        }

        // 2. Fetch recovery_logs
        const { data: recoveryLogs } = await sb
            .from('recovery_logs')
            .select('*')
            .eq('user_id', userId)
            .gte('log_date', startStr)
            .lte('log_date', endStr)
            .is('deleted_at', null);

        for (const row of (recoveryLogs || [])) {
            const dateKey = row.log_date;
            if (!logs[dateKey]) logs[dateKey] = {};
            Object.assign(logs[dateKey], {
                sleepHrs: row.sleep_hours,
                sleepQual: row.sleep_quality_1_5,
                hrv: row.hrv_ms,
                restingHR: row.resting_hr,
                soreness0to10: row.soreness_0_10,
                stress0to10: row.stress_0_10,
                motivation0to10: row.motivation_0_10,
                caffeineCutoffMet: row.caffeine_cutoff_met,
                mealCutoffMet: row.meal_cutoff_met,
                shutdownProtocolCompleted: row.shutdown_protocol,
                readinessScore: row.readiness_score
            });
        }

        // 3. Fetch nutrition_logs
        const { data: nutritionLogs } = await sb
            .from('nutrition_logs')
            .select('*')
            .eq('user_id', userId)
            .gte('log_date', startStr)
            .lte('log_date', endStr)
            .is('deleted_at', null);

        for (const row of (nutritionLogs || [])) {
            const dateKey = row.log_date;
            if (!logs[dateKey]) logs[dateKey] = {};
            Object.assign(logs[dateKey], {
                totalCals: row.total_cals,
                proG: row.protein_g,
                carbsG: row.carbs_g,
                fatsG: row.fat_g,
                fiberG: row.fiber_g,
                sugarG: row.sugar_g,
                waterLiters: row.water_liters,
                sodiumMg: row.sodium_mg,
                preWorkoutCarbsG: row.pre_workout_carbs_g,
                intraCarbs: row.intra_carbs_g,
                preSodium: row.pre_sodium_mg,
                postRefeed: row.post_refeed,
                postWorkoutProteinG: row.post_protein_g,
                postWorkoutCarbsG: row.post_carbs_g
            });
        }

        // 4. Fetch workout_sessions
        const { data: workouts } = await sb
            .from('workout_sessions')
            .select('*')
            .eq('user_id', userId)
            .gte('log_date', startStr)
            .lte('log_date', endStr)
            .is('deleted_at', null);

        for (const row of (workouts || [])) {
            const dateKey = row.log_date;
            if (!logs[dateKey]) logs[dateKey] = {};

            if (row.session_type === 'cardio') {
                const modMap: Record<string, string> = {
                    walk_jog: 'WALK_JOG', cycling: 'CYCLING', rowing: 'ROWING',
                    swimming: 'SWIMMING', running: 'RUNNING'
                };
                Object.assign(logs[dateKey], {
                    cardioType: modMap[row.modality] || row.modality?.toUpperCase(),
                    cardioStart: row.started_at,
                    manualCardioDuration: row.duration_min,
                    distanceKm: row.distance_km,
                    avgHR: row.avg_hr,
                    maxHR: row.max_hr,
                    stravaPace: row.avg_pace_min_km,
                    avgPower: row.avg_power_watts,
                    caloriesBurned: row.calories,
                    elevationGain: row.elevation_gain_m,
                    manualCardioRpe: row.rpe,
                    zone1Min: row.zone1_min,
                    zone2Min: row.zone2_min,
                    zone3Min: row.zone3_min,
                    zone4Min: row.zone4_min,
                    zone5Min: row.zone5_min,
                    stravaEffort: row.strava_effort,
                    trainingLoad: row.training_load
                });
            } else if (row.session_type === 'strength') {
                Object.assign(logs[dateKey], {
                    gymStart: row.started_at
                });
            }
        }

        // 5. Fetch gym_sessions
        const { data: gymSessions } = await sb
            .from('gym_sessions')
            .select('*')
            .eq('user_id', userId)
            .gte('log_date', startStr)
            .lte('log_date', endStr)
            .is('deleted_at', null);

        for (const row of (gymSessions || [])) {
            const dateKey = row.log_date;
            if (!logs[dateKey]) logs[dateKey] = {};
            Object.assign(logs[dateKey], {
                gymType: row.gym_type,
                muscleTarget: row.muscle_target,
                muscleSets: row.muscle_sets,
                prehabDone: row.prehab_done
            });
        }

        // 6. Fetch strength_sets (via gym sessions)
        if (gymSessions && gymSessions.length > 0) {
            const sessionIds = gymSessions
                .filter((g: any) => g.workout_session_id)
                .map((g: any) => g.workout_session_id);

            if (sessionIds.length > 0) {
                const { data: sets } = await sb
                    .from('strength_sets')
                    .select('*')
                    .in('workout_session_id', sessionIds);

                const sessionToDate: Record<string, string> = {};
                for (const g of gymSessions) {
                    if (g.workout_session_id) sessionToDate[g.workout_session_id] = g.log_date;
                }

                for (const set of (sets || [])) {
                    const dateKey = sessionToDate[set.workout_session_id];
                    if (dateKey && logs[dateKey]) {
                        Object.assign(logs[dateKey], {
                            liftName: set.exercise_name,
                            liftWeight: set.load_kg,
                            liftReps: set.reps,
                            liftSets: set.sets,
                            liftRestSeconds: set.rest_seconds,
                            liftRir: set.rir
                        });
                    }
                }
            }
        }

        // 7. Fetch pain_logs
        const { data: painLogs } = await sb
            .from('pain_logs')
            .select('*')
            .eq('user_id', userId)
            .gte('log_date', startStr)
            .lte('log_date', endStr)
            .is('deleted_at', null);

        for (const row of (painLogs || [])) {
            const dateKey = row.log_date;
            if (!logs[dateKey]) logs[dateKey] = {};
            Object.assign(logs[dateKey], {
                injuryLoc: row.body_region,
                injuryPain: row.pain_score_0_10,
                painType: row.pain_type,
                painSide: row.side,
                painTiming: row.timing,
                painActionTaken: row.action_taken,
                painNotes: row.notes
            });
        }

        // 8. Fetch body_scan_logs
        const { data: scans } = await sb
            .from('body_scan_logs')
            .select('*')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .order('scan_date', { ascending: false });

        const latestScan = scans && scans.length > 0 ? scans[0] : null;

        for (const row of (scans || [])) {
            const dateKey = row.scan_date;
            if (!logs[dateKey]) logs[dateKey] = {};
            Object.assign(logs[dateKey], {
                inbodyDate: row.scan_date,
                inbodyWeight: row.weight_kg,
                inbodyBf: row.body_fat_pct,
                inbodySmm: row.skeletal_muscle_kg,
                inbodyTbw: row.tbw_pct,
                inbodyBmr: row.bmr,
                inbodyBmi: row.bmi
            });
        }

        // 9. Fetch biomarker_logs
        const { data: biomarkers } = await sb
            .from('biomarker_logs')
            .select('*')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .order('test_date', { ascending: false });

        for (const row of (biomarkers || [])) {
            const dateKey = row.test_date;
            if (!logs[dateKey]) logs[dateKey] = {};
            Object.assign(logs[dateKey], {
                bioTest: row.testosterone_ng_dl,
                bioCortisol: row.cortisol_am_ug_dl,
                bioHscrp: row.hs_crp_mg_l,
                bioFerritin: row.ferritin_ng_ml
            });
        }

        // 10. Fetch mobility_tendon_checklists
        const { data: mobility } = await sb
            .from('mobility_tendon_checklists')
            .select('*')
            .eq('user_id', userId)
            .gte('log_date', startStr)
            .lte('log_date', endStr);

        for (const row of (mobility || [])) {
            const dateKey = row.log_date;
            if (!logs[dateKey]) logs[dateKey] = {};
            Object.assign(logs[dateKey], {
                warmupDone: row.warmup_done,
                tendonIsometrics: row.isometrics_done,
                hsrDone: row.hsr_done,
                mobilityDone: row.mobility_done
            });
        }

        // 11. Fetch weather (latest per date)
        const { data: weather } = await sb
            .from('weather_snapshots')
            .select('*')
            .gte('snapshot_at', startStr)
            .order('snapshot_at', { ascending: false });

        const weatherByDate: Record<string, any> = {};
        for (const row of (weather || [])) {
            const dateKey = (row.snapshot_at || '').split('T')[0];
            if (!weatherByDate[dateKey]) weatherByDate[dateKey] = row;
        }
        for (const [dateKey, row] of Object.entries(weatherByDate)) {
            if (!logs[dateKey]) logs[dateKey] = {};
            Object.assign(logs[dateKey], {
                tempC: (row as any).temperature_c,
                humidity: (row as any).humidity_pct,
                windSpeed: (row as any).wind_speed,
                weatherCondition: (row as any).condition,
                heatRisk: (row as any).heat_risk
            });
        }

        // 12. Fetch movement_quality_logs
        const { data: movement } = await sb
            .from('movement_quality_logs')
            .select('*')
            .eq('user_id', userId)
            .gte('log_date', startStr)
            .lte('log_date', endStr);

        for (const row of (movement || [])) {
            const dateKey = row.log_date;
            if (!logs[dateKey]) logs[dateKey] = {};
            const flags: any = {};
            for (const f of (row.issue_flags || [])) {
                if (f === 'knee_cave') flags.squatKneeCave = true;
                else if (f === 'back_rounds') flags.hingeBackRounds = true;
                else if (f === 'shoulder_pain') flags.shoulderPainFlag = true;
                else if (f === 'poor_brace') flags.poorBrace = true;
                else if (f === 'overstriding') flags.overstriding = true;
                else if (f === 'low_cadence') flags.lowCadence = true;
                else if (f === 'swim_shoulder') flags.swimShoulderMechanics = true;
            }
            Object.assign(logs[dateKey], flags, { movementNotes: row.notes });
        }

        return new Response(JSON.stringify({
            success: true,
            logs,
            meta: {
                totalDays: Object.keys(logs).length,
                dateRange: { start: startStr, end: endStr },
                latestBodyScan: latestScan ? {
                    date: latestScan.scan_date,
                    weight: latestScan.weight_kg,
                    bodyFat: latestScan.body_fat_pct,
                    smm: latestScan.skeletal_muscle_kg
                } : null
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
