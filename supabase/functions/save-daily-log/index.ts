import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CORS_HEADERS } from '../_shared/cors.ts';

const corsHeaders = CORS_HEADERS;

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

function num(v: unknown): number | null {
    if (v === null || v === undefined || v === '' || v === 'NaN') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function int(v: unknown): number | null {
    const n = num(v);
    return n !== null ? Math.round(n) : null;
}

function str(v: unknown): string | null {
    if (v === null || v === undefined || v === '') return null;
    return String(v);
}

function bool(v: unknown): boolean {
    if (typeof v === 'boolean') return v;
    if (v === 'true' || v === '1') return true;
    return false;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;
        const sb = createClient(supabaseUrl, supabaseKey);

        const payload = await req.json();
        const userId = payload.userId || DEFAULT_USER_ID;
        const logDate = payload.logDate;
        const data = payload.data || {};

        if (!logDate) {
            return new Response(JSON.stringify({ error: 'logDate is required' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const results: Record<string, unknown> = {};

        // 1. Upsert daily_logs
        const { error: dlErr } = await sb.from('daily_logs').upsert({
            user_id: userId,
            log_date: logDate,
            morning_weight_kg: num(data.weight),
            body_fat_pct: num(data.bodyFatPct),
            cns_fatigue_1_5: int(data.cnsFatigue),
            work_stress_1_5: int(data.workStress) ?? 1,
            peak_energy_window: str(data.peakEnergyWindow),
            caffeine_mg: int(data.caffeineMg),
            nsaids_taken: bool(data.nsaidsTaken),
            day_notes: str(data.dayNotes),
            source: data.source || 'manual',
            raw_jsonb: data
        }, { onConflict: 'user_id,log_date' });
        results.daily_logs = dlErr ? dlErr.message : 'ok';

        // 2. Upsert recovery_logs
        const { error: rlErr } = await sb.from('recovery_logs').upsert({
            user_id: userId,
            log_date: logDate,
            sleep_hours: num(data.sleepHrs),
            sleep_quality_1_5: int(data.sleepQual),
            hrv_ms: num(data.hrv),
            resting_hr: int(data.restingHR),
            soreness_0_10: num(data.soreness0to10),
            stress_0_10: num(data.stress0to10),
            motivation_0_10: num(data.motivation0to10),
            caffeine_cutoff_met: bool(data.caffeineCutoffMet),
            meal_cutoff_met: bool(data.mealCutoffMet),
            shutdown_protocol: bool(data.shutdownProtocolCompleted)
        }, { onConflict: 'user_id,log_date' });
        results.recovery_logs = rlErr ? rlErr.message : 'ok';

        // 3. Upsert nutrition_logs
        const { error: nlErr } = await sb.from('nutrition_logs').upsert({
            user_id: userId,
            log_date: logDate,
            total_cals: num(data.totalCals),
            protein_g: num(data.proG),
            carbs_g: num(data.carbsG),
            fats_g: num(data.fatsG),
            fiber_g: num(data.fiberG),
            sugar_g: num(data.sugarG),
            water_liters: num(data.waterLiters),
            sodium_mg: num(data.sodiumMg),
            pre_workout_carbs_g: num(data.preWorkoutCarbsG),
            intra_carbs_g: num(data.intraCarbs),
            pre_sodium_mg: num(data.preSodium),
            post_refeed: bool(data.postRefeed),
            post_protein_g: num(data.postWorkoutProteinG),
            post_carbs_g: num(data.postWorkoutCarbsG)
        }, { onConflict: 'user_id,log_date' });
        results.nutrition_logs = nlErr ? nlErr.message : 'ok';

        // 4. Workout session (cardio)
        if (data.cardioType && data.cardioType !== 'NONE') {
            const modalityMap: Record<string, string> = {
                WALK_JOG: 'walk_jog', CYCLING: 'cycling', ROWING: 'rowing',
                SWIMMING: 'swimming', RUNNING: 'running',
                ZONE2: 'walk_jog', VO2MAX: 'running', RECOVERY: 'walk_jog', TEMPO: 'running'
            };
            const { data: wsData, error: wsErr } = await sb.from('workout_sessions').upsert({
                user_id: userId,
                log_date: logDate,
                source: data.source || 'manual',
                external_id: `cardio_${logDate}`,
                session_type: 'cardio',
                modality: modalityMap[data.cardioType] || null,
                started_at: str(data.cardioStart),
                duration_min: num(data.manualCardioDuration),
                distance_km: num(data.distanceKm),
                avg_hr: int(data.avgHR),
                max_hr: int(data.maxHR),
                avg_pace_min_km: num(data.stravaPace),
                avg_power_watts: num(data.avgPower),
                calories: num(data.caloriesBurned),
                rpe: num(data.manualCardioRpe),
                elevation_gain_m: num(data.elevationGain),
                zone1_min: num(data.zone1Min) ?? 0,
                zone2_min: num(data.zone2Min) ?? 0,
                zone3_min: num(data.zone3Min) ?? 0,
                zone4_min: num(data.zone4Min) ?? 0,
                zone5_min: num(data.zone5Min) ?? 0,
                strava_effort: num(data.stravaEffort),
                notes: str(data.cardioNotes)
            }, { onConflict: 'user_id,source,external_id' });
            results.workout_session_cardio = wsErr ? wsErr.message : 'ok';
        }

        if (data.gearId && (num(data.manualCardioDuration) > 0 || num(data.distanceKm) > 0)) {
            const distKm = num(data.distanceKm) || (num(data.manualCardioDuration) * 0.1);
            await sb.from('gear_usage_logs').insert({
                user_id: userId,
                gear_item_id: str(data.gearId),
                log_date: logDate,
                distance_km: distKm
            }).catch(e => console.warn('gear_usage_logs insert skipped', e));
        }

        // 5. Gym session + strength set
        if (data.gymType && data.gymType !== 'NONE') {
            const { data: wsData, error: wsErr2 } = await sb.from('workout_sessions').upsert({
                user_id: userId,
                log_date: logDate,
                source: 'manual',
                external_id: `gym_${logDate}`,
                session_type: 'strength',
                started_at: str(data.gymStart)
            }, { onConflict: 'user_id,source,external_id' }).select();

            if (!wsErr2 && wsData && wsData.length > 0) {
                const sessionId = wsData[0].id;

                await sb.from('gym_sessions').upsert({
                    user_id: userId,
                    workout_session_id: sessionId,
                    log_date: logDate,
                    gym_type: data.gymType,
                    muscle_target: str(data.muscleTarget),
                    muscle_sets: int(data.muscleSets),
                    prehab_done: bool(data.prehabDone)
                }, { onConflict: 'user_id,workout_session_id' });

                if (data.liftName && data.liftName !== '') {
                    const loadKg = num(data.liftWeight);
                    const reps = int(data.liftReps);
                    const e1rm = (loadKg && reps) ? loadKg * (1 + reps / 30) : null;

                    await sb.from('strength_sets').insert({
                        workout_session_id: sessionId,
                        exercise_name: data.liftName,
                        load_kg: loadKg,
                        reps: reps,
                        sets: int(data.liftSets),
                        rest_seconds: int(data.liftRestSeconds),
                        rir: num(data.liftRir),
                        estimated_1rm: e1rm
                    });
                }
            }
            results.gym_session = wsErr2 ? wsErr2.message : 'ok';
        }

        // 6. Pain log
        if (data.injuryLoc && data.injuryLoc !== '' && data.injuryPain) {
            await sb.from('pain_logs').insert({
                user_id: userId,
                log_date: logDate,
                body_region: data.injuryLoc,
                side: data.painSide || 'center',
                pain_score_0_10: num(data.injuryPain),
                pain_type: data.painType || 'unknown',
                timing: data.painTiming || 'during',
                action_taken: str(data.painActionTaken),
                notes: str(data.painNotes)
            });
            results.pain_log = 'ok';
        }

        // 7. Body scan (InBody)
        if (data.inbodyDate && data.inbodyDate !== '') {
            await sb.from('body_scan_logs').upsert({
                user_id: userId,
                scan_date: data.inbodyDate,
                weight_kg: num(data.inbodyWeight),
                body_fat_pct: num(data.inbodyBf),
                skeletal_muscle_kg: num(data.inbodySmm),
                tbw_pct: num(data.inbodyTbw),
                bmr: num(data.inbodyBmr),
                bmi: num(data.inbodyBmi)
            }, { onConflict: 'user_id,scan_date' });
            results.body_scan = 'ok';
        }

        // 8. Biomarker
        if (data.bioTest || data.bioCortisol || data.bioHscrp || data.bioFerritin) {
            await sb.from('biomarker_logs').upsert({
                user_id: userId,
                test_date: logDate,
                testosterone_ng_dl: num(data.bioTest),
                cortisol_am_ug_dl: num(data.bioCortisol),
                hs_crp_mg_l: num(data.bioHscrp),
                ferritin_ng_ml: num(data.bioFerritin)
            }, { onConflict: 'user_id,test_date' });
            results.biomarker = 'ok';
        }

        // 9. Mobility/tendon checklist
        if (data.warmupDone || data.tendonIsometrics || data.hsrDone || data.mobilityDone) {
            await sb.from('mobility_tendon_checklists').upsert({
                user_id: userId,
                log_date: logDate,
                warmup_done: bool(data.warmupDone),
                isometrics_done: bool(data.tendonIsometrics),
                hsr_done: bool(data.hsrDone),
                mobility_done: bool(data.mobilityDone)
            }, { onConflict: 'user_id,log_date' });
            results.mobility = 'ok';
        }

        // Also upsert to n1_logs for backwards compatibility (scoped per user)
        const compatDateId = userId === DEFAULT_USER_ID ? logDate : `${userId.slice(0, 8)}_${logDate}`;
        await sb.from('n1_logs').upsert({
            date_id: compatDateId,
            data: { ...data, _user_id: userId }
        }, { onConflict: 'date_id' });
        results.n1_logs_compat = 'ok';

        return new Response(JSON.stringify({ success: true, date: logDate, results }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
