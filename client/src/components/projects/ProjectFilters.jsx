import { RotateCcw } from 'lucide-react';
import { PROJECT_TYPES, STATUS_META } from '../../lib/constants.js';
import { Field, Select } from '../common/Form.jsx';

/** Project list filters: municipality, barangay, office, contractor, status and type. */
export default function ProjectFilters({ reference: refData, filters, onChange, compact = false }) {
  const set = (k) => (e) => onChange({ ...filters, [k]: e.target.value, ...(k === 'municipality_id' ? { barangay_id: '' } : {}) });
  const barangays = (refData?.barangays || []).filter((b) => String(b.municipality_id) === String(filters.municipality_id));
  const active = Object.values(filters).some(Boolean);
  const grid = compact ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6';

  return (
    <div>
      <div className={grid}>
        <Field label="Municipality">
          {(a) => (
            <Select {...a} value={filters.municipality_id || ''} onChange={set('municipality_id')}>
              <option value="">All municipalities</option>
              {refData?.municipalities.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Barangay">
          {(a) => (
            <Select {...a} value={filters.barangay_id || ''} onChange={set('barangay_id')} disabled={!filters.municipality_id}>
              <option value="">{filters.municipality_id ? 'All barangays' : 'Select municipality'}</option>
              {barangays.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Office">
          {(a) => (
            <Select {...a} value={filters.agency_id || ''} onChange={set('agency_id')}>
              <option value="">All offices</option>
              {refData?.agencies.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name.replace('DPWH ', '')}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Contractor">
          {(a) => (
            <Select {...a} value={filters.contractor_id || ''} onChange={set('contractor_id')}>
              <option value="">All contractors</option>
              {refData?.contractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Status">
          {(a) => (
            <Select {...a} value={filters.status || ''} onChange={set('status')}>
              <option value="">Any status</option>
              {Object.entries(STATUS_META).map(([k, m]) => (
                <option key={k} value={k}>
                  {m.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Type">
          {(a) => (
            <Select {...a} value={filters.type || ''} onChange={set('type')}>
              <option value="">All types</option>
              {Object.entries(PROJECT_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      {active && (
        <button type="button" onClick={() => onChange({})} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Clear filters
        </button>
      )}
    </div>
  );
}
