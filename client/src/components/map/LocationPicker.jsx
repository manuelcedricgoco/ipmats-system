import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Loader2, LocateFixed, MapPin, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polygon, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { OUTSIDE_PROVINCE_MESSAGE, PROVINCE_BOUNDS, PROVINCE_OUTLINE, isWithinOccidentalMindoro, searchPlaces } from '../../lib/geo.js';

const B = PROVINCE_BOUNDS;
const PROVINCE_FIT = [[B.minLat, B.minLng], [B.maxLat, B.maxLng]];
const MAX_BOUNDS = [[B.minLat - 0.35, B.minLng - 0.35], [B.maxLat + 0.35, B.maxLng + 0.35]];
// Shade everything outside the province: a world-sized ring with the province cut out as holes.
const MASK = [[[-89, -179], [-89, 179], [89, 179], [89, -179]], ...PROVINCE_OUTLINE];
const round6 = (n) => Math.round(Number(n) * 1e6) / 1e6;

const PIN = L.divIcon({
  className: '',
  iconSize: [32, 42],
  iconAnchor: [16, 42],
  html: '<svg width="32" height="42" viewBox="0 0 32 42" aria-hidden="true"><path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 41 16 41s15-14 15-25.2C31 7.6 24.3 1 16 1z" fill="#0b2545" stroke="#fff" stroke-width="2"/><circle cx="16" cy="15.5" r="5.5" fill="#f5b700"/></svg>',
});

function ClickToPick({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Keep the map the right size when its card changes width (sidebar, rotation). */
function KeepSized() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

/** Bring the pin into view when the coordinates change from outside the map (place chosen, typed, searched). */
function FollowPin({ position, flyKey }) {
  const map = useMap();
  const lastFly = useRef(flyKey);
  useEffect(() => {
    if (!position) return;
    const asked = flyKey !== lastFly.current; // a search result or "My location" was chosen
    lastFly.current = flyKey;
    if (asked) map.flyTo(position, Math.max(map.getZoom(), 16), { duration: 0.6 });
    else if (!map.getBounds().pad(-0.1).contains(position)) map.flyTo(position, Math.max(map.getZoom(), 14), { duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyKey, position?.[0], position?.[1]]);
  return null;
}

/**
 * Project location picker (Register / Edit Project): search a place, click the map, or drag the pin.
 * Only points inside Occidental Mindoro are accepted; the API checks the same rule on save.
 *
 * Props: latitude / longitude (form values), onChange(lat, lng), places = [{ id, label, latitude, longitude }]
 * from our own municipality / barangay list (works even if the search service is unavailable).
 */
export default function LocationPicker({ latitude, longitude, onChange, places = [], error, className = '' }) {
  const lat = latitude === '' || latitude == null ? NaN : Number(latitude);
  const lng = longitude === '' || longitude == null ? NaN : Number(longitude);
  const position = Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  const initial = useRef(position);
  const [message, setMessage] = useState('');
  const [flyKey, setFlyKey] = useState(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState('');
  const [locating, setLocating] = useState(false);
  const lastSearch = useRef(0);
  const abort = useRef(null);

  useEffect(() => () => abort.current?.abort(), []);

  const pick = (y, x, { fly = false } = {}) => {
    if (!isWithinOccidentalMindoro(y, x)) {
      setMessage(OUTSIDE_PROVINCE_MESSAGE);
      return false;
    }
    setMessage('');
    onChange(round6(y), round6(x));
    if (fly) setFlyKey((k) => k + 1);
    return true;
  };

  const localMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return places.filter((p) => p.label.toLowerCase().includes(q)).slice(0, 5);
  }, [places, query]);

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    // Nominatim usage policy: at most one request per second, only on an explicit search.
    if (Date.now() - lastSearch.current < 1100) return;
    lastSearch.current = Date.now();
    abort.current?.abort();
    abort.current = new AbortController();
    setSearching(true);
    setSearchNote('');
    try {
      const found = await searchPlaces(q, { signal: abort.current.signal });
      const seen = new Set(localMatches.map((p) => `${p.latitude.toFixed(3)},${p.longitude.toFixed(3)}`));
      const online = found.filter((r) => !seen.has(`${r.latitude.toFixed(3)},${r.longitude.toFixed(3)}`));
      setResults([...localMatches, ...online]);
      if (!localMatches.length && !online.length) setSearchNote('No place found inside Occidental Mindoro. Try another name, or click the map.');
    } catch (e) {
      if (e.name === 'AbortError') return;
      setResults(localMatches);
      setSearchNote('The map search service is not reachable right now. Showing municipalities and barangays only — you can still click the map.');
    } finally {
      setSearching(false);
    }
  };

  const choose = (r) => {
    if (pick(r.latitude, r.longitude, { fly: true })) {
      setResults(null);
      setSearchNote('');
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return setMessage('This browser cannot share its location.');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        pick(p.coords.latitude, p.coords.longitude, { fly: true });
      },
      (e) => {
        setLocating(false);
        setMessage(e.code === 1 ? 'Location permission was denied.' : 'Your location could not be found. Click the map instead.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  const shown = results ?? (query.trim().length >= 2 ? localMatches : []);
  const problem = message || error;

  return (
    <div className={className}>
      <div className="relative">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setResults(null);
                setSearchNote('');
              }}
              onKeyDown={(e) => {
                // Enter searches instead of submitting the project form.
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runSearch();
                }
                if (e.key === 'Escape') setResults(null);
              }}
              placeholder="Search a barangay, road, landmark…"
              aria-label="Search for the project location"
              className="block w-full rounded-md border-0 bg-white py-2 pl-9 pr-8 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 hover:ring-slate-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-600"
            />
            {query && (
              <button type="button" onClick={() => { setQuery(''); setResults(null); setSearchNote(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700" aria-label="Clear search">
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={runSearch} disabled={searching || query.trim().length < 2} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />} Search
            </button>
            <button type="button" onClick={useMyLocation} disabled={locating} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 transition-colors hover:bg-slate-50 disabled:opacity-50 sm:flex-none" title="Use this device's GPS (on site)">
              {locating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LocateFixed className="h-4 w-4" aria-hidden />} My location
            </button>
          </div>
        </div>
        {(shown.length > 0 || searchNote) && (
          <div className="absolute inset-x-0 top-full z-[1100] mt-1 max-h-64 overflow-y-auto rounded-md bg-white shadow-panel ring-1 ring-slate-200" role="listbox" aria-label="Search results">
            {shown.map((r) => (
              <button
                key={r.id}
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => choose(r)}
                className="flex w-full items-start gap-2 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-brand-50 focus:bg-brand-50 focus:outline-none"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden />
                <span className="min-w-0">
                  <span className="block break-words text-slate-800">{r.label}</span>
                  <span className="block text-xs text-slate-500">{r.source || 'IPMATS place list'}</span>
                </span>
              </button>
            ))}
            {searchNote && <p className="px-3 py-2 text-xs text-slate-600">{searchNote}</p>}
            {results === null && query.trim().length >= 2 && <p className="px-3 py-2 text-xs text-slate-500">Press Search to look up more places on OpenStreetMap.</p>}
          </div>
        )}
      </div>

      <div className={`relative mt-3 overflow-hidden rounded-lg ring-1 ${problem ? 'ring-red-400' : 'ring-slate-200'}`}>
        <MapContainer
          center={initial.current || [12.95, 120.8]}
          zoom={initial.current ? 15 : 8}
          bounds={initial.current ? undefined : PROVINCE_FIT}
          minZoom={8}
          maxZoom={19}
          maxBounds={MAX_BOUNDS}
          maxBoundsViscosity={1}
          className="z-0 h-72 w-full cursor-crosshair sm:h-80 lg:h-96"
          scrollWheelZoom={false}
          aria-label="Map of Occidental Mindoro. Click to place the project pin."
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <Polygon positions={MASK} interactive={false} pathOptions={{ stroke: false, fillColor: '#0b2545', fillOpacity: 0.22 }} />
          <Polygon positions={PROVINCE_OUTLINE} interactive={false} pathOptions={{ color: '#1d4e89', weight: 2, dashArray: '6 4', fill: false }} />
          <ClickToPick onPick={(y, x) => pick(y, x)} />
          <KeepSized />
          <FollowPin position={position} flyKey={flyKey} />
          {position && (
            <Marker
              position={position}
              icon={PIN}
              draggable
              keyboard
              title="Project location — drag to adjust"
              eventHandlers={{
                dragend: (e) => {
                  const ll = e.target.getLatLng();
                  if (!pick(ll.lat, ll.lng)) e.target.setLatLng(position);
                },
              }}
            />
          )}
        </MapContainer>
        <div className="pointer-events-none absolute right-2 top-2 z-[500] max-w-[60%] rounded bg-white/90 px-2 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
          Shaded area = outside Occidental Mindoro
        </div>
      </div>

      <p className={`mt-2 text-xs ${problem ? 'font-medium text-red-700' : 'text-slate-500'}`} role={problem ? 'alert' : undefined}>
        {problem ||
          (position
            ? `Pin at ${lat.toFixed(6)}, ${lng.toFixed(6)}. Drag the pin or click the map to adjust.`
            : 'Click the map, search a place, or choose the municipality / barangay to drop the pin.')}
      </p>
    </div>
  );
}
