import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
// player 1 joins the race
const p1 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await p1.goto('http://localhost:8080');
await p1.fill('#name-input', 'FRIEND');
await p1.click('.level-card:nth-child(2)');
await p1.click('#play-btn');
await p1.waitForTimeout(3000);
// player 2 opens the menu and should see the badge
const p2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await p2.goto('http://localhost:8080');
await p2.waitForTimeout(1000);
const badge = await p2.evaluate(() => [...document.querySelectorAll('.card-badge:not(.hidden)')].map((b) => b.textContent));
console.log('visible badges:', JSON.stringify(badge));
await p2.screenshot({ path: '/tmp/shot-menu-badge.png' });
// Esc exit on player 1
await Promise.all([p1.waitForNavigation(), p1.keyboard.press('Escape')]);
await p1.waitForTimeout(800);
const backAtMenu = await p1.evaluate(() => !document.getElementById('menu')!.classList.contains('hidden'));
console.log('esc returns to menu:', backAtMenu);
await browser.close();
