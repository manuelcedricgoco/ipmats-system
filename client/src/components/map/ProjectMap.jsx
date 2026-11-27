import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { FLAG_META, OCC_MINDORO_CENTER } from '../../lib/constants.js';

function FitBounds({ projects, selectedId }) {
  const map = useMap();
  useEffect(() => {
    if (selectedId) return;
    const pts = projects.map((p) => [Number(p.latitude), Number(p.longitude)]);
    if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 12 });
    else if (pts.length === 1) map.setView(pts[0], 13);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.length]);
  return null;
}

/**
 * Fly to the selected project. `inset()` → [right, bottom] pixels covered by a panel over the map
 * (e.g. the public drawer): the pin is centred in the part of the map that stays visible.
 * Changing `recenterKey` flies there again.
 */
function FlyTo({ project, inset, recenterKey }) {
  const map = useMap();
  useEffect(() => {
    if (!project) return;
    const zoom = Math.max(map.getZoom(), 12);
    let target = [Number(project.latitude), Number(project.longitude)];
    const [right, bottom] = inset?.() || [0, 0];
    if (right || bottom) target = map.unproject(map.project(target, zoom).add([right / 2, bottom / 2]), zoom);
    map.flyTo(target, zoom, { duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, recenterKey, map]);
  return null;
}

/** Clicks on the map itself (not on a marker). */
function BackgroundClick({ onClick }) {
  useMapEvents({ click: () => onClick?.() });
  return null;
}

/**
 * WEEK 3 — OpenStreetMap of Occidental Mindoro with coloured project markers (Jonalyn Pagilagan).
 * Staff: coloured by flag (`flagOf(project)`). `markerOf(project)` → { color, label } overrides that
 * (the public portal colours by the auditor-reviewed flag only, gray while under review: lib/publicFlag.js).
 * Optional: `onBackgroundClick` (click on the map, not a marker), `inset` and `recenterKey` (see FlyTo).
 */
export default function ProjectMap({
  projects = [],
  selectedId,
  onSelect,
  className = 'h-full',
  flagOf = (p) => p.current_flag,
  emptyLabel = 'Not evaluated',
  markerOf,
  onBackgroundClick,
  inset,
  recenterKey,
}) {
  const selected = projects.find((p) => p.id === selectedId);
  return (
    <MapContainer center={OCC_MINDORO_CENTER} zoom={9} minZoom={7} maxZoom={18} className={`z-0 ${className}`} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds projects={projects} selectedId={selectedId} />
      <FlyTo project={selected} inset={inset} recenterKey={recenterKey} />
      {onBackgroundClick && <BackgroundClick onClick={onBackgroundClick} />}
      {selected && (
        <CircleMarker
          key={`halo-${selected.id}`}
          center={[Number(selected.latitude), Number(selected.longitude)]}
          radius={20}
          interactive={false}
          pathOptions={{ color: '#0b2545', weight: 2, fill: true, fillColor: '#0b2545', fillOpacity: 0.12, className: 'animate-pulse' }}
        />
      )}
      {projects.map((p) => {
        const meta = (markerOf ? markerOf(p) : FLAG_META[flagOf(p)]) || { color: '#94a3b8', label: emptyLabel };
        const isSel = p.id === selectedId;
        return (
          <CircleMarker
            key={p.id}
            center={[Number(p.latitude), Number(p.longitude)]}
            radius={isSel ? 12 : 9}
            pathOptions={{ color: isSel ? '#0b2545' : '#ffffff', weight: isSel ? 3 : 2, fillColor: meta.color, fillOpacity: 0.95 }}
            bubblingMouseEvents={false}
            eventHandlers={{
              click: () => onSelect?.(p.id),
              keypress: (e) => e.originalEvent.key === 'Enter' && onSelect?.(p.id),
              mouseover: (e) => {
                e.target.setRadius(isSel ? 14 : 12);
                e.target.setStyle({ weight: 3 });
                e.target.bringToFront();
              },
              mouseout: (e) => {
                e.target.setRadius(isSel ? 12 : 9);
                e.target.setStyle({ weight: isSel ? 3 : 2 });
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              <div className="text-xs">
                <p className="font-semibold">{p.project_code}</p>
                <p className="max-w-[220px] whitespace-normal">{p.name}</p>
                <p className="mt-0.5 text-slate-600">
                  {meta.label} · {Number(p.overall_progress).toFixed(0)}% · {p.municipality_name}
                </p>
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

export function MapLegend({ extra }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700">
      {Object.entries(FLAG_META).map(([k, m]) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full ring-2 ring-white" style={{ background: m.color }} aria-hidden />
          {m.label} – {m.long}
        </span>
      ))}
      {extra && (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full ring-2 ring-white" style={{ background: '#94a3b8' }} aria-hidden />
          {extra}
        </span>
      )}
    </div>
  );
}
