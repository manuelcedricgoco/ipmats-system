import { ImageOff } from 'lucide-react';
import ProgressBar from '../common/ProgressBar.jsx';

/** Reference photos of a progress report (030): signed links that open the photo in a new tab. */
export default function ReportPhotos({ photos = [], className = '' }) {
  if (!photos.length) return null;
  return (
    <ul className={`flex flex-wrap gap-2 ${className}`} aria-label="Reference photos">
      {photos.map((ph, i) =>
        ph.url ? (
          <li key={ph.id}>
            <a href={ph.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg ring-1 ring-slate-200 transition hover:ring-brand-400" title="Open the photo in a new tab">
              <img src={ph.url} alt={`Reference photo ${i + 1}`} loading="lazy" referrerPolicy="no-referrer" className="h-20 w-28 object-cover" />
            </a>
          </li>
        ) : (
          <li key={ph.id} className="grid h-20 w-28 place-items-center rounded-lg bg-slate-100 text-center text-xs text-slate-500 ring-1 ring-slate-200">
            <span><ImageOff className="mx-auto mb-1 h-4 w-4" aria-hidden />Photo unavailable</span>
          </li>
        ),
      )}
    </ul>
  );
}

/**
 * The phases of a progress report as they were at that date, each with its sub-activities
 * (activity_snapshot, 030). Old reports have no sub-activity breakdown.
 */
export function SnapshotBreakdown({ phases = [], activities = [] }) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {phases.map((s) => {
        const acts = activities.filter((a) => s.phase_id && a.phase_id === s.phase_id).sort((a, b) => a.sequence_no - b.sequence_no);
        return (
          <li key={s.phase_id || s.sequence_no} className="rounded-md bg-white px-3 py-2 text-xs ring-1 ring-slate-200">
            <span className="font-medium text-slate-800">{s.sequence_no}. {s.name}</span> <span className="text-slate-500">({s.weight}%)</span>
            <ProgressBar value={s.accomplishment} size="sm" className="mt-1.5" />
            {acts.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2" aria-label={`Sub-activities of ${s.name}`}>
                {acts.map((a) => (
                  <li key={a.activity_id || a.sequence_no} className="flex justify-between gap-2 text-slate-600">
                    <span className="truncate">{a.name} <span className="text-slate-400">({a.weight}%)</span></span>
                    <span className="shrink-0 tabular-nums font-medium text-slate-800">{Number(a.accomplishment).toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
