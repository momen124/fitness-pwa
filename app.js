// Momen Fitness V2 - PWA Logic
// Built to handle missing DOM elements safely and render advanced charts

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MILESTONE_TARGETS = [115, 110, 105, 100, 95];
const DEFAULT_USER_PROFILE = {
    id: 'default-athlete',
    name: 'Momen',
    age: 22,
    heightCm: 173,
    weightKg: 115.5,
    currentPhase: 'phase_1',
    primaryGoals: ['fat_loss', 'dense_strength', 'endurance_base', 'injury_prevention'],
    sportBackground: 'hybrid athlete',
    occupation: 'software engineer',
    baselineWeightKg: 119.6,
    baselineBodyFatPercent: 37.5,
    baselineMuscleMassKg: 24.1,
    baselineTotalBodyWaterPercent: null,
    baselineBMR: null,
    targetWeightKg: 95,
    targetBodyFatPercent: 22
};

const PHASE_1_RULES = {
    id: 'phase_1',
    label: 'Phase 1 - Excavation & Structural Armor',
    transitionWeightKg: 95,
    transitionBodyFatPercent: 22,
    proteinTargetG: 200,
    calorieTargets: {
        rest: 2000,
        strength: 2300,
        endurance: 2400
    }
};

let state = {
    isAlexandria: true,
    startWeight: 119.6,
    kcalTarget: 2000,
    proteinTarget: 200,
    currentPhase: 'phase_1',
    macrocycle: 'STRENGTH',
    profile: DEFAULT_USER_PROFILE,
    importedActivities: {},
    weatherLastFetch: '',
    stravaSync: {
        lastManualSyncAt: '',
        lastPassiveSyncAt: '',
        lastImportedCount: 0
    },
    logs: {}
};

// --- SAFE DOM HELPERS ---
function safeGetVal(id, def = '') {
    const el = document.getElementById(id);
    if(el) return el.type === 'checkbox' ? el.checked : el.value;
    return def;
}
function safeSetVal(id, val) {
    const el = document.getElementById(id);
    if(el) {
        if(el.type === 'checkbox') el.checked = !!val;
        else el.value = val;
        
        // Sync custom pill UI if exists
        const pillGroup = document.querySelector(`.form-pills[data-target-id="${id}"]`);
        if (pillGroup) {
            const pills = pillGroup.querySelectorAll('.pill');
            pills.forEach(p => p.classList.remove('active'));
            const targetPill = pillGroup.querySelector(`.pill[data-val="${val}"]`);
            if (targetPill) targetPill.classList.add('active');
        }
    }
}

function getTodayKey() { return new Date().toISOString().split('T')[0]; }

const SUPABASE_URL = 'https://vbfefnljqfcahuhxzfwp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZiZmVmbmxqcWZjYWh1aHh6ZndwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNTI2MTEsImV4cCI6MjA5NTkyODYxMX0.5T4qT1GUDuWjSBZoCy7ADfmzf8dwVJzIVD4XFKxa-KI';
const GUEST_USER_ID = '00000000-0000-0000-0000-000000000001';
let supabaseClient = null;
let currentUser = null;

function initSupabase() {
    try {
        if (window.supabase && window.supabase.createClient) {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            console.log('Supabase SDK initialized.');
        } else {
            console.warn('Supabase SDK not loaded. Running in offline-only mode.');
        }
    } catch(e) {
        console.error('Supabase init failed.', e);
    }
}

function getUserId() {
    if (currentUser && currentUser.id) return currentUser.id;
    const saved = localStorage.getItem('n1_user_id');
    if (saved) return saved;
    return GUEST_USER_ID;
}

function isGuest() {
    return getUserId() === GUEST_USER_ID;
}

async function initAuth() {
    if (!supabaseClient) return;
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session && session.user) {
        currentUser = session.user;
        localStorage.setItem('n1_user_id', currentUser.id);
        hideAuthOverlay();
        return;
    }
    const guestMode = localStorage.getItem('n1_guest_mode');
    if (guestMode === 'true') {
        localStorage.setItem('n1_user_id', GUEST_USER_ID);
        hideAuthOverlay();
        return;
    }
    showAuthOverlay();
}

function showAuthOverlay() {
    const el = document.getElementById('auth-overlay');
    if (el) el.style.display = 'flex';
}

function hideAuthOverlay() {
    const el = document.getElementById('auth-overlay');
    if (el) el.style.display = 'none';
}

function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function hideAuthError() {
    const el = document.getElementById('auth-error');
    if (el) el.style.display = 'none';
}

async function handleLogin() {
    hideAuthError();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    if (!email || !password) { showAuthError('Email and password required.'); return; }
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { showAuthError(error.message); return; }
    currentUser = data.user;
    localStorage.setItem('n1_user_id', currentUser.id);
    localStorage.removeItem('n1_guest_mode');
    hideAuthOverlay();
    await loadData();
    refreshAllViews();
    showToast('Logged in.');
}

async function handleSignup() {
    hideAuthError();
    const email = document.getElementById('auth-signup-email').value.trim();
    const password = document.getElementById('auth-signup-password').value;
    const displayName = document.getElementById('auth-display-name').value.trim();
    if (!email || !password) { showAuthError('Email and password required.'); return; }
    if (password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }
    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName || 'Athlete' } }
    });
    if (error) { showAuthError(error.message); return; }
    currentUser = data.user;
    if (currentUser) {
        localStorage.setItem('n1_user_id', currentUser.id);
        await supabaseClient.from('profiles').upsert({
            id: currentUser.id,
            display_name: displayName || 'Athlete',
            email: currentUser.email
        });
        localStorage.removeItem('n1_guest_mode');
        hideAuthOverlay();
        await loadData();
        refreshAllViews();
        showToast('Account created.');
    } else {
        showAuthError('Check your email to confirm your account, then log in.');
    }
}

async function handleLogout() {
    if (supabaseClient) {
        await supabaseClient.auth.signOut();
    }
    currentUser = null;
    localStorage.removeItem('n1_user_id');
    localStorage.removeItem('n1_guest_mode');
    state.logs = {};
    state.supplementCatalog = [];
    state.gearItems = [];
    state.raceEvents = [];
    state.trainingPlan = null;
    state.progressPhotos = [];
    state.customMetricDefs = [];
    localStorage.removeItem('n1_state');
    showAuthOverlay();
    showToast('Logged out.');
}

function handleGuestMode() {
    localStorage.setItem('n1_user_id', GUEST_USER_ID);
    localStorage.setItem('n1_guest_mode', 'true');
    hideAuthOverlay();
    showToast('Running as guest. Data saved locally only.');
}

function bindAuthHandlers() {
    const btnLogin = document.getElementById('btn-auth-login');
    if (btnLogin) btnLogin.addEventListener('click', handleLogin);
    const btnSignup = document.getElementById('btn-auth-signup');
    if (btnSignup) btnSignup.addEventListener('click', handleSignup);
    const btnGuest = document.getElementById('btn-auth-guest');
    if (btnGuest) btnGuest.addEventListener('click', handleGuestMode);
    const showSignup = document.getElementById('auth-show-signup');
    if (showSignup) showSignup.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('auth-form-login').style.display = 'none';
        document.getElementById('auth-form-signup').style.display = 'block';
        hideAuthError();
    });
    const showLogin = document.getElementById('auth-show-login');
    if (showLogin) showLogin.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('auth-form-signup').style.display = 'none';
        document.getElementById('auth-form-login').style.display = 'block';
        hideAuthError();
    });
    ['auth-password', 'auth-email'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });
    });
    ['auth-signup-password', 'auth-signup-email'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSignup(); });
    });
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    initNavigation();
    initSupabase();
    bindAuthHandlers();
    await initAuth();
    await loadData();
    bindLogForm();
    bindSeeder();
    bindLibrary();
    bindStravaInbox();
    setupCockpitHandlers();
    setupSettingsHandlers();
    refreshAllViews();
    updateSettingsView();
    if (getWeatherKey()) fetchWeather().then(() => refreshAllViews());
});

async function loadData() {
    const saved = localStorage.getItem('n1_pwa_state');
    if(saved) {
        try { 
            const data = JSON.parse(saved); 
            state = { ...state, ...data };
            state.profile = { ...DEFAULT_USER_PROFILE, ...(state.profile || {}) };
            state.currentPhase = state.currentPhase || state.profile.currentPhase || 'phase_1';
            getActivityStore();
            
            for (let key in state.logs) {
                state.logs[key] = normalizeLog(state.logs[key]);
            }
        } catch(e) { console.error(e); }
    }
    
    let today = getTodayKey();
    if(!state.logs[today]) {
        state.logs[today] = getEmptyLog();
    } else {
        state.logs[today] = normalizeLog(state.logs[today]);
    }

    if (supabaseClient) {
        try {
            let loadedFromDashboard = false;
            try {
                const { data: dashData, error: dashErr } = await supabaseClient.functions.invoke('load-dashboard', {
                    method: 'GET',
                    headers: { 'x-user-id': getUserId() }
                });
                if (!dashErr && dashData && dashData.success && dashData.logs) {
                    loadedFromDashboard = true;
                    for (const [date, fields] of Object.entries(dashData.logs)) {
                        if (!state.logs[date]) state.logs[date] = getEmptyLog();
                        state.logs[date] = normalizeLog({ ...state.logs[date], ...fields });
                    }
                    if (dashData.meta && dashData.meta.latestBodyScan) {
                        const scan = dashData.meta.latestBodyScan;
                        if (scan.date && state.logs[scan.date]) {
                            Object.assign(state.logs[scan.date], {
                                inbodyDate: scan.date,
                                inbodyWeight: scan.weight,
                                inbodyBf: scan.bodyFat,
                                inbodySmm: scan.smm
                            });
                        }
                    }
                    localStorage.setItem('n1_pwa_state', JSON.stringify(state));
                }
            } catch (dashE) { console.warn('load-dashboard fallback to n1_logs:', dashE); }

            if (!loadedFromDashboard) {
                const uid = getUserId();
                const prefix = uid === GUEST_USER_ID ? '' : `${uid.slice(0, 8)}_`;
                let query = supabaseClient.from('n1_logs').select('*').order('date_id', { ascending: false }).limit(120);
                if (prefix) query = query.like('date_id', `${prefix}%`);
                const { data: cloudLogs, error } = await query;
                if (!error && cloudLogs) {
                    cloudLogs.forEach(row => {
                        const rawDate = row.date_id;
                        const date = prefix ? rawDate.split('_').slice(1).join('_') : rawDate;
                        if (!state.logs[date]) state.logs[date] = getEmptyLog();
                        if (row.data) {
                            const { importedActivities, stravaSync, ...cloudDailyFields } = row.data;
                            state.logs[date] = normalizeLog({ ...state.logs[date], ...cloudDailyFields });
                            if (stravaSync) state.stravaSync = { ...(state.stravaSync || {}), ...stravaSync };

                            if (row.data.weatherTempC != null) state.logs[date].tempC = row.data.weatherTempC;
                            if (row.data.weatherHumidity != null) state.logs[date].humidity = row.data.weatherHumidity;
                            if (row.data.weatherWindSpeed != null) state.logs[date].windSpeed = row.data.weatherWindSpeed;
                            if (row.data.weatherCondition != null) state.logs[date].weatherCondition = row.data.weatherCondition;
                            if (row.data.heatRisk != null) state.logs[date].heatRisk = row.data.heatRisk;
                            if (row.data.stravaEffort != null) state.logs[date].stravaEffort = row.data.stravaEffort;
                            if (row.data.cardioDuration != null && row.data.cardioDuration > 0) state.logs[date].manualCardioDuration = row.data.cardioDuration;
                            if (row.data.cardioStart != null && row.data.cardioStart !== '00:00') state.logs[date].cardioStart = row.data.cardioStart;
                            if (row.data.totalCalories != null && row.data.totalCalories > 0) state.logs[date].totalCals = row.data.totalCalories;
                            if (row.data.proteinG != null && row.data.proteinG > 0) state.logs[date].proG = row.data.proteinG;
                            if (row.data.carbsG != null && row.data.carbsG > 0) state.logs[date].carbsG = row.data.carbsG;
                            if (row.data.fatsG != null && row.data.fatsG > 0) state.logs[date].fatsG = row.data.fatsG;
                            if (row.data.inbodyDate) state.logs[date].inbodyDate = row.data.inbodyDate;
                            if (row.data.inbodyWeight) state.logs[date].inbodyWeight = row.data.inbodyWeight;
                            if (row.data.inbodySmm) state.logs[date].inbodySmm = row.data.inbodySmm;
                            if (row.data.inbodyBf) state.logs[date].inbodyBf = row.data.inbodyBf;
                            if (row.data.inbodyTbw) state.logs[date].inbodyTbw = row.data.inbodyTbw;
                            if (row.data.inbodyBmi) state.logs[date].inbodyBmi = row.data.inbodyBmi;
                            if (row.data.inbodyBmr) state.logs[date].inbodyBmr = row.data.inbodyBmr;
                            if (row.data.bioTest) state.logs[date].bioTest = row.data.bioTest;
                            if (row.data.bioCortisol) state.logs[date].bioCortisol = row.data.bioCortisol;
                            if (row.data.bioHscrp) state.logs[date].bioHscrp = row.data.bioHscrp;
                            if (row.data.bioFerritin) state.logs[date].bioFerritin = row.data.bioFerritin;
                            if (row.data.weight) state.logs[date].weight = row.data.weight;
                            if (row.data.cnsFatigue) state.logs[date].cnsFatigue = row.data.cnsFatigue;
                            if (row.data.sleepHrs) state.logs[date].sleepHrs = row.data.sleepHrs;
                            if (row.data.sleepQual) state.logs[date].sleepQual = row.data.sleepQual;
                            if (row.data.hrv) state.logs[date].hrv = row.data.hrv;
                            if (row.data.cardioStart) state.logs[date].cardioStart = row.data.cardioStart;
                            if (row.data.liftReps) state.logs[date].liftReps = row.data.liftReps;
                            if (row.data.liftRestSeconds) state.logs[date].liftRestSeconds = row.data.liftRestSeconds;
                            if (Array.isArray(row.data.importedActivities)) {
                                importExternalActivities(row.data.importedActivities, 'strava', {
                                    syncMode: 'passive',
                                    syncedAt: row.data.syncedAt
                                });
                            } else if (row.data.rawActivity || row.data.stravaActivityId) {
                                importExternalActivities([{
                                    ...(row.data.rawActivity || {}),
                                    externalActivityId: row.data.stravaActivityId,
                                    cardioDuration: row.data.cardioDuration || row.data.manualCardioDuration,
                                    stravaEffort: row.data.stravaEffort,
                                    start_date_local: row.data.cardioStart ? `${date}T${row.data.cardioStart}:00` : date,
                                    type: row.data.cardioType || row.data.type,
                                    source: row.data.source || 'strava'
                                }], row.data.source || 'strava', {
                                    syncMode: 'passive',
                                    syncedAt: row.data.syncedAt
                                });
                            }
                        }
                        state.logs[date] = normalizeLog(state.logs[date]);
                    });
                    localStorage.setItem('n1_pwa_state', JSON.stringify(state));
                }
            }
        } catch (e) { console.error("Supabase sync failed on load", e); }
    }

    await loadCloudSettings();
}

async function loadCloudSettings() {
    if (!supabaseClient) return;
    const uid = getUserId();

    try {
        const { data: gearRows } = await supabaseClient.from('gear_items').select('*').eq('user_id', uid);
        if (gearRows && gearRows.length > 0) {
            const local = getGearStore();
            const localNames = new Set(local.map(g => g.name));
            let changed = false;
            for (const g of gearRows) {
                if (!localNames.has(g.name)) {
                    local.push({ id: g.id, name: g.name, type: g.type, lifeKm: g.initial_life_km, currentKm: g.current_km, retired: g.retired });
                    changed = true;
                }
            }
            if (changed) { saveGearStore(local); renderGearList(); }
        }
    } catch (e) { console.warn('Gear cloud pull failed', e); }

    try {
        const { data: raceRows } = await supabaseClient.from('race_events').select('*').eq('user_id', uid);
        if (raceRows && raceRows.length > 0) {
            const local = getRaceStore();
            const localNames = new Set(local.map(r => r.name));
            let changed = false;
            for (const r of raceRows) {
                if (!localNames.has(r.name)) {
                    local.push({ id: r.id, name: r.name, date: r.event_date, type: r.event_type, distance: r.distance_km, priority: r.priority, status: r.status });
                    changed = true;
                }
            }
            if (changed) { saveRaceStore(local); renderRaceList(); }
        }
    } catch (e) { console.warn('Race cloud pull failed', e); }

    try {
        const { data: suppRows } = await supabaseClient.from('supplement_catalog').select('*').eq('user_id', uid).eq('is_active', true);
        if (suppRows && suppRows.length > 0) {
            const local = getSuppCatalog();
            const localNames = new Set(local.map(s => s.name));
            let changed = false;
            for (const s of suppRows) {
                if (!localNames.has(s.name)) {
                    local.push({ name: s.name, dose: s.dose || '', timing: s.timing || 'any' });
                    changed = true;
                }
            }
            if (changed) { saveSuppCatalog(local); renderSupplementChecklist(); }
        }
    } catch (e) { console.warn('Supplement cloud pull failed', e); }

    try {
        const { data: planRows } = await supabaseClient.from('training_plans').select('*').eq('user_id', uid).eq('is_active', true);
        if (planRows && planRows.length > 0) {
            const local = getTrainingPlanStore();
            const localNames = new Set(local.map(p => p.name));
            let changed = false;
            for (const p of planRows) {
                if (!localNames.has(p.name) && p.plan_data) {
                    local.push(p.plan_data);
                    changed = true;
                }
            }
            if (changed) { saveTrainingPlanStore(local); renderTrainingPlans(); }
        }
    } catch (e) { console.warn('Training plan cloud pull failed', e); }

    try {
        const { data: cmRows } = await supabaseClient.from('custom_metric_definitions').select('*').eq('user_id', uid);
        if (cmRows && cmRows.length > 0) {
            const local = getCustomMetrics();
            const localNames = new Set(local.map(m => m.name));
            let changed = false;
            for (const m of cmRows) {
                if (!localNames.has(m.name)) {
                    local.push({ name: m.name, type: m.metric_type, unit: m.unit || '' });
                    changed = true;
                }
            }
            if (changed) { saveCustomMetrics(local); renderCustomMetrics(); }
        }
    } catch (e) { console.warn('Custom metrics cloud pull failed', e); }

    try {
        await loadPhotosFromCloud();
        renderPhotoTimeline();
    } catch (e) { console.warn('Photo cloud pull failed', e); }
}

async function saveData(dateKey = getTodayKey()) {
    localStorage.setItem('n1_pwa_state', JSON.stringify(state));
    refreshAllViews();
    
    let log = state.logs[dateKey];
    const payload = {
        ...log,
        importedActivities: getImportedActivitiesList().filter(activity => activity.dateKey === dateKey),
        stravaSync: state.stravaSync
    };
    
    if (supabaseClient) {
        try {
            try {
                await supabaseClient.functions.invoke('save-daily-log', {
                    method: 'POST',
                    body: { logDate: dateKey, data: log, userId: getUserId() }
                });
            } catch (efErr) {
                console.warn('save-daily-log fallback to n1_logs:', efErr);
                const uid = getUserId();
                const compatDateId = uid === GUEST_USER_ID ? dateKey : `${uid.slice(0, 8)}_${dateKey}`;
                await supabaseClient.from('n1_logs').upsert({
                    date_id: compatDateId,
                    data: { ...payload, _user_id: uid }
                }, { onConflict: 'date_id' });
            }
        } catch(e) { console.error("Supabase push failed on save", e); }
    }
}

function getEmptyLog() {
    return {
        weight: '', cnsFatigue: '', sleepHrs: '', sleepQual: '',
        hrv: '', restingHR: '', injuryLoc: '', injuryPain: '', caffeineMg: '', nsaidsTaken: false, peakEnergyWindow: '',
        tempC: '', humidity: '', windSpeed: '', weatherCondition: '', heatRisk: 'unknown', gymType: 'NONE', gymStart: '', prehabDone: false,
        liftName: '', liftWeight: '', liftSets: '', liftReps: '', liftRestSeconds: '', liftRir: '', muscleTarget: '',
        muscleSets: '',
        cardioType: 'NONE', cardioStart: '', manualCardioDuration: '', manualCardioRpe: '',
        distanceKm: '', avgHR: '', maxHR: '', avgPower: '', caloriesBurned: '', elevationGain: '',
        zone1Min: '', zone2Min: '', zone3Min: '', zone4Min: '', zone5Min: '',
        preWorkoutCarbsG: '', intraCarbs: '', preSodium: '', fueled: '', postRefeed: false, postWorkoutProteinG: '', postWorkoutCarbsG: '',
        totalCals: '', proG: '', carbsG: '', fatsG: '', fiberG: '', sugarG: '', waterLiters: '', sodiumMg: '',
        painType: 'unknown', painTiming: 'during', painSide: 'center', painActionTaken: '', painNotes: '',
        soreness0to10: '', stress0to10: '', motivation0to10: '', caffeineCutoffMet: false,
        mealCutoffMet: false, shutdownProtocolCompleted: false,
        mobilityDone: false, tendonIsometrics: false, hsrDone: false, warmupDone: false,
        squatKneeCave: false, hingeBackRounds: false, shoulderPainFlag: false, poorBrace: false,
        overstriding: false, lowCadence: false, swimShoulderMechanics: false, movementNotes: '',
        stravaActivityId: '', source: 'manual', rawActivity: null,
        bioTest: '', bioCortisol: '', bioHscrp: '', bioFerritin: '',
        inbodyDate: '', inbodyWeight: '', inbodySmm: '', inbodyBf: '', inbodyTbw: '', inbodyBmr: '', inbodyNotes: '',
        workStress: 1,
        bodyFatPct: '',
        supplements: [],
        customMetrics: {},
        wellness: null,
        hormone: null
    };
}

function normalizeLog(log = {}) {
    return { ...getEmptyLog(), ...log };
}

function getActivityStore() {
    if (!state.importedActivities || Array.isArray(state.importedActivities)) {
        const next = {};
        (state.importedActivities || []).forEach(activity => {
            if (activity && activity.id) next[activity.id] = activity;
        });
        state.importedActivities = next;
    }
    return state.importedActivities;
}

function getActivityDateKey(value) {
    if (!value) return getTodayKey();
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return getTodayKey();
    return date.toISOString().split('T')[0];
}

function formatPaceFromSpeed(speedMetersPerSecond) {
    const speed = num(speedMetersPerSecond);
    if (speed <= 0) return '';
    const minPerKm = 1000 / speed / 60;
    const minutes = Math.floor(minPerKm);
    const seconds = Math.round((minPerKm - minutes) * 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}/km`;
}

function mapExternalActivityType(raw = {}) {
    const type = (raw.sport_type || raw.type || raw.activity_type || raw.modality || '').toString().toLowerCase();
    if (type.includes('ride') || type.includes('bike') || type.includes('cycling')) return { appType: 'bike', cardioType: 'CYCLING', impactLevel: 'zero', label: 'Bike' };
    if (type.includes('row')) return { appType: 'row', cardioType: 'ROWING', impactLevel: 'zero', label: 'Row' };
    if (type.includes('swim')) return { appType: 'swim', cardioType: 'SWIMMING', impactLevel: 'zero', label: 'Swim' };
    if (type.includes('walk') || type.includes('hike')) return { appType: 'run_walk', cardioType: 'WALK_JOG', impactLevel: 'low', label: 'Walk/Jog' };
    if (type.includes('run')) return { appType: 'run_walk', cardioType: 'RUNNING', impactLevel: 'high', label: 'Run' };
    if (type.includes('workout') || type.includes('strength')) return { appType: 'strength', cardioType: 'NONE', impactLevel: 'low', label: 'Strength' };
    return { appType: 'recovery', cardioType: 'NONE', impactLevel: 'low', label: raw.type || raw.sport_type || 'Activity' };
}

function normalizeImportedActivity(raw = {}, source = raw.source || 'strava') {
    const externalActivityId = String(raw.externalActivityId || raw.external_activity_id || raw.id || raw.activity_id || `${source}-${Date.now()}`);
    const start = raw.start_date_local || raw.start_date || raw.startLocal || raw.startTime || raw.dateTimeStart || raw.start || raw.date || new Date().toISOString();
    const mapping = mapExternalActivityType(raw);
    const durationMin = Math.round(num(raw.moving_time || raw.elapsed_time || raw.durationMin || raw.duration_min || raw.cardioDuration) / (raw.durationMin || raw.duration_min || raw.cardioDuration ? 1 : 60));
    const distanceKm = num(raw.distanceKm || raw.distance_km || raw.distance) > 100
        ? num(raw.distanceKm || raw.distance_km || raw.distance) / 1000
        : num(raw.distanceKm || raw.distance_km || raw.distance);
    const rpe = raw.rpe === '' ? '' : (raw.rpe ?? raw.manualCardioRpe ?? '');
    const painScore = raw.painScore === '' ? '' : (raw.painScore ?? raw.injuryPain ?? '');
    const intraCarbs = raw.intraCarbs === '' ? '' : (raw.intraCarbs ?? raw.intra_workout_carbs_g ?? '');
    const trainingLoad = num(raw.trainingLoad || raw.training_load || raw.suffer_score || raw.calc_relative_effort || raw.stravaEffort) || (durationMin && rpe ? durationMin * num(rpe) : 0);
    const calories = num(raw.caloriesBurned || raw.calories_burned || raw.calories || raw.kilojoules);
    const id = `${source}:${externalActivityId}`;
    const dateKey = raw.dateKey || getActivityDateKey(start);
    const existing = getActivityStore()[id] || {};

    return {
        ...existing,
        id,
        source,
        externalActivityId,
        name: raw.name || raw.title || existing.name || mapping.label,
        type: mapping.appType,
        modality: raw.sport_type || raw.type || mapping.label,
        cardioType: mapping.cardioType,
        impactLevel: mapping.impactLevel,
        dateKey,
        startLocal: start,
        durationMin: durationMin || num(existing.durationMin),
        distanceKm: distanceKm || num(existing.distanceKm),
        avgHR: num(raw.average_heartrate || raw.avgHR || raw.avg_hr || existing.avgHR) || '',
        maxHR: num(raw.max_heartrate || raw.maxHR || raw.max_hr || existing.maxHR) || '',
        avgPower: num(raw.average_watts || raw.weighted_average_watts || raw.avgPower || raw.avg_power || existing.avgPower) || '',
        avgPace: raw.avgPace || raw.average_pace || existing.avgPace || formatPaceFromSpeed(raw.average_speed),
        caloriesBurned: calories || num(existing.caloriesBurned) || '',
        elevationGain: num(raw.total_elevation_gain || raw.elevationGain || raw.elevation_gain || existing.elevationGain) || '',
        zone1Min: num(raw.zone1Min || raw.zone1_min || existing.zone1Min),
        zone2Min: num(raw.zone2Min || raw.zone2_min || existing.zone2Min),
        zone3Min: num(raw.zone3Min || raw.zone3_min || existing.zone3Min),
        zone4Min: num(raw.zone4Min || raw.zone4_min || existing.zone4Min),
        zone5Min: num(raw.zone5Min || raw.zone5_min || existing.zone5Min),
        trainingLoad,
        rpe,
        painRegion: raw.painRegion || raw.injuryLoc || existing.painRegion || '',
        painScore,
        painType: raw.painType || raw.pain_type || existing.painType || 'unknown',
        painTiming: raw.painTiming || raw.timing || existing.painTiming || 'during',
        painSide: raw.painSide || raw.side || existing.painSide || 'center',
        fueled: raw.fueled ?? existing.fueled ?? '',
        intraCarbs,
        postRefeed: raw.postRefeed ?? existing.postRefeed ?? false,
        notes: raw.notes || existing.notes || '',
        raw,
        importedAt: existing.importedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

function isActivitySubjectiveComplete(activity) {
    const needsFuel = num(activity.durationMin) > 75;
    return num(activity.rpe) > 0 && activity.painScore !== '' && (!needsFuel || activity.fueled !== '');
}

function getImportedActivitiesList() {
    return Object.values(getActivityStore())
        .map(activity => normalizeImportedActivity(activity, activity.source || 'strava'))
        .sort((a, b) => new Date(b.startLocal) - new Date(a.startLocal));
}

function getPendingImportedActivities() {
    return getImportedActivitiesList().filter(activity => !isActivitySubjectiveComplete(activity));
}

function mergeActivityIntoDailyLog(activity) {
    const dateKey = activity.dateKey || getActivityDateKey(activity.startLocal);
    const log = normalizeLog(state.logs[dateKey] || getEmptyLog());
    const start = new Date(activity.startLocal);

    log.source = activity.source;
    log.stravaActivityId = activity.externalActivityId;
    log.rawActivity = activity.raw;
    log.cardioType = activity.cardioType || log.cardioType;
    log.cardioStart = !Number.isNaN(start.getTime())
        ? `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}`
        : log.cardioStart;
    log.manualCardioDuration = activity.durationMin || log.manualCardioDuration;
    log.distanceKm = activity.distanceKm || log.distanceKm;
    log.avgHR = activity.avgHR || log.avgHR;
    log.maxHR = activity.maxHR || log.maxHR;
    log.avgPower = activity.avgPower || log.avgPower;
    log.avgPace = activity.avgPace || log.avgPace;
    log.caloriesBurned = activity.caloriesBurned || log.caloriesBurned;
    log.elevationGain = activity.elevationGain || log.elevationGain;
    log.stravaEffort = activity.trainingLoad || log.stravaEffort;
    log.zone1Min = activity.zone1Min || log.zone1Min;
    log.zone2Min = activity.zone2Min || log.zone2Min;
    log.zone3Min = activity.zone3Min || log.zone3Min;
    log.zone4Min = activity.zone4Min || log.zone4Min;
    log.zone5Min = activity.zone5Min || log.zone5Min;

    if (activity.rpe) log.manualCardioRpe = activity.rpe;
    if (activity.painScore !== '') log.injuryPain = activity.painScore;
    if (activity.painRegion) log.injuryLoc = activity.painRegion;
    if (activity.painType) log.painType = activity.painType;
    if (activity.painTiming) log.painTiming = activity.painTiming;
    if (activity.painSide) log.painSide = activity.painSide;
    if (activity.fueled !== '') log.fueled = activity.fueled;
    if (activity.intraCarbs !== '') log.intraCarbs = activity.intraCarbs;
    if (activity.postRefeed !== '') log.postRefeed = !!activity.postRefeed;

    state.logs[dateKey] = log;
}

function importExternalActivities(rawActivities = [], source = 'strava', options = {}) {
    const store = getActivityStore();
    let importedCount = 0;
    rawActivities.forEach(raw => {
        if (!raw) return;
        const activity = normalizeImportedActivity(raw, raw.source || source);
        const previous = store[activity.id];
        store[activity.id] = activity;
        mergeActivityIntoDailyLog(activity);
        if (!previous) importedCount += 1;
    });
    const syncStamp = options.syncedAt || new Date().toISOString();
    const syncKey = options.syncMode === 'passive' ? 'lastPassiveSyncAt' : 'lastManualSyncAt';
    state.stravaSync = {
        ...(state.stravaSync || {}),
        [syncKey]: syncStamp,
        lastImportedCount: getImportedActivitiesList().length
    };
    return importedCount;
}

// --- NAVIGATION ---
function initNavigation() {
    const navButtons = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            navButtons.forEach(b => b.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));
            btn.classList.add('active');
            const target = document.getElementById(btn.dataset.target);
            if(target) target.classList.add('active');
            
            if(btn.dataset.target === 'view-progress') {
                renderAllCharts();
            }
            if(btn.dataset.target === 'view-strava') {
                renderStravaInbox();
            }
            if(btn.dataset.target === 'view-settings') {
                updateSettingsView();
            }
            if(btn.dataset.target === 'view-fueling') {
                // Pre-populate gut history when tab opens
                const gut = getGutTrainingBaseline();
                const gutDisplay = document.getElementById('gutHistoryDisplay');
                if (gutDisplay) {
                    if (gut) {
                        gutDisplay.innerHTML = `
                            <p style="margin-bottom:10px;">Based on <strong>${gut.sessions}</strong> long sessions:</p>
                            <div style="display:flex;gap:16px;margin-top:10px;flex-wrap:wrap;">
                                <div class="stat-box">Avg: <strong>${gut.avgPerHour.toFixed(1)}g/hr</strong></div>
                                <div class="stat-box">Max: <strong>${gut.maxPerHour.toFixed(1)}g/hr</strong></div>
                            </div>
                            <p style="margin-top:12px;font-size:0.8rem;color:#666;line-height:1.4;">
                                Your "gut limit" is the highest rate you can process without GI distress. 
                                Race day should be 10-15% below this limit.
                            </p>
                        `;
                    } else {
                        gutDisplay.innerHTML = `<p style="color:#666;">Log <code>intraCarbs</code> during your next 60+ minute cardio session to calibrate.</p>`;
                    }
                }
            }
        });
    });

    const subPills = document.querySelectorAll('#view-progress .sub-nav-pills .pill');
    const chartGroups = document.querySelectorAll('#view-progress .chart-group');
    subPills.forEach(pill => {
        pill.addEventListener('click', () => {
            subPills.forEach(p => p.classList.remove('active'));
            chartGroups.forEach(g => g.classList.remove('active'));
            pill.classList.add('active');
            const targetGroup = document.getElementById(pill.dataset.group);
            if(targetGroup) {
                targetGroup.classList.add('active');
            }
        });
    });

    // Custom Form Pills replacing <select>
    const formPills = document.querySelectorAll('.form-pills .pill');
    formPills.forEach(pill => {
        pill.addEventListener('click', (e) => {
            const group = e.target.closest('.form-pills');
            const targetId = group.dataset.targetId;
            const targetInput = document.getElementById(targetId);
            
            // Update UI
            group.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
            e.target.classList.add('active');
            
            // Update hidden input value
            if (targetInput) {
                targetInput.value = e.target.dataset.val;
                // Dispatch change event so specific listeners (like settings-macrocycle) trigger
                targetInput.dispatchEvent(new Event('change'));
            }
        });
    });
}

// --- CORE REFRESH ---
function refreshAllViews() {
    updateHubDashboard();
    updateLogForm();
    renderStravaInbox();
    renderCockpit();
    renderAllCharts();
    updateDataDump();
}

// --- COCKPIT RENDERING & ACTIONS ---
let cockpitSparks = {};

function setupCockpitHandlers() {
    const btnRec = document.getElementById('btn-mark-recovery');
    const btnNsaid = document.getElementById('btn-log-nsaid');
    const btnBio = document.getElementById('btn-add-biomarker');
    const btnExport = document.getElementById('btn-export-csv');

    if (btnRec) btnRec.addEventListener('click', () => { markRecoveryDay(); });
    if (btnNsaid) btnNsaid.addEventListener('click', () => { toggleNSAID(); });
    if (btnBio) btnBio.addEventListener('click', () => { promptAddBiomarker(); });
    if (btnExport) btnExport.addEventListener('click', () => { exportCockpitCSV(); });

    // Session status updater: show friendly label/description and auto-reveal gym details
    function updateSessionStatusUI(gymType) {
        const label = document.getElementById('session-type-label');
        const desc = document.getElementById('session-type-desc');
        const gymDetails = document.getElementById('gym-details');
        let friendly = 'None';
        let friendlyDesc = 'No gym session planned for today.';
        if (gymType === 'DAY_A') { friendly = 'Heavy Day A'; friendlyDesc = 'High-intensity strength session. Warm up and prehab recommended.'; }
        else if (gymType === 'DAY_B') { friendly = 'Heavy Day B'; friendlyDesc = 'Alternate heavy session focusing complementary lifts.'; }
        else if (gymType === 'TENDON') { friendly = 'Tendon Isolation'; friendlyDesc = 'Low-volume tendon-focused work. Prioritise warm-up and low RPE.'; }

        if (label) label.textContent = `Session: ${friendly}`;
        if (desc) desc.textContent = friendlyDesc;

        if (gymDetails) {
            if (gymType === 'NONE') gymDetails.classList.add('hidden');
            else gymDetails.classList.remove('hidden');
        }
    }

    const gymTypeInput = document.getElementById('log-gym-type');
    if (gymTypeInput) {
        gymTypeInput.addEventListener('change', (e) => {
            const val = e.target.value || 'NONE';
            updateSessionStatusUI(val);
            // If opening details, focus primary lift name for quick entry
            if (val !== 'NONE') {
                const lift = document.getElementById('log-lift-name');
                if (lift) setTimeout(() => lift.focus(), 120);
            }
        });
        // Initialize status based on current value
        updateSessionStatusUI(gymTypeInput.value || 'NONE');
    }
}

function getMacrocycleMeta(cycle) {
    const map = {
        HYPERTROPHY: {
            label: 'Hypertrophy',
            desc: 'High-volume block. Protein minimums are stricter and the app will bias toward muscle gain.'
        },
        STRENGTH: {
            label: 'Strength',
            desc: 'High-intensity block. The app will tolerate lower volume but watch fatigue and tendon load.'
        },
        ENDURANCE: {
            label: 'Endurance',
            desc: 'High-cardio block. ACWR and heat exposure become more important, and lift alerts soften.'
        },
        DELOAD: {
            label: 'Deload',
            desc: 'Recovery block. Alert thresholds relax and the app encourages low stress, sleep, and refeed support.'
        }
    };
    return map[cycle] || map.HYPERTROPHY;
}

function num(value, fallback = 0) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function formatNumber(value, digits = 0, fallback = '--') {
    return Number.isFinite(value) ? value.toFixed(digits) : fallback;
}

function escapeHTML(value = '') {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function getSortedLogDates() {
    return Object.keys(state.logs || {}).sort();
}

function getLatestLogWith(field) {
    const dates = getSortedLogDates();
    for (let i = dates.length - 1; i >= 0; i--) {
        const value = state.logs[dates[i]][field];
        if (value !== '' && value !== null && value !== undefined) {
            return { date: dates[i], log: state.logs[dates[i]], value };
        }
    }
    return null;
}

function getCurrentWeightKg() {
    const today = state.logs[getTodayKey()] || getEmptyLog();
    return num(today.weight) || num(today.inbodyWeight) || num(getLatestLogWith('weight')?.value) || num(getLatestLogWith('inbodyWeight')?.value) || DEFAULT_USER_PROFILE.weightKg;
}

function getCurrentBodyFatPercent() {
    const today = state.logs[getTodayKey()] || getEmptyLog();
    return num(today.bodyFatPct) || num(today.inbodyBf) || num(getLatestLogWith('bodyFatPct')?.value) || num(getLatestLogWith('inbodyBf')?.value) || null;
}

function getTrainingLoad(log) {
    const duration = num(log.manualCardioDuration || log.cardioDuration);
    const rpe = num(log.manualCardioRpe || log.aerobicRpe);
    if (duration > 0 && rpe > 0) return duration * rpe;

    const stravaEffort = num(log.stravaEffort);
    if (stravaEffort > 0) return stravaEffort;

    if (duration > 0) return duration * 5;
    return 0;
}

function calculateACWR() {
    const dates = getSortedLogDates();
    const last28 = dates.slice(-28);
    const last7 = dates.slice(-7);
    const acuteLoad = last7.reduce((sum, d) => sum + getTrainingLoad(state.logs[d]), 0);
    const chronicTotal = last28.reduce((sum, d) => sum + getTrainingLoad(state.logs[d]), 0);
    const chronicLoad = chronicTotal / 4;
    const ratio = chronicLoad > 0 ? acuteLoad / chronicLoad : 0;
    const hasBaseline = last28.length >= 14;

    let zone = 'baseline';
    let severity = 'neutral';
    if (!hasBaseline) {
        zone = 'baseline';
    } else if (ratio > 1.5) {
        zone = 'danger';
        severity = 'red';
    } else if (ratio >= 1.3) {
        zone = 'caution';
        severity = 'yellow';
    } else if (ratio >= 0.8) {
        zone = 'optimal';
        severity = 'green';
    } else {
        zone = 'undertraining';
        severity = 'yellow';
    }

    return { acuteLoad, chronicLoad, ratio, zone, severity, hasBaseline };
}

function calculateReadinessScore(log = state.logs[getTodayKey()] || getEmptyLog()) {
    const sleepHours = num(log.sleepHrs);
    const sleepQualityRaw = num(log.sleepQual);
    const sleepQualityScore = sleepQualityRaw > 0 ? (sleepQualityRaw <= 5 ? sleepQualityRaw * 20 : sleepQualityRaw * 10) : null;
    const sleepHoursScore = sleepHours > 0 ? clamp((sleepHours / 8) * 100, 0, 100) : null;
    const sleepScore = sleepHoursScore != null && sleepQualityScore != null
        ? (sleepHoursScore + sleepQualityScore) / 2
        : (sleepHoursScore ?? sleepQualityScore ?? 70);

    const hrv = num(log.hrv);
    const hrvValues = getSortedLogDates()
        .slice(-14)
        .map(d => num(state.logs[d].hrv))
        .filter(v => v > 0);
    const hrvBaseline = hrvValues.length ? hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length : 60;
    const hrvScore = hrv > 0 ? clamp((hrv / hrvBaseline) * 100, 30, 110) : null;

    const painInverseScore = clamp(100 - num(log.injuryPain) * 10, 0, 100);
    const stressRaw = num(log.stress0to10) || (num(log.workStress, 1) * 2);
    const stressInverseScore = clamp(100 - stressRaw * 10, 0, 100);
    const sorenessRaw = num(log.soreness0to10) || (num(log.cnsFatigue) ? num(log.cnsFatigue) * 2 : 3);
    const sorenessInverseScore = clamp(100 - sorenessRaw * 10, 0, 100);

    let readinessScore;
    if (hrvScore == null) {
        readinessScore =
            sleepScore * 0.35 +
            painInverseScore * 0.30 +
            stressInverseScore * 0.15 +
            sorenessInverseScore * 0.20;
    } else {
        readinessScore =
            sleepScore * 0.25 +
            hrvScore * 0.20 +
            painInverseScore * 0.25 +
            stressInverseScore * 0.15 +
            sorenessInverseScore * 0.15;
    }

    const previousDate = getSortedLogDates().slice(-2)[0];
    const previousLoad = previousDate ? getTrainingLoad(state.logs[previousDate]) : 0;
    if (previousLoad > 450) readinessScore -= 5;

    readinessScore = clamp(readinessScore, 0, 100);
    let status = 'red';
    if (readinessScore >= 80) status = 'green';
    else if (readinessScore >= 60) status = 'yellow';

    return { score: readinessScore, status, sleepScore, hrvScore, painInverseScore, stressInverseScore, sorenessInverseScore };
}

function getDayType(log) {
    const isStrength = ['DAY_A', 'DAY_B', 'STRENGTH'].includes(log.gymType);
    const cardioDuration = num(log.manualCardioDuration || log.cardioDuration);
    if (cardioDuration >= 30 || num(log.stravaEffort) > 0) return 'endurance';
    if (isStrength) return 'strength';
    return 'rest';
}

function getNutritionTarget(log) {
    const dayType = getDayType(log);
    return {
        dayType,
        calories: PHASE_1_RULES.calorieTargets[dayType],
        proteinG: PHASE_1_RULES.proteinTargetG
    };
}

function calculateDynamicTDEE() {
    const dates = getSortedLogDates();
    const last14 = dates.slice(-14);
    const calories = last14.map(d => num(state.logs[d].totalCals)).filter(v => v > 0);
    const averageCalories = calories.length ? calories.reduce((a, b) => a + b, 0) / calories.length : state.kcalTarget || 2000;
    const current7 = dates.slice(-7).map(d => num(state.logs[d].weight)).filter(v => v > 0);
    const previous7 = dates.slice(-14, -7).map(d => num(state.logs[d].weight)).filter(v => v > 0);
    const currentAvg = current7.length ? current7.reduce((a, b) => a + b, 0) / current7.length : null;
    const previousAvg = previous7.length ? previous7.reduce((a, b) => a + b, 0) / previous7.length : null;

    if (currentAvg == null || previousAvg == null) {
        return { estimatedTDEE: averageCalories, averageCalories, weightChangeKgPerWeek: null, ready: false };
    }

    const weightChangeKgPerWeek = currentAvg - previousAvg;
    const dailyEnergyDelta = Math.abs(weightChangeKgPerWeek * 7700) / 7;
    const estimatedTDEE = weightChangeKgPerWeek < 0
        ? averageCalories + dailyEnergyDelta
        : averageCalories - dailyEnergyDelta;

    return { estimatedTDEE, averageCalories, weightChangeKgPerWeek, ready: true };
}

function calculateCatabolicThreat(log) {
    const durationMin = num(log.manualCardioDuration || log.cardioDuration);
    const durationHours = durationMin / 60;
    const rpe = num(log.manualCardioRpe || log.aerobicRpe);
    const actualCarbs = num(log.intraCarbs);

    if (durationMin <= 70) {
        return {
            severity: 'green',
            requiredCarbsG: 0,
            targetCarbsPerHour: 0,
            message: 'No intra-workout carbs required for this duration.'
        };
    }

    let targetCarbsPerHour = 30;
    if (durationMin > 120 || rpe >= 7) targetCarbsPerHour = 60;
    else if (rpe >= 5) targetCarbsPerHour = 45;

    const requiredCarbsG = Math.round(durationHours * targetCarbsPerHour);
    const severity = durationMin > 75 && actualCarbs < requiredCarbsG ? 'red' : 'green';
    return {
        severity,
        requiredCarbsG,
        targetCarbsPerHour,
        message: severity === 'red'
            ? `Long cardio needs about ${requiredCarbsG}g carbs. Logged ${actualCarbs}g.`
            : `Fueling covered: ${actualCarbs}g logged for a ${durationMin} min session.`
    };
}

function timeToMinutes(value) {
    if (!value || typeof value !== 'string' || !value.includes(':')) return null;
    const [hours, minutes] = value.split(':').map(v => parseInt(v, 10));
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
}

function calculateInterferenceShield(log) {
    const isHeavyStrength = ['DAY_A', 'DAY_B', 'STRENGTH'].includes(log.gymType);
    const cardioDuration = num(log.manualCardioDuration || log.cardioDuration);
    const cardioRpe = num(log.manualCardioRpe || log.aerobicRpe);
    const cardioLoad = getTrainingLoad(log);
    const longOrHardCardio = cardioDuration >= 75 || cardioRpe >= 7 || cardioLoad >= 450 || num(log.stravaEffort) >= 80;

    if (!isHeavyStrength || !longOrHardCardio) {
        return { severity: 'green', message: 'No meaningful strength-cardio interference risk detected.', separationHours: null };
    }

    const gymStart = timeToMinutes(log.gymStart);
    const cardioStart = timeToMinutes(log.cardioStart);
    if (gymStart != null && cardioStart != null) {
        const separationHours = (gymStart - cardioStart) / 60;
        if (separationHours >= 0 && separationHours < 4) {
            return {
                severity: 'red',
                message: 'AMPK/mTOR interference risk. Delay strength or switch to mobility.',
                separationHours
            };
        }
        if (separationHours >= 4 && separationHours < 6) {
            return {
                severity: 'yellow',
                message: 'Minimum separation met. Six-plus hours would be better for heavy strength.',
                separationHours
            };
        }
        return { severity: 'green', message: 'Separation is acceptable for a two-a-day.', separationHours };
    }

    return {
        severity: 'yellow',
        message: 'Heavy strength and long/hard cardio are on the same day. Add start times to verify 4-hour separation.',
        separationHours: null
    };
}

function calculateHeatRisk(log) {
    const temperatureC = num(log.tempC);
    const humidityPercent = num(log.humidity);
    if (!temperatureC || !humidityPercent) {
        return { heatRisk: 'unknown', severity: 'neutral', message: 'Waiting for weather data.' };
    }
    if (temperatureC >= 35 || humidityPercent >= 75) {
        return {
            heatRisk: 'critical',
            severity: 'red',
            message: 'Critical heat risk. Use indoor bike, row, or swim and avoid outdoor hard intervals.'
        };
    }
    if (temperatureC >= 30 && humidityPercent >= 60) {
        return {
            heatRisk: 'high',
            severity: 'yellow',
            message: 'High heat/humidity. Reduce target RPE by 1 and increase hydration.'
        };
    }
    return { heatRisk: 'low', severity: 'green', message: 'Weather does not limit the plan.' };
}

function calculateRunningShield(log, acwr = calculateACWR()) {
    const weightKg = getCurrentWeightKg();
    const pain = num(log.injuryPain);
    const cardioType = log.cardioType || 'NONE';
    const tendonConsistency = getSortedLogDates()
        .slice(-7)
        .filter(d => {
            const day = state.logs[d];
            return day.prehabDone || day.tendonIsometrics || day.hsrDone || day.mobilityDone || day.gymType === 'TENDON';
        }).length;

    const blocked = [];
    const reasons = [];
    let severity = 'green';

    if (weightKg > PHASE_1_RULES.transitionWeightKg) {
        severity = 'yellow';
        blocked.push('continuous running', 'plyometrics');
        reasons.push(`weight ${weightKg.toFixed(1)}kg > 95kg`);
    }

    if (cardioType === 'RUNNING' && weightKg > PHASE_1_RULES.transitionWeightKg) {
        severity = 'red';
        reasons.push('continuous running planned while Phase 1 shield is active');
    }

    if (pain >= 4) {
        severity = 'red';
        blocked.push('run/walk progression');
        reasons.push(`pain ${pain}/10 overrides performance goals`);
    }

    if (acwr.ratio > 1.5 && acwr.hasBaseline) {
        severity = 'red';
        blocked.push('running progression');
        reasons.push(`ACWR ${acwr.ratio.toFixed(2)} is above 1.5`);
    }

    const unlocked = weightKg <= PHASE_1_RULES.transitionWeightKg && pain <= 2 && (!acwr.hasBaseline || acwr.ratio <= 1.3) && tendonConsistency >= 3;
    const message = unlocked
        ? 'Continuous running can be considered in the next phase gate.'
        : blocked.length
            ? `Shield active: avoid ${[...new Set(blocked)].join(', ')}.`
            : 'Shield clear for walk/jog only; keep impact conservative.';

    return { severity, active: !unlocked, unlocked, blocked: [...new Set(blocked)], reasons, tendonConsistency, message };
}

function calculateStrengthCompliance(log) {
    const loadKg = num(log.liftWeight);
    const reps = num(log.liftReps);
    const sets = num(log.liftSets);
    const restSeconds = num(log.liftRestSeconds);
    const warnings = [];

    if (!['DAY_A', 'DAY_B', 'STRENGTH'].includes(log.gymType)) {
        return { severity: 'neutral', compliant: true, estimated1RM: null, percent1RM: null, warnings: ['No heavy strength session logged.'] };
    }

    if (!loadKg || !reps) warnings.push('Log reps and load to calculate dense-strength compliance.');
    const estimated1RM = loadKg && reps ? loadKg * (1 + reps / 30) : null;
    const percent1RM = estimated1RM ? loadKg / estimated1RM : null;

    if (reps > 5) warnings.push('Reps above 5 drift away from current dense-strength focus.');
    if (reps >= 8 && reps <= 15 && restSeconds > 0 && restSeconds < 180) warnings.push('8-15 reps with short rest is pump/hypertrophy territory.');
    if (restSeconds > 0 && restSeconds < 180) warnings.push('Rest under 180s adds metabolic stress.');
    if (sets > 6) warnings.push('Set count is creeping high for minimum effective dose.');

    const compliant = reps >= 1 && reps <= 5 && percent1RM != null && percent1RM >= 0.85 && restSeconds >= 180;
    const severity = compliant ? 'green' : warnings.length ? 'yellow' : 'neutral';
    return { severity, compliant, estimated1RM, percent1RM, warnings };
}

function getZoneDistribution(days = 7) {
    const totals = { zone1: 0, zone2: 0, zone3: 0, zone4_5: 0, total: 0 };
    getSortedLogDates().slice(-days).forEach(d => {
        const log = state.logs[d];
        const explicitTotal =
            num(log.zone1Min) + num(log.zone2Min) + num(log.zone3Min) + num(log.zone4Min) + num(log.zone5Min);
        if (explicitTotal > 0) {
            totals.zone1 += num(log.zone1Min);
            totals.zone2 += num(log.zone2Min);
            totals.zone3 += num(log.zone3Min);
            totals.zone4_5 += num(log.zone4Min) + num(log.zone5Min);
            totals.total += explicitTotal;
            return;
        }

        const duration = num(log.manualCardioDuration || log.cardioDuration);
        if (duration <= 0) return;
        const rpe = num(log.manualCardioRpe || log.aerobicRpe);
        if (log.cardioType === 'ZONE2' || rpe <= 4) totals.zone2 += duration;
        else if (rpe <= 6 || ['CYCLING', 'ROWING', 'SWIMMING', 'WALK_JOG'].includes(log.cardioType)) totals.zone3 += duration;
        else totals.zone4_5 += duration;
        totals.total += duration;
    });

    return {
        ...totals,
        zone2Percent: totals.total ? (totals.zone2 / totals.total) * 100 : 0,
        zone3Percent: totals.total ? (totals.zone3 / totals.total) * 100 : 0,
        zone4_5Percent: totals.total ? (totals.zone4_5 / totals.total) * 100 : 0
    };
}

function getInBodyInterpretation() {
    const scans = getSortedLogDates()
        .filter(d => num(state.logs[d].inbodyWeight) || num(state.logs[d].inbodySmm))
        .map(d => ({ date: d, log: state.logs[d] }));

    if (scans.length < 2) {
        return { severity: 'neutral', title: 'InBody baseline pending', message: 'Add at least two scans to detect water flush versus real muscle loss.' };
    }

    const latest = scans[scans.length - 1];
    const previous = scans[scans.length - 2];
    const weightDelta = num(latest.log.inbodyWeight) - num(previous.log.inbodyWeight);
    const smmDelta = num(latest.log.inbodySmm) - num(previous.log.inbodySmm);
    const tbwDelta = num(latest.log.inbodyTbw) - num(previous.log.inbodyTbw);
    const liftEntries = getSortedLogDates().filter(d => num(state.logs[d].liftWeight) > 0).slice(-2);
    const strengthStable = liftEntries.length < 2 || num(state.logs[liftEntries[1]].liftWeight) >= num(state.logs[liftEntries[0]].liftWeight) * 0.97;
    const proteinLow = num((state.logs[getTodayKey()] || {}).proG) > 0 && num((state.logs[getTodayKey()] || {}).proG) < PHASE_1_RULES.proteinTargetG;
    const readiness = calculateReadinessScore();

    if (weightDelta < -0.3 && smmDelta < -0.2 && tbwDelta < -0.3 && strengthStable) {
        return {
            severity: 'yellow',
            title: 'Possible glycogen/water flush',
            message: 'Weight, SMM, and TBW all dropped while strength is stable. Do not automatically cut calories further.'
        };
    }

    if (smmDelta < -0.2 && !strengthStable && proteinLow && readiness.status !== 'green') {
        return {
            severity: 'red',
            title: 'Possible real muscle loss',
            message: 'SMM is down with weaker lifting, low protein, and poor recovery. Raise protein/calories and prioritize sleep.'
        };
    }

    return {
        severity: 'green',
        title: 'Composition signal stable',
        message: `Latest SMM change ${smmDelta >= 0 ? '+' : ''}${smmDelta.toFixed(1)}kg; no muscle-loss alert.`
    };
}

function getPainTrend(log = state.logs[getTodayKey()] || getEmptyLog()) {
    const entries = getSortedLogDates()
        .map(date => ({ date, log: state.logs[date] }))
        .filter(item => item.log.injuryLoc && num(item.log.injuryPain) > 0)
        .slice(-14);
    const latestPain = num(log.injuryPain);
    const latestRegion = log.injuryLoc || '';
    const latestType = log.painType || 'unknown';

    if (!entries.length) {
        return { severity: 'green', rising: false, region: '', message: 'No pain trend detected.' };
    }

    const regionEntries = latestRegion
        ? entries.filter(item => item.log.injuryLoc === latestRegion).slice(-3)
        : entries.slice(-3);
    const rising = regionEntries.length >= 3
        && num(regionEntries[2].log.injuryPain) >= num(regionEntries[1].log.injuryPain)
        && num(regionEntries[1].log.injuryPain) >= num(regionEntries[0].log.injuryPain)
        && num(regionEntries[2].log.injuryPain) > num(regionEntries[0].log.injuryPain);
    const jointOrTendon = ['joint', 'tendon'].includes(latestType);

    if (latestPain >= 6 || (rising && jointOrTendon && latestPain >= 4)) {
        return {
            severity: 'red',
            rising,
            region: latestRegion,
            message: rising
                ? `${latestRegion || 'Pain'} is rising across 3 logs. Joint/tendon safety overrides performance.`
                : `Pain ${latestPain}/10 requires a red alert and impact reduction.`
        };
    }

    if (latestPain >= 4 || rising) {
        return {
            severity: 'yellow',
            rising,
            region: latestRegion,
            message: rising
                ? `${latestRegion || 'Pain'} is trending upward. Reduce load and monitor next morning.`
                : `Pain ${latestPain}/10 triggers caution.`
        };
    }

    return {
        severity: latestPain > 0 ? 'green' : 'green',
        rising: false,
        region: latestRegion,
        message: latestPain > 0 ? `Pain is low at ${latestPain}/10.` : 'No pain trend detected.'
    };
}

function calculateNutritionCompliance(log, target = getNutritionTarget(log), catabolic = calculateCatabolicThreat(log)) {
    const calories = num(log.totalCals);
    const protein = num(log.proG);
    const cardioDuration = num(log.manualCardioDuration || log.cardioDuration);
    const warnings = [];
    let severity = 'green';

    if (calories > 0 && calories < target.calories) {
        warnings.push(`Calories below ${target.dayType} target (${target.calories} kcal).`);
        severity = 'yellow';
    }
    if (target.dayType === 'rest' && calories > 0 && calories < PHASE_1_RULES.calorieTargets.rest) {
        warnings.push('Rest-day calories are below the 2000 kcal floor.');
        severity = 'red';
    }
    if (protein > 0 && protein < target.proteinG) {
        warnings.push(`Protein below ${target.proteinG}g muscle-preservation target.`);
        if (severity !== 'red') severity = 'yellow';
    }
    if (catabolic.severity === 'red') {
        warnings.push(catabolic.message);
        severity = 'red';
    }
    if (cardioDuration > 30 && !log.postRefeed && num(log.postWorkoutProteinG) < 20 && num(log.postWorkoutCarbsG) < 30) {
        warnings.push('Post-cardio reset is missing: log protein + carbs within 15-30 minutes.');
        if (severity !== 'red') severity = 'yellow';
    }

    return {
        severity,
        warnings,
        message: warnings.length ? warnings.join(' ') : 'Nutrition supports today\'s training dose.'
    };
}

function calculateMovementQuality(log) {
    const flags = [];
    const actions = new Set();

    if (log.squatKneeCave) {
        flags.push('knee tracking');
        actions.add('block running progression');
        actions.add('reduce lower-body load');
    }
    if (log.hingeBackRounds) {
        flags.push('hinge position');
        actions.add('reduce load');
        actions.add('technique work');
    }
    if (log.shoulderPainFlag) {
        flags.push('shoulder mechanics');
        actions.add('reduce swim intensity');
        actions.add('reduce upper-body load');
    }
    if (log.poorBrace) {
        flags.push('core brace');
        actions.add('reduce load');
    }
    if (log.overstriding) {
        flags.push('overstriding');
        actions.add('block running progression');
    }
    if (log.lowCadence) {
        flags.push('low cadence');
        actions.add('walk/jog technique only');
    }
    if (log.swimShoulderMechanics) {
        flags.push('swim shoulder mechanics');
        actions.add('technique swim only');
    }

    const pain = num(log.injuryPain);
    const severity = flags.length && pain >= 4 ? 'red' : flags.length ? 'yellow' : 'green';
    return {
        severity,
        flags,
        actions: Array.from(actions),
        message: flags.length
            ? `Movement quality flags: ${flags.join(', ')}.`
            : 'Movement quality has no blocking flags today.'
    };
}

function calculateDeloadRecommendation(log, acwr, readiness, painTrend) {
    const dates = getSortedLogDates();
    const firstDate = dates.length ? new Date(dates[0]) : null;
    const todayDate = new Date(getTodayKey());
    const weekIndex = firstDate && !Number.isNaN(firstDate.getTime())
        ? Math.floor((todayDate - firstDate) / (7 * 24 * 60 * 60 * 1000))
        : 0;
    const scheduled = dates.length >= 21 && weekIndex % 4 === 3;
    const hrv = num(log.hrv);
    const hrvValues = dates.slice(-14).map(d => num(state.logs[d].hrv)).filter(v => v > 0);
    const hrvBaseline = hrvValues.length ? hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length : null;
    const triggers = [];

    if (scheduled) triggers.push('4th-week deload');
    if (acwr.severity === 'red' || acwr.severity === 'yellow') triggers.push(`ACWR ${acwr.zone}`);
    if (painTrend.severity !== 'green') triggers.push('pain rising or high');
    if (num(log.sleepHrs) > 0 && num(log.sleepHrs) < 6) triggers.push('sleep under 6h');
    if (num(log.sleepQual) > 0 && num(log.sleepQual) < 3) triggers.push('poor sleep quality');
    if (hrvBaseline && hrv > 0 && hrv < hrvBaseline * 0.9) triggers.push('HRV suppressed');
    if (num(log.motivation0to10) > 0 && num(log.motivation0to10) < 4) triggers.push('motivation low');
    if (num(log.soreness0to10) >= 7) triggers.push('soreness high');
    if (readiness.status === 'red') triggers.push('readiness red');

    let severity = 'green';
    if (readiness.status === 'red' || acwr.severity === 'red' || num(log.injuryPain) >= 6 || triggers.length >= 3) severity = 'red';
    else if (scheduled || triggers.length >= 2) severity = 'yellow';

    return {
        severity,
        scheduled,
        triggers,
        message: severity === 'red'
            ? 'Force deload: reduce volume 30-40%, keep movement quality, and avoid extra intensity.'
            : severity === 'yellow'
                ? 'Deload pressure building: trim volume 20-30% and keep easy Zone 2.'
                : 'No deload trigger today.'
    };
}

function calculatePhaseProgression(log, acwr, runningShield) {
    const weightOk = getCurrentWeightKg() <= PHASE_1_RULES.transitionWeightKg;
    const bodyFat = getCurrentBodyFatPercent();
    const bodyFatOk = bodyFat != null && bodyFat <= PHASE_1_RULES.transitionBodyFatPercent;
    const painOk = num(log.injuryPain) <= 2;
    const acwrOk = !acwr.hasBaseline || acwr.ratio <= 1.3;
    const walkJogEntries = getSortedLogDates()
        .slice(-21)
        .filter(d => state.logs[d].cardioType === 'WALK_JOG');
    const walkJogPainFree = walkJogEntries.length > 0 && walkJogEntries.every(d => num(state.logs[d].injuryPain) <= 2);
    const liftEntries = getSortedLogDates().filter(d => num(state.logs[d].liftWeight) > 0).slice(-2);
    const strengthStable = liftEntries.length < 2 || num(state.logs[liftEntries[1]].liftWeight) >= num(state.logs[liftEntries[0]].liftWeight) * 0.97;
    const tendonOk = runningShield.tendonConsistency >= 3;
    const checks = [
        { label: 'weight <= 95kg', ok: weightOk },
        { label: 'body fat <= 22%', ok: bodyFatOk },
        { label: 'pain <= 2/10', ok: painOk },
        { label: 'ACWR safe', ok: acwrOk },
        { label: 'walk/jog pain-free evidence', ok: walkJogPainFree },
        { label: 'strength stable', ok: strengthStable },
        { label: 'tendon armor 3+/week', ok: tendonOk }
    ];
    const passed = checks.filter(item => item.ok).length;
    const status = passed === checks.length ? 'unlock_phase_2' : passed >= 4 ? 'partial_progression' : 'stay_phase_1';

    return {
        status,
        checks,
        passed,
        total: checks.length,
        message: status === 'unlock_phase_2'
            ? 'Phase 2 planning can unlock: continuous running and plyometrics may be progressed carefully.'
            : status === 'partial_progression'
                ? 'Partial progress only. Keep the running shield while adding small non-impact volume.'
                : 'Stay in Phase 1 until weight, pain, ACWR, and tendon consistency are ready.'
    };
}

function getMinimumEffectiveDose(status, deload, pain, heat) {
    if (deload.severity === 'red' || status === 'red') {
        return 'Recovery dose only: isometrics, mobility, easy swim/bike/row, or rest.';
    }
    if (heat.severity === 'red') {
        return 'Move indoors and keep the session easy: bike, row, swim, or mobility.';
    }
    if (pain >= 4) {
        return 'Swap impact for bike/swim/row and keep tendon armor as the main dose.';
    }
    if (status === 'yellow' || deload.severity === 'yellow') {
        return 'Reduce volume 20-30%; a 60 min plan becomes 35-40 min Zone 2.';
    }
    return 'Full planned session is allowed inside Phase 1 rules.';
}

function buildAlertEngine(parts) {
    const alerts = [];
    const add = (type, severity, title, message, reasonCodes = []) => {
        alerts.push({ type, severity, title, message, reasonCodes });
    };
    const {
        today, acwr, readiness, runningShield, catabolic, interference, heat,
        strength, inbody, nutrition, movement, painTrend, deload, phaseProgression, zoneDistribution
    } = parts;

    if (acwr.hasBaseline) add('acwr', acwr.severity, 'ACWR Load', `${acwr.ratio.toFixed(2)} (${acwr.zone}).`, [`acwr_${acwr.zone}`]);
    if (num(today.injuryPain) >= 6) add('pain', 'red', 'High Pain', `Pain is ${num(today.injuryPain)}/10.`, ['pain_red']);
    else if (num(today.injuryPain) >= 3) add('pain', 'yellow', 'Pain Caution', `Pain is ${num(today.injuryPain)}/10.`, ['pain_yellow']);
    if (painTrend.rising) add('pain_trend', painTrend.severity, 'Pain Trend', painTrend.message, ['pain_trend']);
    if (readiness.status !== 'green') add('readiness', readiness.status, 'Readiness', `${Math.round(readiness.score)} (${readiness.status}).`, [`readiness_${readiness.status}`]);
    if (runningShield.active) add('running_shield', runningShield.severity, 'Running Shield', runningShield.message, ['phase_1_running_shield']);
    if (catabolic.severity === 'red') add('catabolic', 'red', 'Long Cardio Carbs', catabolic.message, ['long_cardio_needs_carbs']);
    if (interference.severity !== 'green') add('interference', interference.severity, 'Interference Shield', interference.message, ['interference_risk']);
    if (heat.severity !== 'green' && heat.severity !== 'neutral') add('thermal', heat.severity, 'Thermal Strain', heat.message, [`heat_${heat.heatRisk}`]);
    if (nutrition.severity !== 'green') add('nutrition', nutrition.severity, 'Nutrition', nutrition.message, ['nutrition_target']);
    if (movement.severity !== 'green') add('movement_quality', movement.severity, 'Movement Quality', movement.message, ['movement_quality']);
    if (strength.severity === 'yellow') add('strength_compliance', 'yellow', 'Dense Strength', strength.warnings.join(' '), ['strength_compliance']);
    if (inbody.severity !== 'green' && inbody.severity !== 'neutral') add('inbody', inbody.severity, inbody.title, inbody.message, ['inbody_interpretation']);
    if (deload.severity !== 'green') add('deload', deload.severity, 'Deload Engine', deload.message, ['deload']);
    if (zoneDistribution.total && zoneDistribution.zone3Percent > 25) add('zone_discipline', 'yellow', 'Zone Discipline', `Zone 3 is ${zoneDistribution.zone3Percent.toFixed(0)}% of weekly cardio.`, ['zone3_gray_zone']);
    if (phaseProgression.status === 'unlock_phase_2') add('phase_gate', 'green', 'Phase Gate', phaseProgression.message, ['phase_2_unlock']);

    if (!alerts.length) add('all_clear', 'green', 'Green Signals', 'ACWR, pain, readiness, nutrition, and Phase 1 shields are clear.', ['all_clear']);
    const rank = { red: 0, yellow: 1, green: 2, neutral: 3 };
    return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function buildAthleteOSDecision() {
    const today = normalizeLog(state.logs[getTodayKey()] || getEmptyLog());
    const acwr = calculateACWR();
    const readiness = calculateReadinessScore(today);
    const runningShield = calculateRunningShield(today, acwr);
    const nutritionTarget = getNutritionTarget(today);
    const catabolic = calculateCatabolicThreat(today);
    const interference = calculateInterferenceShield(today);
    const heat = calculateHeatRisk(today);
    const strength = calculateStrengthCompliance(today);
    const inbody = getInBodyInterpretation();
    const painTrend = getPainTrend(today);
    const nutrition = calculateNutritionCompliance(today, nutritionTarget, catabolic);
    const movement = calculateMovementQuality(today);
    const deload = calculateDeloadRecommendation(today, acwr, readiness, painTrend);
    const phaseProgression = calculatePhaseProgression(today, acwr, runningShield);
    const zoneDistribution = getZoneDistribution(7);

    const reasonCodes = [];
    const avoid = new Set();

    if (readiness.status !== 'green') reasonCodes.push(`readiness_${readiness.status}`);
    if (acwr.hasBaseline && acwr.severity !== 'green') reasonCodes.push(`acwr_${acwr.zone}`);
    if (runningShield.active) reasonCodes.push('phase_1_running_shield');
    if (runningShield.blocked.length) runningShield.blocked.forEach(item => avoid.add(item));
    if (catabolic.severity === 'red') reasonCodes.push('long_cardio_needs_carbs');
    if (interference.severity !== 'green') reasonCodes.push('interference_risk');
    if (heat.severity === 'red') reasonCodes.push('critical_heat');
    if (heat.severity === 'yellow') reasonCodes.push('heat_rpe_minus_1');
    if (strength.severity === 'yellow') reasonCodes.push('strength_compliance_warning');
    if (inbody.severity !== 'green' && inbody.severity !== 'neutral') reasonCodes.push(inbody.severity === 'red' ? 'possible_muscle_loss' : 'possible_water_flush');
    if (nutrition.severity !== 'green') reasonCodes.push(`nutrition_${nutrition.severity}`);
    if (movement.severity !== 'green') {
        reasonCodes.push('movement_quality');
        movement.actions.forEach(item => avoid.add(item));
    }
    if (painTrend.severity !== 'green') reasonCodes.push('pain_trend');
    if (deload.severity !== 'green') reasonCodes.push(`deload_${deload.severity}`);

    let status = 'green';
    if ([readiness.status, runningShield.severity, catabolic.severity, interference.severity, heat.severity, inbody.severity, nutrition.severity, movement.severity, painTrend.severity, deload.severity].includes('red')) {
        status = 'red';
    } else if ([readiness.status, runningShield.severity, acwr.severity, catabolic.severity, interference.severity, heat.severity, strength.severity, inbody.severity, nutrition.severity, movement.severity, painTrend.severity, deload.severity].includes('yellow')) {
        status = 'yellow';
    }

    const pain = num(today.injuryPain);
    const cardioDuration = num(today.manualCardioDuration || today.cardioDuration);
    let recommendedSession = '45-60 min Zone 2 bike, row, swim, or walk/jog plus tendon armor.';
    if (status === 'red') {
        recommendedSession = 'Recovery dose only: mobility, isometrics, easy swim/bike/row, or full rest.';
    } else if (status === 'yellow') {
        recommendedSession = 'Reduce volume 20-30%: 35-40 min Zone 2 bike/row/swim plus mobility.';
    } else if (['DAY_A', 'DAY_B'].includes(today.gymType)) {
        recommendedSession = 'Heavy low-rep strength is allowed. Keep sets at 1-5 reps, long rest, and do prehab first.';
    } else if (cardioDuration > 0) {
        recommendedSession = 'Complete planned non-impact cardio and stay mostly Zone 2.';
    }

    if (pain >= 4) {
        recommendedSession = 'Replace impact with bike, swim, or row. Joint/tendon pain overrides performance goals.';
        avoid.add('impact progression');
    }
    if (movement.severity === 'red') {
        recommendedSession = 'Technique reset: reduce load, skip impact progression, and use mobility or easy non-impact work.';
    }
    if (heat.severity === 'red') {
        recommendedSession = 'Train indoors: bike, row, swim, mobility, or tendon armor. Avoid outdoor hard work.';
        avoid.add('outdoor hard intervals');
    }
    if (deload.severity === 'red') {
        recommendedSession = 'Forced deload: reduce volume 30-40%, keep easy Zone 2, mobility, and tendon armor only.';
    }

    const recoveryInstructions = readiness.status === 'red'
        ? 'Prioritize sleep, shutdown protocol, protein, hydration, and no extra intensity.'
        : readiness.status === 'yellow'
            ? 'Trim volume, keep technique clean, and finish with a recovery meal.'
            : 'Green recovery: train, but stay inside Phase 1 rules.';
    const minimumDose = getMinimumEffectiveDose(status, deload, pain, heat);
    const alerts = buildAlertEngine({
        today,
        acwr,
        readiness,
        runningShield,
        catabolic,
        interference,
        heat,
        strength,
        inbody,
        nutrition,
        movement,
        painTrend,
        deload,
        phaseProgression,
        zoneDistribution
    });

    return {
        status,
        recommendedSession,
        avoid: Array.from(avoid),
        nutritionTarget,
        recoveryInstructions,
        reasonCodes: reasonCodes.length ? [...new Set(reasonCodes)] : ['all_clear'],
        acwr,
        readiness,
        runningShield,
        catabolic,
        interference,
        heat,
        strength,
        inbody,
        nutrition,
        movement,
        painTrend,
        deload,
        phaseProgression,
        minimumDose,
        alerts,
        zoneDistribution,
        currentWeightKg: getCurrentWeightKg(),
        currentBodyFatPercent: getCurrentBodyFatPercent()
    };
}

function generateWeeklyReview(decision = buildAthleteOSDecision()) {
    const dates = getSortedLogDates();
    const last7 = dates.slice(-7);
    const previous7 = dates.slice(-14, -7);
    const avg = (items, field) => {
        const values = items.map(d => num(state.logs[d][field])).filter(v => v > 0);
        return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    };
    const currentWeightAvg = avg(last7, 'weight');
    const previousWeightAvg = avg(previous7, 'weight');
    const weightTrend = currentWeightAvg != null && previousWeightAvg != null ? currentWeightAvg - previousWeightAvg : null;
    const proteinDays = last7.filter(d => num(state.logs[d].proG) >= PHASE_1_RULES.proteinTargetG).length;
    const mobilityDays = last7.filter(d => {
        const log = state.logs[d];
        return log.prehabDone || log.mobilityDone || log.tendonIsometrics || log.hsrDone || log.gymType === 'TENDON';
    }).length;
    const maxPain = last7.reduce((max, d) => Math.max(max, num(state.logs[d].injuryPain)), 0);
    const zone = decision.zoneDistribution;
    const strengthEntries = last7.map(d => calculateStrengthCompliance(state.logs[d])).filter(item => item.severity !== 'neutral');
    const strengthCompliant = strengthEntries.length ? strengthEntries.filter(item => item.compliant).length : 0;

    let nextAction = 'continue';
    if (decision.status === 'red' || decision.acwr.severity === 'red' || maxPain >= 6) nextAction = 'deload';
    else if (decision.status === 'yellow' || maxPain >= 3) nextAction = 'reduce';
    else if (zone.zone2Percent < 70 && zone.total > 0) nextAction = 'increase non-impact Zone 2';

    return {
        weightTrend,
        proteinDays,
        mobilityDays,
        maxPain,
        zone2Percent: zone.zone2Percent,
        strengthCompliant,
        strengthEntries: strengthEntries.length,
        nextAction,
        items: [
            {
                label: 'Weight trend',
                value: weightTrend == null ? 'Need 14 days' : `${weightTrend >= 0 ? '+' : ''}${weightTrend.toFixed(1)} kg vs prior week`,
                severity: weightTrend != null && weightTrend < -1.0 ? 'yellow' : 'green'
            },
            {
                label: 'ACWR',
                value: decision.acwr.hasBaseline ? `${decision.acwr.ratio.toFixed(2)} (${decision.acwr.zone})` : 'Need 14 days baseline',
                severity: decision.acwr.severity
            },
            {
                label: 'Zone 2 share',
                value: zone.total ? `${zone.zone2Percent.toFixed(0)}% of cardio` : 'No cardio minutes logged',
                severity: zone.total && zone.zone2Percent < 70 ? 'yellow' : 'green'
            },
            {
                label: 'Strength compliance',
                value: strengthEntries.length ? `${strengthCompliant}/${strengthEntries.length} heavy sessions compliant` : 'No heavy sessions logged',
                severity: strengthEntries.length && strengthCompliant < strengthEntries.length ? 'yellow' : 'green'
            },
            {
                label: 'Pain ceiling',
                value: `${maxPain}/10`,
                severity: maxPain >= 6 ? 'red' : maxPain >= 3 ? 'yellow' : 'green'
            },
            {
                label: 'Protein compliance',
                value: `${proteinDays}/7 days hit 200g`,
                severity: proteinDays < 4 ? 'yellow' : 'green'
            },
            {
                label: 'Tendon armor',
                value: `${mobilityDays}/7 days`,
                severity: mobilityDays < 3 ? 'yellow' : 'green'
            },
            {
                label: 'Deload pressure',
                value: decision.deload.triggers.length ? decision.deload.triggers.join(', ') : 'No trigger',
                severity: decision.deload.severity
            },
            {
                label: 'Phase gate',
                value: `${decision.phaseProgression.passed}/${decision.phaseProgression.total} checks - ${decision.phaseProgression.status.replaceAll('_', ' ')}`,
                severity: decision.phaseProgression.status === 'unlock_phase_2' ? 'green' : decision.phaseProgression.status === 'partial_progression' ? 'yellow' : 'red'
            }
        ]
    };
}

function renderAthleteOS() {
    const decision = buildAthleteOSDecision();
    const weekly = generateWeeklyReview(decision);

    const statusEl = document.getElementById('os-status-pill');
    if (statusEl) {
        statusEl.textContent = decision.status.toUpperCase();
        statusEl.className = `os-status os-status-${decision.status}`;
    }

    const titleEl = document.getElementById('os-session-title');
    if (titleEl) titleEl.textContent = decision.recommendedSession;

    const phaseEl = document.getElementById('os-phase-summary');
    if (phaseEl) {
        const bf = decision.currentBodyFatPercent ? `${decision.currentBodyFatPercent.toFixed(1)}% BF` : 'BF unknown';
        phaseEl.textContent = `${PHASE_1_RULES.label}. Current: ${decision.currentWeightKg.toFixed(1)}kg, ${bf}.`;
    }

    const readinessEl = document.getElementById('os-readiness-value');
    if (readinessEl) readinessEl.textContent = `${Math.round(decision.readiness.score)} (${decision.readiness.status})`;

    const nutritionEl = document.getElementById('os-nutrition-value');
    if (nutritionEl) nutritionEl.textContent = `${decision.nutritionTarget.calories} kcal / ${decision.nutritionTarget.proteinG}g protein`;

    const runningEl = document.getElementById('os-running-value');
    if (runningEl) runningEl.textContent = decision.runningShield.unlocked ? 'Unlocked' : 'Shield active';

    const acwrEl = document.getElementById('os-acwr-value');
    if (acwrEl) acwrEl.textContent = decision.acwr.hasBaseline ? `${decision.acwr.ratio.toFixed(2)} ${decision.acwr.zone}` : 'Baseline pending';

    const avoidEl = document.getElementById('os-avoid-list');
    if (avoidEl) {
        avoidEl.innerHTML = '';
        const items = decision.avoid.length ? decision.avoid : ['No extra restrictions beyond Phase 1 rules'];
        items.forEach(item => {
            const li = document.createElement('li');
            li.textContent = item;
            avoidEl.appendChild(li);
        });
    }

    const recoveryEl = document.getElementById('os-recovery-text');
    if (recoveryEl) recoveryEl.textContent = decision.recoveryInstructions;

    const medEl = document.getElementById('os-minimum-dose-text');
    if (medEl) medEl.textContent = decision.minimumDose;

    const phaseGateEl = document.getElementById('os-phase-gate-text');
    if (phaseGateEl) phaseGateEl.textContent = decision.phaseProgression.message;

    const phaseChecksEl = document.getElementById('os-phase-gate-checks');
    if (phaseChecksEl) {
        phaseChecksEl.innerHTML = '';
        decision.phaseProgression.checks.forEach(check => {
            const span = document.createElement('span');
            span.className = `phase-check ${check.ok ? 'is-pass' : 'is-blocked'}`;
            span.textContent = `${check.ok ? 'OK' : 'HOLD'} ${check.label}`;
            phaseChecksEl.appendChild(span);
        });
    }

    const reasonsEl = document.getElementById('os-reason-codes');
    if (reasonsEl) {
        reasonsEl.innerHTML = '';
        decision.reasonCodes.forEach(code => {
            const span = document.createElement('span');
            span.className = 'reason-chip';
            span.textContent = code.replaceAll('_', ' ');
            reasonsEl.appendChild(span);
        });
    }

    const promptsEl = document.getElementById('os-post-workout-prompts');
    if (promptsEl) {
        const today = state.logs[getTodayKey()] || getEmptyLog();
        const prompts = [];
        const pendingImported = getPendingImportedActivities().length;
        if (pendingImported > 0) prompts.push(`${pendingImported} imported activity check${pendingImported === 1 ? '' : 's'}`);
        if ((num(today.manualCardioDuration) > 0 || num(today.stravaEffort) > 0) && !num(today.manualCardioRpe)) prompts.push('RPE 1-10?');
        if ((num(today.manualCardioDuration) > 0 || num(today.stravaEffort) > 0) && today.injuryPain === '') prompts.push('Any pain?');
        if (num(today.manualCardioDuration) > 75 && !num(today.intraCarbs)) prompts.push('Did you fuel?');
        promptsEl.innerHTML = prompts.length ? prompts.map(p => `<span class="prompt-chip">${p}</span>`).join('') : '<span class="prompt-chip is-complete">Post-workout check complete</span>';
    }

    const alertLedgerEl = document.getElementById('os-alert-ledger');
    if (alertLedgerEl) {
        alertLedgerEl.innerHTML = '';
        decision.alerts.slice(0, 8).forEach(alert => {
            const li = document.createElement('li');
            li.className = `alert-ledger-row alert-${alert.severity}`;
            li.innerHTML = `<span>${alert.title}</span><strong>${alert.severity.toUpperCase()}</strong><p>${alert.message}</p>`;
            alertLedgerEl.appendChild(li);
        });
    }

    const weeklyEl = document.getElementById('weekly-review-list');
    if (weeklyEl) {
        weeklyEl.innerHTML = '';
        weekly.items.forEach(item => {
            const li = document.createElement('li');
            li.className = `review-row review-${item.severity}`;
            li.innerHTML = `<span>${item.label}</span><strong>${item.value}</strong>`;
            weeklyEl.appendChild(li);
        });
    }

    const nextEl = document.getElementById('weekly-next-action');
    if (nextEl) nextEl.textContent = weekly.nextAction;
}

function computeCockpitMetrics() {
    const acwrMetric = calculateACWR();
    const today = state.logs[getTodayKey()] || getEmptyLog();
    const tdeeMetric = calculateDynamicTDEE();

    // WBGT calculation (same as before)
    let t = parseFloat(today.tempC);
    let rh = parseFloat(today.humidity);
    let wbgt = null;
    if (!isNaN(t) && !isNaN(rh)) {
        let e = (rh / 100) * 6.105 * Math.exp((17.27 * t) / (237.7 + t));
        wbgt = 0.567 * t + 0.393 * e + 3.94;
    }

    // Fatigue proxy: combine CNS fatigue, sleep quality and HRV
    let fatigue = 0;
    if (today.cnsFatigue) fatigue = parseFloat(today.cnsFatigue) || 0;
    else {
        const sleep = parseFloat(today.sleepHrs) || 7;
        const sleepQual = parseFloat(today.sleepQual) || 3;
        const hrv = parseFloat(today.hrv) || 60;
        fatigue = Math.max(1, Math.min(5, 5 - (hrv - 40)/30 - (sleep - 7)/2 + (5 - sleepQual)/1.5));
    }

    return { acwr: acwrMetric.ratio, acwrMetric, wbgt, tdee: tdeeMetric.estimatedTDEE, tdeeMetric, fatigue };
}

function renderCockpit() {
    const metrics = computeCockpitMetrics();
    const macroMeta = getMacrocycleMeta(state.macrocycle);
    renderAthleteOS();

    const cycleName = document.getElementById('cockpit-cycle-name');
    const cycleDesc = document.getElementById('cockpit-cycle-desc');
    if (cycleName) cycleName.textContent = macroMeta.label;
    if (cycleDesc) cycleDesc.textContent = macroMeta.desc;

    // ACWR card
    const acwrVal = document.getElementById('card-acwr-val');
    const acwrTip = document.getElementById('card-acwr-tip');
    if (acwrVal) acwrVal.textContent = metrics.acwrMetric.hasBaseline && metrics.acwr ? metrics.acwr.toFixed(2) : 'base';
    if (acwrTip) {
        if (!metrics.acwrMetric.hasBaseline) acwrTip.textContent = 'Need 14 days baseline.';
        else if (metrics.acwr > 1.5) acwrTip.textContent = 'Danger: reduce volume and block impact progression.';
        else if (metrics.acwr >= 1.3) acwrTip.textContent = 'Caution: scale intensity and monitor soreness.';
        else if (metrics.acwr < 0.8) acwrTip.textContent = 'Undertraining risk: add easy non-impact volume.';
        else acwrTip.textContent = 'Optimal load zone.';
    }
    // ACWR severity styling
    const cardAcwr = document.getElementById('card-acwr');
    if (cardAcwr) {
        cardAcwr.classList.remove('card-danger','card-warning','card-ok');
        if (metrics.acwrMetric.hasBaseline && metrics.acwr > 1.5) cardAcwr.classList.add('card-danger');
        else if (metrics.acwrMetric.hasBaseline && (metrics.acwr >= 1.3 || metrics.acwr < 0.8)) cardAcwr.classList.add('card-warning');
        else cardAcwr.classList.add('card-ok');
    }

    // WBGT card
    const wbgtVal = document.getElementById('card-wbgt-val');
    const wbgtTip = document.getElementById('card-wbgt-tip');
    if (wbgtVal) wbgtVal.textContent = metrics.wbgt ? `${metrics.wbgt.toFixed(1)}°C` : '—';
    if (wbgtTip) wbgtTip.textContent = metrics.wbgt ? (metrics.wbgt>28 ? 'Critical heat: reduce RPE by 1 and hydrate.' : metrics.wbgt>25 ? 'High heat: consider shorter sessions.' : 'Conditions OK') : 'Waiting for env data';
    const cardWbgt = document.getElementById('card-wbgt');
    if (cardWbgt) { cardWbgt.classList.remove('card-danger','card-warning','card-ok'); if (metrics.wbgt && metrics.wbgt>28) cardWbgt.classList.add('card-danger'); else if (metrics.wbgt && metrics.wbgt>25) cardWbgt.classList.add('card-warning'); else cardWbgt.classList.add('card-ok'); }

    // TDEE card
    const tdeeVal = document.getElementById('card-tdee-val');
    const tdeeTip = document.getElementById('card-tdee-tip');
    if (tdeeVal) tdeeVal.textContent = Math.round(metrics.tdee) + ' kcal';
    if (tdeeTip) {
        tdeeTip.textContent = metrics.tdeeMetric.ready
            ? 'Dynamic estimate from 14-day calories and weight trend.'
            : 'Awaiting 14 days of weight trend.';
    }
    const cardTdee = document.getElementById('card-tdee');
    if (cardTdee) { cardTdee.classList.remove('card-danger','card-warning','card-ok'); cardTdee.classList.add('card-ok'); }

    // Fatigue card
    const fatVal = document.getElementById('card-fatigue-val');
    const fatTip = document.getElementById('card-fatigue-tip');
    if (fatVal) fatVal.textContent = metrics.fatigue ? metrics.fatigue.toFixed(1) : '—';
    if (fatTip) fatTip.textContent = metrics.fatigue >= 4 ? 'High fatigue: prioritize recovery.' : 'Ready for quality work.';
    const cardFat = document.getElementById('card-fatigue');
    if (cardFat) { cardFat.classList.remove('card-danger','card-warning','card-ok'); if (metrics.fatigue>=4) cardFat.classList.add('card-warning'); else cardFat.classList.add('card-ok'); }

    // Render sparklines for last 7 days
    renderSparklines();
}

function renderSparklines() {
    const ids = ['acwr','wbgt','tdee','fatigue'];
    const dates = Object.keys(state.logs).sort();
    const last7 = dates.slice(-7);
    const dataMap = {
        acwr: last7.map(d => {
            return getTrainingLoad(state.logs[d]);
        }),
        wbgt: last7.map(d => parseFloat(state.logs[d].tempC) || 0),
        tdee: last7.map(d => parseFloat(state.logs[d].totalCals) || 0),
        fatigue: last7.map(d => parseFloat(state.logs[d].cnsFatigue) || 0)
    };

    ids.forEach(id => {
        const canvasId = `spark-${id}`;
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        const series = dataMap[id];
        // Destroy previous chart if exists
        if (cockpitSparks[id]) {
            try { cockpitSparks[id].destroy(); } catch(e){}
        }

        cockpitSparks[id] = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: { labels: last7, datasets: [{ data: series, borderColor: '#7c3aed', tension: 0.3, borderWidth: 1, pointRadius: 0 }] },
            options: { responsive: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } }
        });
    });
}

function markRecoveryDay() {
    const today = getTodayKey();
    if (!state.logs[today]) state.logs[today] = getEmptyLog();
    state.logs[today].gymType = 'NONE';
    state.logs[today].cnsFatigue = 1;
    saveData();
    showToast('Marked today as recovery day.');
}

function toggleNSAID() {
    const today = getTodayKey();
    if (!state.logs[today]) state.logs[today] = getEmptyLog();
    state.logs[today].nsaidsTaken = !state.logs[today].nsaidsTaken;
    saveData();
    showToast(`NSAID logged: ${state.logs[today].nsaidsTaken ? 'YES' : 'NO'}`);
}

function promptAddBiomarker() {
    const today = state.logs[getTodayKey()] || getEmptyLog();
    const modal = document.getElementById('biomarker-modal');
    if (!modal) return;
    document.getElementById('modal-bio-test').value = today.bioTest || '';
    document.getElementById('modal-bio-cortisol').value = today.bioCortisol || '';
    document.getElementById('modal-bio-hscrp').value = today.bioHscrp || '';
    document.getElementById('modal-bio-ferritin').value = today.bioFerritin || '';
    modal.classList.add('is-open');
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('is-open');
}

function saveBiomarkerModal() {
    const today = getTodayKey();
    if (!state.logs[today]) state.logs[today] = getEmptyLog();
    state.logs[today].bioTest = document.getElementById('modal-bio-test').value || '';
    state.logs[today].bioCortisol = document.getElementById('modal-bio-cortisol').value || '';
    state.logs[today].bioHscrp = document.getElementById('modal-bio-hscrp').value || '';
    state.logs[today].bioFerritin = document.getElementById('modal-bio-ferritin').value || '';
    saveData();
    closeModal('biomarker-modal');
    showToast('Biomarker values saved.');
}

const DEFAULT_SUPPLEMENTS = [
    { name: 'Creatine 5g', timing: 'morning' },
    { name: 'Whey Protein', timing: 'post_workout' },
    { name: 'Vitamin D3 4000IU', timing: 'morning' },
    { name: 'Omega-3', timing: 'morning' },
    { name: 'Magnesium', timing: 'bedtime' },
    { name: 'Melatonin 3mg', timing: 'bedtime' },
    { name: 'Caffeine 200mg', timing: 'pre_workout' },
    { name: 'Ashwagandha', timing: 'evening' }
];

function getSuppCatalog() {
    const saved = localStorage.getItem('n1_supp_catalog');
    if (saved) return JSON.parse(saved);
    return [...DEFAULT_SUPPLEMENTS];
}

function saveSuppCatalog(catalog) {
    localStorage.setItem('n1_supp_catalog', JSON.stringify(catalog));
    if (supabaseClient) {
        const uid = getUserId();
        Promise.all(catalog.map(s =>
            supabaseClient.from('supplement_catalog').upsert({
                user_id: uid, name: s.name, dose: s.dose || '', timing: s.timing || 'any', is_active: true
            }, { onConflict: 'user_id,name' })
        )).catch(e => console.warn('Supplement catalog cloud sync failed', e));
    }
}

function renderSupplementChecklist() {
    const container = document.getElementById('supplement-checklist');
    if (!container) return;
    const today = state.logs[getTodayKey()];
    const taken = (today && today.supplements) || [];
    const catalog = getSuppCatalog();

    container.innerHTML = catalog.map(supp => {
        const isTaken = taken.some(t => t.name === supp.name && t.timing === supp.timing);
        return `<div class="supp-chip ${isTaken ? 'active' : ''}" data-name="${supp.name}" data-timing="${supp.timing}">
            <span>${supp.name}</span>
            <span class="supp-time">${supp.timing.replace('_', ' ')}</span>
            <span class="supp-remove" data-remove="true" title="Remove">&times;</span>
        </div>`;
    }).join('');

    container.querySelectorAll('.supp-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            if (e.target.dataset.remove) {
                const name = chip.dataset.name;
                const timing = chip.dataset.timing;
                const catalog = getSuppCatalog().filter(s => !(s.name === name && s.timing === timing));
                saveSuppCatalog(catalog);
                renderSupplementChecklist();
                return;
            }
            chip.classList.toggle('active');
            collectSupplements();
        });
    });
}

function collectSupplements() {
    const today = getTodayKey();
    if (!state.logs[today]) state.logs[today] = getEmptyLog();
    const chips = document.querySelectorAll('#supplement-checklist .supp-chip.active');
    state.logs[today].supplements = Array.from(chips).map(c => ({
        name: c.dataset.name,
        timing: c.dataset.timing,
        taken: true
    }));
    saveData();
}

function addSupplementFromUI() {
    const input = document.getElementById('supp-quick-add');
    const timing = document.getElementById('supp-quick-timing');
    if (!input || !input.value.trim()) return;
    const catalog = getSuppCatalog();
    catalog.push({ name: input.value.trim(), timing: timing.value });
    saveSuppCatalog(catalog);
    input.value = '';
    renderSupplementChecklist();
    showToast('Supplement added.');
}

function restoreSupplementForm() {
    const today = state.logs[getTodayKey()];
    renderSupplementChecklist();
}

function getGearStore() {
    const saved = localStorage.getItem('n1_gear');
    return saved ? JSON.parse(saved) : [];
}

function saveGearStore(gear) {
    localStorage.setItem('n1_gear', JSON.stringify(gear));
    if (supabaseClient) {
        supabaseClient.from('gear_items').upsert(
            gear.map(g => ({
                user_id: getUserId(),
                name: g.name, type: g.type,
                initial_life_km: g.lifeKm, current_km: g.currentKm,
                retired: g.retired || false
            }))
        ).catch(e => console.warn('Gear cloud sync failed', e));
    }
}

function renderGearList() {
    const container = document.getElementById('gear-list');
    if (!container) return;
    const gear = getGearStore();
    if (gear.length === 0) {
        container.innerHTML = '<div class="text-sm text-secondary">No gear tracked yet. Add your running shoes to start.</div>';
        return;
    }
    container.innerHTML = gear.filter(g => !g.retired).map(g => {
        const pct = g.lifeKm > 0 ? Math.min(100, (g.currentKm / g.lifeKm) * 100) : 0;
        const cls = pct > 90 ? 'danger' : pct > 75 ? 'warn' : 'ok';
        const typeIcon = { shoe: '👟', bike: '🚴', wetsuit: '🥽', clothing: '👕', accessory: '🎒' }[g.type] || '📦';
        return `<div class="gear-item">
            <div class="gear-info">
                <span class="gear-name">${typeIcon} ${g.name}</span>
                <span class="gear-meta">${g.currentKm.toFixed(1)} / ${g.lifeKm} km &middot; ${pct.toFixed(0)}% used</span>
                <div class="gear-bar"><div class="gear-bar-fill ${cls}" style="width:${pct}%"></div></div>
            </div>
            <button class="btn-sm" onclick="retireGear('${g.id}')" title="Retire gear">Retire</button>
        </div>`;
    }).join('');
}

function addGearFromUI() {
    const name = document.getElementById('gear-name').value.trim();
    const type = document.getElementById('gear-type').value;
    const lifeKm = parseFloat(document.getElementById('gear-life-km').value) || 0;
    if (!name) return;
    const gear = getGearStore();
    gear.push({ id: Date.now().toString(36), name, type, lifeKm, currentKm: 0, retired: false });
    saveGearStore(gear);
    document.getElementById('gear-name').value = '';
    document.getElementById('gear-life-km').value = '';
    renderGearList();
    showToast('Gear added.');
}

function retireGear(id) {
    const gear = getGearStore();
    const item = gear.find(g => g.id === id);
    if (item) item.retired = true;
    saveGearStore(gear);
    renderGearList();
    showToast('Gear retired.');
}

function getRaceStore() {
    const saved = localStorage.getItem('n1_races');
    return saved ? JSON.parse(saved) : [];
}

function saveRaceStore(races) {
    localStorage.setItem('n1_races', JSON.stringify(races));
    if (supabaseClient) {
        supabaseClient.from('race_events').upsert(
            races.map(r => ({
                user_id: getUserId(),
                name: r.name, event_date: r.date, event_type: r.type,
                distance_km: r.distance, priority: r.priority, status: r.status || 'planned'
            }))
        ).catch(e => console.warn('Race cloud sync failed', e));
    }
}

function renderRaceList() {
    const container = document.getElementById('race-list');
    if (!container) return;
    const races = getRaceStore().filter(r => r.status !== 'completed').sort((a, b) => new Date(a.date) - new Date(b.date));
    if (races.length === 0) {
        container.innerHTML = '<div class="text-sm text-secondary">No upcoming races. Add your target event.</div>';
        return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    container.innerHTML = races.map(r => {
        const raceDate = new Date(r.date);
        const days = Math.ceil((raceDate - today) / 86400000);
        const countdownText = days > 0 ? `${days}d` : days === 0 ? 'TODAY' : 'Past';
        const countdownColor = days <= 7 ? 'color:#ff6b6b' : days <= 30 ? 'color:#ffc107' : 'color:#36d7b7';
        const typeIcon = { run: '🏃', triathlon: '🏊‍♂️', cycling: '🚴', swim: '🏊', obstacle: '🧱' }[r.type] || '🏁';
        return `<div class="race-item">
            <div class="race-info">
                <span class="race-name">${typeIcon} ${r.name}</span>
                <span class="race-meta">${r.date} &middot; ${r.distance}km &middot; <span class="race-priority ${r.priority}">${r.priority}</span></span>
            </div>
            <span class="race-countdown" style="${countdownColor}">${countdownText}</span>
        </div>`;
    }).join('');
}

function addRaceFromUI() {
    const name = document.getElementById('race-name').value.trim();
    const date = document.getElementById('race-date').value;
    const distance = parseFloat(document.getElementById('race-distance').value) || 0;
    const type = document.getElementById('race-type').value;
    const priority = document.getElementById('race-priority').value;
    if (!name || !date) return;
    const races = getRaceStore();
    races.push({ id: Date.now().toString(36), name, date, distance, type, priority, status: 'planned' });
    saveRaceStore(races);
    document.getElementById('race-name').value = '';
    document.getElementById('race-date').value = '';
    document.getElementById('race-distance').value = '';
    renderRaceList();
    showToast('Race added.');
}

function getCustomMetrics() {
    const saved = localStorage.getItem('n1_custom_metrics');
    return saved ? JSON.parse(saved) : [];
}

function saveCustomMetrics(metrics) {
    localStorage.setItem('n1_custom_metrics', JSON.stringify(metrics));
    if (supabaseClient) {
        const uid = getUserId();
        Promise.all(metrics.map(m =>
            supabaseClient.from('custom_metric_definitions').upsert({
                user_id: uid, name: m.name, metric_type: m.type || 'number', unit: m.unit || ''
            }, { onConflict: 'user_id,name' })
        )).catch(e => console.warn('Custom metrics cloud sync failed', e));
    }
}

function renderCustomMetrics() {
    const container = document.getElementById('custom-metrics-list');
    if (!container) return;
    const metrics = getCustomMetrics();
    if (metrics.length === 0) {
        container.innerHTML = '<div class="text-sm text-secondary">No custom metrics defined. Create one to start tracking.</div>';
        return;
    }
    const today = state.logs[getTodayKey()] || {};
    const cmValues = today.customMetrics || {};
    container.innerHTML = metrics.filter(m => m.active !== false).map(m => {
        const val = cmValues[m.name] || '';
        const inputType = m.type === 'boolean' ? 'checkbox' : m.type === 'scale' ? 'range' : m.type === 'number' ? 'number' : 'text';
        const inputHtml = m.type === 'boolean'
            ? `<input type="checkbox" data-cm="${m.name}" ${val ? 'checked' : ''} style="width:auto">`
            : m.type === 'scale'
            ? `<input type="range" min="1" max="10" data-cm="${m.name}" value="${val || 5}" style="width:80px">`
            : `<input type="${m.type}" data-cm="${m.name}" value="${val}" placeholder="${m.unit || ''}" style="width:80px">`;
        return `<div class="cm-item">
            <div><span class="cm-name">${m.name}</span> <span class="cm-type">${m.type}${m.unit ? ' ('+m.unit+')' : ''}</span></div>
            <div class="flex-row" style="gap:0.3rem;align-items:center">${inputHtml}</div>
        </div>`;
    }).join('');
    container.querySelectorAll('[data-cm]').forEach(el => {
        el.addEventListener('change', collectCustomMetrics);
    });
}

function collectCustomMetrics() {
    const today = getTodayKey();
    if (!state.logs[today]) state.logs[today] = getEmptyLog();
    const vals = {};
    document.querySelectorAll('[data-cm]').forEach(el => {
        const name = el.dataset.cm;
        vals[name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    state.logs[today].customMetrics = vals;
    saveData();
}

function addCustomMetricFromUI() {
    const name = document.getElementById('cm-name').value.trim();
    const type = document.getElementById('cm-type').value;
    const unit = document.getElementById('cm-unit').value.trim();
    if (!name) return;
    const metrics = getCustomMetrics();
    if (metrics.find(m => m.name === name)) { showToast('Metric already exists.'); return; }
    metrics.push({ name, type, unit, active: true });
    saveCustomMetrics(metrics);
    document.getElementById('cm-name').value = '';
    document.getElementById('cm-unit').value = '';
    renderCustomMetrics();
    showToast('Custom metric added.');
}

function saveWellnessCheckIn() {
    const today = getTodayKey();
    if (!state.logs[today]) state.logs[today] = getEmptyLog();
    state.logs[today].wellness = {
        mood: parseInt(document.getElementById('wq-mood').value),
        digestion: parseInt(document.getElementById('wq-digestion').value),
        joints: parseInt(document.getElementById('wq-joints').value),
        confidence: parseInt(document.getElementById('wq-confidence').value),
        sorenessLocs: document.getElementById('wq-soreness-locs').value,
        timestamp: new Date().toISOString()
    };
    saveData();
    showToast('Wellness check-in saved.');
}

function restoreWellnessForm() {
    const today = state.logs[getTodayKey()];
    if (!today || !today.wellness) return;
    const w = today.wellness;
    const setRange = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setRange('wq-mood', w.mood || 3);
    setRange('wq-digestion', w.digestion || 3);
    setRange('wq-joints', w.joints || 3);
    setRange('wq-confidence', w.confidence || 3);
    const locs = document.getElementById('wq-soreness-locs');
    if (locs) locs.value = w.sorenessLocs || '';
}

function saveHormoneEntry() {
    const today = getTodayKey();
    if (!state.logs[today]) state.logs[today] = getEmptyLog();
    state.logs[today].hormone = {
        cycleDay: parseInt(document.getElementById('hormone-cycle-day').value) || null,
        phase: document.getElementById('hormone-phase').value,
        basalTempC: parseFloat(document.getElementById('hormone-temp').value) || null,
        energyLevel: parseInt(document.getElementById('hormone-energy').value) || null,
        cramps: parseFloat(document.getElementById('hormone-cramps').value) || 0,
        bloating: document.getElementById('hormone-bloating').checked,
        notes: document.getElementById('hormone-notes').value
    };
    saveData();
    showToast('Hormone entry saved.');
}

function restoreHormoneForm() {
    const today = state.logs[getTodayKey()];
    if (!today || !today.hormone) return;
    const h = today.hormone;
    const s = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    s('hormone-cycle-day', h.cycleDay || '');
    s('hormone-phase', h.phase || '');
    s('hormone-temp', h.basalTempC || '');
    s('hormone-energy', h.energyLevel || '');
    s('hormone-cramps', h.cramps || '');
    const bl = document.getElementById('hormone-bloating');
    if (bl) bl.checked = !!h.bloating;
    s('hormone-notes', h.notes || '');
}

function getPhotoStore() {
    const saved = localStorage.getItem('n1_photos');
    return saved ? JSON.parse(saved) : [];
}

function savePhotoStore(photos) {
    const lite = photos.map(p => ({ id: p.id, date: p.date, type: p.type, url: p.url || null }));
    localStorage.setItem('n1_photos', JSON.stringify(lite));
}

async function loadPhotosFromCloud() {
    if (!supabaseClient) return;
    const uid = getUserId();
    const { data: list } = await supabaseClient.storage.from('progress-photos').list(uid, { limit: 50, sortBy: { column: 'created_at', order: 'desc' } });
    if (!list || list.length === 0) return;
    const local = getPhotoStore();
    const localIds = new Set(local.map(p => p.id));
    for (const f of list) {
        const photoId = f.name.replace(/\.\w+$/, '');
        if (localIds.has(photoId)) continue;
        const { data: urlData } = supabaseClient.storage.from('progress-photos').getPublicUrl(`${uid}/${f.name}`);
        local.push({ id: photoId, date: f.name.split('_')[0] || '', type: 'cloud', url: urlData?.publicUrl || '' });
    }
    savePhotoStore(local);
}

function renderPhotoTimeline() {
    const container = document.getElementById('photo-timeline');
    if (!container) return;
    const photos = getPhotoStore();
    if (photos.length === 0) {
        container.innerHTML = '<div class="text-sm text-secondary">No progress photos yet.</div>';
        return;
    }
    container.innerHTML = photos.slice(-20).reverse().map(p => {
        const src = p.url || p.dataUrl || '';
        return `<img class="photo-thumb" src="${src}" title="${p.date} - ${p.type}" alt="${p.type}">`;
    }).join('');
}

function uploadPhoto() {
    const fileInput = document.getElementById('photo-file');
    const type = document.getElementById('photo-type').value;
    if (!fileInput || !fileInput.files || !fileInput.files[0]) return;
    const file = fileInput.files[0];
    if (file.size > 5 * 1024 * 1024) { showToast('Photo too large (max 5MB).'); return; }
    const photoId = Date.now().toString(36);
    const ext = file.name.split('.').pop() || 'jpg';
    const dateStr = getTodayKey();

    if (supabaseClient) {
        const uid = getUserId();
        const path = `${uid}/${dateStr}_${photoId}.${ext}`;
        supabaseClient.storage.from('progress-photos').upload(path, file, { cacheControl: '3600', upsert: true }).then(({ data, error }) => {
            if (error) { console.warn('Storage upload failed, falling back to local', error); saveLocal(); return; }
            const { data: urlData } = supabaseClient.storage.from('progress-photos').getPublicUrl(path);
            const photos = getPhotoStore();
            photos.push({ id: photoId, date: dateStr, type: type, url: urlData?.publicUrl || '' });
            savePhotoStore(photos);
            renderPhotoTimeline();
            fileInput.value = '';
            showToast('Photo uploaded to cloud.');
        });
    } else {
        saveLocal();
    }

    function saveLocal() {
        const reader = new FileReader();
        reader.onload = (e) => {
            const photos = getPhotoStore();
            photos.push({ id: photoId, date: dateStr, type: type, dataUrl: e.target.result });
            savePhotoStore(photos);
            renderPhotoTimeline();
            fileInput.value = '';
            showToast('Photo saved locally.');
        };
        reader.readAsDataURL(file);
    }
}

function getTrainingPlanStore() {
    const saved = localStorage.getItem('n1_training_plans');
    return saved ? JSON.parse(saved) : [];
}

function saveTrainingPlanStore(plans) {
    localStorage.setItem('n1_training_plans', JSON.stringify(plans));
    if (supabaseClient) {
        const uid = getUserId();
        Promise.all(plans.filter(p => p.active).map(p =>
            supabaseClient.from('training_plans').upsert({
                user_id: uid, name: p.name || 'Weekly Plan', phase: p.phase || 'hypertrophy',
                is_active: true, plan_data: p
            }, { onConflict: 'user_id,name' })
        )).catch(e => console.warn('Training plan cloud sync failed', e));
    }
}

function renderTrainingPlans() {
    const container = document.getElementById('training-plan-view');
    if (!container) return;
    const plans = getTrainingPlanStore();
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    if (plans.length === 0) {
        container.innerHTML = '<div class="text-sm text-secondary">No training plans yet.</div>';
        return;
    }
    container.innerHTML = plans.filter(p => p.active).map(p => {
        const weekHtml = days.map((d, i) => {
            const dayPlan = (p.weeklyStructure || {})[i] || { type: 'rest', desc: 'Rest' };
            const cls = dayPlan.type === 'cardio' ? 'cardio' : dayPlan.type === 'strength' ? 'strength' : dayPlan.type === 'mixed' ? 'mixed' : 'rest';
            return `<div class="tp-day ${cls}"><div class="tp-day-header">${d}</div>${dayPlan.desc}</div>`;
        }).join('');
        return `<div class="glass-card mt-2" style="padding:0.8rem">
            <div class="flex-row" style="justify-content:space-between;align-items:center;margin-bottom:0.5rem">
                <div><strong>${p.name}</strong> <span class="text-sm text-secondary">${p.phase} phase</span></div>
                <button class="btn-sm" onclick="deactivatePlan('${p.id}')">Stop</button>
            </div>
            <div class="text-sm text-secondary mb-2">${p.startDate} → ${p.endDate}</div>
            <div class="tp-week">${weekHtml}</div>
        </div>`;
    }).join('');
}

function createTrainingPlan() {
    const name = document.getElementById('tp-name').value.trim();
    const startDate = document.getElementById('tp-start').value;
    const endDate = document.getElementById('tp-end').value;
    const phase = document.getElementById('tp-phase').value;
    if (!name || !startDate || !endDate) return;
    const plans = getTrainingPlanStore();
    const defaultWeek = {
        0: { type: 'strength', desc: 'Heavy Day A' },
        1: { type: 'cardio', desc: 'Zone 2 45min' },
        2: { type: 'mixed', desc: 'Tendon + Light Cardio' },
        3: { type: 'strength', desc: 'Heavy Day B' },
        4: { type: 'cardio', desc: 'Zone 2 60min' },
        5: { type: 'cardio', desc: 'Long Easy' },
        6: { type: 'rest', desc: 'Rest' }
    };
    plans.push({
        id: Date.now().toString(36),
        name, startDate, endDate, phase,
        weeklyStructure: defaultWeek,
        active: true
    });
    saveTrainingPlanStore(plans);
    document.getElementById('tp-name').value = '';
    renderTrainingPlans();
    showToast('Training plan created.');
}

function deactivatePlan(id) {
    const plans = getTrainingPlanStore();
    const plan = plans.find(p => p.id === id);
    if (plan) plan.active = false;
    saveTrainingPlanStore(plans);
    renderTrainingPlans();
    showToast('Plan deactivated.');
}

function populateRaceDropdown() {
    const select = document.getElementById('tp-race');
    if (!select) return;
    const races = getRaceStore().filter(r => r.status !== 'completed');
    select.innerHTML = '<option value="">None</option>' + races.map(r =>
        `<option value="${r.id}">${r.name} (${r.date})</option>`
    ).join('');
}

function exportFullBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `n1-backup-${getTodayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Full backup downloaded.');
}

function exportProgressCSV() {
    const dates = Object.keys(state.logs).sort();
    const headers = ['date','weight','bodyFatPct','sleepHrs','sleepQual','hrv','restingHR',
        'cnsFatigue','soreness','stress','motivation','workStress',
        'injuryLoc','injuryPain','painType','painSide',
        'gymType','liftName','liftWeight','liftSets','liftReps','liftRestSeconds','liftRir',
        'cardioType','cardioStart','cardioDuration','cardioRpe',
        'zone1Min','zone2Min','zone3Min','zone4Min','zone5Min',
        'totalCals','proG','carbsG','fatsG','waterLiters','sodiumMg',
        'tempC','humidity','stravaEffort','nsaidsTaken',
        'prehabDone','warmupDone','tendonIsometrics','hsrDone','mobilityDone',
        'preWorkoutCarbsG','intraCarbs','postRefeed','postWorkoutProteinG','postWorkoutCarbsG',
        'inbodyWeight','inbodySmm','inbodyBf','inbodyTbw',
        'bioTest','bioCortisol','bioHscrp','bioFerritin'];
    const rows = [headers];
    dates.forEach(d => {
        const l = normalizeLog(state.logs[d]);
        rows.push(headers.map(h => l[h] !== undefined && l[h] !== null ? l[h] : ''));
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `n1-progress-${getTodayKey()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Progress CSV exported.');
}

function resetAllData() {
    if (!confirm('This will permanently delete ALL local data. Are you sure?')) return;
    if (!confirm('Last chance: this cannot be undone. Proceed?')) return;
    localStorage.removeItem('n1_pwa_state');
    localStorage.removeItem('n1_weather_key');
    showToast('All data cleared. Reloading...');
    setTimeout(() => location.reload(), 1000);
}

function getWeatherKey() {
    return localStorage.getItem('n1_weather_key') || '';
}

async function fetchWeather() {
    const key = getWeatherKey();
    if (!key) return;
    const today = state.logs[getTodayKey()] || getEmptyLog();
    if (num(today.tempC) > 0 && num(today.humidity) > 0) return;
    try {
        const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=31.2001&lon=29.9187&appid=${key}&units=metric`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.main) {
            if (!state.logs[getTodayKey()]) state.logs[getTodayKey()] = getEmptyLog();
            const log = state.logs[getTodayKey()];
            if (!num(log.tempC)) log.tempC = Math.round(data.main.temp * 10) / 10;
            if (!num(log.humidity)) log.humidity = data.main.humidity;
            if (data.wind) log.windSpeed = Math.round(data.wind.speed * 10) / 10;
            if (data.weather && data.weather[0]) log.weatherCondition = data.weather[0].main;
            localStorage.setItem('n1_pwa_state', JSON.stringify(state));
            state.weatherLastFetch = new Date().toISOString();
            localStorage.setItem('n1_pwa_state', JSON.stringify(state));
        }
    } catch (e) {
        console.warn('Weather fetch failed:', e);
    }
}

function updateSettingsView() {
    const macroInput = document.getElementById('settings-macrocycle');
    if (macroInput) {
        macroInput.value = state.macrocycle || 'STRENGTH';
        const pills = macroInput.closest('.input-group').querySelectorAll('.form-pills .pill');
        pills.forEach(p => {
            p.classList.toggle('active', p.dataset.val === state.macrocycle);
        });
    }

    const weatherInput = document.getElementById('settings-weather-key');
    if (weatherInput) {
        const key = getWeatherKey();
        weatherInput.value = key;
        weatherInput.type = key ? 'password' : 'text';
    }

    const supabaseIndicator = document.getElementById('status-supabase-indicator');
    if (supabaseIndicator) {
        if (supabaseClient) {
            supabaseIndicator.innerHTML = '<span class="sync-status-dot green"></span>Connected';
            supabaseIndicator.style.color = 'var(--success)';
        } else {
            supabaseIndicator.innerHTML = '<span class="sync-status-dot red"></span>Offline';
            supabaseIndicator.style.color = 'var(--danger)';
        }
    }

    const cloudCount = document.getElementById('status-cloud-count');
    if (cloudCount) {
        cloudCount.textContent = Object.keys(state.logs).length + ' days';
    }

    const passiveEl = document.getElementById('status-passive-engine');
    if (passiveEl) {
        const stamp = state.stravaSync?.lastPassiveSyncAt || state.stravaSync?.lastManualSyncAt;
        if (stamp) {
            const d = new Date(stamp);
            const diff = Math.floor((Date.now() - d.getTime()) / 3600000);
            passiveEl.innerHTML = diff < 3
                ? '<span class="sync-status-dot green"></span>' + diff + 'h ago'
                : '<span class="sync-status-dot yellow"></span>' + diff + 'h ago';
        } else {
            passiveEl.innerHTML = '<span class="sync-status-dot yellow"></span>No sync yet';
        }
    }

    const weatherSourceEl = document.getElementById('status-weather-source');
    if (weatherSourceEl) {
        const key = getWeatherKey();
        if (key) {
            const lastFetch = state.weatherLastFetch;
            if (lastFetch) {
                const d = new Date(lastFetch);
                const diff = Math.floor((Date.now() - d.getTime()) / 3600000);
                weatherSourceEl.innerHTML = diff < 3
                    ? '<span class="sync-status-dot green"></span>Auto ' + diff + 'h ago'
                    : '<span class="sync-status-dot yellow"></span>Stale';
            } else {
                weatherSourceEl.innerHTML = '<span class="sync-status-dot yellow"></span>Key set, not fetched';
            }
        } else {
            weatherSourceEl.innerHTML = '<span class="sync-status-dot yellow"></span>Waiting for key';
        }
    }

    const stravaIndicator = document.getElementById('status-strava-indicator');
    const stravaLastImport = document.getElementById('status-strava-last-import');
    if (stravaIndicator) {
        const hasStravaData = Object.values(state.logs).some(l => l.source === 'strava' || num(l.stravaEffort) > 0);
        const importedCount = getImportedActivitiesList().filter(a => a.source === 'strava').length;
        if (importedCount > 0) {
            stravaIndicator.innerHTML = '<span class="sync-status-dot green"></span>Connected';
            stravaIndicator.style.color = 'var(--success)';
        } else if (hasStravaData) {
            stravaIndicator.innerHTML = '<span class="sync-status-dot yellow"></span>Has data';
        } else {
            stravaIndicator.innerHTML = '<span class="sync-status-dot yellow"></span>Not connected';
        }
    }
    if (stravaLastImport) {
        const stravaActivities = getImportedActivitiesList().filter(a => a.source === 'strava' || a.source === 'intervals');
        if (stravaActivities.length > 0) {
            const latest = stravaActivities[0];
            stravaLastImport.textContent = latest.dateKey || '--';
        } else {
            stravaLastImport.textContent = '--';
        }
    }
}

async function invokePassiveSync() {
    if (!supabaseClient) throw new Error('Supabase not connected');
    const { data, error } = await supabaseClient.functions.invoke('sync-passive', {
        method: 'POST',
    });
    if (error) throw new Error(error.message || 'Edge function error');
    return data;
}

function connectStrava() {
    const clientId = prompt('Enter your Strava Client ID:');
    if (!clientId) return;
    const callbackUrl = `${SUPABASE_URL}/functions/v1/strava-callback`;
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(callbackUrl)}&approval_prompt=force&scope=activity:read_all`;
    window.open(authUrl, '_blank');
    showToast('Authorize Strava in the new window, then come back and Sync.');
}

function setupSettingsHandlers() {
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', handleLogout);
        if (!isGuest() && currentUser) btnLogout.style.display = 'block';
    }
    const authInfo = document.getElementById('auth-info');
    if (authInfo) {
        if (currentUser) {
            authInfo.textContent = `Logged in as ${currentUser.email}${isGuest() ? ' (Guest)' : ''}`;
        } else if (isGuest()) {
            authInfo.textContent = 'Running in guest mode. Data saved locally.';
        }
    }

    const settingsMacro = document.getElementById('settings-macrocycle');
    if (settingsMacro && !settingsMacro.dataset.bound) {
        settingsMacro.addEventListener('change', () => {
            state.macrocycle = settingsMacro.value;
            saveData();
            renderCockpit();
            updateHubDashboard();
            showToast('Macrocycle updated to ' + getMacrocycleMeta(state.macrocycle).label);
        });
        settingsMacro.dataset.bound = 'true';
    }

    const saveWeatherBtn = document.getElementById('btn-save-weather-key');
    if (saveWeatherBtn && !saveWeatherBtn.dataset.bound) {
        saveWeatherBtn.addEventListener('click', () => {
            const input = document.getElementById('settings-weather-key');
            const key = input ? input.value.trim() : '';
            if (key) {
                localStorage.setItem('n1_weather_key', key);
                input.type = 'password';
                showToast('Weather API key saved. Fetching...');
                fetchWeather().then(() => { refreshAllViews(); updateSettingsView(); });
            } else {
                localStorage.removeItem('n1_weather_key');
                input.type = 'text';
                showToast('Weather key removed.');
            }
        });
        saveWeatherBtn.dataset.bound = 'true';
    }

    const syncNowBtn = document.getElementById('btn-sync-now');
    if (syncNowBtn && !syncNowBtn.dataset.bound) {
        syncNowBtn.addEventListener('click', async () => {
            syncNowBtn.disabled = true;
            syncNowBtn.textContent = 'Syncing...';
            try {
                await invokePassiveSync();
                await loadData();
                await fetchWeather();
                refreshAllViews();
                updateSettingsView();
                showToast('Passive sync complete.');
            } catch (e) {
                showToast('Sync error: ' + e.message);
            } finally {
                syncNowBtn.disabled = false;
                syncNowBtn.textContent = 'Sync Now';
            }
        });
        syncNowBtn.dataset.bound = 'true';
    }

    const exportBackupBtn = document.getElementById('btn-export-full-backup');
    if (exportBackupBtn && !exportBackupBtn.dataset.bound) {
        exportBackupBtn.addEventListener('click', exportFullBackup);
        exportBackupBtn.dataset.bound = 'true';
    }

    const resetBtn = document.getElementById('btn-reset-data');
    if (resetBtn && !resetBtn.dataset.bound) {
        resetBtn.addEventListener('click', resetAllData);
        resetBtn.dataset.bound = 'true';
    }

    const exportProgressBtn = document.getElementById('btn-export-progress-csv');
    if (exportProgressBtn && !exportProgressBtn.dataset.bound) {
        exportProgressBtn.addEventListener('click', exportProgressCSV);
        exportProgressBtn.dataset.bound = 'true';
    }

    const bioSaveBtn = document.getElementById('modal-bio-save');
    if (bioSaveBtn && !bioSaveBtn.dataset.bound) {
        bioSaveBtn.addEventListener('click', saveBiomarkerModal);
        bioSaveBtn.dataset.bound = 'true';
    }

    const bioCancelBtn = document.getElementById('modal-bio-cancel');
    if (bioCancelBtn && !bioCancelBtn.dataset.bound) {
        bioCancelBtn.addEventListener('click', () => closeModal('biomarker-modal'));
        bioCancelBtn.dataset.bound = 'true';
    }

    const bioModal = document.getElementById('biomarker-modal');
    if (bioModal && !bioModal.dataset.bound) {
        bioModal.addEventListener('click', (e) => {
            if (e.target === bioModal) closeModal('biomarker-modal');
        });
        bioModal.dataset.bound = 'true';
    }

    const stravaConnectBtn = document.getElementById('btn-connect-strava');
    if (stravaConnectBtn && !stravaConnectBtn.dataset.bound) {
        stravaConnectBtn.addEventListener('click', connectStrava);
        stravaConnectBtn.dataset.bound = 'true';
    }
}

function exportCockpitCSV() {
    const dates = Object.keys(state.logs).sort().slice(-90);
    const rows = [['date','weight','bodyFatPct','cnsFatigue','workStress','sleepHrs','sleepQual','hrv','restingHR','soreness','stress','motivation','caffeineMg','tempC','humidity','gymType','cardioType','cardioDuration','cardioRpe','distanceKm','avgHR','maxHR','caloriesBurned','avgPower','stravaEffort','elevationGain','zone1Min','zone2Min','zone3Min','zone4Min','zone5Min','liftName','liftWeight','liftSets','liftReps','liftRir','totalCals','proG','carbsG','fatsG','fiberG','sugarG','waterLiters','sodiumMg','injuryLoc','injuryPain','supplements','wellness_mood','wellness_digestion','wellness_joints','wellness_confidence','hormone_cycleDay','hormone_phase','hormone_basalTempC','hormone_energy','customMetrics']];
    dates.forEach(d => {
        const l = state.logs[d] || {};
        const w = l.wellness || {};
        const h = l.hormone || {};
        rows.push([
            d, l.weight||'', l.bodyFatPct||'', l.cnsFatigue||'', l.workStress||'',
            l.sleepHrs||'', l.sleepQual||'', l.hrv||'', l.restingHR||'',
            l.soreness0to10||'', l.stress0to10||'', l.motivation0to10||'',
            l.caffeineMg||'', l.tempC||'', l.humidity||'',
            l.gymType||'', l.cardioType||'', l.manualCardioDuration||'', l.manualCardioRpe||'',
            l.distanceKm||'', l.avgHR||'', l.maxHR||'', l.caloriesBurned||'',
            l.avgPower||'', l.stravaEffort||'', l.elevationGain||'',
            l.zone1Min||'', l.zone2Min||'', l.zone3Min||'', l.zone4Min||'', l.zone5Min||'',
            l.liftName||'', l.liftWeight||'', l.liftSets||'', l.liftReps||'', l.liftRir||'',
            l.totalCals||'', l.proG||'', l.carbsG||'', l.fatsG||'',
            l.fiberG||'', l.sugarG||'', l.waterLiters||'', l.sodiumMg||'',
            l.injuryLoc||'', l.injuryPain||'',
            (l.supplements||[]).join(';'),
            w.mood||'', w.digestion||'', w.joints||'', w.confidence||'',
            h.cycleDay||'', h.phase||'', h.basalTempC||'', h.energyLevel||'',
            JSON.stringify(l.customMetrics||{})
        ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `n1-export-${getTodayKey()}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function buildActivitiesFromDailyLogs() {
    const activities = [];
    Object.keys(state.logs || {}).forEach(dateKey => {
        const log = state.logs[dateKey];
        if (!log) return;
        const hasObjective = log.stravaActivityId || num(log.stravaEffort) > 0 || (log.source === 'strava' && num(log.manualCardioDuration) > 0);
        if (!hasObjective) return;

        activities.push({
            id: log.stravaActivityId || `daily-${dateKey}`,
            externalActivityId: log.stravaActivityId || `daily-${dateKey}`,
            source: log.source || 'strava',
            name: log.cardioType && log.cardioType !== 'NONE' ? `${log.cardioType.replace('_', ' ')} session` : 'Imported activity',
            type: log.cardioType || 'Workout',
            sport_type: log.cardioType || 'Workout',
            start_date_local: log.cardioStart ? `${dateKey}T${log.cardioStart}:00` : `${dateKey}T12:00:00`,
            durationMin: log.manualCardioDuration,
            distanceKm: log.distanceKm,
            average_heartrate: log.avgHR,
            max_heartrate: log.maxHR,
            average_watts: log.avgPower,
            calories: log.caloriesBurned,
            total_elevation_gain: log.elevationGain,
            stravaEffort: log.stravaEffort,
            rpe: log.manualCardioRpe,
            painRegion: log.injuryLoc,
            painScore: log.injuryPain,
            intraCarbs: log.intraCarbs,
            postRefeed: log.postRefeed,
            notes: log.notes
        });
    });
    return activities;
}

async function syncStravaInboxFromCloud() {
    let imported = 0;

    if (supabaseClient) {
        try {
            const { data: cloudLogs, error } = await supabaseClient
                .from('n1_logs')
                .select('*')
                .order('date_id', { ascending: false })
                .limit(45);

            if (error) throw error;

            (cloudLogs || []).forEach(row => {
                if (!row.data) return;
                if (Array.isArray(row.data.importedActivities)) {
                    imported += importExternalActivities(row.data.importedActivities, 'strava');
                } else if (row.data.rawActivity || row.data.stravaActivityId || row.data.stravaEffort) {
                    imported += importExternalActivities([{
                        ...(row.data.rawActivity || {}),
                        externalActivityId: row.data.stravaActivityId || `cloud-${row.date_id}`,
                        source: row.data.source || 'strava',
                        type: row.data.cardioType || row.data.type || 'Workout',
                        sport_type: row.data.cardioType || row.data.type || 'Workout',
                        start_date_local: row.data.cardioStart ? `${row.date_id}T${row.data.cardioStart}:00` : `${row.date_id}T12:00:00`,
                        durationMin: row.data.cardioDuration || row.data.manualCardioDuration,
                        distanceKm: row.data.distanceKm,
                        average_heartrate: row.data.avgHR || row.data.stravaHr,
                        max_heartrate: row.data.maxHR,
                        average_watts: row.data.avgPower,
                        calories: row.data.caloriesBurned,
                        total_elevation_gain: row.data.elevationGain,
                        stravaEffort: row.data.stravaEffort
                    }], row.data.source || 'strava');
                }
            });
        } catch (e) {
            console.error('Strava inbox cloud sync failed', e);
            showToast('Cloud sync unavailable. Rebuilt from local logs.');
        }
    }

    imported += importExternalActivities(buildActivitiesFromDailyLogs(), 'strava');
    localStorage.setItem('n1_pwa_state', JSON.stringify(state));
    refreshAllViews();
    showToast(imported > 0 ? `Imported ${imported} new activities.` : 'Activity inbox is up to date.');
}

function bindStravaInbox() {
    const syncBtn = document.getElementById('btn-sync-strava');
    if (syncBtn && !syncBtn.dataset.bound) {
        syncBtn.addEventListener('click', syncStravaInboxFromCloud);
        syncBtn.dataset.bound = 'true';
    }

    const list = document.getElementById('strava-inbox-list');
    if (list && !list.dataset.bound) {
        list.addEventListener('input', (event) => {
            const card = event.target.closest('.activity-card');
            if (!card) return;
            updateActivityDraftFromCard(card);
        });
        list.addEventListener('change', (event) => {
            const card = event.target.closest('.activity-card');
            if (!card) return;
            updateActivityDraftFromCard(card);
        });
        list.addEventListener('click', (event) => {
            const saveBtn = event.target.closest('[data-save-activity]');
            if (!saveBtn) return;
            const card = saveBtn.closest('.activity-card');
            if (!card) return;
            updateActivityDraftFromCard(card);
            saveActivitySubjective(card.dataset.activityId);
        });
        list.dataset.bound = 'true';
    }
}

function updateActivityDraftFromCard(card) {
    const activity = getActivityStore()[card.dataset.activityId];
    if (!activity) return;
    activity.rpe = card.querySelector('[data-field="rpe"]')?.value || '';
    activity.painRegion = card.querySelector('[data-field="painRegion"]')?.value || '';
    activity.painScore = card.querySelector('[data-field="painScore"]')?.value || '';
    activity.fueled = card.querySelector('[data-field="fueled"]')?.value || '';
    activity.intraCarbs = card.querySelector('[data-field="intraCarbs"]')?.value || '';
    activity.notes = card.querySelector('[data-field="notes"]')?.value || '';
    activity.updatedAt = new Date().toISOString();
}

function saveActivitySubjective(activityId) {
    const activity = getActivityStore()[activityId];
    if (!activity) return;
    mergeActivityIntoDailyLog(activity);
    saveData(activity.dateKey || getTodayKey());
    showToast(isActivitySubjectiveComplete(activity) ? 'Post-workout check saved.' : 'Activity saved with missing prompts.');
}

function renderStravaInbox() {
    const list = document.getElementById('strava-inbox-list');
    const empty = document.getElementById('strava-empty-state');
    const totalEl = document.getElementById('strava-total-count');
    const pendingEl = document.getElementById('strava-pending-count');
    const latestEl = document.getElementById('strava-last-sync');
    if (!list) return;

    const activities = getImportedActivitiesList();
    const pending = activities.filter(activity => !isActivitySubjectiveComplete(activity));
    if (totalEl) totalEl.textContent = activities.length;
    if (pendingEl) pendingEl.textContent = pending.length;
    if (latestEl) {
        const stamp = state.stravaSync?.lastManualSyncAt || state.stravaSync?.lastPassiveSyncAt;
        latestEl.textContent = stamp ? new Date(stamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not synced';
    }

    if (empty) empty.classList.toggle('hidden', activities.length > 0);
    list.innerHTML = '';

    activities.slice(0, 20).forEach(activity => {
        const complete = isActivitySubjectiveComplete(activity);
        const needsFuel = num(activity.durationMin) > 75;
        const name = escapeHTML(activity.name || activity.modality);
        const modality = escapeHTML(activity.modality || activity.type);
        const dateKey = escapeHTML(activity.dateKey);
        const impact = escapeHTML(activity.impactLevel);
        const avgPace = escapeHTML(activity.avgPace || '--');
        const painRegion = escapeHTML(activity.painRegion || '');
        const notes = escapeHTML(activity.notes || '');
        const card = document.createElement('article');
        card.className = `activity-card ${complete ? 'is-complete' : 'is-pending'}`;
        card.dataset.activityId = activity.id;
        card.innerHTML = `
            <div class="activity-card-header">
                <div>
                    <div class="activity-title">${name}</div>
                    <div class="activity-meta">${modality} · ${dateKey} · ${activity.durationMin || 0} min${activity.distanceKm ? ` · ${Number(activity.distanceKm).toFixed(1)} km` : ''}</div>
                </div>
                <span class="activity-status">${complete ? 'Complete' : 'Needs check'}</span>
            </div>
            <div class="activity-metrics">
                <div><span>Load</span><strong>${Math.round(num(activity.trainingLoad)) || '--'}</strong></div>
                <div><span>HR</span><strong>${activity.avgHR || '--'}</strong></div>
                <div><span>Pace</span><strong>${avgPace}</strong></div>
                <div><span>Impact</span><strong>${impact}</strong></div>
            </div>
            <div class="activity-prompts">
                <label>RPE<input data-field="rpe" type="number" min="1" max="10" value="${activity.rpe || ''}"></label>
                <label>Pain region<input data-field="painRegion" type="text" value="${painRegion}" placeholder="e.g. Left knee"></label>
                <label>Pain<input data-field="painScore" type="number" min="0" max="10" value="${activity.painScore === undefined ? '' : activity.painScore}"></label>
                <label>Fueled<select data-field="fueled">
                    <option value="" ${activity.fueled === '' ? 'selected' : ''}>--</option>
                    <option value="yes" ${activity.fueled === 'yes' ? 'selected' : ''}>Yes</option>
                    <option value="no" ${activity.fueled === 'no' ? 'selected' : ''}>No</option>
                </select></label>
                <label class="${needsFuel ? '' : 'is-muted'}">Carbs g<input data-field="intraCarbs" type="number" min="0" value="${activity.intraCarbs || ''}"></label>
            </div>
            <textarea data-field="notes" class="activity-notes" placeholder="Notes">${notes}</textarea>
            <div class="activity-actions">
                <span>${needsFuel ? 'Long session: fueling answer required.' : 'Fueling optional for this duration.'}</span>
                <button class="btn btn-sm" data-save-activity>Save Check</button>
            </div>
        `;
        list.appendChild(card);
    });
}

function updateHubDashboard() {
    const today = state.logs[getTodayKey()];
    
    const hDate = document.getElementById('header-date');
    if(hDate) hDate.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    
    const sEl = document.getElementById('streak-count');
    if(sEl) sEl.textContent = calculateStreak();

    const macroPills = document.querySelectorAll('#cockpit-macrocycle-pills .pill');
    if(macroPills.length > 0) {
        let currentCycle = state.macrocycle || 'HYPERTROPHY';
        macroPills.forEach(pill => {
            if(pill.dataset.cycle === currentCycle) {
                pill.classList.add('active');
            } else {
                pill.classList.remove('active');
            }
            // Bind click handler only once
            if(!pill.dataset.bound) {
                pill.addEventListener('click', (e) => {
                    state.macrocycle = e.target.dataset.cycle;
                    saveData();
                    updateHubDashboard();
                    renderCockpit();
                });
                pill.dataset.bound = 'true';
            }
        });
    }

    const statusName = document.getElementById('cockpit-cycle-name');
    const statusDesc = document.getElementById('cockpit-cycle-desc');
    if (statusName || statusDesc) {
        const meta = getMacrocycleMeta(state.macrocycle);
        if (statusName) statusName.textContent = meta.label;
        if (statusDesc) statusDesc.textContent = meta.desc;
    }

    if(!today) return;
    
    const cardioEl = document.getElementById('hub-cardio');
    if(cardioEl) cardioEl.textContent = today.manualCardioDuration ? `${today.manualCardioDuration}m` : '0m';
    
    const liftEl = document.getElementById('hub-lift');
    if(liftEl) {
        let text = 'Rest';
        if (today.gymType === 'DAY_A') text = 'Heavy A';
        else if (today.gymType === 'DAY_B') text = 'Heavy B';
        else if (today.gymType === 'TENDON') text = 'Tendon Iso';
        else if (today.gymType === 'HYPERTROPHY') text = 'Hypertrophy';
        else if (today.gymType === 'STRENGTH') text = 'Strength';
        liftEl.textContent = text;
    }

    // Cockpit Alerts
    const alertLift = document.getElementById('alert-lift-msg');
    const alertLiftNode = document.getElementById('alert-lift');
    const alertLiftIcon = alertLiftNode ? alertLiftNode.querySelector('.icon') : null;
    const interference = calculateInterferenceShield(today);
    if (alertLift && interference.severity !== 'green') {
        alertLift.textContent = interference.message;
        alertLift.style.color = "var(--accent)";
        if(alertLiftIcon) alertLiftIcon.textContent = "🔴";
    } else if (alertLift) {
        alertLift.textContent = interference.message;
        alertLift.style.color = "var(--text-secondary)";
        if(alertLiftIcon) alertLiftIcon.textContent = "🟢";
    }

    const alertTendon = document.getElementById('alert-tendon-msg');
    const alertTendonNode = document.getElementById('alert-tendon');
    const alertTendonIcon = alertTendonNode ? alertTendonNode.querySelector('.icon') : null;
    let isLowCals = parseFloat(today.totalCals) < 1800;
    if (alertTendon && (today.injuryPain >= 3 || (isLowCals && !today.prehabDone && today.injuryPain > 0))) {
        alertTendon.textContent = "Tendon starvation risk! High pain or deep deficit without prehab.";
        alertTendon.style.color = "var(--accent)";
        if(alertTendonIcon) alertTendonIcon.textContent = "🔴";
    } else if (alertTendon) {
        alertTendon.textContent = "Tendons are recovering well.";
        alertTendon.style.color = "var(--text-secondary)";
        if(alertTendonIcon) alertTendonIcon.textContent = "🟢";
    }

    const alertEndocrine = document.getElementById('alert-endocrine-msg');
    const alertEndocrineNode = document.getElementById('alert-endocrine');
    const alertEndocrineIcon = alertEndocrineNode ? alertEndocrineNode.querySelector('.icon') : null;
    let isRestDay = today.gymType === 'NONE' && (!today.manualCardioDuration || today.manualCardioDuration <= 0);
    if (alertEndocrine && isRestDay && parseFloat(today.totalCals) < 2100) {
        alertEndocrine.textContent = "Endocrine Crash Warning: Rest day calories < 2100. Adrenaline is masking fatigue.";
        alertEndocrine.style.color = "var(--accent)";
        if(alertEndocrineIcon) alertEndocrineIcon.textContent = "🔴";
    } else if (alertEndocrine) {
        alertEndocrine.textContent = "Endocrine system stable.";
        alertEndocrine.style.color = "var(--text-secondary)";
        if(alertEndocrineIcon) alertEndocrineIcon.textContent = "🟢";
    }

    const alertHeat = document.getElementById('alert-heat-msg');
    const alertHeatNode = document.getElementById('alert-heat');
    const alertHeatIcon = alertHeatNode ? alertHeatNode.querySelector('.icon') : null;
    const catabolic = calculateCatabolicThreat(today);
    if (alertHeat && catabolic.severity === 'red') {
        alertHeat.textContent = catabolic.message;
        alertHeat.style.color = "var(--accent)";
        if(alertHeatIcon) alertHeatIcon.textContent = "🔴";
    } else if (alertHeat) {
        alertHeat.textContent = catabolic.message;
        alertHeat.style.color = "var(--text-secondary)";
        if(alertHeatIcon) alertHeatIcon.textContent = "🟢";
    }

    // Alert 4: Nutrition Adherence
    const alertNut = document.getElementById('alert-nutrition-msg');
    const alertNutNode = document.getElementById('alert-nutrition');
    const alertNutIcon = alertNutNode ? alertNutNode.querySelector('.icon') : null;
    
    if (alertNut) {
        let isHeavy = today.gymType === 'DAY_A' || today.gymType === 'DAY_B';
        let isCardio = parseFloat(today.manualCardioDuration) > 0;
        let cals = parseFloat(today.totalCals) || 0;
        let pro = parseFloat(today.proG) || 0;
        
        let target = getNutritionTarget(today);
        let targetCals = target.calories;
        let targetPro = target.proteinG;
        
        if (cals > 0) {
            if (cals < targetCals) {
                alertNut.textContent = `Catabolic Warning! Target is ${targetCals} kcal. You are under-fueled.`;
                alertNut.style.color = "var(--accent)";
                if (alertNutIcon) alertNutIcon.textContent = "🔴";
            } else if ((isHeavy || today.gymType === 'HYPERTROPHY') && pro < targetPro) {
                alertNut.textContent = `Sarcopenia Warning! Heavy lift logged but protein is <${targetPro}g.`;
                alertNut.style.color = "var(--accent)";
                if (alertNutIcon) alertNutIcon.textContent = "🔴";
            } else {
                alertNut.textContent = "Phase targets met. Optimal.";
                alertNut.style.color = "var(--text-secondary)";
                if (alertNutIcon) alertNutIcon.textContent = "🟢";
            }
        } else {
            alertNut.textContent = "Awaiting nutrition data...";
            alertNut.style.color = "var(--text-secondary)";
            if (alertNutIcon) alertNutIcon.textContent = "⚪";
        }
    }

    // Alert 5: ACWR (Acute:Chronic Workload Ratio)
    const alertAcwr = document.getElementById('alert-acwr-msg');
    const alertAcwrNode = document.getElementById('alert-acwr');
    const alertAcwrIcon = alertAcwrNode ? alertAcwrNode.querySelector('.icon') : null;
    if (alertAcwr) {
        let acwrStatus = calculateACWR();
        let dates = Object.keys(state.logs).sort();
        let last28 = dates.slice(-28);
        let chronicSum = 0;
        let acuteSum = 0;
        
        last28.forEach((d, idx) => {
            let effort = parseFloat(state.logs[d].stravaEffort) || 0;
            chronicSum += effort;
            if (idx >= last28.length - 7) acuteSum += effort; // Last 7 days
        });
        
        let chronicAvg = chronicSum / 4; // 4-week average weekly load
        let acwr = chronicAvg > 0 ? (acuteSum / chronicAvg) : 0;
        
        // Suppress ACWR alerts during deload
        let acwrLimit = state.macrocycle === 'DELOAD' ? 2.0 : 1.5;
        
        if (!acwrStatus.hasBaseline) {
             alertAcwr.textContent = "Gathering data. Need 14 days baseline.";
             alertAcwr.style.color = "var(--text-secondary)";
             if (alertAcwrIcon) alertAcwrIcon.textContent = "⚪";
        } else if (acwrStatus.ratio > 1.5) {
             alertAcwr.textContent = `DANGER ZONE! ACWR is ${acwrStatus.ratio.toFixed(2)}. Reduce volume and block impact progression.`;
             alertAcwr.style.color = "var(--accent)";
             if (alertAcwrIcon) alertAcwrIcon.textContent = "🔴";
        } else if (acwrStatus.ratio >= 1.3 || acwrStatus.ratio < 0.8) {
             alertAcwr.textContent = `Caution: ACWR is ${acwrStatus.ratio.toFixed(2)} (${acwrStatus.zone}). Adjust volume.`;
             alertAcwr.style.color = "var(--accent)";
             if (alertAcwrIcon) alertAcwrIcon.textContent = "ðŸŸ¡";
        } else {
             alertAcwr.textContent = `Load ratio is optimal (${acwrStatus.ratio.toFixed(2)}). Safe to progress.`;
             alertAcwr.style.color = "var(--text-secondary)";
             if (alertAcwrIcon) alertAcwrIcon.textContent = "🟢";
        }
    }

    // Alert 6: Thermal Strain Shield (WBGT)
    const alertWbgt = document.getElementById('alert-wbgt-msg');
    const alertWbgtNode = document.getElementById('alert-wbgt');
    const alertWbgtIcon = alertWbgtNode ? alertWbgtNode.querySelector('.icon') : null;
    if (alertWbgt) {
        const heat = calculateHeatRisk(today);
        let t = parseFloat(today.tempC);
        let rh = parseFloat(today.humidity);
        
        if (!isNaN(t) && !isNaN(rh)) {
            // Simplified WBGT Approximation: 0.567*T + 0.393*e + 3.94
            let e = (rh / 100) * 6.105 * Math.exp((17.27 * t) / (237.7 + t));
            let wbgt = 0.567 * t + 0.393 * e + 3.94;
            
            if (heat.severity !== 'green') {
                alertWbgt.textContent = `${heat.message} WBGT ${wbgt.toFixed(1)}°C.`;
                alertWbgt.style.color = "var(--accent)";
                if (alertWbgtIcon) alertWbgtIcon.textContent = "🔴";
            } else {
                alertWbgt.textContent = `Thermal strain low (WBGT ${wbgt.toFixed(1)}°C). Normal pacing.`;
                alertWbgt.style.color = "var(--text-secondary)";
                if (alertWbgtIcon) alertWbgtIcon.textContent = "🟢";
            }
        } else {
            alertWbgt.textContent = "Awaiting OpenWeatherMap sync...";
            alertWbgt.style.color = "var(--text-secondary)";
            if (alertWbgtIcon) alertWbgtIcon.textContent = "⚪";
        }
    }


    // Alert 7: Cognitive Overload
    const alertCog = document.getElementById('alert-cognitive-msg');
    const alertCogNode = document.getElementById('alert-cognitive');
    const alertCogIcon = alertCogNode ? alertCogNode.querySelector('.icon') : null;
    if (alertCog) {
        let cogAlert = checkCognitiveOverload();
        if (cogAlert) {
            alertCog.textContent = cogAlert.message;
            alertCog.style.color = "var(--accent)";
            if(alertCogIcon) alertCogIcon.textContent = "🔴";
        } else {
            alertCog.textContent = "Cognitive load within tolerance.";
            alertCog.style.color = "var(--text-secondary)";
            if(alertCogIcon) alertCogIcon.textContent = "🟢";
        }
    }

    // Alert 8: Metabolic Stall (Adaptation Velocity)
    const alertStall = document.getElementById('alert-stall-msg');
    const alertStallNode = document.getElementById('alert-stall');
    const alertStallIcon = alertStallNode ? alertStallNode.querySelector('.icon') : null;
    if (alertStall) {
        let stallAlert = checkMetabolicStall();
        if (stallAlert) {
            alertStall.textContent = stallAlert.message;
            alertStall.style.color = "var(--accent)";
            if(alertStallIcon) alertStallIcon.textContent = "🔴";
        } else {
            let velData = calculateAdaptationVelocity();
            if (velData.velocities.length > 0) {
                let lastVel = velData.velocities[velData.velocities.length - 1];
                alertStall.textContent = `Adaptation velocity: ${lastVel.velocity > 0 ? '+' : ''}${lastVel.velocity.toFixed(3)}%/day. Metabolism responsive.`;
            } else {
                alertStall.textContent = "Log body fat % to enable velocity tracking.";
            }
            alertStall.style.color = "var(--text-secondary)";
            if(alertStallIcon) alertStallIcon.textContent = "🟢";
        }
    }
    updateMilestones();
}

function updateMilestones() {
    let currentWeight = state.startWeight;
    let dates = Object.keys(state.logs).sort();
    for (let i = dates.length - 1; i >= 0; i--) {
        if (state.logs[dates[i]].weight) {
            currentWeight = parseFloat(state.logs[dates[i]].weight);
            break;
        }
    }

    const currentEl = document.getElementById('milestone-current-weight');
    const progressEl = document.getElementById('milestone-progress-bar');
    
    if (currentEl) currentEl.textContent = `Current: ${currentWeight.toFixed(1)} kg`;
    
    if (progressEl) {
        let totalDrop = state.startWeight - 95.0;
        let currentDrop = state.startWeight - currentWeight;
        let percentage = Math.max(0, Math.min(100, (currentDrop / totalDrop) * 100));
        progressEl.style.width = `${percentage}%`;
    }

    const items = document.querySelectorAll('.ml-item');
    items.forEach(item => {
        let target = parseFloat(item.dataset.target);
        if (currentWeight <= target) {
            item.classList.add('completed');
        } else {
            item.classList.remove('completed');
        }
    });
}

function calculateStreak() {
    let streak = 0;
    let d = new Date();
    let todayKey = d.toISOString().split('T')[0];
    if (!state.logs[todayKey] || !state.logs[todayKey].weight) d.setDate(d.getDate() - 1);
    for (let i = 0; i < 365; i++) {
        let key = d.toISOString().split('T')[0];
        if (state.logs[key] && state.logs[key].weight) {
            streak++; d.setDate(d.getDate() - 1);
        } else break;
    }
    return streak;
}



function calculateAdaptationVelocity() {
    const entries = Object.keys(state.logs)
        .map(key => ({ date: key, ...state.logs[key] }))
        .filter(d => d.bodyFatPct && !isNaN(parseFloat(d.bodyFatPct)))
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (entries.length < 7) return { velocities: [], stalled: false, avgAbsVelocity: 0 };

    const velocities = [];
    for (let i = 6; i < entries.length; i++) {
        const window = entries.slice(i - 6, i + 1);
        const x = window.map((_, idx) => idx);
        const y = window.map(e => parseFloat(e.bodyFatPct));

        const n = x.length;
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, idx) => sum + xi * y[idx], 0);
        const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

        velocities.push({
            date: window[window.length - 1].date,
            bodyFat: window[window.length - 1].bodyFatPct,
            velocity: slope
        });
    }

    // Detect stall: last 10 days velocity effectively zero while in deficit
    const last10 = velocities.slice(-10);
    const avgAbsVelocity = last10.length > 0 ? 
        last10.reduce((a, v) => a + Math.abs(v.velocity), 0) / last10.length : 0;

    const stalled = avgAbsVelocity < 0.02 && last10.length >= 10;

    return { velocities, stalled, avgAbsVelocity };
}


function checkMetabolicStall() {
    const { stalled, avgAbsVelocity } = calculateAdaptationVelocity();
    if (!stalled) return null;

    const today = state.logs[getTodayKey()];
    if (!today) return null;

    // Simple TDEE proxy: use state.kcalTarget or calculate from recent data
    let tdee = state.kcalTarget || 2000;
    const isDeficit = today.totalCals && parseFloat(today.totalCals) < tdee - 200;

    if (isDeficit) {
        return {
            type: 'REFEED_PROTOCOL',
            severity: 'high',
            message: `METABOLIC STALL: BF velocity flatlined at ${avgAbsVelocity.toFixed(3)}%/day for 10+ days in deficit. Execute 48h refeed: +400 kcal, carb focus 5-7g/kg. Reset leptin. Resume deficit Monday.`
        };
    }
    return null;
}

function checkCognitiveOverload() {
    const today = state.logs[getTodayKey()];
    if (!today) return null;

    let dates = Object.keys(state.logs).sort();
    let yesterdayKey = dates[dates.indexOf(getTodayKey()) - 1];
    if (!yesterdayKey) return null;
    let yesterday = state.logs[yesterdayKey];
    if (!yesterday) return null;

    let cogJump = (parseInt(today.workStress) || 1) - (parseInt(yesterday.workStress) || 1);
    let physicalLoad = parseFloat(today.stravaEffort) || parseFloat(today.manualCardioDuration) || 0;

    if (cogJump >= 2 && physicalLoad > 60) {
        return {
            type: 'CNS_OVERLOAD',
            severity: 'high',
            message: `COGNITIVE SPIKE: Work stress jumped ${cogJump} pts. CNS recovery compromised. Drop RPE by 1 or shorten session.`
        };
    }
    return null;
}

function updateLogForm() {
    const dateInput = document.getElementById('log-date');
    if (dateInput) dateInput.value = getTodayKey();

    const today = state.logs[getTodayKey()];
    if(!today) return;
    
    safeSetVal('log-weight', today.weight);
    safeSetVal('log-cns-fatigue', today.cnsFatigue);
    safeSetVal('log-work-stress', today.workStress || 1);
    safeSetVal('log-bodyfat', today.bodyFatPct);
    safeSetVal('log-sleep-hrs', today.sleepHrs);
    safeSetVal('log-sleep-qual', today.sleepQual);
    safeSetVal('log-hrv', today.hrv);
    safeSetVal('log-resting-hr', today.restingHR);
    safeSetVal('log-soreness', today.soreness0to10);
    safeSetVal('log-stress', today.stress0to10);
    safeSetVal('log-motivation', today.motivation0to10);
    safeSetVal('log-caffeine-cutoff', today.caffeineCutoffMet);
    safeSetVal('log-meal-cutoff', today.mealCutoffMet);
    safeSetVal('log-shutdown', today.shutdownProtocolCompleted);
    
    safeSetVal('log-injury-loc', today.injuryLoc);
    safeSetVal('log-injury-pain', today.injuryPain);
    safeSetVal('log-pain-side', today.painSide);
    safeSetVal('log-pain-type', today.painType);
    safeSetVal('log-pain-timing', today.painTiming);
    safeSetVal('log-pain-action', today.painActionTaken);
    safeSetVal('log-pain-notes', today.painNotes);
    
    safeSetVal('log-caffeine', today.caffeineMg);
    safeSetVal('log-energy-window', today.peakEnergyWindow);
    safeSetVal('log-nsaids', today.nsaidsTaken);
    safeSetVal('log-bio-test', today.bioTest);
    safeSetVal('log-bio-cortisol', today.bioCortisol);
    safeSetVal('log-bio-hscrp', today.bioHscrp);
    safeSetVal('log-bio-ferritin', today.bioFerritin);
    
    safeSetVal('log-inbody-date', today.inbodyDate);
    safeSetVal('log-inbody-weight', today.inbodyWeight);
    safeSetVal('log-inbody-smm', today.inbodySmm);
    safeSetVal('log-inbody-bf', today.inbodyBf);
    safeSetVal('log-inbody-tbw', today.inbodyTbw);

    safeSetVal('log-temp', today.tempC);
    safeSetVal('log-humidity', today.humidity);
    
    safeSetVal('log-gym-type', today.gymType || 'NONE');
    safeSetVal('log-gym-start', today.gymStart);
    safeSetVal('log-prehab', today.prehabDone);
    safeSetVal('log-warmup', today.warmupDone);
    safeSetVal('log-tendon-isometrics', today.tendonIsometrics);
    safeSetVal('log-hsr', today.hsrDone);
    safeSetVal('log-mobility', today.mobilityDone);
    safeSetVal('log-squat-knee-cave', today.squatKneeCave);
    safeSetVal('log-hinge-back-rounds', today.hingeBackRounds);
    safeSetVal('log-shoulder-pain-flag', today.shoulderPainFlag);
    safeSetVal('log-poor-brace', today.poorBrace);
    safeSetVal('log-overstriding', today.overstriding);
    safeSetVal('log-low-cadence', today.lowCadence);
    safeSetVal('log-swim-shoulder-mechanics', today.swimShoulderMechanics);
    safeSetVal('log-movement-notes', today.movementNotes);
    safeSetVal('log-lift-name', today.liftName);
    safeSetVal('log-lift-weight', today.liftWeight);
    safeSetVal('log-lift-sets', today.liftSets);
    safeSetVal('log-lift-reps', today.liftReps);
    safeSetVal('log-lift-rest', today.liftRestSeconds);
    safeSetVal('log-lift-rir', today.liftRir);
    safeSetVal('log-muscle-target', today.muscleTarget);
    safeSetVal('log-muscle-sets', today.muscleSets);
    
    safeSetVal('log-cardio-type', today.cardioType || 'NONE');
    safeSetVal('log-cardio-start', today.cardioStart);
    safeSetVal('log-cardio-duration', today.manualCardioDuration);
    safeSetVal('log-cardio-rpe', today.manualCardioRpe);
    safeSetVal('log-zone1', today.zone1Min);
    safeSetVal('log-zone2', today.zone2Min);
    safeSetVal('log-zone3', today.zone3Min);
    safeSetVal('log-zone4', today.zone4Min);
    safeSetVal('log-zone5', today.zone5Min);
    
    safeSetVal('log-pre-workout-carbs', today.preWorkoutCarbsG);
    safeSetVal('log-intra-carbs', today.intraCarbs);
    safeSetVal('log-pre-sodium', today.preSodium);
    safeSetVal('log-post-refeed', today.postRefeed);
    safeSetVal('log-post-protein', today.postWorkoutProteinG);
    safeSetVal('log-post-carbs', today.postWorkoutCarbsG);
    
    safeSetVal('log-cals', today.totalCals);
    safeSetVal('log-pro', today.proG);
    safeSetVal('log-carbs', today.carbsG);
    safeSetVal('log-fats', today.fatsG);
    safeSetVal('log-fiber', today.fiberG);
    safeSetVal('log-sugar', today.sugarG);
    safeSetVal('log-water', today.waterLiters);
    safeSetVal('log-sodium', today.sodiumMg);
    renderSupplementChecklist();
}

function bindLogForm() {
    const btnSave = document.getElementById('btn-save-log');
    if(btnSave) {
        btnSave.addEventListener('click', () => {
            const todayStr = getTodayKey();
            let log = state.logs[todayStr] || getEmptyLog();
            
            log.weight = safeGetVal('log-weight');
            log.cnsFatigue = safeGetVal('log-cns-fatigue');
            log.workStress = parseInt(safeGetVal('log-work-stress', 1));
            log.bodyFatPct = safeGetVal('log-bodyfat');
            log.sleepHrs = safeGetVal('log-sleep-hrs');
            log.sleepQual = safeGetVal('log-sleep-qual');
            log.hrv = safeGetVal('log-hrv');
            log.restingHR = safeGetVal('log-resting-hr');
            log.soreness0to10 = safeGetVal('log-soreness');
            log.stress0to10 = safeGetVal('log-stress');
            log.motivation0to10 = safeGetVal('log-motivation');
            log.caffeineCutoffMet = safeGetVal('log-caffeine-cutoff', false);
            log.mealCutoffMet = safeGetVal('log-meal-cutoff', false);
            log.shutdownProtocolCompleted = safeGetVal('log-shutdown', false);
            
            log.injuryLoc = safeGetVal('log-injury-loc');
            log.injuryPain = safeGetVal('log-injury-pain');
            log.painSide = safeGetVal('log-pain-side', 'center');
            log.painType = safeGetVal('log-pain-type', 'unknown');
            log.painTiming = safeGetVal('log-pain-timing', 'during');
            log.painActionTaken = safeGetVal('log-pain-action');
            log.painNotes = safeGetVal('log-pain-notes');
            
            log.caffeineMg = safeGetVal('log-caffeine');
            log.peakEnergyWindow = safeGetVal('log-energy-window');
            log.nsaidsTaken = safeGetVal('log-nsaids', false);
            log.bioTest = safeGetVal('log-bio-test');
            log.bioCortisol = safeGetVal('log-bio-cortisol');
            log.bioHscrp = safeGetVal('log-bio-hscrp');
            log.bioFerritin = safeGetVal('log-bio-ferritin');
            
            log.inbodyDate = safeGetVal('log-inbody-date');
            log.inbodyWeight = safeGetVal('log-inbody-weight');
            log.inbodySmm = safeGetVal('log-inbody-smm');
            log.inbodyBf = safeGetVal('log-inbody-bf');
            log.inbodyTbw = safeGetVal('log-inbody-tbw');

            log.tempC = safeGetVal('log-temp');
            log.humidity = safeGetVal('log-humidity');
            
            log.gymType = safeGetVal('log-gym-type');
            log.gymStart = safeGetVal('log-gym-start');
            log.prehabDone = safeGetVal('log-prehab', false);
            log.warmupDone = safeGetVal('log-warmup', false);
            log.tendonIsometrics = safeGetVal('log-tendon-isometrics', false);
            log.hsrDone = safeGetVal('log-hsr', false);
            log.mobilityDone = safeGetVal('log-mobility', false);
            log.squatKneeCave = safeGetVal('log-squat-knee-cave', false);
            log.hingeBackRounds = safeGetVal('log-hinge-back-rounds', false);
            log.shoulderPainFlag = safeGetVal('log-shoulder-pain-flag', false);
            log.poorBrace = safeGetVal('log-poor-brace', false);
            log.overstriding = safeGetVal('log-overstriding', false);
            log.lowCadence = safeGetVal('log-low-cadence', false);
            log.swimShoulderMechanics = safeGetVal('log-swim-shoulder-mechanics', false);
            log.movementNotes = safeGetVal('log-movement-notes');
            log.liftName = safeGetVal('log-lift-name');
            log.liftWeight = safeGetVal('log-lift-weight');
            log.liftSets = safeGetVal('log-lift-sets');
            log.liftReps = safeGetVal('log-lift-reps');
            log.liftRestSeconds = safeGetVal('log-lift-rest');
            log.liftRir = safeGetVal('log-lift-rir');
            log.muscleTarget = safeGetVal('log-muscle-target');
            log.muscleSets = safeGetVal('log-muscle-sets');
            
            log.cardioType = safeGetVal('log-cardio-type');
            log.cardioStart = safeGetVal('log-cardio-start');
            log.manualCardioDuration = safeGetVal('log-cardio-duration');
            log.manualCardioRpe = safeGetVal('log-cardio-rpe');
            log.zone1Min = safeGetVal('log-zone1');
            log.zone2Min = safeGetVal('log-zone2');
            log.zone3Min = safeGetVal('log-zone3');
            log.zone4Min = safeGetVal('log-zone4');
            log.zone5Min = safeGetVal('log-zone5');
            
            log.preWorkoutCarbsG = safeGetVal('log-pre-workout-carbs');
            log.intraCarbs = safeGetVal('log-intra-carbs');
            log.preSodium = safeGetVal('log-pre-sodium');
            log.postRefeed = safeGetVal('log-post-refeed', false);
            log.postWorkoutProteinG = safeGetVal('log-post-protein');
            log.postWorkoutCarbsG = safeGetVal('log-post-carbs');
            
            log.totalCals = safeGetVal('log-cals');
            log.proG = safeGetVal('log-pro');
            log.carbsG = safeGetVal('log-carbs');
            log.fatsG = safeGetVal('log-fats');
            log.fiberG = safeGetVal('log-fiber');
            log.sugarG = safeGetVal('log-sugar');
            log.waterLiters = safeGetVal('log-water');
            log.sodiumMg = safeGetVal('log-sodium');
            
            const existing = state.logs[todayStr] || {};
            log.supplements = existing.supplements || [];
            log.wellness = existing.wellness || null;
            log.hormone = existing.hormone || null;
            log.customMetrics = existing.customMetrics || {};
            
            state.logs[todayStr] = log;
            saveData();
            showToast("Log Saved successfully!");
        });
    }

    const btnSuppAdd = document.getElementById('btn-supp-add');
    if (btnSuppAdd) btnSuppAdd.addEventListener('click', addSupplementFromUI);
    const suppInput = document.getElementById('supp-quick-add');
    if (suppInput) suppInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addSupplementFromUI(); });

    const btnAddGear = document.getElementById('btn-add-gear');
    if (btnAddGear) btnAddGear.addEventListener('click', addGearFromUI);
    const btnAddRace = document.getElementById('btn-add-race');
    if (btnAddRace) btnAddRace.addEventListener('click', addRaceFromUI);

    const btnAddCm = document.getElementById('btn-add-cm');
    if (btnAddCm) btnAddCm.addEventListener('click', addCustomMetricFromUI);
    const btnSaveWellness = document.getElementById('btn-save-wellness');
    if (btnSaveWellness) btnSaveWellness.addEventListener('click', saveWellnessCheckIn);
    const btnSaveHormone = document.getElementById('btn-save-hormone');
    if (btnSaveHormone) btnSaveHormone.addEventListener('click', saveHormoneEntry);
    const btnUploadPhoto = document.getElementById('btn-upload-photo');
    if (btnUploadPhoto) btnUploadPhoto.addEventListener('click', uploadPhoto);
    const btnCreateTp = document.getElementById('btn-create-tp');
    if (btnCreateTp) btnCreateTp.addEventListener('click', createTrainingPlan);

    renderGearList();
    renderRaceList();
    renderCustomMetrics();
    renderPhotoTimeline();
    renderTrainingPlans();
    populateRaceDropdown();
    restoreWellnessForm();
    restoreHormoneForm();
}


function getGutTrainingBaseline() {
    const sessions = Object.values(state.logs)
        .filter(d => parseFloat(d.manualCardioDuration) >= 60 && parseFloat(d.intraCarbs) > 0)
        .slice(-10);

    if (sessions.length === 0) return null;

    const rates = sessions.map(d => parseFloat(d.intraCarbs) / (parseFloat(d.manualCardioDuration) / 60));
    const avgPerHour = rates.reduce((a, b) => a + b, 0) / rates.length;

    return {
        avgPerHour: avgPerHour,
        sessions: sessions.length,
        maxPerHour: Math.max(...rates)
    };
}

function runFuelingSim() {
    const duration = parseFloat(document.getElementById('sim-duration').value) || 4;
    const rpe = parseInt(document.getElementById('sim-rpe').value) || 6;
    const weight = parseFloat(document.getElementById('sim-weight').value) || 78;
    const temp = parseFloat(document.getElementById('sim-temp').value) || 20;

    // Sports science carb oxidation rates
    let carbRate;
    if (rpe <= 4) carbRate = 45;
    else if (rpe <= 6) carbRate = 60;
    else if (rpe <= 8) carbRate = 90;
    else carbRate = 100;

    // Heat adjustment
    const heatStress = temp > 30 ? 0.85 : temp > 25 ? 0.95 : 1.0;
    const adjustedRate = Math.floor(carbRate * heatStress);

    const totalCarbs = Math.round(adjustedRate * duration);
    const sodiumPerHour = temp > 28 ? 1000 : 700;
    const totalSodium = sodiumPerHour * duration;
    const fluidPerHour = temp > 28 ? 750 : 500;

    // Gut limit check
    const gut = getGutTrainingBaseline();
    let gutWarning = '';
    let gutClass = 'gut-safe';

    if (gut) {
        if (adjustedRate > gut.maxPerHour * 1.2) {
            gutWarning = `⚠️ GUT RISK: You train at ${gut.maxPerHour.toFixed(0)}g/hr max. ${adjustedRate}g/hr is a 20%+ jump. GI distress likely. Practice this rate on 3 long sessions before race day.`;
            gutClass = 'gut-warning';
        } else if (adjustedRate > gut.avgPerHour * 1.1) {
            gutWarning = `⚡ GUT CHALLENGE: Above your ${gut.avgPerHour.toFixed(0)}g/hr training average. Doable, but practice first.`;
        } else {
            gutWarning = `✅ GUT READY: ${adjustedRate}g/hr is within your training tolerance.`;
        }
    } else {
        gutWarning = `ℹ️ No intra-carb data found. Log fueling on your next 60+ min session to unlock gut-limit analysis.`;
    }

    document.getElementById('simResults').innerHTML = `
        <h3>${duration}h Event @ RPE ${rpe} | ${temp}°C</h3>
        <div class="sim-result-row ${gutClass}">
            <span>Carbohydrate Rate</span>
            <span class="sim-result-value">${adjustedRate}g/hr</span>
        </div>
        <div class="sim-result-row">
            <span>Total Race Fuel</span>
            <span class="sim-result-value">${totalCarbs}g</span>
        </div>
        <div class="sim-result-row">
            <span>Sodium Target</span>
            <span class="sim-result-value">${totalSodium}mg</span>
        </div>
        <div class="sim-result-row">
            <span>Fluid Target</span>
            <span class="sim-result-value">${fluidPerHour * duration}ml</span>
        </div>
        <div class="sim-result-row" style="border-left-color:#6496ff;">
            <span>Pre-Race Carb Load</span>
            <span class="sim-result-value">${Math.round(weight * 8)}g</span>
        </div>
        <p style="margin-top:10px;font-size:0.85rem;color:#aaa;">${gutWarning}</p>
        <p style="font-size:0.8rem;color:#666;margin-top:6px;">
            Protocol: Start fueling at minute 20. Never try anything new on race day. 
            Train your gut at ${adjustedRate}g/hr on your next 2+ hour session.
        </p>
    `;

    // Update history display
    const gutDisplay = document.getElementById('gutHistoryDisplay');
    if (gut) {
        gutDisplay.innerHTML = `
            <p style="margin-bottom:10px;">Based on <strong>${gut.sessions}</strong> long sessions:</p>
            <div style="display:flex;gap:16px;margin-top:10px;flex-wrap:wrap;">
                <div class="stat-box">Avg: <strong>${gut.avgPerHour.toFixed(1)}g/hr</strong></div>
                <div class="stat-box">Max: <strong>${gut.maxPerHour.toFixed(1)}g/hr</strong></div>
            </div>
            <p style="margin-top:12px;font-size:0.8rem;color:#666;line-height:1.4;">
                Your "gut limit" is the highest rate you can process without GI distress. 
                Race day should be 10-15% below this limit.
            </p>
        `;
    } else {
        gutDisplay.innerHTML = `<p style="color:#666;">Log <code>intraCarbs</code> during your next 60+ minute cardio session to calibrate.</p>`;
    }
}

// --- SEEDER ---
function bindSeeder() {
}

// --- CHARTS ---
let charts = {};

// --- INJURY LOC MAP FOR HEATMAP ---

function updateJointHeatmap() {
    // Reset all
    document.querySelectorAll('.joint-point').forEach(el => {
        el.style.backgroundColor = 'transparent';
        el.style.boxShadow = 'none';
        el.style.borderColor = '#555';
        el.style.borderWidth = '2px';
        el.removeAttribute('title');
    });

    // Aggregate max pain per location over last 14 days
    const painMap = {};
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);

    Object.keys(state.logs).forEach(key => {
        const day = state.logs[key];
        if (!day.injuryLoc || !day.injuryPain || parseFloat(day.injuryPain) <= 0) return;
        const dayDate = new Date(key);
        if (dayDate < cutoff) return;

        const loc = day.injuryLoc.trim();
        const pain = parseFloat(day.injuryPain);
        if (!painMap[loc] || pain > painMap[loc]) {
            painMap[loc] = pain;
        }
    });

    // Paint the map
    Object.entries(painMap).forEach(([loc, pain]) => {
        const jointId = injuryLocMap[loc];
        if (!jointId) return;
        const el = document.getElementById(jointId);
        if (!el) return;

        let color, opacity;
        if (pain >= 8) { color = '#ff0000'; opacity = 0.9; }
        else if (pain >= 5) { color = '#ff6600'; opacity = 0.7; }
        else if (pain >= 1) { color = '#ffcc00'; opacity = 0.5; }
        else return;

        el.style.backgroundColor = color;
        el.style.borderColor = color;
        el.style.boxShadow = `0 0 10px ${color}`;
        el.setAttribute('title', `${loc}: ${pain}/10 pain (14-day max)`);
    });
}

const injuryLocMap = {
    'Left Shoulder': 'joint-l-shoulder', 'Right Shoulder': 'joint-r-shoulder',
    'Left Elbow': 'joint-l-elbow', 'Right Elbow': 'joint-r-elbow',
    'Left Wrist': 'joint-l-wrist', 'Right Wrist': 'joint-r-wrist',
    'Left Hip': 'joint-l-hip', 'Right Hip': 'joint-r-hip',
    'Left Knee': 'joint-l-knee', 'Right Knee': 'joint-r-knee',
    'Left Patella': 'joint-l-knee', 'Right Patella': 'joint-r-knee',
    'Left Ankle': 'joint-l-ankle', 'Right Ankle': 'joint-r-ankle',
    'Left Foot': 'joint-l-foot', 'Right Foot': 'joint-r-foot',
    'Left Heel': 'joint-l-foot', 'Right Heel': 'joint-r-foot',
    'Left Achilles': 'joint-l-achilles', 'Right Achilles': 'joint-r-achilles',
    'Lower Back': 'joint-lower-back', 'Upper Back': 'joint-upper-back',
    'Spine': 'joint-lower-back', 'Neck': 'joint-neck', 'Head': 'joint-head'
};

// Interactive Heatmap Click Delegation
document.addEventListener('click', (e) => {
    const jointPoint = e.target.closest('.joint-point');
    if (jointPoint) {
        const loc = jointPoint.dataset.loc;
        if (loc) {
            // Navigate to the log view
            document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
            const logBtn = document.querySelector('.nav-item[data-target="view-log"]');
            if (logBtn) logBtn.classList.add('active');
            
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            const logView = document.getElementById('view-log');
            if (logView) logView.classList.add('active');
            
            // Set location value
            safeSetVal('log-injury-loc', loc);
            
            // Default to pain level 5 if none set to make it obvious
            const painInput = document.getElementById('log-injury-pain');
            if (painInput && (!painInput.value || painInput.value === "0")) {
                painInput.value = "5";
                const painVal = document.getElementById('pain-val');
                if (painVal) painVal.textContent = "5";
            }
            
            // Scroll up to the injury section
            const injurySection = document.getElementById('log-injury-loc');
            if (injurySection) {
                injurySection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    }
});

function renderAllCharts() {
    if(typeof Chart === 'undefined') return;
    
    // Global Chart.js Aesthetics
    Chart.defaults.font.family = "'Outfit', sans-serif";
    Chart.defaults.color = '#a0aabf';
    Chart.defaults.scale.grid.color = 'rgba(255, 255, 255, 0.03)';
    Chart.defaults.elements.line.tension = 0.4;
    Chart.defaults.elements.bar.borderRadius = 6;
    Chart.defaults.elements.point.radius = 3;
    Chart.defaults.elements.point.hoverRadius = 6;
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(13, 14, 18, 0.9)';
    Chart.defaults.plugins.tooltip.titleColor = '#fff';
    Chart.defaults.plugins.tooltip.padding = 12;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.borderColor = 'rgba(255, 255, 255, 0.1)';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    
    let dates = Object.keys(state.logs).sort();
    if(dates.length === 0) {
        // Show empty state
        const canvases = ['trendChart', 'radarChart', 'hrvChart', 'injuryChart', 'macroChart', 'modalityChart', 'liftChart', 'decouplingChart', 'tdeeChart', 'volumePainChart', 'inbodyChart', 'mentalVsPhysicalChart', 'adaptationVelocityChart'];
        canvases.forEach(id => {
            const canvas = document.getElementById(id);
            if(canvas) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.font = "14px 'Outfit'";
                ctx.fillStyle = "#a0aabf";
                ctx.textAlign = "center";
                ctx.fillText("No data available yet.", canvas.width/2, canvas.height/2);
            }
        });
        return;
    }
    
    let last30 = dates.slice(-30);
    let last7 = dates.slice(-7);
    
    let volumeData = [], painData = [], cnsData = [], cardioData = [], rpeData = [], hrvData = [];
    let calsData = [], proData = [], carbsData = [], fatsData = [];
    let paceData = [], hrData = [], weightData = [], stravaEffortData = [];
    
    let cardioTypes = { 'WALK_JOG': 0, 'CYCLING': 0, 'ROWING': 0, 'SWIMMING': 0, 'RUNNING': 0 };
    let gymTypes = { 'DAY_A': 0, 'DAY_B': 0, 'TENDON': 0, 'NONE': 0 };
    
    last30.forEach(d => {
        let log = state.logs[d];
        volumeData.push(parseFloat(log.muscleSets) || 0);
        painData.push(parseFloat(log.injuryPain) || 0);
        cnsData.push(parseFloat(log.cnsFatigue) || 0);
        cardioData.push(parseFloat(log.manualCardioDuration) || 0);
        rpeData.push(parseFloat(log.manualCardioRpe || log.aerobicRpe) || 0);
        hrvData.push(parseFloat(log.hrv) || 0);
        calsData.push(parseFloat(log.totalCals) || 0);
        proData.push(parseFloat(log.proG) || 0);
        carbsData.push(parseFloat(log.carbsG) || 0);
        fatsData.push(parseFloat(log.fatsG) || 0);
        paceData.push(parseFloat(log.stravaPace) || 0);
        hrData.push(parseFloat(log.avgHR || log.stravaHr) || 0);
        weightData.push(parseFloat(log.weight) || 0);
        stravaEffortData.push(parseFloat(log.stravaEffort) || 0);
        
        if (log.cardioType && cardioTypes[log.cardioType] !== undefined) cardioTypes[log.cardioType]++;
        if (log.gymType && gymTypes[log.gymType] !== undefined) gymTypes[log.gymType]++;
    });

    // We render them progressively using requestAnimationFrame to avoid iOS Safari GPU composite layer crashing
    const chartRenderTasks = [
        () => {
            // 1. Trend Chart (Fatigue vs Load)
            renderChart('trendChart', 'line', {
                labels: last7,
                datasets: [
                    { label: 'CNS Fatigue (1-5)', data: cnsData.slice(-7), borderColor: '#ff7864', backgroundColor: 'rgba(255,120,100,0.1)', yAxisID: 'y', tension: 0.4 },
                    { label: 'Strava Effort', data: stravaEffortData.slice(-7), borderColor: '#6496ff', borderDash: [5, 5], yAxisID: 'y1', tension: 0.4 }
                ]
            }, { scales: { y: { type: 'linear', display: true, position: 'left', min: 0, max: 5 }, y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } } } });
        },
        () => {
            // 2. Radar Chart
            let avgPain = painData.slice(-1)[0] || 0;
            let avgFatigue = cnsData.slice(-1)[0] || 0;
            let avgRpe = rpeData.slice(-1)[0] || 0;
            renderChart('radarChart', 'radar', {
                labels: ['Joint Pain', 'CNS Fatigue', 'Aerobic RPE'],
                datasets: [{
                    label: 'Current State',
                    data: [avgPain, avgFatigue, avgRpe],
                    backgroundColor: 'rgba(100,150,255,0.2)',
                    borderColor: '#6496ff',
                    pointBackgroundColor: '#ff7864'
                }]
            }, { scales: { r: { angleLines: { color: 'rgba(255,255,255,0.1)' }, grid: { color: 'rgba(255,255,255,0.1)' }, pointLabels: { color: '#a0aabf' }, suggestedMin: 0, suggestedMax: 5 } } });
        },
        () => {
            // 3. HRV vs Load
            renderChart('hrvChart', 'line', {
                labels: last30,
                datasets: [
                    { label: 'HRV (ms)', data: hrvData, borderColor: '#20c997', backgroundColor: 'rgba(32,201,151,0.1)', fill: true, yAxisID: 'y' },
                    { label: 'Cardio Vol (m)', data: cardioData, borderColor: '#ffc107', type: 'bar', yAxisID: 'y1', opacity: 0.3 }
                ]
            }, { scales: { y: { type: 'linear', display: true, position: 'left' }, y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } } } });
        },
        () => {
            // 4. Injury Tracker
            renderChart('injuryChart', 'line', {
                labels: last30,
                datasets: [{ label: 'Pain Level (1-10)', data: painData, borderColor: '#dc3545', backgroundColor: 'rgba(220,53,69,0.1)', fill: true, stepped: true }]
            }, { scales: { y: { type: 'linear', min: 0, max: 10 } } });
        },
        () => {
            // 5. Macro Stack
            renderChart('macroChart', 'bar', {
                labels: last7,
                datasets: [
                    { label: 'Carbs', data: carbsData.slice(-7), backgroundColor: '#6496ff' },
                    { label: 'Protein', data: proData.slice(-7), backgroundColor: '#20c997' },
                    { label: 'Fats', data: fatsData.slice(-7), backgroundColor: '#ffc107' }
                ]
            }, { scales: { x: { stacked: true }, y: { stacked: true } } });
        },
        () => {
            // 6. Modality Pie
            let modCounts = {};
            const modLabels = { WALK_JOG: 'Walk/Jog', CYCLING: 'Cycling', ROWING: 'Rowing', SWIMMING: 'Swimming', RUNNING: 'Running' };
            const modColors = { WALK_JOG: '#6496ff', CYCLING: '#ffc107', ROWING: '#ff7864', SWIMMING: '#36d7b7', RUNNING: '#e056fd' };
            last30.forEach(d => {
                let t = state.logs[d].cardioType;
                if (t && t !== 'NONE' && modLabels[t]) modCounts[t] = (modCounts[t] || 0) + 1;
            });
            let modKeys = Object.keys(modCounts);
            if (modKeys.length === 0) modKeys = ['No Data'];
            renderChart('modalityChart', 'doughnut', {
                labels: modKeys.map(k => modLabels[k] || k),
                datasets: [{ data: modKeys.map(k => modCounts[k] || 1), backgroundColor: modKeys.map(k => modColors[k] || '#444'), borderWidth: 0 }]
            });
        },
        () => {
            // 7. Lift Chart (Strength Progression)
            let liftTrend = [];
            let liftLabels = [];
            for(let i = dates.length - 1; i >= 0; i--) {
                let w = parseFloat(state.logs[dates[i]].liftWeight);
                if (w > 0) {
                    liftTrend.unshift(w);
                    liftLabels.unshift(dates[i]);
                    if (liftTrend.length >= 10) break;
                }
            }
            if(liftTrend.length === 0) {
                 liftTrend = [0]; liftLabels = ['No Data'];
            }
            renderChart('liftChart', 'line', {
                labels: liftLabels,
                datasets: [{ label: 'Primary Lift Weight (kg)', data: liftTrend, borderColor: '#ffc107', tension: 0.2, pointBackgroundColor: '#ffc107', pointRadius: 4 }]
            }, { scales: { y: { display: true, grid: { color: 'rgba(255, 255, 255, 0.05)' } } } });
        },
        () => {
            // 8. Decoupling (Scatter)
            let scatterDecoupling = [];
            for(let j = 0; j < last30.length; j++) {
                if(paceData[j] > 0 && hrData[j] > 0) {
                    scatterDecoupling.push({x: paceData[j], y: hrData[j]});
                }
            }
            renderChart('decouplingChart', 'scatter', {
                datasets: [{ label: 'Pace vs HR', data: scatterDecoupling, backgroundColor: '#6496ff' }]
            }, { scales: { x: { type: 'linear', position: 'bottom', title: { display: true, text: 'Pace (min/km)', color: '#a0aabf' } }, y: { title: { display: true, text: 'Heart Rate', color: '#a0aabf' } } } });
        },
        () => {
            // 9. Metabolic (TDEE)
            let tdeeData = [];
            // Calculate 14-day rolling TDEE
            // TDEE = Avg 14d Intake - (Avg 14d Weight Change * 7700 / 14)
            for(let j = 0; j < last30.length; j++) {
                if(j < 13) { tdeeData.push(null); continue; }
                let sliceCals = calsData.slice(j - 13, j + 1);
                let avgCals = sliceCals.reduce((a, b) => a + b, 0) / 14;
                
                // Weight trend: weight[j] - weight[j-13]
                let startW = weightData[j - 13];
                let endW = weightData[j];
                let weightDelta = endW - startW;
                
                let tdee = avgCals - (weightDelta * 7700 / 14);
                tdeeData.push(Math.round(tdee));
            }

            renderChart('tdeeChart', 'line', {
                labels: last30,
                datasets: [
                    { label: 'Morning Weight (kg)', data: weightData, borderColor: '#ffc107', yAxisID: 'y', tension: 0.4 },
                    { label: 'True TDEE (kcal)', data: tdeeData, borderColor: '#20c997', yAxisID: 'y1', tension: 0.4 }
                ]
            }, { scales: { y: { type: 'linear', display: true, position: 'left' }, y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } } } });
        },
        () => {
            // 10. Volume vs Pain (Scatter)
            let scatterVolumePain = [];
            for(let j = 0; j < last30.length; j++) {
                if(volumeData[j] > 0 || painData[j] > 0) {
                    scatterVolumePain.push({x: volumeData[j], y: painData[j]});
                }
            }
            renderChart('volumePainChart', 'scatter', {
                datasets: [{ label: 'Muscle Sets vs Joint Pain', data: scatterVolumePain, backgroundColor: '#dc3545' }]
            }, { scales: { x: { type: 'linear', position: 'bottom', title: { display: true, text: 'Muscle Sets', color: '#a0aabf' } }, y: { title: { display: true, text: 'Pain (0-10)', color: '#a0aabf' }, min: 0, max: 10 } } });
        },
        () => {
            // 11. Mental vs Physical Stress (Scatter)
            let mentalData = [];
            for(let j = 0; j < last30.length; j++) {
                let log = state.logs[last30[j]];
                let ws = parseInt(log.workStress);
                let effort = parseFloat(log.stravaEffort) || (parseFloat(log.manualCardioDuration) * 2) || 0;
                if(ws > 0 && effort > 0) {
                    mentalData.push({x: ws, y: effort, date: last30[j]});
                }
            }
            renderChart('mentalVsPhysicalChart', 'scatter', {
                datasets: [{
                    label: 'Mental Load vs Physical Strain',
                    data: mentalData,
                    backgroundColor: (ctx) => {
                        const val = ctx.raw?.x;
                        return val >= 4 ? 'rgba(255, 0, 0, 0.85)' : 
                               val >= 3 ? 'rgba(255, 120, 0, 0.75)' : 'rgba(100, 150, 255, 0.65)';
                    },
                    pointRadius: 7,
                    pointHoverRadius: 11
                }]
            }, { 
                scales: { 
                    x: { title: { display: true, text: 'Work Stress (1-5)', color: '#a0aabf' }, min: 0.5, max: 5.5, ticks: { stepSize: 1, color: '#a0aabf' } },
                    y: { title: { display: true, text: 'Training Load (TSS/Effort)', color: '#a0aabf' } }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `Stress: ${ctx.raw.x}/5 | Load: ${ctx.raw.y} | ${ctx.raw.date}`
                        }
                    }
                }
            });
        },
        () => {
            // 13. Adaptation Velocity Chart
            const velData = calculateAdaptationVelocity();
            if (velData.velocities.length > 0) {
                renderChart('adaptationVelocityChart', 'line', {
                    labels: velData.velocities.map(v => v.date),
                    datasets: [
                        { label: 'Body Fat %', data: velData.velocities.map(v => v.bodyFat), borderColor: '#6496ff', backgroundColor: 'rgba(100,150,255,0.1)', fill: true, yAxisID: 'y', tension: 0.4, spanGaps: true },
                        { label: 'Velocity (%/day)', data: velData.velocities.map(v => v.velocity), borderColor: '#ff7864', borderDash: [6, 4], pointRadius: 0, yAxisID: 'y1', tension: 0.4 }
                    ]
                }, { 
                    scales: { 
                        y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Body Fat %', color: '#a0aabf' } },
                        y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Velocity (%/day)', color: '#a0aabf' }, grid: { drawOnChartArea: false } }
                    },
                    interaction: { mode: 'index', intersect: false }
                });
            } else {
                const canvas = document.getElementById('adaptationVelocityChart');
                if(canvas) {
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.font = "14px 'Outfit'";
                    ctx.fillStyle = "#a0aabf";
                    ctx.textAlign = "center";
                    ctx.fillText("Log body fat % to enable velocity tracking.", canvas.width/2, canvas.height/2);
                }
            }
        },
        () => {
            // 14. InBody Composition Chart (Sparse Data)
            let inbodyDates = [];
            let inbodyWeight = [];
            let inbodyBf = [];
            let inbodySmm = [];
            
            dates.forEach(d => {
                const log = state.logs[d];
                if(log.inbodyWeight || log.inbodyBf || log.inbodySmm) {
                    inbodyDates.push(d);
                    inbodyWeight.push(log.inbodyWeight || null);
                    inbodyBf.push(log.inbodyBf || null);
                    inbodySmm.push(log.inbodySmm || null);
                }
            });

            if(inbodyDates.length > 0) {
                renderChart('inbodyChart', 'line', {
                    labels: inbodyDates,
                    datasets: [
                        { label: 'Weight (kg)', data: inbodyWeight, borderColor: '#ffc107', yAxisID: 'yWeight', tension: 0.3, spanGaps: true },
                        { label: 'Body Fat %', data: inbodyBf, borderColor: '#dc3545', yAxisID: 'yPerc', tension: 0.3, spanGaps: true },
                        { label: 'Muscle Mass %', data: inbodySmm, borderColor: '#20c997', yAxisID: 'yPerc', tension: 0.3, spanGaps: true }
                    ]
                }, { 
                    scales: { 
                        yWeight: { type: 'linear', display: true, position: 'left', title: {display: true, text: 'kg'} }, 
                        yPerc: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, title: {display: true, text: '%'} } 
                    } 
                });
            } else {
                renderChart('inbodyChart', 'line', { labels: [], datasets: [] });
            }
        }
    ];

    let i = 0;
    function renderNext() {
        if(i < chartRenderTasks.length) {
            chartRenderTasks[i]();
            i++;
            requestAnimationFrame(renderNext);
        } else {
            // After all charts render, update heatmap
            updateJointHeatmap();
        }
    }
    renderNext();
}

function renderChart(id, type, data, options = {}) {
    const canvas = document.getElementById(id);
    if(!canvas) return;
    if(charts[id]) charts[id].destroy();
    
    const ctx = canvas.getContext('2d');
    
    // Inject dynamic gradients for a premium feel
    if (data.datasets && (type === 'line' || type === 'bar')) {
        data.datasets.forEach(ds => {
            if (ds.backgroundColor && typeof ds.backgroundColor === 'string' && ds.backgroundColor.startsWith('rgba(') && (ds.fill || type === 'bar')) {
                let grad = ctx.createLinearGradient(0, 0, 0, canvas.height || 200);
                let baseColor = ds.backgroundColor.replace(/[^,]+(?=\))/, '0.8');
                let fadeColor = ds.backgroundColor.replace(/[^,]+(?=\))/, '0.05');
                grad.addColorStop(0, baseColor);
                grad.addColorStop(1, fadeColor);
                ds.backgroundColor = grad;
            } else if (ds.backgroundColor === '#6496ff' || ds.backgroundColor === '#ff7864' || ds.backgroundColor === '#20c997') {
                let grad = ctx.createLinearGradient(0, 0, 0, canvas.height || 200);
                let rgb = ds.backgroundColor === '#6496ff' ? '100, 150, 255' : (ds.backgroundColor === '#ff7864' ? '255, 120, 100' : '32, 201, 151');
                grad.addColorStop(0, `rgba(${rgb}, 0.8)`);
                grad.addColorStop(1, `rgba(${rgb}, 0.1)`);
                ds.backgroundColor = grad;
            }
        });
    }
    
    const defaultOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { labels: { color: '#a0aabf', usePointStyle: true, boxWidth: 8 } }
        },
        scales: {
            x: { ticks: { color: '#a0aabf' }, grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false } },
            y: { ticks: { color: '#a0aabf' }, grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false } }
        },
        interaction: { mode: 'index', intersect: false }
    };
    
    // Merge options dynamically (Radar doesn't use x/y scales)
    let mergedOptions = type === 'radar' || type === 'doughnut' || type === 'pie' ? 
                        { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#a0aabf' } } }, ...options } : 
                        { ...defaultOptions };
                        
    if (type !== 'radar' && type !== 'doughnut' && type !== 'pie') {
        if(options.scales) mergedOptions.scales = { ...defaultOptions.scales, ...options.scales };
        if(options.plugins) mergedOptions.plugins = { ...defaultOptions.plugins, ...options.plugins };
    }
    
    charts[id] = new Chart(canvas, { type, data, options: mergedOptions });
}

function updateDataDump() {
    const dump = document.getElementById('json-dump');
    const picker = document.getElementById('history-date-picker');
    if(!dump || !picker) return;
    
    if(!picker.value) picker.value = getTodayKey();
    
    picker.addEventListener('change', () => {
        dump.textContent = JSON.stringify(state.logs[picker.value] || {}, null, 2);
    });
    dump.textContent = JSON.stringify(state.logs[picker.value] || {}, null, 2);
}

// --- UTILS ---
window._toastTimeout = null;
function showToast(msg) {
    const t = document.getElementById('toast');
    if(!t) return;
    t.textContent = msg;
    t.classList.add('show');
    if(window._toastTimeout) clearTimeout(window._toastTimeout);
    window._toastTimeout = setTimeout(() => {
        t.classList.remove('show');
    }, 3000);
}

// --- LIBRARY TAB INTERACTIVE LOGIC ---
function bindLibrary() {
    const searchInput = document.getElementById('library-search');
    const categoryPills = document.querySelectorAll('#library-pills .pill');
    const conceptCards = document.querySelectorAll('.concept-card');

    // 1. Text Search Filter
    if (searchInput) {
        searchInput.addEventListener('input', filterLibrary);
    }

    // 2. Category Pill Filter
    categoryPills.forEach(pill => {
        pill.addEventListener('click', () => {
            categoryPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            filterLibrary();
        });
    });

    // 3. Card Expand Accordion
    conceptCards.forEach(card => {
        card.addEventListener('click', (e) => {
            // Prevent close/open toggle when interacting with tables or links inside the details
            if (e.target.closest('table') || e.target.closest('a') || e.target.closest('button')) {
                return;
            }
            
            const isExpanded = card.classList.contains('expanded');
            card.classList.toggle('expanded');
            
            // Smooth scroll into view
            if (!isExpanded) {
                setTimeout(() => {
                    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 200);
            }
        });
    });

    function filterLibrary() {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const activePill = document.querySelector('#library-pills .pill.active');
        const category = activePill ? activePill.dataset.category : 'all';

        conceptCards.forEach(card => {
            const cardCategory = card.dataset.category;
            const textContent = card.textContent.toLowerCase();
            const matchesSearch = !query || textContent.includes(query);
            const matchesCategory = category === 'all' || cardCategory === category;

            if (matchesSearch && matchesCategory) {
                card.classList.remove('hidden');
            } else {
                card.classList.add('hidden');
                card.classList.remove('expanded');
            }
        });
    }
}
