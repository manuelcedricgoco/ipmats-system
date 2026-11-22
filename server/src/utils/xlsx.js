/**
 * Formatted Excel (.xlsx) exports (ExcelJS).
 *
 * The data sheet looks like a normal Excel sheet: the column headers are in row 1 (A1), Excel's own
 * gridlines, default font and default row height. On top of that it adds what is tedious to do by hand:
 * column widths fitted to the content, a coloured header row, alternating row colours, coloured flag
 * cells, peso / percent / date formats, wrapped long text with taller rows only where needed,
 * a frozen header row, filters and (where useful) a totals row with SUM formulas.
 * Report details (title, date, who generated it, filters) are on a second sheet, "Report info",
 * so the data sheet starts at A1.
 *
 * One column list drives both exports: CSV stays plain (raw values — CSV cannot hold colours or widths).
 * Column: { label, key | value(row), type: 'text' | 'code' | 'longtext' | 'money' | 'percent' | 'number' | 'date' | 'flag' | 'label', total?: true }
 */
import ExcelJS from 'exceljs';

const NAVY = 'FF0B2545';
const BORDER = { style: 'thin', color: { argb: 'FFD9DEE5' } };
const BORDERS = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
const ZEBRA = 'FFF3F6FA';
const FLAG_FILL = { red: ['FFFEE2E2', 'FFB91C1C'], yellow: ['FFFEF3C7', 'FFB45309'], green: ['FFDCFCE7', 'FF15803D'] };
const FMT = {
  money: '"₱"#,##0.00;[Red]-"₱"#,##0.00',
  percent: '0.00%',
  number: '#,##0.##',
  date: 'mmm d, yyyy',
};
const NUMERIC = ['money', 'percent', 'number'];
const DEFAULT_ROW_HEIGHT = 15; // Excel's default for Calibri 11
const TZ = 'Asia/Manila';

const rawValue = (c, r) => (typeof c.value === 'function' ? c.value(r) : r[c.key]);
const labelOf = (s) => (s ? String(s).replace(/_/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase()) : '');

/** Value as written into the cell (numbers stay numbers so Excel can sum and sort them). */
function cellValue(type, v) {
  if (v === null || v === undefined || v === '') return null;
  switch (type) {
    case 'money':
    case 'number':
      return Number.isFinite(Number(v)) ? Number(v) : null;
    case 'percent':
      return Number.isFinite(Number(v)) ? Number(v) / 100 : null;
    case 'date': {
      // date-only strings are calendar dates: keep them on the same day in every time zone
      const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    case 'flag':
      return String(v).toUpperCase();
    case 'label':
      return labelOf(v);
    default:
      return typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
}

/** Approximate width (characters) of a value as Excel will display it. */
function displayLength(type, v) {
  if (v === null || v === undefined || v === '') return 0;
  if (type === 'money') return Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2 }).length + 2;
  if (type === 'percent') return 8;
  if (type === 'date') return 12;
  if (type === 'label') return labelOf(v).length;
  return String(v)
    .split('\n')
    .reduce((m, line) => Math.max(m, line.length), 0);
}

/** Number of lines a wrapped text needs in a column of the given width. */
const wrappedLines = (text, width) =>
  String(text)
    .split('\n')
    .reduce((s, l) => s + Math.max(1, Math.ceil(l.length / Math.max(1, width - 1))), 0);

/**
 * @returns {Promise<Buffer>}
 */
export async function toXlsx({ sheetName, title, subtitle, filters, columns, rows, generatedBy, totalsLabel = 'Total' }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IPMATS — DPWH 360° Occidental Mindoro';
  wb.company = 'DPWH 360° Occidental Mindoro';
  wb.title = title;
  wb.subject = subtitle || title;
  wb.created = new Date();

  const n = columns.length;
  const ws = wb.addWorksheet(sheetName.slice(0, 31), {
    // header row frozen; Excel gridlines left on (a normal sheet)
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1', margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
    headerFooter: { oddFooter: `&L&8IPMATS · DPWH 360° Occidental Mindoro&C&8${title.replace(/&/g, '&&')}&R&8Page &P of &N` },
  });

  // ---- automatic column widths: the longest of the header and every value, capped for long text
  const widths = columns.map((c) => {
    const longest = rows.reduce((m, r) => Math.max(m, displayLength(c.type, rawValue(c, r))), 0);
    const head = String(c.label).length;
    const cap = c.type === 'longtext' ? 60 : 45;
    return Math.max(9, Math.min(cap, Math.max(longest, Math.min(head, 24)) + 2));
  });
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  // ---- header (row 1, cell A1 onwards)
  const header = ws.getRow(1);
  let headerLines = 1;
  columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { vertical: 'middle', horizontal: NUMERIC.includes(c.type) ? 'right' : c.type === 'flag' ? 'center' : 'left', wrapText: true };
    cell.border = BORDERS;
    headerLines = Math.max(headerLines, wrappedLines(c.label, widths[i]));
  });
  header.height = Math.max(20, headerLines * DEFAULT_ROW_HEIGHT + 4);

  // ---- data rows (from row 2)
  rows.forEach((r, ri) => {
    const row = ws.getRow(2 + ri);
    let lines = 1;
    columns.forEach((c, i) => {
      const raw = rawValue(c, r);
      const cell = row.getCell(i + 1);
      cell.value = cellValue(c.type, raw);
      cell.border = BORDERS;
      const numeric = NUMERIC.includes(c.type);
      cell.alignment = { vertical: 'top', horizontal: numeric ? 'right' : c.type === 'flag' ? 'center' : 'left', wrapText: !numeric };
      if (FMT[c.type]) cell.numFmt = FMT[c.type];
      if (c.type === 'code') cell.font = { bold: true, color: { argb: 'FF1A3D70' } };
      if (c.type === 'flag' && FLAG_FILL[String(raw)]) {
        const [bg, fg] = FLAG_FILL[String(raw)];
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.font = { bold: true, color: { argb: fg } };
      } else if (ri % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      }
      if (!numeric && cell.value != null) lines = Math.max(lines, wrappedLines(cell.value, widths[i]));
    });
    // Excel does not grow rows for wrapped text written by a program: only rows that wrap get a taller height,
    // every other row keeps Excel's default height.
    if (lines > 1) row.height = Math.min(409, lines * DEFAULT_ROW_HEIGHT + 3);
  });

  // ---- totals row (SUM formulas, so the sheet stays correct if someone edits a value)
  const last = 1 + rows.length;
  if (columns.some((c) => c.total) && rows.length) {
    const tr = ws.getRow(last + 1);
    tr.getCell(1).value = totalsLabel;
    columns.forEach((c, i) => {
      const cell = tr.getCell(i + 1);
      if (c.total) {
        const col = ws.getColumn(i + 1).letter;
        const result = rows.reduce((s, r) => s + (Number(rawValue(c, r)) || 0), 0);
        cell.value = { formula: `SUM(${col}2:${col}${last})`, result };
        cell.numFmt = FMT[c.type] || FMT.number;
        cell.alignment = { horizontal: 'right' };
      }
      cell.font = { bold: true, color: { argb: NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3ECF7' } };
      cell.border = { ...BORDERS, top: { style: 'double', color: { argb: NAVY } } };
    });
  }

  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: last, column: n } };

  // ---- second sheet: report details (also a plain sheet starting at A1)
  const info = wb.addWorksheet('Report info');
  const generated = new Date().toLocaleString('en-PH', { timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  [
    ['Report', title],
    ['System', 'DPWH 360° Infrastructure Project Monitoring and Transparency System (IPMATS) · Occidental Mindoro'],
    ['Generated', generated],
    ['Generated by', generatedBy || ''],
    ['Filters', filters || 'None'],
    ['Records', rows.length],
    ['Data sheet', sheetName.slice(0, 31)],
  ].forEach(([k, v], i) => {
    const row = info.getRow(i + 1);
    row.getCell(1).value = k;
    row.getCell(1).font = { bold: true, color: { argb: NAVY } };
    row.getCell(2).value = v;
    row.getCell(2).alignment = { horizontal: 'left' };
  });
  info.getColumn(1).width = 14;
  info.getColumn(2).width = 90;

  return Buffer.from(await wb.xlsx.writeBuffer());
}
