import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorState, Skeleton } from '../common/Feedback.jsx';
import ProjectMap from '../map/ProjectMap.jsx';
import ProjectDrawer from './ProjectDrawer.jsx';
import { useApi } from '../../hooks/useApi.js';
import { STATUS_META } from '../../lib/constants.js';

const marker = (p) => ({ color: STATUS_META[p.status]?.color || '#94a3b8', label: STATUS_META[p.status]?.label || p.status });
const HEADER = 64; // sticky top bar height (px)
const wide = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches;

/**
 * PUBLIC PORTAL — map of every project with coordinates (pins coloured by status) with the project
 * drawer laid over it. Opening a project (pin or card) brings the map into view; clicking the
 * empty map, the X or Escape closes the drawer.
 */
export default function PublicProjectMap({ openId, onOpen, onClose, className = 'h-[60vh] min-h-[380px]' }) {
  const pins = useApi('/public/map', undefined, { select: (r) => r.data });
  const box = useRef(null);
  const [recenterKey, setRecenterKey] = useState(0);

  // Keep the drawer tied to the map: scroll the map into view when a project opens off-screen.
  useEffect(() => {
    if (!openId || !box.current) return;
    const r = box.current.getBoundingClientRect();
    if (r.top < HEADER || r.bottom > window.innerHeight) box.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [openId]);

  // Pixels the drawer covers, so the selected pin is centred in the visible part of the map.
  const inset = useCallback(() => {
    const el = box.current;
    if (!el) return [0, 0];
    return wide() ? [Math.min(372, el.clientWidth), 0] : [0, Math.round(el.clientHeight * 0.65)];
  }, []);

  return (
    <div>
      <div ref={box} className={`relative scroll-mt-20 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-card ${className}`}>
        {pins.error ? (
          <div className="p-6"><ErrorState error={pins.error} onRetry={pins.reload} /></div>
        ) : pins.loading && !pins.data ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <ProjectMap
            projects={pins.data || []}
            selectedId={openId}
            onSelect={onOpen}
            markerOf={marker}
            onBackgroundClick={openId ? onClose : undefined}
            inset={inset}
            recenterKey={recenterKey}
          />
        )}
        <ProjectDrawer projectId={openId} onClose={onClose} onRecenter={() => setRecenterKey((k) => k + 1)} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700">
        {Object.entries(STATUS_META).map(([k, m]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full ring-2 ring-white" style={{ background: m.color }} aria-hidden />
            {m.label}
          </span>
        ))}
        {pins.data && <span className="ml-auto text-slate-500">{pins.data.length} project(s) on the map</span>}
      </div>
    </div>
  );
}
