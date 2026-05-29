import { chromium } from 'playwright';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const userDataDir = 'C:\\Users\\Admin\\AppData\\Local\\Microsoft\\Edge\\User Data';

const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'msedge', headless: false,
  args: ['--start-maximized', '--no-first-run'], viewport: null,
});
const page = await context.newPage();

await page.goto('https://console.firebase.google.com/project/logianalytics-pro/authentication/providers', { waitUntil: 'domcontentloaded', timeout: 25000 });
await page.waitForTimeout(4000);

// Find Google row and click it
for (const row of await page.locator('li').all()) {
  const t = (await row.innerText().catch(() => '')).trim();
  if (t.startsWith('Google')) {
    await row.click(); await page.waitForTimeout(2000);
    const sw = page.locator('[role="switch"]').first();
    if ((await sw.getAttribute('aria-checked').catch(() => 'false')) !== 'true') {
      await sw.click(); await page.waitForTimeout(500);
    }
    // Pick support email from dropdown
    const matSel = page.locator('mat-select').first();
    if (await matSel.isVisible({ timeout: 2000 }).catch(() => false)) {
      await matSel.click(); await page.waitForTimeout(1000);
      await page.locator('mat-option').first().click().catch(() => {});
    }
    for (const b of await page.locator('button').all()) {
      if (/Guardar|Save/i.test(await b.innerText().catch(() => ''))) {
        await b.click(); break;
      }
    }
    console.log('✅ Google Sign-In habilitado');
    break;
  }
}
await page.waitForTimeout(2000);
await context.close();
console.log('DONE');
