import { ArrowRight, Building2, Calendar, HardHat, MapPin, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApi } from '../../hooks/useApi.js';
import { PROJECT_TYPES } from '../../lib/constants.js';
import { date, peso } from '../../lib/format.js';
import FlagReasons from '../audit/FlagReasons.jsx';
import { FlagBadge, StatusBadge } from '../common/Badges.jsx';
import { ErrorState, Spinner } from '../common/Feedback.jsx';
import ProgressBar from '../common/ProgressBar.jsx';
import PanoramaViewer from '../viewer360/PanoramaViewer.jsx';

/** Turn the staff (/map/projects/:id) or public (/public/projects/:id) answer into one shape. */
function normalize(data, isPublic) {
  if (!data) return null;
  if (!isPublic) return { ...data, flag: data.current_flag, reasons: (data.auto_flag_reasons || []).filter((r) => r.severity === 'yellow' || r.severity === 'red') };
  const { project, images, flag, planned_progress: planned } = data;
  return { ...project, images, planned_progress: planned, flag: flag.color, reasons: flag.reasons || [], under_review: flag.under_review };
}

/**
 * WEEK 3 — Opens when a map marker is selected (Tracy Ann Milaflores): the latest 360° image
 * in the Pannellum viewer beside the project's details, progress and flag.
 */
export default function ProjectPanel({ projectId, onClose, isPublic = false }) {
  const { data, error, loading, reload } = useApi(projectId ? (isPublic ? `/public/projects/${projectId}` : `/map/projects/${projectId}`) : null, undefined, { select: (r) => r.data });
  const p = normalize(data, isPublic);

  return (
    <aside className="flex h-full flex-col bg-white" aria-label="Selected project">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-brand-700">{p?.project_code || 'Project'}</p>
          <h2 className="mt-0.5 text-base font-semibold leading-snug text-slate-900">{p?.name || (loading ? 'Loading…' : '')}</h2>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 transition-all duration-150 hover:rotate-90 hover:bg-slate-100 hover:text-slate-700" aria-label="Close project panel">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && !p && (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500"><Spinner /> <span className="text-sm">Opening 360° view…</span></div>
        )}
        {error && <div className="p-4"><ErrorState error={error} onRetry={reload} /></div>}
        {p && (
          <>
            <div className="p-3">
              <PanoramaViewer url={p.images?.[0]?.url} title={p.name} className="h-56 sm:h-64" compact />
              {p.images?.[0] && <p className="mt-1.5 text-xs text-slate-500">{p.images[0].is_final ? 'Final as-built image' : 'Latest site image'} · inspected {date(p.images[0].inspection_date)}</p>}
            </div>
            <div className="space-y-4 px-4 pb-5">
              <div className="flex flex-wrap items-center gap-2">
                <FlagBadge flag={p.flag} long emptyLabel={isPublic ? 'Under review' : 'Not evaluated'} />
                <StatusBadge status={p.status} />
                <span className="text-xs text-slate-500">{PROJECT_TYPES[p.project_type]}</span>
              </div>
              <ProgressBar value={p.overall_progress} planned={p.planned_progress} />
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div><dt className="text-xs text-slate-500">Approved budget</dt><dd className="font-semibold tabular-nums text-slate-900">{peso(p.approved_budget)}</dd></div>
                <div><dt className="text-xs text-slate-500">Contract amount</dt><dd className="font-semibold tabular-nums text-slate-900">{peso(p.revised_contract_amount ?? p.contract_amount)}</dd></div>
                <div className="col-span-2 flex gap-2"><HardHat className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden /><div><dt className="text-xs text-slate-500">Contractor</dt><dd className="font-medium text-slate-900">{p.contractor_name || '—'}</dd></div></div>
                <div className="col-span-2 flex gap-2"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden /><div><dt className="text-xs text-slate-500">Implementing office</dt><dd className="font-medium text-slate-900">{p.agency_name}</dd></div></div>
                <div className="col-span-2 flex gap-2">
                  <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <div>
                    <dt className="text-xs text-slate-500">Duration</dt>
                    <dd className="font-medium text-slate-900">
                      {p.duration_days ? `${p.duration_days} days` : '—'} · NTP {date(p.notice_to_proceed)} → target {date(p.target_completion_date)}
                      {p.actual_completion_date && <span className="block text-emerald-700">Completed {date(p.actual_completion_date)}</span>}
                    </dd>
                  </div>
                </div>
                <div className="col-span-2 flex gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <div>
                    <dt className="text-xs text-slate-500">Location</dt>
                    <dd className="font-medium text-slate-900">{p.barangay_name ? `Brgy. ${p.barangay_name}, ` : ''}{p.municipality_name}</dd>
                    {p.latitude != null && p.longitude != null && (
                      <dd className="font-mono text-xs text-slate-500">
                        {Number(p.latitude).toFixed(6)}, {Number(p.longitude).toFixed(6)}
                      </dd>
                    )}
                  </div>
                </div>
              </dl>
              {p.reasons.length > 0 && (
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="mb-1 text-xs font-semibold text-slate-700">Why this flag</p>
                  <FlagReasons reasons={p.reasons} compact />
                </div>
              )}
              {isPublic && p.under_review && <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">The flag of this project is shown once an auditor has reviewed it.</p>}
              <Link
                to={isPublic ? `/portal/projects/${p.id}` : `/app/projects/${p.id}`}
                className="group inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-brand-900 hover:shadow-md active:scale-[0.98]"
              >
                Full project details <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
              </Link>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
