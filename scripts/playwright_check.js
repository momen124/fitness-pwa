const { chromium } = require('playwright');
const path = require('path');

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    console.error("Failed to launch browser. You might need to run 'npx playwright install'.", e);
    process.exit(1);
  }
  
  const page = await browser.newPage();
  
  // Track console logs and errors
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      const text = `[Browser ${msg.type()}] ${msg.text()}`;
      console.error(text);
      errors.push(text);
    }
  });
  page.on('pageerror', err => {
    const text = `[Browser Exception] ${err.message}`;
    console.error(text);
    errors.push(text);
  });

  const url = `http://localhost:8080`;
  console.log('Navigating to', url);
  await page.goto(url, { waitUntil: 'networkidle' });

  // Array of tabs to check
  const tabs = [
    { name: 'Cockpit', selector: 'button[data-target="view-dashboard"]', contentSelector: '#view-dashboard' },
    { name: 'Log', selector: 'button[data-target="view-log"]', contentSelector: '#view-log' },
    { name: 'Data', selector: 'button[data-target="view-progress"]', contentSelector: '#view-progress' },
    { name: 'Library', selector: 'button[data-target="view-library"]', contentSelector: '#view-library' },
    { name: 'Cloud', selector: 'button[data-target="view-settings"]', contentSelector: '#view-settings' }
  ];

  for (const tab of tabs) {
    console.log(`Clicking tab: ${tab.name}`);
    await page.click(tab.selector);
    await page.waitForSelector(`${tab.contentSelector}.active`, { state: 'visible', timeout: 5000 });
  }

  console.log('Injecting 90 days of mock data to verify charts...');
  
  // Handle the confirmation dialog
  page.on('dialog', async dialog => {
    console.log(`Dialog message: ${dialog.message()}`);
    await dialog.accept();
  });

  // Navigate back to Cockpit and click seed data
  await page.click('button[data-target="view-dashboard"]');
  await page.click('#btn-seed-data');

  // Wait for the app to reload after seeder (seeder calls location.reload() after 1500ms)
  await page.waitForTimeout(2000);
  await page.waitForLoadState('networkidle');

  console.log('Re-verifying tabs with injected data...');
  for (const tab of tabs) {
    console.log(`Checking populated tab: ${tab.name}`);
    await page.click(tab.selector);
    await page.waitForSelector(`${tab.contentSelector}.active`, { state: 'visible', timeout: 5000 });
  }

  // Small delay to catch asynchronous errors from Chart.js rendering
  await page.waitForTimeout(2000);

  if (errors.length > 0) {
    console.error('Errors found during navigation:');
    errors.forEach(err => console.error(err));
    process.exitCode = 1;
  } else {
    console.log('All pages navigated and charts rendered successfully with no errors!');
  }

  await browser.close();
})();
