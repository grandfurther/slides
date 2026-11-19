import '@fontsource-variable/archivo/wght.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles.css';

import { store, latestRecord } from './store.js';
import { router } from './router.js';
import { mountView, serviceView, briefView, icon, h, SERVICES } from './views.js';
import { mountDashboard } from './dashboard.js';
import { createStage, DEVICE, SCREEN_W, SCREEN_H } from './phone3d.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const params = new URLSearchParams(location.search);
const studio = params.get('studio');
const mqDesktop = matchMedia('(min-width: 960px)');
const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
const reducedMotion = () => mqReduce.matches;
const scrollBehavior = () => (reducedMotion() ? 'auto' : 'smooth');

root.style.setProperty('--screen-ar', (SCREEN_W / SCREEN_H).toFixed(4));
root.style.setProperty('--screen-r', (DEVICE.screenR / SCREEN_H).toFixed(4));
root.style.setProperty('--bezel', (DEVICE.bezel / SCREEN_H).toFixed(4));
if (studio) { root.classList.add('studio'); root.dataset.studio = studio; }
$$('[data-ic]').forEach((el) => { el.innerHTML = icon(el.dataset.ic, 18); });

const stageEl = $('#stage');
const deviceEl = $('#device');
const screenEl = $('#phone-screen');
const viewEl = $('#phone-view');
const backBtn = $('#ph-back');
const homeBtn = $('#ph-home');
const rotateBtn = $('#rotate');
const planeEls = [1, 2, 3].map((i) => $(`.plane[data-layer="${i}"]`));
const labelEls = $$('.plane-label');

/* ───────────── Phone screen: views, Back, Home ───────────── */
let unmount = null;
let lastTouch = -1e9;
const touch = () => { lastTouch = performance.now(); };
['pointerdown', 'keydown', 'input'].forEach((t) => screenEl.addEventListener(t, touch, true));

function goDashboard() {
  const target = $('#dash');
  target.scrollIntoView({ behavior: scrollBehavior(), block: mqDesktop.matches ? 'center' : 'start' });
  const row = target.querySelector('tr.is-new .btn-s') || target.querySelector('.btn-s');
  row?.focus({ preventScroll: true });
}

router.onChange((view, source) => {
  const hadFocus = screenEl.contains(document.activeElement);
  if (unmount) unmount();
  unmount = mountView(viewEl, view, { onViewDashboard: goDashboard });
  viewEl.scrollTop = 0;
  backBtn.disabled = view === 'home';
  homeBtn.disabled = view === 'home';
  document.title = view === 'home' ? 'Softworkz · Prototype' : `${viewEl.querySelector('.ph-title').textContent} · Softworkz prototype`;
  if (source === 'user' || source === 'history') {
    if (source === 'user') touch();
    // Move focus with the view so keyboard and screen-reader users land in it.
    if (hadFocus) {
      const target = view === 'home' ? viewEl.querySelector('.app') : viewEl.querySelector('.ph-title');
      target?.focus({ preventScroll: true });
    }
  }
  if (['web', 'mobile', 'saas', 'enterprise'].includes(view)) selectTab(view, false);
  syncDock();
});
backBtn.addEventListener('click', () => router.back());
homeBtn.addEventListener('click', () => router.home());
screenEl.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && store.state.view !== 'home') { e.preventDefault(); router.back(); }
});

// Fit the wordmark to the page width; the CSS size is only the pre-JS guess.
const wm = $('.wordmark');
const wmSpan = h('span', { text: wm.textContent });
wm.replaceChildren(wmSpan);
function fitWordmark() {
  const target = wm.clientWidth - (mqDesktop.matches ? 36 : 20);
  const size = parseFloat(getComputedStyle(wm).fontSize);
  const w = wmSpan.getBoundingClientRect().width;
  if (w > 0) wm.style.fontSize = `${(size * target / w).toFixed(2)}px`;
}
document.fonts?.ready.then(fitWordmark);
addEventListener('resize', fitWordmark);
fitWordmark();

const tick = () => { const d = new Date(); $('#sb-time').textContent = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
tick(); setInterval(tick, 30000);

/* ───────────── Browse services (same content outside the device) ───────────── */
const tabsEl = $('#svc-tabs');
const panelEl = $('#svc-panel');
let tabOff = null;
let tabKey = null;
const TAB_KEYS = Object.keys(SERVICES);
TAB_KEYS.forEach((k) => {
  tabsEl.append(h('button', { type: 'button', class: 'svc-tab', role: 'tab', id: `tab-${k}`, 'aria-controls': 'svc-panel', 'data-k': k,
    onclick: () => selectTab(k, false) }, SERVICES[k].title.split(' ')[0]));
});
function selectTab(k, focus) {
  if (k === tabKey) return;
  tabKey = k;
  $$('.svc-tab', tabsEl).forEach((b) => {
    const on = b.dataset.k === k;
    b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1;
    if (on && focus) b.focus();
  });
  if (tabOff) tabOff();
  panelEl.replaceChildren();
  panelEl.setAttribute('aria-labelledby', `tab-${k}`);
  tabOff = serviceView(panelEl, k, { heading: 'h3' });
}
tabsEl.addEventListener('keydown', (e) => {
  const i = TAB_KEYS.indexOf(tabKey);
  const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TAB_KEYS.length - 1 : null;
  if (next === null) return;
  e.preventDefault();
  selectTab(TAB_KEYS[(next + TAB_KEYS.length) % TAB_KEYS.length], true);
});
selectTab('web', false);

/* ───────────── Dashboard + brief ───────────── */
const dashEl = $('#dash');
mountDashboard(dashEl);
briefView($('#brief'), { heading: 'h2', title: 'Tell us what you want to build.' });

// On narrow screens the dashboard sits directly beneath the phone.
const dock = $('#dock');
function syncDock() {
  const mobile = !mqDesktop.matches;
  const home = mobile ? dock : $('#dash-slot');
  if (dashEl.parentElement !== home) home.append(dashEl);
  dock.hidden = !(mobile && store.state.view === 'surveyplus');
}
mqDesktop.addEventListener('change', syncDock);
$('#open-sp').addEventListener('click', () => {
  router.go('surveyplus');
  stageEl.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  viewEl.querySelector('.ph-title')?.focus({ preventScroll: true });
});

/* ───────────── The 3D handset ───────────── */
const stage = createStage({
  canvas: $('#gl'), stageEl: $('#stage-3d'), screenEl: deviceEl, grabEl: $('#grab'), floorEl: $('#floor-fade'),
  planeEls, labelEls, reducedMotion,
  onRest(rest) {
    // The live screen only takes input while it is still and facing the visitor.
    screenEl.inert = !rest;
    deviceEl.classList.toggle('is-moving', !rest);
  },
});
if (!stage.ok) {
  root.classList.add('no-webgl');
} else {
  stage.onFlip = (on) => {
    rotateBtn.setAttribute('aria-pressed', on);
    $('#rotate-label').textContent = on ? 'Show screen' : 'Rotate phone';
  };
  rotateBtn.addEventListener('click', () => stage.setFlip(!stage.flipped));
  const fit = () => {
    const w = stageEl.clientWidth;
    stage.setRear(studio ? studio === 'pair' : mqDesktop.matches && w >= 560);
    stage.resize();
  };
  new ResizeObserver(fit).observe(stageEl);
  document.fonts?.ready.then(fit);
  fit();
  if (studio === 'rear') stage.setFlip(true);
}

/* ───────────── Under the hood: planes + record trace ───────────── */
function traceLines(r) {
  const attn = r.status === 'Needs attention';
  return [
    `${r.id} · ${r.status}`,
    attn ? 'status = Needs attention → follow-up required ✓' : 'status = Pass → no follow-up needed ✓',
    `{ id: "${r.id}", site: "${r.site}", status: "${r.status}" }`,
    `${r.id} → operations dashboard, row added`,
  ];
}
function renderLayers() {
  const r = latestRecord();
  const t = traceLines(r);
  $$('[data-trace]').forEach((el) => { el.textContent = t[+el.dataset.trace]; });
  const attn = r.status === 'Needs attention';
  planeEls[0].replaceChildren(
    h('h4', { text: 'Form logic' }),
    h('div', { class: 'pl-block', text: 'IF status = Needs attention' }),
    h('div', { class: `pl-block ${attn ? 'hot' : ''}`, text: 'THEN show + require follow-up' }),
    h('div', { class: `pl-block ${attn ? '' : 'hot'}`, text: 'ELSE save without it' }),
    h('div', { class: 'pl-block', text: `${r.id}: valid ✓` }));
  planeEls[1].replaceChildren(
    h('h4', { text: 'Data' }),
    h('div', { class: 'pl-block hot', text: `id: ${r.id}` }),
    h('div', { class: 'pl-block', text: `site: ${r.site}` }),
    h('div', { class: 'pl-block', text: `area: ${r.area}` }),
    h('div', { class: 'pl-block hot', text: `status: ${r.status}` }),
    h('div', { class: 'pl-block', text: `saved: ${r.savedAt}` }));
  planeEls[2].replaceChildren(
    h('h4', { text: 'Integrations' }),
    h('div', { class: 'pl-block hot', text: `→ Dashboard: ${r.id}` }),
    h('div', { class: 'pl-block', text: '→ Notification' }),
    h('div', { class: 'pl-block', text: '→ Export' }),
    h('p', { style: 'font-size:.8em', text: 'Illustrative targets' }));
}
store.subscribe(renderLayers);
renderLayers();

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
let lastStep = -2;
function setStep(step) {
  if (step === lastStep) return;
  lastStep = step;
  $$('#layers li').forEach((li) => {
    const i = +li.dataset.step;
    li.classList.toggle('on', i === step);
    li.classList.toggle('done', step >= 0 && i < step);
  });
  deviceEl.classList.toggle('trace-on', step === 0);
  planeEls.forEach((p, i) => p.classList.toggle('on', step === i + 1));
  labelEls.forEach((l, i) => l.classList.toggle('on', step === i));
}

/* ───────────── Scroll chapters (native scrolling, nothing hijacked) ───────────── */
const chapters = $$('[data-chapter]');
const CHAPTER_VIEW = { hero: 'home', services: 'home', surveyplus: 'surveyplus', start: 'contact' };
let chapter = null;
let userScrolled = false;

function isBusy() {
  const a = document.activeElement;
  const typing = screenEl.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName);
  const s = store.state;
  const briefInProgress = s.view === 'contact' && (s.brief.what || s.brief.needs || s.brief.when);
  return typing || s.insp.dirty || briefInProgress || performance.now() - lastTouch < 6000;
}

function onChapter(name) {
  if (!userScrolled || studio || !mqDesktop.matches) return;
  const want = CHAPTER_VIEW[name];
  if (!want || isBusy()) return; // never pull the screen out from under a task
  const v = store.state.view;
  if (name === 'services' && SERVICES[v]) return;
  if (name === 'hero' && v !== 'surveyplus' && v !== 'contact') return;
  router.go(want, { source: 'auto' });
}

let ticking = false;
function onScroll() {
  ticking = false;
  const vh = innerHeight;
  let current = chapters[0];
  for (const c of chapters) { if (c.getBoundingClientRect().top <= vh * 0.5) current = c; }
  const name = current.dataset.chapter;
  if (name !== chapter) { chapter = name; onChapter(name); }

  const r = $('#how-we-build').getBoundingClientRect();
  const span = Math.max(1, r.height - vh * 0.45);
  const p = Math.min(1, Math.max(0, (vh * 0.3 - r.top) / span));
  let e, step;
  if (mqDesktop.matches) {
    const inside = p > 0.1 && p < 0.92;
    e = reducedMotion() ? (inside ? 1 : 0) : smooth(0.03, 0.2, p) * (1 - smooth(0.86, 0.98, p));
    step = p < 0.2 || p > 0.86 ? -1 : Math.min(3, Math.floor((p - 0.2) / 0.165));
  } else {
    // In-flow layout: no explode, just walk the list as it passes.
    e = 0;
    const lis = $$('#layers li');
    step = -1;
    lis.forEach((li, i) => { if (li.getBoundingClientRect().top < vh * 0.6) step = i; });
    if (r.bottom < vh * 0.3 || r.top > vh * 0.7) step = -1;
  }
  if (stage.ok && !studio) stage.setExplode(e);
  stageEl.classList.toggle('is-exploded', stage.ok && e > 0.5);
  setStep(step);
}
addEventListener('scroll', () => { userScrolled = true; if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
addEventListener('resize', () => requestAnimationFrame(onScroll));
mqReduce.addEventListener('change', onScroll);

router.init();
syncDock();
onScroll();

// Hooks for scripted checks and local renders.
window.__softworkz = { store, router, stage };
