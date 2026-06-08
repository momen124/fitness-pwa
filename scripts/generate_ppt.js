const { chromium } = require('playwright');
const PptxGenJS = require('pptxgenjs');
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.static(__dirname));
const port = 3000;

async function generatePPT() {
    const server = app.listen(port, () => console.log(`Server running on port ${port}`));

    try {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            viewport: { width: 414, height: 896 }, // Mobile viewport for PWA
            deviceScaleFactor: 2
        });
        const page = await context.newPage();
        await page.goto(`http://localhost:${port}/index.html`);
        await page.waitForTimeout(2000); // wait for initial load

        // Click the seeder to populate data
        await page.click('#btn-seed-data');
        await page.waitForTimeout(1000);

        if (!fs.existsSync('screenshots')) {
            fs.mkdirSync('screenshots');
        }

        const pptx = new PptxGenJS();
        pptx.layout = 'LAYOUT_16x9';

        // Helper to add a slide with title, image, and text
        const addFeatureSlide = (title, imgPath, desc) => {
            let slide = pptx.addSlide();
            slide.addText(title, { x: 0.5, y: 0.5, fontSize: 24, bold: true, color: '363636' });
            slide.addImage({ path: imgPath, x: 0.5, y: 1.2, w: 4.5, h: 5.5, sizing: { type: 'contain' } });
            slide.addText(desc, { x: 5.5, y: 1.2, w: 4.0, fontSize: 16, color: '666666', valign: 'top' });
        };

        const addTabSlide = (title, imgPath, desc) => {
            let slide = pptx.addSlide();
            slide.addText(title + " Tab", { x: 0.5, y: 0.5, fontSize: 28, bold: true, color: '003366' });
            slide.addImage({ path: imgPath, x: 0.5, y: 1.2, w: 4, h: 5.5, sizing: { type: 'contain' } });
            slide.addText(desc, { x: 5.0, y: 1.2, w: 4.5, fontSize: 18, color: '333333', valign: 'top' });
        };

        // 1. Title Slide
        let slideTitle = pptx.addSlide();
        slideTitle.addText("N=1 Performance Lab", { x: '10%', y: '40%', w: '80%', fontSize: 44, bold: true, align: 'center', color: '003366' });
        slideTitle.addText("Project Overview & Application Structure", { x: '10%', y: '55%', w: '80%', fontSize: 24, align: 'center', color: '666666' });

        // 2. Architecture Slide
        let slideArch = pptx.addSlide();
        slideArch.addText("Architecture Overview", { x: 0.5, y: 0.5, fontSize: 28, bold: true, color: '003366' });
        slideArch.addText([
            { text: "Frontend:", options: { bold: true, bullet: true } },
            { text: " Vanilla JavaScript, HTML5, CSS3 (Mobile-first PWA)" },
            { text: "Data Visualization:", options: { bold: true, bullet: true, breakLine: true } },
            { text: " Chart.js for progress tracking" },
            { text: "Backend/Storage:", options: { bold: true, bullet: true, breakLine: true } },
            { text: " LocalStorage for offline capability, Supabase integration ready" },
            { text: "Core Philosophy:", options: { bold: true, bullet: true, breakLine: true } },
            { text: " Track subjective metrics, recovery, and structured workouts" }
        ], { x: 0.5, y: 1.5, w: 9, fontSize: 20, color: '333333', lineSpacing: 30 });

        // --- TAB 1: DASHBOARD ---
        console.log('Capturing Tab 1: Dashboard');
        await page.click('[data-target="view-dashboard"]');
        await page.waitForTimeout(500);
        await page.screenshot({ path: 'screenshots/tab1_full.png' });
        addTabSlide("Dashboard", 'screenshots/tab1_full.png', "The Cockpit of the N=1 Performance Lab.\n\nProvides a quick glance at motivational quotes, macrocycle focus, intersection hub statistics (cardio vs lift), system alerts, and the weight milestone tracker.");

        // Dashboard Cards
        const dashCards = [
            { locator: '.quote-card', name: 'quote', title: 'Motivational Quote Card', desc: 'Sets the daily intention for the athlete.' },
            { locator: 'text=🧪 Lab Seeder', parentClass: '.glass-card', name: 'seeder', title: 'Lab Seeder', desc: 'Injects 90 days of mock data for testing analytics.' },
            { locator: 'text=Cockpit Dashboard 🚀', parentClass: '.glass-card', name: 'cockpit', title: 'Cockpit Dashboard', desc: 'Shows the current macrocycle and critical system alerts (Interference Shield, Tendon Load, etc.).' },
            { locator: 'text=⛰️ Way to 95', parentClass: '.glass-card', name: 'milestone', title: '"Way to 95" Tracker', desc: 'Tracks the ultimate weight goal and milestones.' }
        ];

        for (let card of dashCards) {
            let loc = card.parentClass ? page.locator(`xpath=//div[contains(@class, "glass-card") and .//*[contains(text(), "${card.locator.replace('text=', '')}")]]`).first() : page.locator(card.locator).first();
            await loc.screenshot({ path: `screenshots/dash_${card.name}.png` });
            addFeatureSlide(card.title, `screenshots/dash_${card.name}.png`, card.desc);
        }

        // --- TAB 2: DAILY LOG ---
        console.log('Capturing Tab 2: Daily Log');
        await page.click('[data-target="view-log"]');
        await page.waitForTimeout(500);
        await page.screenshot({ path: 'screenshots/tab2_full.png' });
        addTabSlide("Daily Log", 'screenshots/tab2_full.png', "Comprehensive daily data entry.\n\nCaptures subjective fatigue, recovery metrics, granular joint pain tracking, heavy lifting logs, pharmacology, and manual nutrition entries.");

        // Log Cards
        const logCards = [
            { text: '🧠 Subjective Truth', name: 'subjective', title: 'Subjective Truth', desc: 'Morning weight, CNS fatigue, and target muscle.' },
            { text: '🌙 Recovery & Sleep', name: 'recovery', title: 'Recovery & Sleep', desc: 'Sleep hours, quality, and HRV.' },
            { text: '⚕️ Granular Injury Tracker', name: 'injury', title: 'Injury Tracker', desc: 'Target joint/area and pain scaling (0-10).' },
            { text: '🏋️‍♂️ Strength & Structure', name: 'strength', title: 'Strength & Structure', desc: 'Session types (Heavy Day A/B, Tendon) and lift details.' },
            { text: '💊 Pharmacology & Stims', name: 'pharma', title: 'Pharmacology', desc: 'Alert boxes and NSAID tracking (blunts mTOR).' },
            { text: '🩸 Quarterly Biomarker Vault', name: 'biomarker', title: 'Biomarker Vault', desc: 'Testosterone, Cortisol, hs-CRP, Ferritin.' },
            { text: '🍎 Nutrition (Manual)', name: 'nutrition', title: 'Nutrition Manual', desc: 'Calories, Protein, Carbs, Fats, and Caffeine tracking.' }
        ];

        for (let card of logCards) {
            let loc = page.locator(`xpath=//div[contains(@class, "glass-card") and .//*[contains(text(), "${card.text.replace(/^[^\w]*/, '')}")]]`).first();
            // Scroll to element to ensure it's fully rendered
            await loc.scrollIntoViewIfNeeded();
            await page.waitForTimeout(200);
            await loc.screenshot({ path: `screenshots/log_${card.name}.png` });
            addFeatureSlide(card.title, `screenshots/log_${card.name}.png`, card.desc);
        }

        // --- TAB 3: PROGRESS ---
        console.log('Capturing Tab 3: Progress');
        await page.click('[data-target="view-progress"]');
        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'screenshots/tab3_full.png' });
        addTabSlide("Progress", 'screenshots/tab3_full.png', "Data visualization and analytics.\n\nTracks recovery trends, performance decoupling, and metabolic adaptation over time using Chart.js.");

        // Recovery charts
        await page.locator('.glass-card.hero-card').first().screenshot({ path: 'screenshots/prog_recovery.png' });
        addFeatureSlide("Recovery Charts", 'screenshots/prog_recovery.png', "Fatigue vs. Load, Subjective Readiness Radar, and HRV trends.");

        // Performance charts
        await page.click('[data-group="chart-performance"]');
        await page.waitForTimeout(500);
        await page.locator('#chart-performance').screenshot({ path: 'screenshots/prog_perf.png' });
        addFeatureSlide("Performance Charts", 'screenshots/prog_perf.png', "Aerobic Decoupling, Cardio Modality breakdown, Heavy Lifts progress, and Volume vs Joint Pain limit finding.");

        // Metabolism charts
        await page.click('[data-group="chart-metabolism"]');
        await page.waitForTimeout(500);
        await page.locator('#chart-metabolism').screenshot({ path: 'screenshots/prog_meta.png' });
        addFeatureSlide("Metabolism Charts", 'screenshots/prog_meta.png', "Metabolic Adaptation (TDEE vs weight) and Macro Nutrition Stack trailing 7-day intake.");

        // --- TAB 4: LIBRARY ---
        console.log('Capturing Tab 4: Library');
        await page.click('[data-target="view-library"]');
        await page.waitForTimeout(500);
        await page.screenshot({ path: 'screenshots/tab4_full.png' });
        addTabSlide("Library", 'screenshots/tab4_full.png', "Knowledge base and protocols.\n\nHolds Pillar concepts, Playbooks, Roadmaps, and strict Rules to follow during the athletic journey.");

        const libraryCards = [
            { pillId: '#library-pill-pillars', targetText: 'Pillar 1: Cellular', name: 'pillar', title: 'Pillar Cards', desc: 'Core scientific pillars (e.g. Metabolism & Lactate Shuttle).' },
            { pillId: '#library-pill-playbook', targetText: 'Heavy Isometrics', name: 'playbook', title: 'Playbook Cards', desc: 'Actionable playbooks like Pain-Killer Protocols.' },
            { pillId: '#library-pill-roadmap', targetText: 'Target InBody', name: 'roadmap', title: 'Roadmap Cards', desc: 'Phase-by-phase roadmaps and InBody targets.' },
            { pillId: '#library-pill-rules', targetText: 'The 4-Hour Separation', name: 'rules', title: 'Rules Cards', desc: 'Hard rules like the 4-Hour Separation Rule.' }
        ];

        for (let card of libraryCards) {
            await page.click(card.pillId);
            await page.waitForTimeout(300);
            let loc = page.locator(`xpath=//div[contains(@class, "concept-card") and .//*[contains(text(), "${card.targetText.substring(0, 15)}")]]`).first();
            await loc.click(); // Expand the card
            await page.waitForTimeout(300);
            await loc.screenshot({ path: `screenshots/lib_${card.name}.png` });
            addFeatureSlide(card.title, `screenshots/lib_${card.name}.png`, card.desc);
        }

        // Summary Slide
        let slideSum = pptx.addSlide();
        slideSum.addText("Summary", { x: 0.5, y: 0.5, fontSize: 32, bold: true, color: '003366' });
        slideSum.addText([
            { text: "The N=1 Performance Lab is a comprehensive tool:", options: { bold: true, bullet: true } },
            { text: " Tracks subjective truths often missed by wearables.", options: { bullet: { type: 'circle' } } },
            { text: " Visualizes intersecting data (Fatigue vs Load, Volume vs Pain).", options: { bullet: { type: 'circle' } } },
            { text: " Embeds actionable science directly in the app (Library).", options: { bullet: { type: 'circle' } } },
            { text: " Guides the user towards a specific physical state safely.", options: { bullet: { type: 'circle' } } }
        ], { x: 0.5, y: 1.5, w: 9, fontSize: 20, color: '333333', lineSpacing: 30 });

        await pptx.writeFile({ fileName: 'N_1_Performance_Lab_Project.pptx' });
        console.log('Presentation saved as N_1_Performance_Lab_Project.pptx');

        await browser.close();
        server.close();
    } catch (error) {
        console.error("Error generating PPT:", error);
        server.close();
    }
}

generatePPT();
