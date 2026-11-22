import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ExcelJS from 'exceljs';
import { toCsv } from '../utils/csv.js';
import { toXlsx } from '../utils/xlsx.js';

const columns = [
  { label: 'Project ID', key: 'project_code', type: 'code' },
  { label: 'Project name', key: 'name', type: 'longtext' },
  { label: 'Approved budget', key: 'approved_budget', type: 'money', total: true },
  { label: 'Fund utilization %', key: 'financial_progress', type: 'percent' },
  { label: 'Target completion', key: 'target', type: 'date' },
  { label: 'Current flag', key: 'current_flag', type: 'flag' },
  { label: 'Status', key: 'status', type: 'label' },
];
const rows = [
  { project_code: '26OM0001', name: 'Concreting of a very long farm-to-market road name that needs wrapping in the cell so it stays readable', approved_budget: '48500000.00', financial_progress: 52.5, target: '2027-04-15', current_flag: 'red', status: 'ongoing' },
  { project_code: '26OM0002', name: '=HYPERLINK("http://evil")', approved_budget: 1500000, financial_progress: 0, target: null, current_flag: 'green', status: 'not_started' },
];

describe('Excel export (.xlsx)', () => {
  it('writes a normal sheet (header in A1, gridlines) with auto widths, colours, filters and totals', async () => {
    const buf = await toXlsx({ sheetName: 'Financial summary', title: 'Financial Summary', columns, rows, generatedBy: 'Tester', totalsLabel: 'Total' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet('Financial summary');
    // header row starts at A1, like a sheet typed in Excel
    assert.equal(ws.getCell('A1').value, 'Project ID');
    assert.equal(ws.getCell('A1').font.bold, true);
    assert.equal(ws.getCell('A1').fill.fgColor.argb, 'FF0B2545');
    assert.equal(ws.views[0].state, 'frozen');
    assert.equal(ws.views[0].ySplit, 1);
    assert.notEqual(ws.views[0].showGridLines, false);
    assert.ok(ws.autoFilter);
    // typed values and formats (data from row 2)
    assert.equal(ws.getCell('C2').value, 48500000);
    assert.match(ws.getCell('C2').numFmt, /#,##0\.00/);
    assert.equal(ws.getCell('D2').value, 0.525);
    assert.equal(ws.getCell('D2').numFmt, '0.00%');
    assert.ok(ws.getCell('E2').value instanceof Date);
    assert.equal(ws.getCell('F2').value, 'RED');
    assert.equal(ws.getCell('G3').value, 'Not Started');
    // text that looks like a formula stays text
    assert.equal(ws.getCell('B3').value, '=HYPERLINK("http://evil")');
    assert.equal(ws.getCell('B3').type, ExcelJS.ValueType.String);
    // long text wraps and only that row is taller; other rows keep Excel's default height
    assert.equal(ws.getCell('B2').alignment.wrapText, true);
    assert.ok(ws.getRow(2).height > 15);
    assert.ok(!ws.getRow(3).height || ws.getRow(3).height <= 15);
    assert.ok(ws.getColumn(3).width >= 14);
    // totals row uses a formula
    assert.equal(ws.getCell('A4').value, 'Total');
    assert.equal(ws.getCell('C4').value.formula, 'SUM(C2:C3)');
    assert.equal(ws.getCell('C4').value.result, 50000000);
    // report details on their own sheet
    const info = wb.getWorksheet('Report info');
    assert.equal(info.getCell('B1').value, 'Financial Summary');
    assert.equal(info.getCell('B4').value, 'Tester');
  });

  it('keeps CSV plain: raw values, no formatting, formula text neutralised', () => {
    const csv = toCsv(rows, columns);
    const lines = csv.trim().split('\r\n');
    assert.equal(lines[0].replace(/^﻿/, ''), 'Project ID,Project name,Approved budget,Fund utilization %,Target completion,Current flag,Status');
    assert.ok(lines[1].includes(',48500000.00,52.5,2027-04-15,red,ongoing'));
    assert.ok(lines[2].startsWith(`26OM0002,"'=HYPERLINK`));
  });
});
