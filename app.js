/* Momen Fitness V3 - PWA Logic */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MILESTONE_TARGETS = [115, 110, 105, 100, 95];

// Meal plan removed, static in UI

const quotes = [
    "One more day closer to free diving and kitesurfing stamina.",
    "Consistency over intensity. Show up.",
    "Small steps lead to massive results.",
    "Your future self will thank you for today.",
    "Focus on the process, protect the muscle.",
    "Phase 1 is about building the engine. Keep walking."
];

let state = {
    isAlexandria: true,
    startWeight: 119.6,
    kcalTarget: 2000,
    proteinTarget: 165,
    logs: {} // structured mapping { "YYYY-MM-DD": { weight, cardio, diet, protein, strength, type, swim, notes, water, bf, muscle } }
};

function getTodayKey() { return new Date().toISOString().split('T')[0]; }

// Setup & Initialization
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initServiceWorker();
    loadData();
    setDateAndQuote();
    bindSettings();
    bindLogForm();
    bindDashboardQuickActions();
    bindExport();
    bindExport();
    
    // Initial Render
    refreshAllViews();
});

function loadData() {
    const saved = localStorage.getItem('fitnessPWA_state');
    if(saved) {
        try { 
            const data = JSON.parse(saved); 
            state = { ...state, ...data };
        } catch(e) { console.error(e) }
    }
    
    // Ensure today's log exists
    let today = getTodayKey();
    if(!state.logs[today]) {
        state.logs[today] = { weight: '', cardio: '', diet: false, protein: false, strength: false, type: 'gym', swim: false, notes: '', water: 0, bf: '', muscle: '' };
    }
    
    applyMode();
}

function saveData() {
    localStorage.setItem('fitnessPWA_state', JSON.stringify(state));
    refreshAllViews();
}

function applyMode() {
    if(state.isAlexandria) {
        document.body.classList.remove('mode-cairo');
        document.body.classList.add('mode-alexandria');
    } else {
        document.body.classList.remove('mode-alexandria');
        document.body.classList.add('mode-cairo');
    }
}

function setDateAndQuote() {
    const dateEl = document.getElementById('header-date');
    const today = new Date();
    dateEl.textContent = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    
    const quoteEl = document.getElementById('motivational-quote');
    const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
    quoteEl.textContent = `"${quotes[dayOfYear % quotes.length]}"`;
}

// Global Refresh logic
function refreshAllViews() {
    updateDashboard();
    updateLogForm();
    updateProgressTab();
}

function getCurrentWeight() {
    let dates = Object.keys(state.logs).sort().reverse();
    for(let d of dates) {
        if(state.logs[d].weight && state.logs[d].weight > 0) return parseFloat(state.logs[d].weight);
    }
    return parseFloat(state.startWeight); // fallback
}

function getCurrentBF() {
    let dates = Object.keys(state.logs).sort().reverse();
    for(let d of dates) {
        if(state.logs[d].bf && state.logs[d].bf > 0) return parseFloat(state.logs[d].bf);
    }
    return 37.5; // fallback
}

function getCurrentMuscle() {
    let dates = Object.keys(state.logs).sort().reverse();
    for(let d of dates) {
        if(state.logs[d].muscle && state.logs[d].muscle > 0) return parseFloat(state.logs[d].muscle);
    }
    return 24.1; // fallback
}

// Dashboard Logic
function updateDashboard() {
    const today = state.logs[getTodayKey()];
    
    // Checklist
    document.getElementById('dash-walk').textContent = today.cardio >= 5 || today.cardio >= 45 ? '✅' : '❌'; // walk >= 5km or cycle >= 45min
    document.getElementById('dash-diet').textContent = today.diet ? '✅' : '❌';
    document.getElementById('dash-protein').textContent = today.protein ? '✅' : '❌';
    document.getElementById('dash-strength').textContent = today.strength ? '✅' : '❌';
    document.getElementById('dash-swim').textContent = today.swim ? '✅' : '❌';
    
    // Water
    document.getElementById('water-label').textContent = `${(today.water || 0).toFixed(1)} L`;
    const waterLevel = today.water || 0;
    document.querySelectorAll('.cup').forEach(cup => {
        let v = parseFloat(cup.dataset.vol);
        if(v <= waterLevel) cup.classList.add('active');
        else cup.classList.remove('active');
    });

    // Milestone logic
    const w = getCurrentWeight();
    document.getElementById('current-weight-display').textContent = `${w.toFixed(1)} kg`;
    const bf = getCurrentBF();
    document.getElementById('current-bf-display').textContent = `${bf.toFixed(1)}%`;
    
    let nextMilestone = 90;
    for(let i=0; i<MILESTONE_TARGETS.length; i++) {
        if(w > MILESTONE_TARGETS[i]) {
            nextMilestone = MILESTONE_TARGETS[i];
            break;
        }
    }
    document.getElementById('next-milestone-display').textContent = `${nextMilestone} kg`;
    
    let prevMilestone = state.startWeight;
    for(let i=MILESTONE_TARGETS.length-1; i>=0; i--) {
        if(w <= MILESTONE_TARGETS[i]) {
            prevMilestone = MILESTONE_TARGETS[i];
        }
    }
    if(state.startWeight <= w) prevMilestone = state.startWeight + 5; // safety

    let progress = 0;
    if(prevMilestone > nextMilestone) {
        progress = ((prevMilestone - w) / (prevMilestone - nextMilestone)) * 100;
    }
    progress = Math.max(0, Math.min(100, progress));
    
    document.getElementById('milestone-progress-bar').style.width = `${progress}%`;
    document.getElementById('milestone-text').textContent = `${Math.round(progress)}% there! Next stop: ${nextMilestone}kg.`;

    // Phase update
    if(w <= 110) {
        document.getElementById('current-phase-label').textContent = "Phase 2";
        document.getElementById('current-phase-desc').textContent = "Mix in strength training. Retain cardio base.";
    } else {
        document.getElementById('current-phase-label').textContent = "Phase 1";
        document.getElementById('current-phase-desc').textContent = "Cardio base (walk/cycle daily until 110kg).";
    }

    // Streak logic (days with diet = true AND cardio logged)
    let currentStreak = 0;
    let dates = Object.keys(state.logs).sort().reverse(); // newest first
    for(let d of dates) {
        if(state.logs[d].diet && state.logs[d].cardio > 0) currentStreak++;
        else break;
    }
    document.getElementById('streak-count').textContent = currentStreak;
}

function bindDashboardQuickActions() {
    const qw = document.getElementById('quick-weight');
    document.getElementById('btn-quick-weight').addEventListener('click', () => {
        if(qw.value) {
            state.logs[getTodayKey()].weight = parseFloat(qw.value);
            saveData();
            showToast('Weight logged');
            qw.value = '';
        }
    });

    document.querySelectorAll('.cup').forEach(cup => {
        cup.addEventListener('click', (e) => {
            let v = parseFloat(e.currentTarget.dataset.vol);
            state.logs[getTodayKey()].water = v;
            saveData();
            showToast('Water logged');
        });
    });
}

// Log Form
function updateLogForm() {
    const today = state.logs[getTodayKey()];
    document.getElementById('log-date').value = getTodayKey();
    
    const dayName = WEEKDAYS[new Date().getDay()];
    document.getElementById('log-assigned-meal').textContent = `Daily High-Volume Plan`;
    
    document.getElementById('log-weight').value = today.weight || '';
    document.getElementById('log-cardio').value = today.cardio || '';
    document.getElementById('log-bf').value = today.bf || '';
    document.getElementById('log-muscle').value = today.muscle || '';
    document.getElementById('log-diet').checked = today.diet;
    document.getElementById('log-protein').checked = today.protein;
    document.getElementById('log-strength').checked = today.strength;
    document.getElementById('log-strength-type').value = today.type || 'gym';
    document.getElementById('log-swim').checked = today.swim;
    document.getElementById('log-notes').value = today.notes || '';
    
    const sOpts = document.getElementById('strength-options');
    if(today.strength) sOpts.classList.remove('hidden');
    else sOpts.classList.add('hidden');
}

function bindLogForm() {
    const sTog = document.getElementById('log-strength');
    sTog.addEventListener('change', () => {
        if(sTog.checked) document.getElementById('strength-options').classList.remove('hidden');
        else document.getElementById('strength-options').classList.add('hidden');
    });

    document.getElementById('btn-save-log').addEventListener('click', () => {
        const todayStr = getTodayKey();
        state.logs[todayStr] = {
            ...state.logs[todayStr], // preserve water
            weight: document.getElementById('log-weight').value,
            cardio: document.getElementById('log-cardio').value,
            bf: document.getElementById('log-bf').value,
            muscle: document.getElementById('log-muscle').value,
            diet: document.getElementById('log-diet').checked,
            protein: document.getElementById('log-protein').checked,
            strength: document.getElementById('log-strength').checked,
            type: document.getElementById('log-strength-type').value,
            swim: document.getElementById('log-swim').checked,
            notes: document.getElementById('log-notes').value,
        };
        saveData();
        showToast("Daily Log Saved!");
        window.scrollTo(0,0);
    });
}

// Progress Tab
function updateProgressTab() {
    // last 7 days calculation
    const keyDates = [];
    let d = new Date();
    for(let i=0; i<7; i++) {
        keyDates.push(d.toISOString().split('T')[0]);
        d.setDate(d.getDate() - 1);
    }
    
    let dietCount=0, cardioCount=0, validDays=0, strengthCount=0;
    
    let firstWeight = null;
    let lastWeight = null;
    
    // Reverse for chronologic display in chart
    keyDates.slice().reverse().forEach(dateStr => {
        const log = state.logs[dateStr];
        if(log) {
            if(log.diet) dietCount++;
            if(log.cardio && log.cardio > 0) cardioCount++;
            if(log.strength) strengthCount++;
            if(log.weight && log.weight > 0) {
                if(!firstWeight) firstWeight = parseFloat(log.weight);
                lastWeight = parseFloat(log.weight);
            }
            validDays++;
        }
    });
    
    document.getElementById('stat-diet-days').textContent = `${dietCount}/7`;
    document.getElementById('stat-cardio-days').textContent = `${cardioCount}/7`;
    const comp = validDays > 0 ? ((dietCount + cardioCount) / (validDays*2)) * 100 : 0;
    document.getElementById('stat-compliance').textContent = `${Math.round(comp)}%`;
    
    let avgLoss = 0;
    if(firstWeight && lastWeight && validDays > 1) {
        avgLoss = firstWeight - lastWeight; 
    }
    document.getElementById('stat-avg-loss').textContent = `${avgLoss.toFixed(1)} kg`;
    document.getElementById('stat-strength-days').textContent = `${strengthCount}/7`;
    document.getElementById('stat-muscle').textContent = `${getCurrentMuscle()}%`;
    
    // Milestones Path Setup
    let html = '';
    const cw = getCurrentWeight();
    MILESTONE_TARGETS.forEach(target => {
        let isPast = cw <= target;
        html += `<div class="ml-item ${isPast ? 'completed' : ''}">
            <div class="ml-text">${target} kg</div>
            <div class="ml-sub">${isPast ? 'Achieved 🏆' : 'Pending Target'}</div>
        </div>`;
    });
    document.getElementById('milestones-path').innerHTML = html;
}

// Meals Tab
function renderMeals() {
    let container = document.getElementById('meals-list');
    let html = '';
    WEEKDAYS.forEach((day, index) => {
        // Start week from Monday logically ?
        const meals = MEAL_PLAN[day];
        const isToday = new Date().getDay() === index;
        
        html += `<div class="plan-day ${isToday ? 'active' : ''}">
            <div class="plan-header" onclick="this.parentElement.classList.toggle('active')">
                <span>${day} ${isToday ? '(Today)' : ''}</span>
                <span>👇</span>
            </div>
            <div class="plan-body">
                <ul>
                    <li><span>Br</span> ${meals.br}</li>
                    <li><span>Lu</span> ${meals.lu}</li>
                    <li><span>Sn</span> ${meals.sn}</li>
                </ul>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

// Settings
function bindSettings() {
    const smode = document.getElementById('settings-mode');
    const skcal = document.getElementById('settings-kcal');
    const spro = document.getElementById('settings-protein');
    const swght = document.getElementById('settings-start-weight');
    
    smode.checked = state.isAlexandria;
    skcal.value = state.kcalTarget;
    spro.value = state.proteinTarget;
    swght.value = state.startWeight;

    document.getElementById('btn-save-settings').addEventListener('click', () => {
        state.isAlexandria = smode.checked;
        state.kcalTarget = parseFloat(skcal.value) || 2000;
        state.proteinTarget = parseFloat(spro.value) || 140;
        state.startWeight = parseFloat(swght.value) || 120;
        
        saveData();
        applyMode();
        showToast("Settings Updated");
    });
    
    document.getElementById('btn-reset-data').addEventListener('click', () => {
        if(confirm("Are you sure you want to delete ALL logged data?")) {
            state.logs = {};
            saveData();
            showToast("Data Reset!");
            setTimeout(() => window.location.reload(), 500);
        }
    });
}

function bindExport() {
    const btn = document.getElementById('btn-export');
    if(!btn) return;
    btn.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
        const anchor = document.createElement('a');
        anchor.setAttribute("href", dataStr);
        anchor.setAttribute("download", `momen-fitness-${getTodayKey()}.json`);
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
        showToast("Data Exported!");
    });
}

// Tooling & Generic
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            const targetId = item.getAttribute('data-target');
            views.forEach(view => {
                view.classList.remove('active');
                if (view.id === targetId) view.classList.add('active');
            });
            window.scrollTo(0,0);
        });
    });
}

function initServiceWorker() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
}

window.showToast = function(message) {
    const toast = document.getElementById('toast');
    if(!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    if(window._toastTimeout) clearTimeout(window._toastTimeout);
    window._toastTimeout = setTimeout(() => toast.classList.add('hidden'), 2500);
}
