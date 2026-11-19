// One shared client-side store. The phone, the dashboard and the
// "outside the device" fallbacks all read and write this same object.
// Nothing here is persisted or sent anywhere.

const SEED_RECORDS = [
  { id: 'INS-1001', site: 'Site A', area: 'Loading bay', status: 'Pass', followUp: '', savedAt: '09:12', seed: true },
  { id: 'INS-1002', site: 'Site B', area: 'Roof access', status: 'Needs attention', followUp: 'Replace the faded guard-rail signage.', savedAt: '10:47', seed: true },
  { id: 'INS-1003', site: 'Site C', area: 'Plant room', status: 'Pass', followUp: '', savedAt: '11:30', seed: true },
];

function freshDemo() {
  return {
    insp: { site: 'Site A', area: 'Loading bay', status: '', followUp: '', dirty: false, error: '', savedId: null },
    records: SEED_RECORDS.map((r) => ({ ...r })),
    nextId: 1004,
    newId: null,
    inspectId: null,
    announce: '',
  };
}

const state = {
  view: 'home',
  web: { filter: 'all', q: '' },
  mobile: { done: [true, false, false] },
  saas: { ws: 'ops' },
  ent: { decisions: {} },
  brief: { what: '', needs: '', when: '', copied: false },
  ...freshDemo(),
};

const subs = new Set();

export const store = {
  get state() { return state; },
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  update(mutator) {
    mutator(state);
    subs.forEach((fn) => fn(state));
  },
  resetDemo() {
    Object.assign(state, freshDemo());
    state.announce = 'Demo reset. The dashboard is back to three sample inspections.';
    subs.forEach((fn) => fn(state));
  },
};

export function saveInspection() {
  const s = state;
  const { site, area, status, followUp } = s.insp;
  if (!status) {
    store.update((st) => { st.insp.error = 'status'; });
    return null;
  }
  if (status === 'Needs attention' && !followUp.trim()) {
    store.update((st) => { st.insp.error = 'followUp'; });
    return null;
  }
  const id = `INS-${s.nextId}`;
  const now = new Date();
  const savedAt = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  store.update((st) => {
    st.records.unshift({ id, site, area, status, followUp: status === 'Needs attention' ? followUp.trim() : '', savedAt, seed: false });
    st.nextId += 1;
    st.newId = id;
    st.inspectId = null;
    st.insp = { ...st.insp, dirty: false, error: '', savedId: id };
    st.announce = `${id} saved with status ${status}. The dashboard now shows ${st.records.length} inspections.`;
  });
  return id;
}

export function latestRecord() {
  return state.records.find((r) => !r.seed) || state.records[1];
}
