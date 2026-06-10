// Headless-browser smoke test: load each mode, drive around, screenshot, catch errors.

import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';
const modes = ['arena', 'race', 'pipe'] as const;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});

let failures = 0;

for (const [i, mode] of modes.entries()) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });

  await page.goto(BASE);
  await page.fill('#name-input', `SMOKE${mode.toUpperCase()}`);
  await page.click(`.level-card:nth-child(${i + 1})`);
  await page.click('#play-btn');
  await page.waitForTimeout(6000); // countdown + into play

  // mode-appropriate driving
  await page.keyboard.down('w');
  if (mode === 'arena') {
    await page.waitForTimeout(1500);
    await page.keyboard.down('a');
    await page.waitForTimeout(900);
    await page.keyboard.up('a');
    await page.keyboard.down('Shift');
    await page.waitForTimeout(1200);
    await page.keyboard.up('Shift');
    await page.waitForTimeout(1500);
  } else if (mode === 'race') {
    await page.keyboard.down('Shift');
    await page.waitForTimeout(4000);
    await page.keyboard.up('Shift');
    await page.waitForTimeout(2000);
  } else {
    // carve in the pipe
    for (const key of ['a', 'd', 'a']) {
      await page.keyboard.down(key);
      await page.waitForTimeout(1300);
      await page.keyboard.up(key);
    }
  }
  await page.keyboard.up('w');
  await page.waitForTimeout(400);

  const hudVisible = await page.evaluate(() => !document.getElementById('hud')!.classList.contains('hidden'));
  const speed = await page.evaluate(() => document.getElementById('speed')!.textContent);
  const shot = `/tmp/shot-${mode}.png`;
  await page.screenshot({ path: shot });

  const uniqueErrors = [...new Set(errors)].filter((e) => !e.includes('WebGL warning') && !e.includes('GroupMarkerNotSet'));
  const ok = hudVisible && uniqueErrors.length === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${mode}: hud=${hudVisible} speed=${speed} errors=${uniqueErrors.length} -> ${shot}`);
  for (const e of uniqueErrors.slice(0, 5)) console.log(`   ${e.slice(0, 300)}`);
  if (!ok) failures++;
  if (Number(speed) < 5) console.log(`   WARN ${mode}: speed is low (${speed}) — vehicle may not be driving`);
  await page.close();
}

await browser.close();
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
