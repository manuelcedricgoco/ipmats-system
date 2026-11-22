import { RotateCcw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Spinner } from '../../components/common/Feedback.jsx';
import { Select } from '../../components/common/Form.jsx';
import ProjectMap, { MapLegend } from '../../components/map/ProjectMap.jsx';
import ProjectPanel from '../../components/map/ProjectPanel.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useReference } from '../../hooks/useReference.js';
import { FLAG_META, STATUS_META } from '../../lib/constants.js';

const KEYS = ['municipality_id', 'barangay_id', 'agency_id', 'contractor_id', 'status', 'flag'];

/**
 * WEEK 3 — Project map (Jonalyn Pagilagan, front-end): OpenStreetMap with flag-coloured markers
 * and filters by municipality, barangay, implementing office, contractor, status and flag. Selecting a marker opens the
 * project details with its latest 360° image (Tracy Ann Milaflores).
 * Staff workspace only (/app/map). The public portal has its own map without flags (pages/public/PublicMapPage.jsx).
 */
export default function MapPage() {
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(KEYS.map((k) => [k, params.get(k) || '']).filter(([, v]) => v));
  const selectedId = params.get('project');
  const { ref } = useReference();
  const { data: projects, loading, error } = useApi('/map/projects', filters, { select: (r) => r.data });
  const update = (next) => {
    const p = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => v && p.set(k, v));
    setParams(p, { replace: true });
  };
  const set = (k) => (e) => update({ ...filters, [k]: e.target.value, project: selectedId });
  // choosing another municipality clears the barangay
  const setMunicipality = (e) => update({ ...filters, municipality_id: e.target.value, barangay_id: '', project: selectedId });
  const barangays = (ref?.barangays || []).filter((b) => String(b.municipality_id) === String(filters.municipality_id));
  const count = projects?.length ?? 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Project map</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">Infrastructure projects in Occidental Mindoro</h1>
          <p className="mt-1 text-sm text-slate-600" aria-live="polite">
            {loading ? 'Loading projects…' : `${count} project${count === 1 ? '' : 's'} shown · select a marker to open its 360° view`}
          </p>
        </div>
        <MapLegend />
      </div>
      <div className="mb-3 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-card md:grid-cols-4 xl:grid-cols-7">
        <Select aria-label="Municipality" value={filters.municipality_id || ''} onChange={setMunicipality}>
          <option value="">All municipalities</option>
          {ref?.municipalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
        <Select aria-label="Barangay" value={filters.barangay_id || ''} onChange={set('barangay_id')} disabled={!filters.municipality_id}>
          <option value="">{filters.municipality_id ? 'All barangays' : 'Barangay (choose a town)'}</option>
          {barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select aria-label="Implementing office" value={filters.agency_id || ''} onChange={set('agency_id')}>
          <option value="">All offices / DEOs</option>
          {ref?.agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <Select aria-label="Contractor" value={filters.contractor_id || ''} onChange={set('contractor_id')}>
          <option value="">All contractors</option>
          {ref?.contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select aria-label="Status" value={filters.status || ''} onChange={set('status')}>
          <option value="">Any status</option>
          {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
        </Select>
        <Select aria-label="Flag" value={filters.flag || ''} onChange={set('flag')}>
          <option value="">Any flag</option>
          {Object.entries(FLAG_META).map(([k, m]) => <option key={k} value={k}>{m.label} – {m.long}</option>)}
        </Select>
        <button
          type="button"
          onClick={() => update({ project: selectedId })}
          disabled={!Object.keys(filters).length}
          className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 disabled:text-slate-300 disabled:hover:bg-transparent"
        >
          <RotateCcw className="h-4 w-4" aria-hidden /> Clear filters
        </button>
      </div>
      <div className="relative flex h-[calc(100vh-17rem)] min-h-[28rem] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="relative min-w-0 flex-1">
          <ProjectMap projects={projects || []} selectedId={selectedId} onSelect={(id) => update({ ...filters, project: id })} className="h-full w-full" />
          {loading && (
            <div className="absolute left-1/2 top-4 z-[400] flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 py-2 text-sm shadow-panel"><Spinner className="h-4 w-4" /> Loading projects</div>
          )}
          {error && <div className="absolute inset-x-4 top-4 z-[400] mx-auto max-w-md"><Alert tone="error" title="Could not load projects">{error.message}</Alert></div>}
          {!loading && !error && count === 0 && <div className="absolute inset-x-4 top-4 z-[400] mx-auto max-w-md"><Alert tone="info">No projects match these filters.</Alert></div>}
        </div>
        {selectedId && (
          <div key={selectedId} className="absolute inset-x-0 bottom-0 z-[600] h-[80%] animate-slide-up overflow-hidden rounded-t-xl border-t border-slate-200 shadow-panel md:static md:h-auto md:w-[420px] md:animate-slide-in-right md:rounded-none md:border-l md:border-t-0 md:shadow-none">
            <ProjectPanel projectId={selectedId} onClose={() => update({ ...filters })} />
          </div>
        )}
      </div>
    </div>
  );
}
