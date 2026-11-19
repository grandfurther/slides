// End-to-end walk-through + screenshots. Run with the dev server up:
//   NODE_PATH=$(npm root -g) node scripts/shots.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const URL = 'http://localhost:8111/';
const OUT = new URL_('../screenshots/', import.meta.url).pathname;
function URL_(a, b) { return new globalThis.URL(a, b); }
mkdirSync(OUT, { recursive: true });
const GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  · ' + extra : ''}`); };

async function open(browser, ctxOpts, suffix = '') {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL + suffix, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  return { ctx, page, errors };
}
const settle = (page, ms = 650) => page.waitForTimeout(ms);
const view = (page) => page.evaluate(() => window.__softworkz.store.state.view);
const phone = (page) => page.locator('#phone-screen');

async function walkthrough(browser, label, ctxOpts, mobile) {
  const { ctx, page, errors } = await open(browser, ctxOpts);
  const shot = async (name) => { await settle(page); await page.screenshot({ path: `${OUT}${label}-${name}.jpg`, quality: 86 }); };
  const tap = (loc) => (mobile ? loc.tap() : loc.click());
  const showPhone = async () => { if (mobile) { await page.locator('#stage').scrollIntoViewIfNeeded(); await page.evaluate(() => document.querySelector('#stage').scrollIntoView({ block: 'start', behavior: 'instant' })); } };

  await shot('01-hero');
  if (mobile) { await showPhone(); await shot('01b-hero-phone'); }

  // Services: one working micro-demo each
  const demos = {
    web: async () => { await tap(phone(page).getByRole('button', { name: 'Open', exact: true })); },
    mobile: async () => { await tap(phone(page).getByRole('checkbox', { name: 'Photograph the meter reading' })); },
    saas: async () => { await tap(phone(page).getByRole('radio', { name: 'Finance' })); },
    enterprise: async () => { await tap(phone(page).getByRole('button', { name: 'Approve REQ-21' })); },
  };
  let n = 2;
  for (const [key, act] of Object.entries(demos)) {
    await showPhone();
    await tap(phone(page).locator(`[data-app="${key}"]`));
    await settle(page, 300);
    check(`${label}: ${key} opens with shareable URL`, (await view(page)) === key && page.url().includes(`view=${key}`));
    await act();
    await shot(`0${n++}-service-${key}`);
    await tap(page.locator('#ph-home'));
    await settle(page, 200);
    check(`${label}: Home returns to the app grid from ${key}`, (await view(page)) === 'home' && !page.url().includes('view='));
  }
  check(`${label}: web demo filtered to Open`, await page.evaluate(() => window.__softworkz.store.state.web.filter === 'Open'));
  check(`${label}: enterprise request approved`, await page.evaluate(() => window.__softworkz.store.state.ent.decisions['REQ-21'] === 'Approved'));

  // Back: web -> (in-phone Back) -> home, and browser back/forward
  await tap(phone(page).locator('[data-app="web"]')); await settle(page, 200);
  await tap(page.locator('#ph-back')); await settle(page, 300);
  check(`${label}: Back returns from Web to Home`, (await view(page)) === 'home');
  await page.goForward(); await settle(page, 300);
  check(`${label}: browser Forward restores Web`, (await view(page)) === 'web');
  await page.goBack(); await settle(page, 300);
  check(`${label}: browser Back restores Home`, (await view(page)) === 'home');

  // SurveyPlus inspection: conditional required field
  await showPhone();
  await tap(phone(page).locator('[data-app="surveyplus"]')); await settle(page, 300);
  const fu = phone(page).getByLabel(/Follow-up needed/);
  check(`${label}: follow-up hidden before status chosen`, !(await fu.isVisible()));
  await tap(phone(page).getByText('Needs attention', { exact: true }));
  await settle(page, 400);
  check(`${label}: follow-up field revealed and required`, (await fu.isVisible()) && (await fu.getAttribute('required')) !== null);
  await shot('06-inspection-conditional');
  // Saving without the follow-up must be refused
  await tap(phone(page).getByRole('button', { name: 'Save sample inspection' })); await settle(page, 300);
  check(`${label}: save blocked while follow-up is empty`, await page.evaluate(() => window.__softworkz.store.state.records.length === 3 && window.__softworkz.store.state.insp.error === 'followUp'));
  await fu.fill('Re-fix the loose handrail bracket.');
  await tap(phone(page).getByRole('button', { name: 'Save sample inspection' })); await settle(page, 500);
  const saved = await page.evaluate(() => window.__softworkz.store.state.records[0]);
  check(`${label}: record saved to shared state`, saved.id === 'INS-1004' && saved.status === 'Needs attention', JSON.stringify(saved));
  await shot('07a-inspection-saved');
  await tap(phone(page).getByRole('button', { name: 'See it in the dashboard' }));
  await settle(page, 1300);
  const row = page.locator('#dash tr.is-new');
  check(`${label}: dashboard shows same ID + status, highlighted`, (await row.count()) === 1 && (await row.innerText()).includes('INS-1004') && (await row.innerText()).includes('Needs attention'));
  check(`${label}: dashboard count updated to 4`, (await page.locator('#dash .kpi-n').first().innerText()) === '4');
  if (mobile) check(`${label}: dashboard is stacked directly beneath the phone`, await page.evaluate(() => { const d = document.querySelector('#dash'); return d.parentElement.id === 'dock' && document.querySelector('#stage').getBoundingClientRect().bottom <= d.getBoundingClientRect().top + 1; }));
  await shot('07b-dashboard-result');
  await tap(page.getByRole('button', { name: 'Inspect INS-1004' })); await settle(page, 300);
  check(`${label}: inspecting the row shows the follow-up`, (await page.locator('#dash .dash-detail').innerText()).includes('Re-fix the loose handrail bracket.'));
  await page.locator('#dash .dash-detail').scrollIntoViewIfNeeded();
  await shot('07c-dashboard-inspect');

  // Exploded view
  const y3 = await page.evaluate(() => { const r = document.querySelector('#how-we-build').getBoundingClientRect(); return r.top + scrollY; });
  if (!mobile) {
    for (const [i, f] of [[1, 0.26], [2, 0.5], [3, 0.74]]) {
      await page.evaluate(([y, f]) => { const s = document.querySelector('#how-we-build'); window.scrollTo({ top: y - innerHeight * 0.3 + (s.offsetHeight - innerHeight * 0.45) * f, behavior: 'instant' }); }, [y3, f]);
      await page.waitForFunction(() => window.__softworkz.stage.state.e > 0.99, null, { timeout: 8000 }).catch(() => {});
      await settle(page, 400);
      if (i === 2) check(`${label}: phone explodes into four planes`, await page.evaluate(() => window.__softworkz.stage.state.e > 0.95 && [...document.querySelectorAll('.plane')].every((p) => getComputedStyle(p).visibility === 'visible')));
      await shot(`08-exploded-${i}`);
    }
    await page.evaluate(() => document.querySelector('#start').scrollIntoView({ block: 'start', behavior: 'instant' }));
    await page.waitForFunction(() => window.__softworkz.stage.state.e < 0.01, null, { timeout: 8000 }).catch(() => {});
    await settle(page, 300);
    check(`${label}: handset reassembles after the chapter`, await page.evaluate(() => window.__softworkz.stage.state.e < 0.01 && !document.querySelector('#phone-screen').inert));
  } else {
    await page.evaluate((y) => window.scrollTo({ top: y + 260, behavior: 'instant' }), y3);
    await shot('08-layers');
  }

  // Project brief
  await page.evaluate(() => document.querySelector('#start').scrollIntoView({ block: 'start', behavior: 'instant' }));
  await settle(page, 400);
  const brief = page.locator('#brief');
  await brief.getByLabel('What do you want to build?').selectOption('A mobile app');
  await brief.getByLabel('What does it need to do?').fill('Let field staff log inspections offline and sync them to a dashboard.');
  await brief.getByLabel('When do you need it?').selectOption('Within 3 months');
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await tap(brief.getByRole('button', { name: 'Copy brief' })); await settle(page, 300);
  const status = await brief.locator('.sent-status').innerText();
  check(`${label}: brief generated locally, "Nothing has been sent" shown`, status.includes('Nothing has been sent') && (await brief.locator('.brief-out').innerText()).includes('A mobile app'), status);
  const href = await brief.getByRole('link', { name: 'Open email draft' }).getAttribute('href');
  check(`${label}: email draft is an explicit mailto to the published address`, href.startsWith('mailto:hello@softworkz.net?subject=') && decodeURIComponent(href).includes('Within 3 months'));
  await brief.locator('.brief-out').scrollIntoViewIfNeeded();
  await shot('09-project-brief');

  // Reset demo
  await page.evaluate(() => document.querySelector('#dash').scrollIntoView({ block: 'center', behavior: 'instant' }));
  await tap(page.getByRole('button', { name: 'Reset demo' })); await settle(page, 300);
  check(`${label}: Reset demo restores 3 rows and a fresh form`, await page.evaluate(() => { const s = window.__softworkz.store.state; return s.records.length === 3 && !s.newId && !s.insp.savedId && document.querySelectorAll('#dash tbody tr').length === 3; }));
  await shot('10-after-reset');

  check(`${label}: no console or page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

const browser = await chromium.launch({ args: GL });
await walkthrough(browser, 'desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }, false);
await walkthrough(browser, 'mobile', { ...devices['iPhone 13'] }, true);

/* Shareable URL */
{
  const { ctx, page } = await open(browser, { viewport: { width: 1440, height: 900 } }, '?view=enterprise');
  check('deep link ?view=enterprise opens that view', (await view(page)) === 'enterprise' && (await page.locator('#phone-view .ph-title').innerText()) === 'Enterprise systems');
  await ctx.close();
}

/* Keyboard only */
{
  const { ctx, page } = await open(browser, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const active = () => page.evaluate(() => { const a = document.activeElement; return (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 40) + '|' + a.tagName; });
  const order = [];
  for (let i = 0; i < 14; i++) { await page.keyboard.press('Tab'); order.push(await active()); }
  console.log('tab order:', order.join('  >  '));
  const iWeb = order.findIndex((o) => o.startsWith('Web|BUTTON'));
  check('keyboard: phone apps reachable by Tab right after the hero links', iWeb > 0 && iWeb < 10);
  // go to the Web app button and open it
  await page.locator('[data-app="surveyplus"]').focus();
  await page.keyboard.press('Enter'); await settle(page, 300);
  check('keyboard: Enter opens SurveyPlus and focus moves into the view', (await view(page)) === 'surveyplus' && (await page.evaluate(() => document.activeElement.classList.contains('ph-title'))));
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); // site, area, radio group
  await page.keyboard.press('ArrowDown'); await settle(page, 200); // Pass -> Needs attention
  if ((await page.evaluate(() => window.__softworkz.store.state.insp.status)) !== 'Needs attention') await page.keyboard.press('ArrowDown');
  check('keyboard: arrow keys choose Needs attention', (await page.evaluate(() => window.__softworkz.store.state.insp.status)) === 'Needs attention');
  await page.keyboard.press('Tab'); await page.keyboard.type('Keyboard-only follow-up');
  await page.keyboard.press('Tab'); 
  const focusRing = await page.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return a.textContent + '|' + cs.outlineStyle + '|' + cs.outlineWidth; });
  check('keyboard: visible focus ring on the save button', focusRing.startsWith('Save sample inspection|solid|2px'), focusRing);
  await page.screenshot({ path: `${OUT}keyboard-focus.jpg` });
  await page.keyboard.press('Enter'); await settle(page, 400);
  check('keyboard: Enter saves the inspection', await page.evaluate(() => window.__softworkz.store.state.records.length === 4));
  await page.keyboard.press('Escape'); await settle(page, 300);
  check('keyboard: Escape goes Back', (await view(page)) === 'home');
  // Rotate phone via keyboard
  await page.locator('#rotate').focus(); await page.keyboard.press('Enter'); await page.waitForFunction(() => Math.abs(window.__softworkz.stage.state.yaw - Math.PI) < 0.001, null, { timeout: 8000 }).catch(() => {}); await settle(page, 300);
  check('keyboard: Rotate phone turns the handset and parks the live screen', await page.evaluate(() => window.__softworkz.stage.flipped && document.querySelector('#phone-screen').inert && document.querySelector('#rotate').getAttribute('aria-pressed') === 'true'));
  await page.screenshot({ path: `${OUT}desktop-rotated.jpg` });
  await page.keyboard.press('Enter'); await page.waitForFunction(() => window.__softworkz.stage.state.rest === true, null, { timeout: 8000 }).catch(() => {}); await settle(page, 300);
  check('keyboard: second press brings the screen back, still and usable', await page.evaluate(() => !window.__softworkz.stage.flipped && !document.querySelector('#phone-screen').inert && document.querySelector('#device').style.transform === ''));
  // Browse services tabs with arrow keys
  await page.locator('#tab-web').focus(); await page.keyboard.press('ArrowRight'); await settle(page, 200);
  check('keyboard: arrow keys move through Browse services tabs', (await page.locator('#svc-panel .ph-title').innerText()) === 'Mobile apps');
  await ctx.close();
}

/* Touch targets */
{
  const { ctx, page } = await open(browser, { ...devices['iPhone 13'] });
  const small = [];
  for (const v of ['home', 'web', 'mobile', 'saas', 'enterprise', 'surveyplus', 'contact']) {
    await page.evaluate((v) => window.__softworkz.router.go(v), v); await settle(page, 150);
    if (v === 'surveyplus') await page.locator('#phone-screen').getByText('Needs attention', { exact: true }).tap();
    small.push(...await page.evaluate((v) => [...document.querySelectorAll('button, a, select, textarea, input:not([type=radio]), label.radio')].filter((el) => el.offsetParent && !el.closest('[hidden]')).map((el) => { const r = el.getBoundingClientRect(); return { v, t: (el.textContent || el.id).trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((x) => x.h < 44 || x.w < 44), v));
  }
  const uniq = [...new Map(small.map((s) => [s.t + s.w + s.h, s])).values()];
  check('touch: every control is at least 44px', uniq.length === 0, JSON.stringify(uniq));
  await ctx.close();
}

/* Reduced motion */
{
  const { ctx, page } = await open(browser, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  await page.locator('#rotate').click(); await page.waitForTimeout(120);
  check('reduced motion: rotate snaps without animation', await page.evaluate(() => Math.abs(window.__softworkz.stage.state.yaw - Math.PI) < 0.001));
  await page.locator('#rotate').click(); await page.waitForTimeout(120);
  await page.evaluate(() => { const s = document.querySelector('#how-we-build'); window.scrollTo({ top: s.offsetTop + s.offsetHeight * 0.45, behavior: 'instant' }); });
  await page.waitForTimeout(250);
  check('reduced motion: exploded view appears as a static state', await page.evaluate(() => window.__softworkz.stage.state.e === 1 && getComputedStyle(document.documentElement).scrollBehavior === 'auto'));
  await page.screenshot({ path: `${OUT}reduced-motion-exploded.jpg` });
  await ctx.close();
}

/* Chapter change must not interrupt a task */
{
  const { ctx, page } = await open(browser, { viewport: { width: 1440, height: 900 } });
  await page.evaluate(() => document.querySelector('#surveyplus').scrollIntoView({ block: 'start', behavior: 'instant' })); await settle(page, 300);
  check('chapters: scrolling to chapter 2 opens SurveyPlus on the idle phone', (await view(page)) === 'surveyplus');
  await page.locator('#phone-screen').getByText('Needs attention', { exact: true }).click();
  await page.evaluate(() => document.querySelector('#start').scrollIntoView({ block: 'start', behavior: 'instant' })); await settle(page, 1000);
  check('chapters: a half-filled inspection is not replaced by the next chapter', (await view(page)) === 'surveyplus');
  check('chapters: native scrolling untouched (no wheel/touch preventDefault, page scrolls)', await page.evaluate(() => scrollY > 1000 && getComputedStyle(document.body).overflowY !== 'hidden'));
  await ctx.close();
}

/* WebGL unavailable */
{
  const b2 = await chromium.launch({ args: ['--disable-gpu', '--disable-webgl', '--disable-3d-apis', '--disable-software-rasterizer'] });
  const { ctx, page } = await open(b2, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const noGl = await page.evaluate(() => document.documentElement.classList.contains('no-webgl'));
  await page.locator('[data-app="enterprise"]').click(); await settle(page, 200);
  await page.locator('#phone-screen').getByRole('button', { name: 'Approve REQ-22' }).click();
  check('no WebGL: static device frame with working HTML controls', noGl && (await page.evaluate(() => window.__softworkz.store.state.ent.decisions['REQ-22'] === 'Approved')), `no-webgl=${noGl}`);
  await page.screenshot({ path: `${OUT}no-webgl-fallback.jpg` });
  await ctx.close(); await b2.close();
}

/* No third-party requests */
{
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  const ext = new Set();
  page.on('request', (r) => { const h = new globalThis.URL(r.url()); if (!['localhost', '127.0.0.1'].includes(h.hostname) && h.protocol !== 'data:') ext.add(h.hostname); });
  await page.goto(URL, { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
  check('network: every asset is served locally (no CDN, analytics or API calls)', ext.size === 0, [...ext].join(','));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
