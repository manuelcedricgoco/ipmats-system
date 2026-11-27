/**
 * WEEK 3 — Chart.js charts used by the dashboards (staff and public).
 * Each chart has an aria-label; the numbers are also shown in text next to it.
 */
import { Bar, Doughnut } from 'react-chartjs-2';
import { PALETTE } from './setup.js'; // registers the Chart.js parts we use
import { STATUS_META } from '../../lib/constants.js';
import { pesoCompact } from '../../lib/format.js';

const grid = { color: '#eef2f7' };

/** Projects by flag (staff dashboard). */
export function FlagDonut({ counts = {}, height = 'h-56' }) {
  const labels = ['Green', 'Yellow', 'Red'];
  const values = [counts.green || 0, counts.yellow || 0, counts.red || 0];
  const data = { labels, datasets: [{ data: values, backgroundColor: [PALETTE.green, PALETTE.yellow, PALETTE.red], borderWidth: 2, borderColor: '#fff' }] };
  return (
    <div className={`relative ${height}`}>
      <Doughnut data={data} role="img" aria-label={`Projects by flag: ${labels.map((l, i) => `${l} ${values[i]}`).join(', ')}`} options={{ maintainAspectRatio: false, cutout: '66%', plugins: { legend: { position: 'bottom' } } }} />
    </div>
  );
}

/** Projects by status (horizontal bars). */
export function StatusBar({ counts = {} }) {
  const keys = Object.keys(STATUS_META).filter((k) => counts[k]);
  const colors = { not_started: PALETTE.slate, ongoing: PALETTE.brand, delayed: PALETTE.yellow };
  const data = { labels: keys.map((k) => STATUS_META[k].label), datasets: [{ data: keys.map((k) => counts[k]), backgroundColor: keys.map((k) => colors[k]), borderRadius: 4 }] };
  return (
    <div className="relative h-56">
      <Bar data={data} role="img" aria-label="Projects by status" options={{ indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { precision: 0 }, grid }, y: { grid: { display: false } } } }} />
    </div>
  );
}

/** Flags per municipality (stacked). */
export function MunicipalityFlagBar({ rows = [] }) {
  const data = {
    labels: rows.map((r) => r.municipality),
    datasets: [
      { label: 'Green', data: rows.map((r) => r.green), backgroundColor: PALETTE.green, stack: 's' },
      { label: 'Yellow', data: rows.map((r) => r.yellow), backgroundColor: PALETTE.yellow, stack: 's' },
      { label: 'Red', data: rows.map((r) => r.red), backgroundColor: PALETTE.red, stack: 's' },
    ],
  };
  return (
    <div className="relative h-64">
      <Bar data={data} role="img" aria-label="Flags per municipality" options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { precision: 0 }, grid } } }} />
    </div>
  );
}

/** Planned vs actual completion of the projects furthest behind. */
export function PlannedVsActual({ rows = [] }) {
  const data = {
    labels: rows.map((r) => r.project_code),
    datasets: [
      { label: 'Planned %', data: rows.map((r) => r.planned), backgroundColor: PALETTE.brandLight, borderRadius: 3 },
      { label: 'Actual %', data: rows.map((r) => r.actual), backgroundColor: rows.map((r) => (r.current_flag === 'red' ? PALETTE.red : r.current_flag === 'yellow' ? PALETTE.yellow : PALETTE.brand)), borderRadius: 3 },
    ],
  };
  return (
    <div className="relative h-64">
      <Bar
        data={data}
        role="img"
        aria-label="Planned versus actual completion of the projects furthest behind"
        options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` } } }, scales: { x: { grid: { display: false } }, y: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` }, grid } } }}
      />
    </div>
  );
}

/** Contract amount vs disbursed per municipality. */
export function ContractVsDisbursed({ rows = [] }) {
  const data = {
    labels: rows.map((r) => r.municipality),
    datasets: [
      { label: 'Contract amount', data: rows.map((r) => r.revised_contract_amount), backgroundColor: PALETTE.brandLight, borderRadius: 3 },
      { label: 'Disbursed', data: rows.map((r) => r.total_disbursed), backgroundColor: PALETTE.brand, borderRadius: 3 },
    ],
  };
  return (
    <div className="relative h-64">
      <Bar
        data={data}
        role="img"
        aria-label="Contract amount and disbursed amount per municipality"
        options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${pesoCompact(c.parsed.y)}` } } }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: (v) => pesoCompact(v) }, grid } } }}
      />
    </div>
  );
}
