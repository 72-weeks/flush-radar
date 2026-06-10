// Glamour screenshots for review: menu + arena puck action.

import { chromium } from 'playwright';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

await page.goto('http://localhost:8080');
await page.fill('#name-input', 'ACE');
await page.screenshot({ path: '/tmp/shot-menu.png' });

await page.click('#play-btn'); // arena is default
await page.waitForTimeout(5500); // countdown ends

// drive straight at the puck from spawn
await page.keyboard.down('w');
await page.keyboard.down('Shift');
await page.waitForTimeout(1700);
await page.keyboard.up('Shift');
await page.screenshot({ path: '/tmp/shot-arena-action.png' });
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/shot-arena-action2.png' });
await page.keyboard.up('w');

// scoreboard
await page.keyboard.down('Tab');
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/shot-scoreboard.png' });
await page.keyboard.up('Tab');

await browser.close();
console.log('done');
