/**
 * Occidental Mindoro boundary for the map picker.
 * Same data file and same rule as the API (server/src/utils/geo.js) — the server checks again
 * on save, so the map is a convenience, not the only guard.
 * Boundary: OpenStreetMap relation 1506320 (includes the Lubang islands and coastal waters).
 */
import boundary from '../data/occidental-mindoro.json';

const PROVINCE_POLYGONS = boundary.geometry.type === 'MultiPolygon' ? boundary.geometry.coordinates : [boundary.geometry.coordinates];

function bboxOf(polygons) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const poly of polygons) {
    for (const [lng, lat] of poly[0]) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }
  return { minLat, maxLat, minLng, maxLng };
}

export const PROVINCE_BOUNDS = Object.freeze(bboxOf(PROVINCE_POLYGONS));

function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function isWithinOccidentalMindoro(lat, lng) {
  const y = Number(lat);
  const x = Number(lng);
  if (lat === '' || lng === '' || lat == null || lng == null || !Number.isFinite(y) || !Number.isFinite(x)) return false;
  const b = PROVINCE_BOUNDS;
  if (y < b.minLat || y > b.maxLat || x < b.minLng || x > b.maxLng) return false;
  return PROVINCE_POLYGONS.some((poly) => inRing(x, y, poly[0]) && !poly.slice(1).some((hole) => inRing(x, y, hole)));
}

export const OUTSIDE_PROVINCE_MESSAGE = 'The selected location is outside Occidental Mindoro. Choose a point inside the province boundary.';

/** Leaflet [lat, lng] rings of the province outline (outer rings only). */
export const PROVINCE_OUTLINE = PROVINCE_POLYGONS.map((poly) => poly[0].map(([lng, lat]) => [lat, lng]));

/**
 * Place search with OpenStreetMap Nominatim, limited to the province's box.
 * Usage policy: called only when the user presses Search (no search-as-you-type), max 1 request/second.
 */
export async function searchPlaces(query, { signal } = {}) {
  const b = PROVINCE_BOUNDS;
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    countrycodes: 'ph',
    viewbox: `${b.minLng},${b.maxLat},${b.maxLng},${b.minLat}`,
    bounded: '1',
    limit: '8',
    addressdetails: '0',
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal, headers: { 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error(`Search service answered ${res.status}`);
  const rows = await res.json();
  return rows
    .map((r) => ({ id: `osm-${r.osm_type}-${r.osm_id}`, label: r.display_name, latitude: Number(r.lat), longitude: Number(r.lon), source: 'OpenStreetMap' }))
    .filter((r) => isWithinOccidentalMindoro(r.latitude, r.longitude));
}
