// Views live in ?view= so section anchors (#services …) stay free for
// in-page links and every phone screen has a shareable URL.
import { store } from './store.js';

export const VIEWS = ['home', 'web', 'mobile', 'saas', 'enterprise', 'surveyplus', 'contact'];

function readUrl() {
  const v = new URLSearchParams(location.search).get('view');
  return VIEWS.includes(v) ? v : 'home';
}

function urlFor(view) {
  const u = new URL(location.href);
  if (view === 'home') u.searchParams.delete('view'); else u.searchParams.set('view', view);
  return u.pathname + u.search + u.hash;
}

let depth = 0;
const listeners = new Set();

export const router = {
  onChange(fn) { listeners.add(fn); },
  get depth() { return depth; },
  // source: 'user' (tap / key) or 'auto' (scroll chapter)
  go(view, { source = 'user', replace = false } = {}) {
    if (!VIEWS.includes(view)) view = 'home';
    if (view === store.state.view) return;
    // Opened straight from a file, some browsers refuse URL changes; the view still switches.
    try {
      if (replace || source === 'auto') {
        history.replaceState({ view, depth }, '', urlFor(view));
      } else {
        history.pushState({ view, depth: depth + 1 }, '', urlFor(view));
        depth += 1;
      }
    } catch { /* keep going without a URL update */ }
    apply(view, source);
  },
  back() {
    if (depth > 0) history.back();
    else if (store.state.view !== 'home') { apply('home', 'user'); try { history.replaceState({ view: 'home', depth: 0 }, '', urlFor('home')); } catch { /* file:// */ } }
  },
  home() { this.go('home'); },
  init() {
    const view = readUrl();
    try { history.replaceState({ view, depth: 0 }, '', urlFor(view)); } catch { /* file:// */ }
    window.addEventListener('popstate', (e) => {
      depth = e.state && typeof e.state.depth === 'number' ? e.state.depth : 0;
      apply(readUrl(), 'history');
    });
    apply(view, 'init', true);
  },
};

function apply(view, source, force = false) {
  if (!force && view === store.state.view) return;
  store.update((st) => { st.view = view; });
  listeners.forEach((fn) => fn(view, source));
}
