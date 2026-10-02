// Small DOM helpers shared by the app's modules.

export const $ = (s) => document.querySelector(s);

export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...children.filter((c) => c != null));
  return node;
}

// A person's color as a CSS value. Person colors only ever mean "this person did this".
export const colorOf = (c) => (c ? `var(--${c})` : 'var(--muted)');

export function toast({ text, color }) {
  const box = $('#toasts');
  const node = el('p', { class: 'toast' }, text);
  node.style.setProperty('--c', colorOf(color));
  box.append(node);
  while (box.children.length > 2) box.firstChild.remove();
  setTimeout(() => node.remove(), 3200);
}

export function debounce(fn, ms) {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
export const clockTime = (ms) => timeFmt.format(new Date(ms));
export const shortDate = (ms) => dayFmt.format(new Date(ms));
