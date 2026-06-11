import { test, expect } from '@playwright/test';

// =============================================
// UNIT-LEVEL: Verify page loads & core elements
// =============================================
test.describe('Unit: Page Structure', () => {
  test('should load the PWA and show the title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/N=1 Performance Lab/i);
  });

  test('should have all 7 navigation tabs', async ({ page }) => {
    await page.goto('/');
    const navItems = page.locator('.nav-item');
    await expect(navItems).toHaveCount(7);
  });

  test('should show Dashboard as default active view', async ({ page }) => {
    await page.goto('/');
    const dashboard = page.locator('#view-dashboard');
    await expect(dashboard).toHaveClass(/active/);
  });

  test('should have Supabase SDK loaded', async ({ page }) => {
    await page.goto('/');
    const supabaseLoaded = await page.evaluate(() => typeof window.supabase !== 'undefined');
    expect(supabaseLoaded).toBe(true);
  });
});

// =============================================
// INTEGRATION: Navigation between tabs
// =============================================
test.describe('Integration: Tab Navigation', () => {
  test('should navigate to Daily Log tab', async ({ page }) => {
    await page.goto('/');
    await page.click('.nav-item[data-target="view-log"]');
    const logView = page.locator('#view-log');
    await expect(logView).toHaveClass(/active/);
  });

  test('should navigate to Progress tab and show charts area', async ({ page }) => {
    await page.goto('/');
    await page.click('.nav-item[data-target="view-progress"]');
    const progressView = page.locator('#view-progress');
    await expect(progressView).toHaveClass(/active/);
    // Sub-pills should be visible
    const pills = page.locator('#view-progress .sub-nav-pills .pill');
    await expect(pills.first()).toBeVisible();
  });

  test('should navigate to Strava tab and show activity inbox', async ({ page }) => {
    await page.goto('/');
    await page.click('.nav-item[data-target="view-strava"]');
    const stravaView = page.locator('#view-strava');
    await expect(stravaView).toHaveClass(/active/);
    await expect(page.locator('#strava-inbox-list')).toBeVisible();
  });

  test('should save Strava inbox subjective prompts into the daily log', async ({ page }) => {
    const activityId = 'strava:phase2-test-run';

    await page.addInitScript((id) => {
      const dateKey = new Date().toISOString().split('T')[0];
      const startLocal = `${dateKey}T06:30:00`;
      localStorage.setItem('n1_pwa_state', JSON.stringify({
        logs: {},
        importedActivities: {
          [id]: {
            id,
            source: 'strava',
            externalActivityId: 'phase2-test-run',
            name: 'Phase 2 Test Run',
            type: 'run_walk',
            modality: 'Run',
            cardioType: 'RUNNING',
            impactLevel: 'high',
            dateKey,
            startLocal,
            durationMin: 42,
            distanceKm: 6.2,
            avgHR: 151,
            trainingLoad: 55,
            rpe: '',
            painRegion: '',
            painScore: '',
            fueled: '',
            intraCarbs: '',
            notes: '',
            raw: { id: 'phase2-test-run', sport_type: 'Run', start_date_local: startLocal }
          }
        },
        stravaSync: {
          lastManualSyncAt: startLocal,
          lastPassiveSyncAt: '',
          lastImportedCount: 1
        }
      }));
    }, activityId);

    await page.goto('/');
    await page.click('.nav-item[data-target="view-strava"]');

    const card = page.locator(`[data-activity-id="${activityId}"]`);
    await expect(card).toBeVisible();
    await card.locator('[data-field="rpe"]').fill('7');
    await card.locator('[data-field="painRegion"]').fill('Left knee');
    await card.locator('[data-field="painScore"]').fill('2');
    await card.locator('[data-field="fueled"]').selectOption('yes');
    await card.locator('[data-field="notes"]').fill('Felt controlled');
    await card.locator('[data-save-activity]').click();

    await expect(card.locator('.activity-status')).toHaveText('Complete');
    await expect(page.locator('#strava-pending-count')).toHaveText('0');

    const saved = await page.evaluate((id) => {
      const savedState = JSON.parse(localStorage.getItem('n1_pwa_state'));
      const dateKey = new Date().toISOString().split('T')[0];
      return {
        activity: savedState.importedActivities[id],
        log: savedState.logs[dateKey]
      };
    }, activityId);

    expect(saved.activity.rpe).toBe('7');
    expect(saved.activity.painRegion).toBe('Left knee');
    expect(saved.activity.painScore).toBe('2');
    expect(saved.activity.fueled).toBe('yes');
    expect(saved.log.stravaActivityId).toBe('phase2-test-run');
    expect(saved.log.manualCardioRpe).toBe('7');
    expect(saved.log.injuryPain).toBe('2');
  });

  test('should navigate to Library tab', async ({ page }) => {
    await page.goto('/');
    await page.click('.nav-item[data-target="view-library"]');
    const libraryView = page.locator('#view-library');
    await expect(libraryView).toHaveClass(/active/);
  });

  test('should navigate to Settings tab', async ({ page }) => {
    await page.goto('/');
    await page.click('.nav-item[data-target="view-settings"]');
    const settingsView = page.locator('#view-settings');
    await expect(settingsView).toHaveClass(/active/);
  });
});

// =============================================
// INTEGRATION: Daily Log Form
// =============================================
test.describe('Integration: Daily Log Form', () => {
  test('should have weight input field', async ({ page }) => {
    await page.goto('/');
    await page.click('.nav-item[data-target="view-log"]');
    const weightInput = page.locator('#log-weight');
    await expect(weightInput).toBeVisible();
  });

  test('should have CNS Fatigue input field', async ({ page }) => {
    await page.goto('/');
    await page.click('.nav-item[data-target="view-log"]');
    const cnsInput = page.locator('#log-cns-fatigue');
    await expect(cnsInput).toBeVisible();
  });

  test('should have InBody Metrics section', async ({ page }) => {
    await page.goto('/');
    await page.click('.nav-item[data-target="view-log"]');
    const inbodyWeight = page.locator('#log-inbody-weight');
    await expect(inbodyWeight).toBeVisible();
  });

  test('should have Biomarker Vault section', async ({ page }) => {
    await page.goto('/');
    await page.click('.nav-item[data-target="view-log"]');
    // Biomarker vault is hidden behind a toggle, click the header to expand
    await page.click('h2:has-text("Quarterly Biomarker Vault")');
    const bioTest = page.locator('#log-bio-test');
    await expect(bioTest).toBeVisible();
  });

  test('should have Save button', async ({ page }) => {
    await page.goto('/');
    await page.click('.nav-item[data-target="view-log"]');
    const saveBtn = page.locator('#btn-save-log');
    await expect(saveBtn).toBeVisible();
  });

  test('should save expanded Athlete OS manual fields', async ({ page }) => {
    await page.goto('/');
    await page.click('.nav-item[data-target="view-log"]');

    await page.fill('#log-resting-hr', '58');
    await page.fill('#log-injury-loc', 'Left Knee');
    await page.fill('#log-injury-pain', '4');
    await page.selectOption('#log-pain-side', 'left');
    await page.selectOption('#log-pain-type', 'tendon');
    await page.selectOption('#log-pain-timing', 'next_morning');
    await page.fill('#log-pain-action', 'Swapped run for bike');
    await page.check('#log-squat-knee-cave');
    await page.check('#log-overstriding');
    await page.fill('#log-zone2', '40');
    await page.fill('#log-zone3', '15');
    await page.fill('#log-pre-workout-carbs', '30');
    await page.fill('#log-post-protein', '35');
    await page.fill('#log-post-carbs', '45');
    await page.fill('#log-fiber', '32');
    await page.fill('#log-sugar', '28');
    await page.click('#btn-save-log');

    const saved = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('n1_pwa_state'));
      const today = new Date().toISOString().split('T')[0];
      return state.logs[today];
    });

    expect(saved.restingHR).toBe('58');
    expect(saved.painType).toBe('tendon');
    expect(saved.painSide).toBe('left');
    expect(saved.painTiming).toBe('next_morning');
    expect(saved.painActionTaken).toBe('Swapped run for bike');
    expect(saved.squatKneeCave).toBe(true);
    expect(saved.overstriding).toBe(true);
    expect(saved.zone2Min).toBe('40');
    expect(saved.zone3Min).toBe('15');
    expect(saved.preWorkoutCarbsG).toBe('30');
    expect(saved.postWorkoutProteinG).toBe('35');
    expect(saved.postWorkoutCarbsG).toBe('45');
    expect(saved.fiberG).toBe('32');
    expect(saved.sugarG).toBe('28');
  });
});

// =============================================
// INTEGRATION: Chart Sub-Navigation (Progress Tab)
// =============================================
test.describe('Integration: Progress Chart Groups', () => {
  test('Recovery sub-tab should be active by default', async ({ page }) => {
    await page.goto('/');
    await page.click('.nav-item[data-target="view-progress"]');
    const recoveryGroup = page.locator('#chart-recovery');
    await expect(recoveryGroup).toHaveClass(/active/);
  });

  test('should switch to Performance sub-tab', async ({ page }) => {
    await page.goto('/');
    await page.click('.nav-item[data-target="view-progress"]');
    await page.click('.pill[data-group="chart-performance"]');
    const perfGroup = page.locator('#chart-performance');
    await expect(perfGroup).toHaveClass(/active/);
  });

  test('should switch to Metabolism sub-tab and show InBody chart canvas', async ({ page }) => {
    await page.goto('/');
    await page.click('.nav-item[data-target="view-progress"]');
    await page.click('.pill[data-group="chart-metabolism"]');
    const metaGroup = page.locator('#chart-metabolism');
    await expect(metaGroup).toHaveClass(/active/);
    const inbodyCanvas = page.locator('#inbodyChart');
    await expect(inbodyCanvas).toBeVisible();
  });
});

// =============================================
// E2E: InBody Data Flow (Supabase -> Chart)
// =============================================
test.describe('E2E: InBody Data Loaded from Supabase', () => {
  test('InBody chart should render with data points', async ({ page }) => {
    await page.goto('/');
    // Wait for Supabase data to load
    await page.waitForTimeout(3000);
    // Navigate to Metabolism tab
    await page.click('.nav-item[data-target="view-progress"]');
    await page.click('.pill[data-group="chart-metabolism"]');
    await page.waitForTimeout(1000);

    // Check that Chart.js rendered the InBody chart (canvas should have dimensions)
    const chartRendered = await page.evaluate(() => {
      const canvas = document.getElementById('inbodyChart');
      if (!canvas) return false;
      // Chart.js writes to the canvas, making width/height > 0
      return canvas.width > 0 && canvas.height > 0;
    });
    expect(chartRendered).toBe(true);
  });

  test('state.logs should contain InBody data for April 7', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    const inbodyData = await page.evaluate(() => {
      const saved = localStorage.getItem('n1_pwa_state');
      if (!saved) return null;
      const state = JSON.parse(saved);
      return state.logs['2026-04-07'];
    });

    expect(inbodyData).not.toBeNull();
    expect(inbodyData.inbodyWeight).toBe(119.6);
    expect(inbodyData.inbodyBf).toBe(37.5);
    expect(inbodyData.inbodySmm).toBe(24.1);
  });

  test('state.logs should contain InBody data for June 1', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    const inbodyData = await page.evaluate(() => {
      const saved = localStorage.getItem('n1_pwa_state');
      if (!saved) return null;
      const state = JSON.parse(saved);
      return state.logs['2026-06-01'];
    });

    expect(inbodyData).not.toBeNull();
    expect(inbodyData.inbodyWeight).toBe(115.5);
    expect(inbodyData.inbodyBf).toBe(30.8);
    expect(inbodyData.inbodySmm).toBe(27.4);
  });
});

// =============================================
// E2E: Save and Persist Data
// =============================================
test.describe('E2E: Save Flow', () => {
  test('should save weight entry and persist in localStorage', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    await page.click('.nav-item[data-target="view-log"]');

    // Enter weight
    await page.fill('#log-weight', '115.2');
    // Click save
    await page.click('#btn-save-log');
    await page.waitForTimeout(1000);

    // Verify it persisted
    const savedWeight = await page.evaluate(() => {
      const saved = localStorage.getItem('n1_pwa_state');
      if (!saved) return null;
      const state = JSON.parse(saved);
      const today = new Date().toISOString().split('T')[0];
      return state.logs[today]?.weight;
    });

    expect(savedWeight).toBe('115.2');
  });
});

// =============================================
// E2E: Dashboard Alert Cards
// =============================================
test.describe('E2E: Dashboard Components', () => {
  test('should show macrocycle pills on dashboard', async ({ page }) => {
    await page.goto('/');
    const pills = page.locator('#view-dashboard .pill');
    const count = await pills.count();
    expect(count).toBeGreaterThanOrEqual(4); // Hypertrophy, Strength, Endurance, Deload
  });

  test('should show motivational quote', async ({ page }) => {
    await page.goto('/');
    const quote = page.locator('.quote-text');
    await expect(quote).toBeVisible();
    const text = await quote.textContent();
    expect(text.length).toBeGreaterThan(5);
  });

  test('should have lab seeder button', async ({ page }) => {
    await page.goto('/');
    const seeder = page.locator('#btn-seed-data');
    await expect(seeder).toBeVisible();
  });

  test('macrocycle pills should update global state and UI', async ({ page }) => {
    await page.goto('/');
    
    // Click DELOAD
    const deloadPill = page.locator('#cockpit-macrocycle-pills .pill[data-cycle="DELOAD"]');
    await deloadPill.click();

    // Verify UI updated
    await expect(deloadPill).toHaveClass(/active/);

    // Verify localStorage updated
    const savedCycle = await page.evaluate(() => {
      const saved = localStorage.getItem('n1_pwa_state');
      if (!saved) return null;
      const state = JSON.parse(saved);
      return state.macrocycle;
    });

    expect(savedCycle).toBe('DELOAD');
  });

  test('Athlete OS should show alert ledger and phase gate for risky Phase 1 running day', async ({ page }) => {
    await page.addInitScript(() => {
      const today = new Date().toISOString().split('T')[0];
      localStorage.setItem('n1_pwa_state', JSON.stringify({
        macrocycle: 'STRENGTH',
        logs: {
          [today]: {
            weight: '116',
            cardioType: 'RUNNING',
            manualCardioDuration: '45',
            manualCardioRpe: '6',
            injuryLoc: 'Left Knee',
            injuryPain: '4',
            painType: 'tendon',
            squatKneeCave: true,
            overstriding: true,
            totalCals: '1600',
            proG: '120',
            sleepHrs: '5.5',
            soreness0to10: '7',
            motivation0to10: '3'
          }
        }
      }));
    });

    await page.goto('/');

    await expect(page.locator('#os-status-pill')).toHaveText('RED');
    await expect(page.locator('#os-alert-ledger')).toContainText('Running Shield');
    await expect(page.locator('#os-alert-ledger')).toContainText('Movement Quality');
    await expect(page.locator('#os-phase-gate-text')).toContainText('Stay in Phase 1');
    await expect(page.locator('#os-minimum-dose-text')).toContainText('Recovery dose');
  });
});

// =============================================
// E2E: Historical Log Viewer
// =============================================
test.describe('E2E: Historical Log Viewer', () => {
  test('should load historical data when date is selected', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);
    await page.click('.nav-item[data-target="view-progress"]');

    const datePicker = page.locator('#history-date-picker');
    await datePicker.fill('2026-04-07');
    await datePicker.dispatchEvent('change');
    await page.waitForTimeout(500);

    const jsonDump = page.locator('#json-dump');
    const text = await jsonDump.textContent();
    expect(text).toContain('inbodyWeight');
  });
});

// =============================================
// UNIT: Hash-based Routing
// =============================================
test.describe('Unit: Hash Routing', () => {
  test('should navigate to log tab via #log hash', async ({ page }) => {
    await page.goto('/#log');
    await page.waitForTimeout(1000);
    const logView = page.locator('#view-log');
    await expect(logView).toHaveClass(/active/);
  });

  test('should navigate to settings tab via #settings hash', async ({ page }) => {
    await page.goto('/#settings');
    await page.waitForTimeout(1000);
    const settingsView = page.locator('#view-settings');
    await expect(settingsView).toHaveClass(/active/);
  });

  test('should update hash when clicking a nav tab', async ({ page }) => {
    await page.goto('/');
    await page.click('.nav-item[data-target="view-log"]');
    await page.waitForTimeout(500);
    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toBe('#log');
  });

  test('should navigate via browser back after tab clicks', async ({ page }) => {
    await page.goto('/');
    await page.click('.nav-item[data-target="view-log"]');
    await page.waitForTimeout(500);
    await page.click('.nav-item[data-target="view-settings"]');
    await page.waitForTimeout(500);
    await page.goBack();
    await page.waitForTimeout(500);
    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toBe('#log');
  });
});

// =============================================
// INTEGRATION: Auth Overlay
// =============================================
test.describe('Integration: Auth Gate', () => {
  test('should show auth overlay on fresh load', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('n1_guest_mode');
      localStorage.removeItem('n1_user_id');
    });
    await page.goto('/');
    const overlay = page.locator('#auth-overlay');
    await expect(overlay).toBeVisible();
  });

  test('should bypass auth overlay in guest mode', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('n1_guest_mode', 'true');
      localStorage.setItem('n1_user_id', '00000000-0000-0000-0000-000000000001');
    });
    await page.goto('/');
    await page.waitForTimeout(2000);
    const overlay = page.locator('#auth-overlay');
    const visible = await overlay.isVisible();
    expect(visible).toBe(false);
  });
});

// =============================================
// INTEGRATION: Form Validation
// =============================================
test.describe('Integration: Form Validation', () => {
  test('should reject weight below 30 kg', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    await page.click('.nav-item[data-target="view-log"]');
    await page.fill('#log-weight', '5');
    await page.click('#btn-save-log');
    const toastText = await page.locator('.toast').textContent().catch(() => '');
    expect(toastText).toContain('Weight');
  });

  test('should reject weight above 300 kg', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    await page.click('.nav-item[data-target="view-log"]');
    await page.fill('#log-weight', '500');
    await page.click('#btn-save-log');
    const toastText = await page.locator('.toast').textContent().catch(() => '');
    expect(toastText).toContain('Weight');
  });

  test('should accept valid weight', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    await page.click('.nav-item[data-target="view-log"]');
    await page.fill('#log-weight', '115');
    await page.click('#btn-save-log');
    await page.waitForTimeout(1000);
    const saved = await page.evaluate(() => {
      const raw = localStorage.getItem('n1_pwa_state');
      if (!raw) return null;
      const s = JSON.parse(raw);
      const today = new Date().toISOString().split('T')[0];
      return s.logs[today]?.weight;
    });
    expect(saved).toBe('115');
  });
});

// =============================================
// E2E: Export Functions
// =============================================
test.describe('E2E: Export', () => {
  test('should trigger JSON backup download', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    await page.click('.nav-item[data-target="view-settings"]');

    const downloadPromise = page.waitForEvent('download');
    await page.click('#btn-export-full-backup');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('n1-backup');
    expect(download.suggestedFilename()).toContain('.json');
  });

  test('should trigger Cockpit CSV export download', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const downloadPromise = page.waitForEvent('download');
    await page.click('#btn-export-csv');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('n1-export');
    expect(download.suggestedFilename()).toContain('.csv');
  });
});

// =============================================
// UNIT: Privacy Section
// =============================================
test.describe('Unit: Privacy Notice', () => {
  test('should show privacy section in Settings', async ({ page }) => {
    await page.goto('/');
    await page.click('.nav-item[data-target="view-settings"]');
    const privacyHeading = page.locator('h2:has-text("Privacy")');
    await expect(privacyHeading).toBeVisible();
  });

  test('should mention local storage in privacy notice', async ({ page }) => {
    await page.goto('/');
    await page.click('.nav-item[data-target="view-settings"]');
    const privacySection = page.locator('#view-settings .glass-card:has(h2:text("Privacy"))');
    const text = await privacySection.textContent();
    expect(text).toContain('IndexedDB');
    expect(text).toContain('Cloud sync');
  });
});

// =============================================
// UNIT: Hormone Tracking Toggle
// =============================================
test.describe('Unit: Hormone Toggle', () => {
  test('hormone section should be hidden by default', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('n1_show_hormone');
    });
    await page.goto('/');
    await page.click('.nav-item[data-target="view-log"]');
    const hormoneSection = page.locator('#hormone-section');
    const visible = await hormoneSection.isVisible();
    expect(visible).toBe(false);
  });

  test('should show hormone section when toggle is enabled', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('n1_show_hormone', 'true');
    });
    await page.goto('/');
    await page.click('.nav-item[data-target="view-log"]');
    const hormoneSection = page.locator('#hormone-section');
    await expect(hormoneSection).toBeVisible();
  });
});

// =============================================
// UNIT: Service Worker Registration
// =============================================
test.describe('Unit: Service Worker', () => {
  test('should register a service worker', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);
    const swRegistered = await page.evaluate(async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.length > 0;
    });
    expect(swRegistered).toBe(true);
  });

  test('should have a valid manifest.json', async ({ page }) => {
    const response = await page.request.get('/manifest.json');
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest.name).toBeTruthy();
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  });
});

// =============================================
// UNIT: Cloud Sync Status
// =============================================
test.describe('Unit: Sync Status', () => {
  test('should show sync status indicator in header', async ({ page }) => {
    await page.goto('/');
    const syncStatus = page.locator('#sync-status');
    await expect(syncStatus).toBeVisible();
  });

  test('should show last sync time in Settings', async ({ page }) => {
    await page.goto('/');
    await page.click('.nav-item[data-target="view-settings"]');
    const syncTime = page.locator('#settings-sync-time');
    await expect(syncTime).toBeVisible();
  });
});
