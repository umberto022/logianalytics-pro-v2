import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const userDataDir = 'C:\\Users\\Admin\\AppData\\Local\\Microsoft\\Edge\\User Data';

async function shot(page, name) {
  await page.screenshot({ path: join(__dirname, name) });
  console.log('📸', name);
}

const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'msedge',
  headless: false,
  args: ['--start-maximized', '--no-first-run'],
  viewport: null,
});
const page = await context.newPage();

// ── REGISTRAR APP WEB ─────────────────────────────────────────────────────────
console.log('Abriendo configuración del proyecto...');
await page.goto('https://console.firebase.google.com/project/logianalytics-pro/settings/general', { waitUntil: 'domcontentloaded', timeout: 25000 });
await page.waitForTimeout(5000);
await shot(page, 'w1.png');

const hasConfig = await page.locator('text=firebaseConfig').isVisible({ timeout: 3000 }).catch(() => false);
console.log('Config ya existe:', hasConfig);

if (!hasConfig) {
  // Scroll al final para ver sección de apps
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);
  await shot(page, 'w2.png');

  // Click botón "Agregar Firebase a tu app web"
  let clicked = false;
  for (const b of await page.locator('button').all()) {
    const aria = (await b.getAttribute('aria-label') || '').toLowerCase();
    if (aria.includes('agregar firebase a tu app web') || aria.includes('add firebase to your web app')) {
      await b.click(); clicked = true;
      console.log('Click en botón web app');
      break;
    }
  }
  if (!clicked) {
    // Buscar por ícono "code"
    for (const b of await page.locator('button').all()) {
      const icon = await b.locator('mat-icon').innerText().catch(() => '');
      if (icon.trim() === 'code') {
        await b.click(); clicked = true; break;
      }
    }
  }
  await page.waitForTimeout(3000);
  await shot(page, 'w3.png');

  // Llenar nombre con keyboard.type (Angular)
  const nickField = page.locator('input[placeholder="Mi app web"]').first();
  await nickField.waitFor({ state: 'visible', timeout: 8000 });
  await nickField.click();
  await page.keyboard.type('LogiAnalytics Web', { delay: 60 });
  await page.waitForTimeout(800);
  await shot(page, 'w4.png');

  // Click Registrar app
  const regBtn = page.locator('button[aria-label="Registrar app"], button:has-text("Registrar app")').first();
  await regBtn.waitFor({ state: 'visible', timeout: 8000 });
  await regBtn.click();
  console.log('Click Registrar app');
  await page.waitForTimeout(5000);
  await shot(page, 'w5.png');

  // Click "Ir a la consola" o "Siguiente"
  for (const b of await page.locator('button, a').all()) {
    const t = await b.innerText().catch(() => '');
    if (/Ir a la consola|Continue to console|Siguiente|Next/i.test(t)) {
      await b.click(); await page.waitForTimeout(2000); break;
    }
  }
}

// ── EXTRAER CONFIG ────────────────────────────────────────────────────────────
console.log('Cargando settings para extraer config...');
await page.goto('https://console.firebase.google.com/project/logianalytics-pro/settings/general', { waitUntil: 'domcontentloaded', timeout: 25000 });
await page.waitForTimeout(6000);
await shot(page, 'cfg.png');

const html = await page.content();
const m = html.match(/["']apiKey["']\s*:\s*["']([^"']+)["'][\s\S]{1,80}?["']authDomain["']\s*:\s*["']([^"']+)["'][\s\S]{1,80}?["']projectId["']\s*:\s*["']([^"']+)["'][\s\S]{1,80}?["']storageBucket["']\s*:\s*["']([^"']+)["'][\s\S]{1,80}?["']messagingSenderId["']\s*:\s*["']([^"']+)["'][\s\S]{1,80}?["']appId["']\s*:\s*["']([^"']+)["']/s);

if (m) {
  const [, apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId] = m;
  const env = `NEXT_PUBLIC_FIREBASE_API_KEY=${apiKey}
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${authDomain}
NEXT_PUBLIC_FIREBASE_PROJECT_ID=${projectId}
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${storageBucket}
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${messagingSenderId}
NEXT_PUBLIC_FIREBASE_APP_ID=${appId}
`;
  writeFileSync(join(__dirname, '.env.local'), env);
  console.log('\n✅ .env.local actualizado con éxito:\n');
  console.log(env);
} else {
  const txt = await page.locator('body').innerText();
  console.log('⚠️ Config no encontrada. Texto visible:\n', txt.slice(0, 3000));
}

await context.close();
console.log('DONE ✅');
