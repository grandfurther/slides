// Local stills of the real-time model on a plain background (no Higgsfield).
//   NODE_PATH=$(npm root -g) node scripts/renders.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = new URL('../public/media/', import.meta.url).pathname;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const pose of ['pair', 'rear', 'front']) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:8111/?studio=${pose}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  if (pose === 'rear') await page.waitForFunction(() => Math.abs(window.__softworkz.stage.state.yaw - Math.PI) < 0.001);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}still-${pose}.jpg`, type: 'jpeg', quality: 90 });
  await page.close();
}
await browser.close();
