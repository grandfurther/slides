// Every view is a small component: build DOM once, patch it from the store.
// The same components mount inside the phone screen and in the page
// ("Browse services"), so both always show the same state.
import { store, saveInspection } from './store.js';
import { router } from './router.js';

let uidN = 0;
const uid = (p) => `${p}-${++uidN}`;

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

function component(root, build) {
  const update = build(root);
  const off = store.subscribe(update);
  update(store.state);
  return off;
}

const ICONS = {
  web: '<rect x="4.5" y="6" width="15" height="10" rx="1.6"/><path d="M2.5 19h19"/>',
  mobile: '<rect x="7.5" y="3" width="9" height="18" rx="2"/><path d="M11 17.8h2"/>',
  saas: '<path d="M7.5 18.5a4 4 0 0 1-.6-7.95 5.5 5.5 0 0 1 10.6 1.2A3.4 3.4 0 0 1 17 18.5z"/>',
  enterprise: '<path d="M12 4 3.5 8.2 12 12.4l8.5-4.2z"/><path d="m3.5 12.2 8.5 4.2 8.5-4.2"/><path d="m3.5 16.1 8.5 4.2 8.5-4.2"/>',
  surveyplus: '<path d="M6 20v-6M12 20V9M18 20V4"/>',
  contact: '<rect x="3.5" y="6" width="17" height="12" rx="1.6"/><path d="m4 7 8 6.2L20 7"/>',
  back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  home: '<path d="M4.5 11 12 4.5 19.5 11"/><path d="M6.5 10v9h11v-9"/>',
  rotate: '<path d="M4.5 12a7.5 7.5 0 0 1 13-5.1L19.5 9"/><path d="M19.5 4.5V9H15"/><path d="M19.5 12a7.5 7.5 0 0 1-13 5.1L4.5 15"/><path d="M4.5 19.5V15H9"/>',
};
export function icon(name, size = 24) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}

export const APPS = [
  { key: 'web', label: 'Web' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'saas', label: 'SaaS' },
  { key: 'enterprise', label: 'Enterprise' },
  { key: 'surveyplus', label: 'SurveyPlus' },
  { key: 'contact', label: 'Contact' },
];

export const SERVICES = {
  web: {
    title: 'Web platforms',
    line: 'Portals and internal tools that run in any browser, shaped around how your team already works.',
    demoTitle: 'Filter a web portal',
  },
  mobile: {
    title: 'Mobile apps',
    line: 'Apps for people on the move: capture, check and complete work from a phone, on site or in transit.',
    demoTitle: 'Complete a mobile task',
  },
  saas: {
    title: 'SaaS products',
    line: 'Subscription software with separate workspaces, roles and modules, so each customer sees only their own.',
    demoTitle: 'Switch a SaaS workspace',
  },
  enterprise: {
    title: 'Enterprise systems',
    line: 'Systems that carry requests, approvals and records across departments without the email chase.',
    demoTitle: 'Approve a request in a queue',
  },
};

const demoTag = () => h('p', { class: 'tag', text: 'Illustrative demo · not a past project' });

/* ───────────── Home grid ───────────── */
export function homeView(root) {
  return component(root, (el) => {
    const grid = h('div', { class: 'appgrid', role: 'list' },
      APPS.map((a) => h('div', { role: 'listitem' },
        h('button', { class: 'app', type: 'button', 'data-app': a.key, onclick: () => router.go(a.key) },
          h('span', { class: 'app-ic', html: icon(a.key, 30) }),
          h('span', { class: 'app-lb', text: a.label })))));
    el.append(
      h('h2', { class: 'ph-title ph-title-home', tabindex: '-1', text: 'Softworkz' }),
      grid,
      h('p', { class: 'cue', text: 'Tap an app to explore.' }),
    );
    return () => {};
  });
}

/* ───────────── Web: filter a portal ───────────── */
const WEB_ROWS = [
  { t: 'Access card replacement', s: 'Open' },
  { t: 'Meeting room booking', s: 'Closed' },
  { t: 'Equipment loan', s: 'Open' },
  { t: 'Parking permit renewal', s: 'In review' },
  { t: 'Visitor pre-registration', s: 'Closed' },
];
const WEB_FILTERS = ['all', 'Open', 'In review', 'Closed'];

function webDemo(root) {
  return component(root, (el) => {
    const id = uid('webq');
    const input = h('input', { id, class: 'inp', type: 'search', placeholder: 'Search requests', autocomplete: 'off',
      oninput: (e) => store.update((s) => { s.web.q = e.target.value; }) });
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by status' },
      WEB_FILTERS.map((f) => h('button', { type: 'button', class: 'chip', 'data-f': f,
        onclick: () => store.update((s) => { s.web.filter = f; }) }, f === 'all' ? 'All' : f)));
    const list = h('ul', { class: 'rows' });
    const count = h('p', { class: 'meta', 'aria-live': 'polite' });
    el.append(h('label', { class: 'lbl', for: id, text: 'Service requests' }), input, chips, list, count);
    return (s) => {
      if (document.activeElement !== input) input.value = s.web.q;
      chips.querySelectorAll('.chip').forEach((c) => {
        const on = c.dataset.f === s.web.filter;
        c.classList.toggle('on', on);
        c.setAttribute('aria-pressed', on);
      });
      const q = s.web.q.trim().toLowerCase();
      const shown = WEB_ROWS.filter((r) => (s.web.filter === 'all' || r.s === s.web.filter) && (!q || r.t.toLowerCase().includes(q)));
      list.replaceChildren(...shown.map((r) => h('li', { class: 'row' },
        h('span', { class: 'row-t', text: r.t }),
        h('span', { class: `st st-${r.s.toLowerCase().replace(' ', '-')}`, text: r.s }))));
      if (!shown.length) list.append(h('li', { class: 'row row-empty', text: 'No requests match.' }));
      count.textContent = `${shown.length} of ${WEB_ROWS.length} shown`;
    };
  });
}

/* ───────────── Mobile: complete a task ───────────── */
const TASKS = ['Check in at site', 'Photograph the meter reading', 'Collect sign-off'];

function mobileDemo(root) {
  return component(root, (el) => {
    const bar = h('div', { class: 'prog' }, h('span'));
    const meta = h('p', { class: 'meta', 'aria-live': 'polite' });
    const list = h('ul', { class: 'rows' },
      TASKS.map((t, i) => h('li', {},
        h('button', { type: 'button', class: 'task', 'data-i': i, role: 'checkbox',
          onclick: () => store.update((s) => { s.mobile.done[i] = !s.mobile.done[i]; }) },
          h('span', { class: 'tick', 'aria-hidden': 'true' }),
          h('span', { class: 'task-t', text: t })))));
    el.append(h('p', { class: 'lbl', text: 'Today’s visit' }), bar, list, meta);
    return (s) => {
      const n = s.mobile.done.filter(Boolean).length;
      bar.firstChild.style.width = `${(n / TASKS.length) * 100}%`;
      list.querySelectorAll('.task').forEach((b) => {
        const on = !!s.mobile.done[+b.dataset.i];
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on);
      });
      meta.textContent = n === TASKS.length ? 'All tasks complete. Visit ready to close.' : `${n} of ${TASKS.length} complete. Tap a task to finish it.`;
    };
  });
}

/* ───────────── SaaS: switch workspace ───────────── */
const WORKSPACES = {
  ops: { name: 'Operations', role: 'Admin', modules: ['Scheduling', 'Checklists', 'Reports'] },
  fin: { name: 'Finance', role: 'Viewer', modules: ['Invoices', 'Approvals', 'Exports'] },
  field: { name: 'Field team', role: 'Member', modules: ['Forms', 'Offline sync', 'Photo capture'] },
};

function saasDemo(root) {
  return component(root, (el) => {
    const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Workspace' },
      Object.entries(WORKSPACES).map(([k, w]) => h('button', { type: 'button', class: 'seg-b', role: 'radio', 'data-k': k,
        onclick: () => store.update((s) => { s.saas.ws = k; }) }, w.name)));
    const card = h('div', { class: 'card', 'aria-live': 'polite' });
    el.append(h('p', { class: 'lbl', text: 'Workspace' }), seg, card);
    return (s) => {
      seg.querySelectorAll('.seg-b').forEach((b) => {
        const on = b.dataset.k === s.saas.ws;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on);
        b.tabIndex = on ? 0 : -1;
      });
      const w = WORKSPACES[s.saas.ws];
      card.replaceChildren(
        h('p', { class: 'card-h' }, h('strong', { text: w.name }), h('span', { class: 'st', text: `Your role: ${w.role}` })),
        h('ul', { class: 'mods' }, w.modules.map((m) => h('li', { text: m }))),
        h('p', { class: 'meta', text: 'Each workspace keeps its own modules, people and data.' }),
      );
    };
  });
}

/* ───────────── Enterprise: approve a request ───────────── */
const REQUESTS = [
  { id: 'REQ-21', t: 'Purchase request', d: 'Safety gloves, 40 pairs' },
  { id: 'REQ-22', t: 'Access request', d: 'Plant room, one week' },
  { id: 'REQ-23', t: 'Leave request', d: 'Two days, next month' },
];

function enterpriseDemo(root) {
  return component(root, (el) => {
    const meta = h('p', { class: 'meta', 'aria-live': 'polite' });
    const list = h('ul', { class: 'rows' });
    el.append(h('p', { class: 'lbl', text: 'Approval queue' }), list, meta);
    const decide = (id, v) => store.update((s) => { if (v) s.ent.decisions[id] = v; else delete s.ent.decisions[id]; });
    return (s) => {
      const active = document.activeElement;
      const keep = el.contains(active) ? active.dataset.key : null;
      list.replaceChildren(...REQUESTS.map((r) => {
        const d = s.ent.decisions[r.id];
        return h('li', { class: `req ${d ? 'req-done' : ''}` },
          h('div', { class: 'req-t' }, h('span', { class: 'mono', text: r.id }), h('strong', { text: r.t }), h('span', { class: 'req-d', text: r.d })),
          d
            ? h('div', { class: 'req-a' },
                h('span', { class: `st ${d === 'Approved' ? 'st-ok' : 'st-in-review'}`, text: d }),
                h('button', { type: 'button', class: 'btn-s', 'data-key': `${r.id}-u`, onclick: () => decide(r.id, null), 'aria-label': `Undo decision on ${r.id}` }, 'Undo'))
            : h('div', { class: 'req-a' },
                h('button', { type: 'button', class: 'btn-s btn-s-solid', 'data-key': `${r.id}-a`, onclick: () => decide(r.id, 'Approved'), 'aria-label': `Approve ${r.id}` }, 'Approve'),
                h('button', { type: 'button', class: 'btn-s', 'data-key': `${r.id}-r`, onclick: () => decide(r.id, 'Returned'), 'aria-label': `Return ${r.id}` }, 'Return')));
      }));
      if (keep) {
        const id = keep.split('-').slice(0, 2).join('-');
        (list.querySelector(`[data-key="${keep}"]`) || list.querySelector(`[data-key^="${id}"]`))?.focus();
      }
      const pending = REQUESTS.length - Object.keys(s.ent.decisions).length;
      meta.textContent = pending ? `${pending} pending` : 'Queue clear.';
    };
  });
}

const DEMOS = { web: webDemo, mobile: mobileDemo, saas: saasDemo, enterprise: enterpriseDemo };

export function serviceView(root, key, { heading = 'h2' } = {}) {
  const svc = SERVICES[key];
  const demo = h('div', { class: 'demo' });
  root.append(
    h(heading, { class: 'ph-title', tabindex: '-1', text: svc.title }),
    h('p', { class: 'ph-line', text: svc.line }),
    h('div', { class: 'demo-wrap' }, h('p', { class: 'demo-h', text: svc.demoTitle }), demo, demoTag()),
  );
  return DEMOS[key](demo);
}

/* ───────────── SurveyPlus: inspection form ───────────── */
const SITES = ['Site A', 'Site B', 'Site C'];
const AREAS = ['Loading bay', 'Roof access', 'Plant room', 'Entrance'];
const STATUSES = ['Pass', 'Needs attention'];

export function inspectionView(root, { onViewDashboard } = {}) {
  return component(root, (el) => {
    const n = uid('insp');
    const set = (fn) => store.update((s) => { fn(s.insp); s.insp.dirty = true; s.insp.error = ''; });
    const site = h('select', { id: `${n}-site`, class: 'inp', onchange: (e) => set((i) => { i.site = e.target.value; }) },
      SITES.map((v) => h('option', { value: v, text: v })));
    const area = h('select', { id: `${n}-area`, class: 'inp', onchange: (e) => set((i) => { i.area = e.target.value; }) },
      AREAS.map((v) => h('option', { value: v, text: v })));
    const radios = STATUSES.map((v, i) => {
      const r = h('input', { type: 'radio', name: `${n}-status`, id: `${n}-s${i}`, value: v, onchange: () => set((x) => { x.status = v; }) });
      return h('label', { class: 'radio', for: `${n}-s${i}` }, r, h('span', { text: v }));
    });
    const statusErr = h('p', { class: 'err', id: `${n}-serr`, role: 'alert', hidden: true, text: 'Choose a status before saving.' });
    const fu = h('textarea', { id: `${n}-fu`, class: 'inp', rows: '2', required: true, 'aria-describedby': `${n}-fuh`,
      oninput: (e) => set((i) => { i.followUp = e.target.value; }) });
    const fuErr = h('p', { class: 'err', role: 'alert', hidden: true, text: 'Describe the follow-up before saving.' });
    const fuWrap = h('div', { class: 'field field-cond', hidden: true },
      h('label', { class: 'lbl', for: `${n}-fu` }, 'Follow-up needed ', h('span', { class: 'req-mark', text: '(required)' })),
      fu,
      h('p', { class: 'hint', id: `${n}-fuh`, text: 'Shown because the status is Needs attention.' }),
      fuErr);
    const form = h('form', { class: 'form', novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      const id = saveInspection();
      if (!id) {
        const err = store.state.insp.error;
        (err === 'followUp' ? fu : form.querySelector('input[type=radio]')).focus();
      }
    } },
      h('div', { class: 'field2' },
        h('div', { class: 'field' }, h('label', { class: 'lbl', for: `${n}-site`, text: 'Site' }), site),
        h('div', { class: 'field' }, h('label', { class: 'lbl', for: `${n}-area`, text: 'Area' }), area)),
      h('fieldset', { class: 'field', 'aria-describedby': `${n}-serr` }, h('legend', { class: 'lbl', text: 'Status' }), h('div', { class: 'radios' }, radios), statusErr),
      fuWrap,
      h('button', { class: 'btn-p', type: 'submit', text: 'Save sample inspection' }));

    const savedMsg = h('p', { class: 'saved-msg', tabindex: '-1' });
    const saved = h('div', { class: 'saved', hidden: true },
      h('span', { class: 'saved-ic', 'aria-hidden': 'true', text: '✓' }),
      savedMsg,
      h('p', { class: 'meta', text: 'The same record is now in the operations dashboard, in this browser tab only.' }),
      h('div', { class: 'saved-a' },
        h('button', { class: 'btn-p', type: 'button', text: 'See it in the dashboard', onclick: () => onViewDashboard && onViewDashboard() }),
        h('button', { class: 'btn-s', type: 'button', text: 'New inspection',
          onclick: () => store.update((s) => { s.insp = { ...s.insp, status: '', followUp: '', savedId: null, dirty: false, error: '' }; }) })));

    el.append(
      h('h2', { class: 'ph-title', tabindex: '-1', text: 'Site inspection' }),
      h('p', { class: 'tag', text: 'Fictional form · sample data only' }),
      form, saved);

    let wasSaved = null;
    return (s) => {
      const i = s.insp;
      site.value = i.site; area.value = i.area;
      form.querySelectorAll('input[type=radio]').forEach((r) => { r.checked = r.value === i.status; });
      const need = i.status === 'Needs attention';
      fuWrap.hidden = !need;
      if (document.activeElement !== fu) fu.value = i.followUp;
      statusErr.hidden = i.error !== 'status';
      fuErr.hidden = i.error !== 'followUp';
      fu.setAttribute('aria-invalid', i.error === 'followUp');
      const isSaved = !!i.savedId;
      form.hidden = isSaved; saved.hidden = !isSaved;
      if (isSaved) {
        const rec = s.records.find((r) => r.id === i.savedId);
        savedMsg.replaceChildren(h('strong', { class: 'mono', text: i.savedId }), ' saved · ', h('span', { text: rec ? rec.status : '' }));
        if (wasSaved === false && el.isConnected) savedMsg.focus({ preventScroll: true });
      }
      wasSaved = isSaved;
    };
  });
}

/* ───────────── Contact: local project brief ───────────── */
export const EMAIL = 'hello@softworkz.net';
const WHAT = ['A web platform', 'A mobile app', 'A SaaS product', 'An enterprise system', 'Something else'];
const WHEN = ['As soon as possible', 'Within 3 months', 'In 3 to 6 months', 'No fixed date yet'];

export function briefText(b) {
  return [
    'Project brief for Softworkz',
    '',
    `What I want to build: ${b.what || '(not answered yet)'}`,
    `What it needs to do: ${b.needs.trim() || '(not answered yet)'}`,
    `When I need it: ${b.when || '(not answered yet)'}`,
  ].join('\n');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { class: 'sr-only', 'aria-hidden': 'true' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export function briefView(root, { heading = 'h2', title = 'Start a project' } = {}) {
  return component(root, (el) => {
    const n = uid('brief');
    const set = (fn) => store.update((s) => { fn(s.brief); s.brief.copied = false; });
    const what = h('select', { id: `${n}-what`, class: 'inp', onchange: (e) => set((b) => { b.what = e.target.value; }) },
      h('option', { value: '', text: 'Choose one' }), WHAT.map((v) => h('option', { value: v, text: v })));
    const needs = h('textarea', { id: `${n}-needs`, class: 'inp', rows: '3', placeholder: 'The main jobs it has to handle',
      oninput: (e) => set((b) => { b.needs = e.target.value; }) });
    const when = h('select', { id: `${n}-when`, class: 'inp', onchange: (e) => set((b) => { b.when = e.target.value; }) },
      h('option', { value: '', text: 'Choose one' }), WHEN.map((v) => h('option', { value: v, text: v })));
    const out = h('pre', { class: 'brief-out', tabindex: '0', 'aria-label': 'Generated brief' });
    const status = h('p', { class: 'sent-status', role: 'status' });
    const mail = h('a', { class: 'btn-s', href: `mailto:${EMAIL}` }, 'Open email draft');
    const copy = h('button', { class: 'btn-p', type: 'button', text: 'Copy brief', onclick: async () => {
      const ok = await copyText(briefText(store.state.brief));
      store.update((s) => { s.brief.copied = ok ? 'yes' : 'failed'; });
    } });
    el.append(
      h(heading, { class: 'ph-title', tabindex: '-1', text: title }),
      h('div', { class: 'form' },
        h('div', { class: 'field' }, h('label', { class: 'lbl', for: `${n}-what`, text: 'What do you want to build?' }), what),
        h('div', { class: 'field' }, h('label', { class: 'lbl', for: `${n}-needs`, text: 'What does it need to do?' }), needs),
        h('div', { class: 'field' }, h('label', { class: 'lbl', for: `${n}-when`, text: 'When do you need it?' }), when)),
      h('p', { class: 'lbl', text: 'Your brief' }),
      out,
      status,
      h('div', { class: 'brief-a' }, copy, mail),
      h('p', { class: 'meta' }, 'The draft opens in your own email app, addressed to ', h('span', { class: 'mono', text: EMAIL }), '. You choose whether to send it.'));
    return (s) => {
      const b = s.brief;
      what.value = b.what; when.value = b.when;
      if (document.activeElement !== needs) needs.value = b.needs;
      const text = briefText(b);
      out.textContent = text;
      mail.href = `mailto:${EMAIL}?subject=${encodeURIComponent('Project brief')}&body=${encodeURIComponent(text)}`;
      status.textContent = b.copied === 'yes' ? 'Brief copied to your clipboard. Nothing has been sent.'
        : b.copied === 'failed' ? 'Copy was blocked by the browser. Select the brief text instead. Nothing has been sent.'
        : 'Nothing has been sent.';
    };
  });
}

/* ───────────── Mount by view name ───────────── */
export function mountView(root, view, opts = {}) {
  root.replaceChildren();
  root.dataset.view = view;
  if (view === 'home') return homeView(root);
  if (view === 'surveyplus') return inspectionView(root, opts);
  if (view === 'contact') return briefView(root, opts);
  return serviceView(root, view, opts);
}
