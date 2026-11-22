/**
 * Shared layout for every IPMATS PDF report (pdfkit).
 *
 * One look for all reports: DPWH 360° letterhead with the portal logo on page 1, a running header
 * on later pages, numbered sections, summary cards, bordered tables that repeat their header row
 * after a page break, record cards for long text, a signature block and a footer with page numbers.
 * Colours and the typeface (Public Sans) are the web portal's.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const asset = (p) => fileURLToPath(new URL(`../assets/${p}`, import.meta.url));
const LOGO = asset('dpwh-logo.png');
const FONT_FILES = {
  Body: asset('fonts/public-sans-latin-400-normal.woff'),
  Semibold: asset('fonts/public-sans-latin-600-normal.woff'),
  Bold: asset('fonts/public-sans-latin-700-normal.woff'),
};
const FALLBACK = { Body: 'Helvetica', Semibold: 'Helvetica-Bold', Bold: 'Helvetica-Bold' };

/** Portal palette (client/tailwind.config.js). */
export const COLORS = {
  navy: '#0b2545',
  brand: '#1a3d70',
  brandTint: '#eef4fb',
  brandLine: '#d6e4f4',
  brandSoft: '#adc8e8',
  accent: '#e9a110',
  text: '#1e293b',
  muted: '#64748b',
  border: '#cbd5e1',
  zebra: '#f8fafc',
  white: '#ffffff',
};

export const FLAG_STYLE = {
  green: { color: '#15803d', tint: '#dcfce7', label: 'GREEN' },
  yellow: { color: '#b45309', tint: '#fef3c7', label: 'YELLOW' },
  red: { color: '#b91c1c', tint: '#fee2e2', label: 'RED' },
};

const TZ = 'Asia/Manila';
/** Characters the embedded font cannot draw are spelled out instead of printing empty boxes. */
export const safe = (v) =>
  v == null || v === ''
    ? '—'
    : String(v)
        .replace(/₱\s?/g, 'PHP ')
        .replace(/\s*→\s*/g, ' to ')
        .replace(/≥/g, '>=')
        .replace(/≤/g, '<=');

export const fmt = {
  peso: (n) => (n == null || n === '' ? '—' : `PHP ${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`),
  pct: (n, digits = 1) => (n == null || n === '' ? '—' : `${Number(n).toFixed(digits)}%`),
  date: (d) => (d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: TZ }) : '—'),
  dateTime: (d) => (d ? new Date(d).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ }) : '—'),
  label: (s) => (s ? String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—'),
  stamp: (d = new Date()) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}`;
  },
};

const MARGIN = { top: 66, bottom: 60, left: 44, right: 44 };

export class Report {
  /**
   * @param {object} o
   * @param {string} o.title       big title on page 1, also the running header
   * @param {string} o.docType     e.g. "PROJECT AUDIT REPORT"
   * @param {string} o.reference   report reference number
   * @param {string} [o.subtitle]
   * @param {string} o.generatedBy
   * @param {Array<[string,string]>} [o.meta] extra label/value pairs for the details box
   */
  constructor({ title, docType, reference, subtitle, generatedBy, meta = [] }) {
    this.title = safe(title);
    this.docType = docType;
    this.reference = reference;
    this.generatedBy = safe(generatedBy);
    this.generatedAt = new Date();
    this.doc = new PDFDocument({
      size: 'A4',
      bufferPages: true,
      margins: MARGIN,
      info: { Title: `${docType} — ${this.title}`, Author: 'IPMATS — DPWH 360° Occidental Mindoro', Subject: docType, Creator: 'IPMATS' },
    });
    this.fonts = { ...FALLBACK };
    for (const [name, file] of Object.entries(FONT_FILES)) {
      try {
        if (existsSync(file)) {
          this.doc.registerFont(name, file);
          this.fonts[name] = name;
        }
      } catch {
        /* keep the built-in fallback font */
      }
    }
    this.left = MARGIN.left;
    this.width = this.doc.page.width - MARGIN.left - MARGIN.right;
    this.bottom = this.doc.page.height - MARGIN.bottom;
    this.letterhead();
    this.titleBlock(subtitle, meta);
  }

  // ---------------------------------------------------------------- basics
  font(kind, size, color = COLORS.text) {
    this.doc.font(this.fonts[kind]).fontSize(size).fillColor(color);
    return this.doc;
  }

  get y() {
    return this.doc.y;
  }

  set y(v) {
    this.doc.y = v;
    this.doc.x = this.left;
  }

  addPage() {
    this.doc.addPage();
    this.y = MARGIN.top;
  }

  /** Start a new page when fewer than `h` points are left (blocks that must stay together). */
  ensureSpace(h) {
    if (this.y + h > this.bottom) this.addPage();
  }

  textHeight(text, kind, size, width, opts = {}) {
    this.font(kind, size);
    return this.doc.heightOfString(safe(text), { width, lineGap: opts.lineGap ?? 1.5 });
  }

  // ---------------------------------------------------------------- page 1
  letterhead() {
    const { doc } = this;
    const W = doc.page.width;
    doc.save();
    doc.rect(0, 0, W, 96).fill(COLORS.navy);
    doc.rect(0, 96, W, 3.5).fill(COLORS.accent);
    // logo on a white disc, as in the portal header
    doc.circle(this.left + 26, 48, 27).fill(COLORS.white);
    if (existsSync(LOGO)) doc.image(LOGO, this.left + 3, 25, { width: 46, height: 46 });
    const tx = this.left + 66;
    this.font('Bold', 17, COLORS.white).text('DPWH 360°', tx, 24, { lineBreak: false });
    this.font('Semibold', 9.5, COLORS.brandLine).text('Infrastructure Project Monitoring and Transparency System', tx, 47, { lineBreak: false });
    this.font('Body', 8.5, COLORS.brandSoft).text('Occidental Mindoro  ·  MIMAROPA Region', tx, 61, { lineBreak: false });
    const rw = 190;
    const rx = W - MARGIN.right - rw;
    this.font('Bold', 9, COLORS.accent).text(this.docType, rx, 27, { width: rw, align: 'right', characterSpacing: 0.6, lineBreak: false });
    this.font('Body', 8.5, COLORS.white).text(`Ref. ${this.reference}`, rx, 43, { width: rw, align: 'right', lineBreak: false });
    this.font('Body', 8, COLORS.brandSoft).text(fmt.dateTime(this.generatedAt), rx, 57, { width: rw, align: 'right', lineBreak: false });
    doc.restore();
    this.y = 122;
  }

  titleBlock(subtitle, meta) {
    this.font('Bold', 18, COLORS.navy).text(this.title, this.left, this.y, { width: this.width, lineGap: 1 });
    if (subtitle) this.font('Body', 10, COLORS.muted).text(safe(subtitle), this.left, this.doc.y + 2, { width: this.width });
    const pairs = [
      ['Report reference', this.reference],
      ['Date generated', fmt.dateTime(this.generatedAt)],
      ['Prepared by', this.generatedBy],
      ...meta,
    ];
    this.y = this.doc.y + 12;
    this.detailsBox(pairs);
  }

  /** Light box of label / value pairs laid out in up to 4 columns; column widths follow their content. */
  detailsBox(pairs) {
    const cols = Math.min(4, pairs.length);
    const pad = 9;
    const gap = 10;
    const inner = this.width - pad * 2;
    // natural single-line width of each column (label or value, whichever is longer)
    const natural = Array.from({ length: cols }, (_, c) =>
      Math.max(
        ...pairs
          .filter((_, i) => i % cols === c)
          .map(([k, v]) => {
            this.font('Semibold', 9);
            const vw = this.doc.widthOfString(safe(v));
            this.font('Semibold', 6.8);
            return Math.max(vw, this.doc.widthOfString(String(k).toUpperCase(), { characterSpacing: 0.4 }));
          }),
      ) + gap,
    );
    const sum = natural.reduce((a, b) => a + b, 0);
    const cw = sum <= inner ? natural.map((w) => w + (inner - sum) / cols) : natural.map(() => inner / cols);
    const xs = cw.reduce((a, w, i) => [...a, i === 0 ? this.left + pad : a[i - 1] + cw[i - 1]], []);
    const rows = [];
    for (let i = 0; i < pairs.length; i += cols) rows.push(pairs.slice(i, i + cols));
    const rowH = rows.map((r) => Math.max(...r.map(([, v], ci) => this.textHeight(v, 'Semibold', 9, cw[ci] - gap))) + 14);
    const h = rowH.reduce((a, b) => a + b, 0) + pad * 2 - 4;
    this.ensureSpace(h);
    const y0 = this.y;
    this.doc.roundedRect(this.left, y0, this.width, h, 5).fillAndStroke(COLORS.brandTint, COLORS.brandLine);
    let y = y0 + pad;
    rows.forEach((r, ri) => {
      r.forEach(([k, v], ci) => {
        this.font('Semibold', 6.8, COLORS.muted).text(String(k).toUpperCase(), xs[ci], y, { width: cw[ci] - gap, characterSpacing: 0.4, height: 9, ellipsis: true });
        this.font('Semibold', 9, COLORS.text).text(safe(v), xs[ci], y + 10, { width: cw[ci] - gap, lineGap: 1.5 });
      });
      y += rowH[ri];
    });
    this.y = y0 + h + 16;
  }

  // ---------------------------------------------------------------- building blocks
  section(title) {
    this.ensureSpace(70);
    this.sectionNo = (this.sectionNo || 0) + 1;
    const y = this.y + 4;
    this.doc.rect(this.left, y, 3.5, 15).fill(COLORS.accent);
    this.font('Bold', 12, COLORS.navy).text(`${this.sectionNo}. ${safe(title)}`, this.left + 11, y + 1, { width: this.width - 11, lineBreak: false });
    this.doc.moveTo(this.left, y + 22).lineTo(this.left + this.width, y + 22).lineWidth(0.6).strokeColor(COLORS.brandLine).stroke();
    this.y = y + 32;
  }

  /** Row of summary cards: [{ label, value, hint, color }] */
  kpis(items) {
    const gap = 8;
    const n = items.length;
    const w = (this.width - gap * (n - 1)) / n;
    const h = 58;
    this.ensureSpace(h + 10);
    const y = this.y;
    items.forEach((it, i) => {
      const x = this.left + i * (w + gap);
      this.doc.roundedRect(x, y, w, h, 5).lineWidth(0.7).fillAndStroke(COLORS.white, COLORS.border);
      this.doc.rect(x, y + 6, 3, h - 12).fill(it.color || COLORS.brand);
      this.font('Semibold', 6.8, COLORS.muted).text(String(it.label).toUpperCase(), x + 11, y + 9, { width: w - 16, height: 9, characterSpacing: 0.4, ellipsis: true });
      this.font('Bold', 14, it.color || COLORS.navy).text(safe(it.value), x + 11, y + 21, { width: w - 16, height: 17, ellipsis: true });
      if (it.hint) this.font('Body', 7, COLORS.muted).text(safe(it.hint), x + 11, y + 40, { width: w - 16, height: 16, ellipsis: true, lineGap: 0.5 });
    });
    this.y = y + h + 14;
  }

  /** Bordered label / value grid, `columns` pairs per row. Rows never split across pages. */
  keyValue(pairs, { columns = 2 } = {}) {
    const pw = this.width / columns;
    const lw = Math.min(118, pw * 0.42);
    const pad = 5;
    for (let i = 0; i < pairs.length; i += columns) {
      const row = pairs.slice(i, i + columns);
      const h = Math.max(...row.map(([k, v]) => Math.max(this.textHeight(k, 'Semibold', 8, lw - pad * 2), this.textHeight(v, 'Body', 8.5, pw - lw - pad * 2)))) + pad * 2;
      this.ensureSpace(h);
      const y = this.y;
      row.forEach(([k, v], c) => {
        const x = this.left + c * pw;
        this.doc.rect(x, y, lw, h).fill(COLORS.brandTint);
        this.doc.rect(x, y, pw, h).lineWidth(0.5).stroke(COLORS.border);
        this.doc.moveTo(x + lw, y).lineTo(x + lw, y + h).lineWidth(0.5).stroke(COLORS.border);
        this.font('Semibold', 8, COLORS.brand).text(safe(k), x + pad, y + pad, { width: lw - pad * 2, lineGap: 1.5 });
        this.font('Body', 8.5, COLORS.text).text(safe(v), x + lw + pad, y + pad, { width: pw - lw - pad * 2, lineGap: 1.5 });
      });
      this.y = y + h;
    }
    this.y += 14;
  }

  /** Small rounded label, e.g. a flag colour. Returns its width. */
  pill(x, y, text, style) {
    const t = safe(text);
    this.font('Bold', 6.8);
    const w = this.doc.widthOfString(t, { characterSpacing: 0.3 }) + 10;
    this.doc.roundedRect(x, y, w, 12, 6).fill(style.tint);
    this.font('Bold', 6.8, style.color).text(t, x + 5, y + 2.6, { characterSpacing: 0.3, lineBreak: false });
    return w;
  }

  /**
   * Bordered data table. columns: [{ header, width (relative), align, value: (row) => string | { text, flag, color, bold } }]
   * The header row repeats on every page; a row is never split.
   */
  table(columns, rows, { emptyText = 'No records.', fontSize = 8.2 } = {}) {
    if (!rows.length) {
      this.font('Body', 8.5, COLORS.muted).text(emptyText, this.left, this.y, { width: this.width });
      this.y = this.doc.y + 14;
      return;
    }
    const total = columns.reduce((s, c) => s + (c.width || 1), 0);
    const widths = columns.map((c) => (this.width * (c.width || 1)) / total);
    const xs = widths.reduce((a, w, i) => [...a, i === 0 ? this.left : a[i - 1] + widths[i - 1]], []);
    const padX = 5;
    const padY = 4.5;

    const drawHeader = (continued) => {
      const labels = columns.map((c, i) => (continued && i === 0 ? `${c.header} (cont.)` : c.header));
      const h = Math.max(...labels.map((l, i) => this.textHeight(l, 'Semibold', 7.6, widths[i] - padX * 2))) + padY * 2;
      const y = this.y;
      this.doc.rect(this.left, y, this.width, h).fill(COLORS.navy);
      labels.forEach((l, i) => {
        this.font('Semibold', 7.6, COLORS.white).text(safe(l), xs[i] + padX, y + padY, { width: widths[i] - padX * 2, align: columns[i].align || 'left', lineGap: 1.5 });
      });
      this.y = y + h;
    };

    const cellOf = (c, r) => {
      const v = c.value(r);
      return v && typeof v === 'object' ? v : { text: v };
    };

    this.ensureSpace(60);
    drawHeader(false);
    rows.forEach((r, ri) => {
      const cells = columns.map((c) => cellOf(c, r));
      const h =
        Math.max(
          ...cells.map((cell, i) => (cell.flag ? 12 : this.textHeight(cell.text, cell.bold ? 'Semibold' : 'Body', fontSize, widths[i] - padX * 2))),
        ) +
        padY * 2;
      if (this.y + h > this.bottom) {
        this.addPage();
        drawHeader(true);
      }
      const y = this.y;
      if (ri % 2 === 1) this.doc.rect(this.left, y, this.width, h).fill(COLORS.zebra);
      cells.forEach((cell, i) => {
        const x = xs[i] + padX;
        if (cell.flag) {
          const st = FLAG_STYLE[cell.flag] || { color: COLORS.muted, tint: '#e2e8f0' };
          this.pill(x, y + padY, cell.text ?? st.label ?? '—', st);
        } else {
          this.font(cell.bold ? 'Semibold' : 'Body', fontSize, cell.color || COLORS.text).text(safe(cell.text), x, y + padY, {
            width: widths[i] - padX * 2,
            align: columns[i].align || 'left',
            lineGap: 1.5,
          });
        }
      });
      this.doc.moveTo(this.left, y + h).lineTo(this.left + this.width, y + h).lineWidth(0.4).stroke(COLORS.border);
      this.y = y + h;
    });
    // outer frame of the last page's part of the table is enough for readability: left/right rules
    this.y += 14;
  }

  /**
   * Card for records with long free text (auditor decisions, findings).
   * { accent, title, badges: [{ text, flag } | { text, style }], fields: [[label, text]] }
   */
  card({ accent = COLORS.brand, title, badges = [], fields = [] }) {
    const inner = this.width - 16;
    const titleH = this.textHeight(title, 'Semibold', 9.5, inner);
    const fieldsH = fields.reduce((s, [k, v]) => s + this.textHeight(`${k}: ${v}`, 'Body', 8.5, inner) + 3, 0);
    const h = titleH + (badges.length ? 18 : 0) + fieldsH + 16;
    const pageH = this.bottom - MARGIN.top;
    this.ensureSpace(Math.min(h, pageH));
    const startPage = this.doc.bufferedPageRange().count;
    const y0 = this.y;
    this.font('Semibold', 9.5, COLORS.navy).text(safe(title), this.left + 12, y0 + 6, { width: inner, lineGap: 1.5 });
    if (badges.length) {
      let bx = this.left + 12;
      const by = this.doc.y + 3;
      for (const b of badges) bx += this.pill(bx, by, b.text, b.flag ? FLAG_STYLE[b.flag] : b.style || { color: COLORS.brand, tint: COLORS.brandTint }) + 4;
      this.y = by + 15;
    }
    for (const [k, v] of fields) {
      this.font('Semibold', 8.5, COLORS.brand).text(`${safe(k)}: `, this.left + 12, this.doc.y + 2, { width: inner, continued: true, lineGap: 1.5 });
      this.font('Body', 8.5, COLORS.text).text(safe(v), { width: inner, lineGap: 1.5 });
    }
    const y1 = this.doc.y + 6;
    // accent bar only when the card stayed on one page (long text may flow on)
    if (this.doc.bufferedPageRange().count === startPage) {
      this.doc.rect(this.left, y0, 3, y1 - y0).fill(accent);
      this.doc.moveTo(this.left, y1).lineTo(this.left + this.width, y1).lineWidth(0.4).stroke(COLORS.border);
    }
    this.y = y1 + 8;
  }

  paragraph(text, { size = 9, color = COLORS.text, kind = 'Body' } = {}) {
    this.font(kind, size, color).text(safe(text), this.left, this.y, { width: this.width, lineGap: 2 });
    this.y = this.doc.y + 8;
  }

  /** "Prepared by / Reviewed by" lines for a printed copy. */
  signatures(entries) {
    this.ensureSpace(80);
    const gap = 28;
    const w = (this.width - gap * (entries.length - 1)) / entries.length;
    const y = this.y + 30;
    entries.forEach((e, i) => {
      const x = this.left + i * (w + gap);
      this.font('Semibold', 7.5, COLORS.muted).text(String(e.label).toUpperCase(), x, y - 26, { width: w, characterSpacing: 0.4 });
      this.doc.moveTo(x, y + 14).lineTo(x + w, y + 14).lineWidth(0.7).stroke(COLORS.text);
      if (e.name) this.font('Semibold', 9, COLORS.text).text(safe(e.name), x, y, { width: w, align: 'center', lineBreak: false, ellipsis: true });
      this.font('Body', 7.5, COLORS.muted).text(e.caption || 'Signature over printed name / date', x, y + 18, { width: w, align: 'center' });
    });
    this.y = y + 40;
  }

  note(text) {
    const h = this.textHeight(text, 'Body', 7.8, this.width - 24) + 14;
    this.ensureSpace(h);
    const y = this.y;
    this.doc.roundedRect(this.left, y, this.width, h, 4).fill(COLORS.brandTint);
    this.doc.rect(this.left, y, 3, h).fill(COLORS.brand);
    this.font('Body', 7.8, COLORS.muted).text(safe(text), this.left + 12, y + 7, { width: this.width - 24, lineGap: 1.5 });
    this.y = y + h + 10;
  }

  // ---------------------------------------------------------------- finish
  /** Draw running headers (pages 2+) and footers (all pages), then close the document. */
  end() {
    const { doc } = this;
    const range = doc.bufferedPageRange();
    const W = doc.page.width;
    const H = doc.page.height;
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      const keep = doc.page.margins.bottom;
      doc.page.margins.bottom = 0; // draw in the margin without creating a page
      if (i > range.start) {
        if (existsSync(LOGO)) doc.image(LOGO, this.left, 20, { width: 22, height: 22 });
        this.font('Bold', 9, COLORS.navy).text('DPWH 360°', this.left + 30, 21, { lineBreak: false });
        this.font('Body', 7.8, COLORS.muted).text(this.title, this.left + 30, 33, { width: this.width - 230, height: 10, ellipsis: true });
        this.font('Semibold', 7.6, COLORS.navy).text(this.docType, W - MARGIN.right - 200, 21, { width: 200, align: 'right', height: 10, ellipsis: true });
        this.font('Body', 7.6, COLORS.muted).text(`Ref. ${this.reference}`, W - MARGIN.right - 200, 33, { width: 200, align: 'right', height: 10, ellipsis: true });
        doc.moveTo(this.left, 48).lineTo(W - MARGIN.right, 48).lineWidth(0.6).stroke(COLORS.brandLine);
      }
      doc.moveTo(this.left, H - 42).lineTo(W - MARGIN.right, H - 42).lineWidth(0.6).stroke(COLORS.brandLine);
      this.font('Body', 7.3, COLORS.muted).text(
        `IPMATS · DPWH 360° Occidental Mindoro  ·  Generated ${fmt.dateTime(this.generatedAt)} by ${this.generatedBy}`,
        this.left,
        H - 34,
        { width: this.width - 80, height: 10, ellipsis: true },
      );
      this.font('Semibold', 7.5, COLORS.navy).text(`Page ${i + 1} of ${range.count}`, W - MARGIN.right - 80, H - 34, { width: 80, align: 'right', lineBreak: false });
      doc.page.margins.bottom = keep;
    }
    doc.end();
    return doc;
  }
}
