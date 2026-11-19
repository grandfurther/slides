// Operations dashboard: a second surface on the same store as the phone form.
import { store } from './store.js';
import { h } from './views.js';

export function mountDashboard(root) {
  const total = h('strong', { class: 'kpi-n' });
  const attn = h('strong', { class: 'kpi-n' });
  const tbody = h('tbody');
  const detail = h('div', { class: 'dash-detail', tabindex: '-1' });
  const live = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });

  root.append(
    h('div', { class: 'dash-head' },
      h('div', {},
        h('p', { class: 'dash-eyebrow mono', text: 'Operations dashboard · desktop' }),
        h('h3', { class: 'dash-title', text: 'Site inspections' })),
      h('button', { class: 'btn-s', type: 'button', text: 'Reset demo', onclick: () => store.resetDemo() })),
    h('div', { class: 'kpis' },
      h('div', { class: 'kpi' }, total, h('span', { text: 'Inspections' })),
      h('div', { class: 'kpi' }, attn, h('span', { text: 'Needs attention' }))),
    h('div', { class: 'dash-tablewrap' },
      h('table', { class: 'dash-table' },
        h('caption', { class: 'sr-only', text: 'Sample inspections, newest first' }),
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col', text: 'ID' }), h('th', { scope: 'col', text: 'Site' }),
          h('th', { scope: 'col', text: 'Status' }), h('th', { scope: 'col', text: 'Saved' }),
          h('th', { scope: 'col' }, h('span', { class: 'sr-only', text: 'Actions' })))),
        tbody)),
    detail,
    h('p', { class: 'meta', text: 'Fictional sample data held in this browser tab. No submissions, customer data or SurveyPlus API calls.' }),
    live);

  let lastTotal = null;
  const update = (s) => {
    const keep = root.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    total.textContent = s.records.length;
    attn.textContent = s.records.filter((r) => r.status === 'Needs attention').length;
    if (lastTotal !== null && lastTotal !== s.records.length) {
      total.classList.remove('bump'); void total.offsetWidth; total.classList.add('bump');
    }
    lastTotal = s.records.length;
    tbody.replaceChildren(...s.records.map((r) => {
      const isNew = r.id === s.newId;
      return h('tr', { class: `${isNew ? 'is-new' : ''} ${r.id === s.inspectId ? 'is-open' : ''}`, 'data-id': r.id },
        h('th', { scope: 'row', class: 'mono' }, r.id, isNew ? h('span', { class: 'new-badge', text: 'New' }) : null),
        h('td', { text: r.site }),
        h('td', {}, h('span', { class: `st ${r.status === 'Pass' ? 'st-ok' : 'st-attn'}`, text: r.status })),
        h('td', { class: 'mono', text: r.savedAt }),
        h('td', { class: 'td-a' }, h('button', { class: 'btn-s', type: 'button', 'data-key': `i-${r.id}`,
          'aria-expanded': r.id === s.inspectId, 'aria-label': `Inspect ${r.id}`,
          onclick: () => store.update((st) => { st.inspectId = st.inspectId === r.id ? null : r.id; }) }, 'Inspect')));
    }));
    const rec = s.records.find((r) => r.id === s.inspectId);
    detail.hidden = !rec;
    if (rec) {
      detail.replaceChildren(
        h('p', { class: 'dash-eyebrow mono', text: `Record ${rec.id}` }),
        h('dl', { class: 'dl' },
          h('dt', { text: 'Site' }), h('dd', { text: `${rec.site} · ${rec.area}` }),
          h('dt', { text: 'Status' }), h('dd', { text: rec.status }),
          h('dt', { text: 'Follow-up' }), h('dd', { text: rec.followUp || 'None recorded' }),
          h('dt', { text: 'Saved' }), h('dd', { text: rec.savedAt }),
          h('dt', { text: 'Source' }), h('dd', { text: rec.seed ? 'Sample record' : 'Phone form in this demo' })));
    }
    if (keep) root.querySelector(`[data-key="${keep}"]`)?.focus({ preventScroll: true });
    if (live.textContent !== s.announce) live.textContent = s.announce;
  };
  store.subscribe(update);
  update(store.state);
}
