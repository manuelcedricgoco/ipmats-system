import { readFileSync } from 'node:fs';

const EARTH_RADIUS_M = 6371008.8;
const rad = (deg) => (Number(deg) * Math.PI) / 180;

/** Great-circle distance in metres between two WGS84 coordinates. */
export function haversineMeters(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/*
 * Occidental Mindoro boundary (OpenStreetMap relation 1506320, includes the Lubang island group
 * and the province's coastal waters). The same file is used by the web app's map picker
 * (client/src/data/occidental-mindoro.json) so both sides apply the same rule.
 */
const boundary = JSON.parse(readFileSync(new URL('../data/occidental-mindoro.json', import.meta.url), 'utf8'));
const POLYGONS = boundary.geometry.type === 'MultiPolygon' ? boundary.geometry.coordinates : [boundary.geometry.coordinates];

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

/** Bounding box of the boundary (used for a quick first check and by the map). */
export const OCC_MINDORO_BOUNDS = Object.freeze(bboxOf(POLYGONS));

/** Ray-casting test: is [lng, lat] inside one ring? */
function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True when the point lies inside the given (Multi)Polygon rings (holes excluded). */
function isInsidePolygons(lat, lng, polygons) {
  return polygons.some((poly) => inRing(lng, lat, poly[0]) && !poly.slice(1).some((hole) => inRing(lng, lat, hole)));
}

/** True only for coordinates inside the Occidental Mindoro boundary polygon. */
export function isWithinOccidentalMindoro(lat, lng) {
  const y = Number(lat);
  const x = Number(lng);
  if (!Number.isFinite(y) || !Number.isFinite(x)) return false;
  const b = OCC_MINDORO_BOUNDS;
  if (y < b.minLat || y > b.maxLat || x < b.minLng || x > b.maxLng) return false;
  return isInsidePolygons(y, x, POLYGONS);
}

export const OUTSIDE_PROVINCE_MESSAGE = 'The selected location is outside Occidental Mindoro. Choose a point inside the province boundary.';
