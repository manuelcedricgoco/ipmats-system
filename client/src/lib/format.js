const pesoFmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 });
const pesoCompactFmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', notation: 'compact', maximumFractionDigits: 1 });
const numFmt = new Intl.NumberFormat('en-PH');

export const peso = (n) => (n === null || n === undefined || n === '' ? '—' : pesoFmt.format(Number(n)));
export const pesoCompact = (n) => (n === null || n === undefined || n === '' ? '—' : pesoCompactFmt.format(Number(n)));
export const number = (n) => (n === null || n === undefined ? '—' : numFmt.format(Number(n)));
export const pct = (n, digits = 1) => (n === null || n === undefined || n === '' ? '—' : `${Number(n).toFixed(digits)}%`);

export function date(value, opts = {}) {
  if (!value) return '—';
  const d = typeof value === 'string' && value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', ...opts });
}

export function dateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function relativeDays(value) {
  if (!value) return '';
  const days = Math.round((new Date(`${String(value).slice(0, 10)}T00:00:00`) - new Date(new Date().toDateString())) / 86400000);
  if (days === 0) return 'today';
  if (days === -1) return 'yesterday';
  if (days < 0) return `${-days} days ago`;
  return `in ${days} days`;
}

export const titleCase = (s) => (s ? String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—');

export const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
