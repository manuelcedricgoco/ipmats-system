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

const pesoWholeFmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
/** ₱76,128,000 for whole pesos; centavos only when there are any (₱1,234.50). */
export const pesoWhole = (n) => {
  if (n === null || n === undefined || n === '') return '—';
  const v = Number(n);
  return Number.isInteger(v) ? pesoWholeFmt.format(v) : peso(v);
};

const WORD = /^[A-Za-zÀ-ÿÑñ'’]+$/;
// A capitalised word right before one of these is a name (Pandurucan River, Tilik Port).
const NAMED_BY_NEXT = new Set(['river', 'creek', 'port', 'bay', 'island', 'lake', 'falls']);
// After "Barangay" these are ordinary nouns, not a barangay's name ("Barangay Road", "Barangay Hall").
const COMMON_AFTER_BARANGAY = new Set(['road', 'roads', 'hall', 'health', 'center', 'centre', 'chapel', 'school', 'covered', 'multi', 'water', 'drainage', 'access', 'bridge']);
// Province-level names that are not in the municipality / barangay lists.
const ALWAYS_PROPER = ['Mindoro', 'Occidental', 'Oriental', 'Lubang', 'MIMAROPA', 'Philippines'];
/**
 * Sentence case for a stored Title Case project name, keeping proper nouns:
 * the first word, place names in `properNames` (municipalities, barangays), the word after
 * "Barangay"/"Brgy.", a capitalised word before River/Creek/Port/Bay/Island/Lake/Falls,
 * acronyms and mixed-case words (RoRo), and codes with digits (K0201+000).
 * "Construction of Flood Control Structure along Iriron River" → "Construction of flood control structure along Iriron river".
 */
export function sentenceCase(text, properNames = []) {
  if (!text) return '';
  const proper = new Map();
  for (const name of [...ALWAYS_PROPER, ...properNames]) for (const w of String(name).split(/[\s–—-]+/)) if (WORD.test(w) && /^[A-ZÑ]/.test(w)) proper.set(w.toLowerCase(), w);
  const isBarangay = (w) => /^(barangay|brgy)$/i.test(w);
  const namesABarangay = (w) => !!w && (proper.has(w.toLowerCase()) || !COMMON_AFTER_BARANGAY.has(w.toLowerCase()));
  const tokens = String(text).match(/[A-Za-zÀ-ÿÑñ'’0-9+.]+|[^A-Za-zÀ-ÿÑñ'’0-9+.]+/g) || [];
  const words = tokens.map((t, i) => (/^[A-Za-zÀ-ÿÑñ'’0-9+.]/.test(t) ? i : -1)).filter((i) => i >= 0);
  words.forEach((ti, n) => {
    const token = tokens[ti];
    const prev = n > 0 ? tokens[words[n - 1]].replace(/\.$/, '') : '';
    const next = n < words.length - 1 ? tokens[words[n + 1]].replace(/\.$/, '').toLowerCase() : '';
    const afterBarangay = isBarangay(prev) && namesABarangay(token.replace(/\.$/, ''));
    const parts = token.split('-'); // Farm-to-Market → each part on its own
    tokens[ti] = parts
      .map((w, i) => {
        const bare = w.replace(/\.$/, '');
        if (!WORD.test(bare)) return w; // digits / codes (K0201+000)
        if (bare.length > 1 && bare === bare.toUpperCase()) return w; // acronym
        if (/[a-zñ][A-ZÑ]/.test(bare)) return w; // mixed case (RoRo)
        if (proper.has(bare.toLowerCase())) return proper.get(bare.toLowerCase()) + w.slice(bare.length);
        if (parts.length === 1 && (afterBarangay || (NAMED_BY_NEXT.has(next) && /^[A-ZÑ]/.test(bare)))) return w;
        if (n === 0 && i === 0) return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        if (parts.length === 1 && isBarangay(bare) && namesABarangay(next)) return w; // "Barangay Buenavista"
        return w.toLowerCase();
      })
      .join('-');
  });
  return tokens.join('');
}

export const titleCase = (s) => (s ? String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—');

export const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
