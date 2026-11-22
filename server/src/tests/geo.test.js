import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { OCC_MINDORO_BOUNDS, isWithinOccidentalMindoro } from '../utils/geo.js';

describe('Occidental Mindoro boundary (server-side location rule)', () => {
  it('accepts towns and islands of Occidental Mindoro', () => {
    for (const [name, lat, lng] of [
      ['Mamburao', 13.2236, 120.596],
      ['San Jose', 12.3527, 121.067],
      ['Sablayan', 12.838, 120.774],
      ['Abra de Ilog', 13.4436, 120.7283],
      ['Magsaysay', 12.305, 121.147],
      ['Lubang Island', 13.858, 120.123],
      ['Looc', 13.76, 120.23],
    ]) assert.equal(isWithinOccidentalMindoro(lat, lng), true, name);
  });

  it('rejects Oriental Mindoro, Batangas and far-away places even inside the old rectangle', () => {
    for (const [name, lat, lng] of [
      ['Calapan (Oriental Mindoro)', 13.4115, 121.1803],
      ['Puerto Galera (Oriental Mindoro)', 13.5049, 120.9547],
      ['Mansalay (Oriental Mindoro)', 12.5208, 121.4386],
      ['Batangas City', 13.7565, 121.0583],
      ['Manila', 14.5995, 120.9842],
    ]) assert.equal(isWithinOccidentalMindoro(lat, lng), false, name);
  });

  it('rejects missing or invalid numbers', () => {
    assert.equal(isWithinOccidentalMindoro(undefined, 120.6), false);
    assert.equal(isWithinOccidentalMindoro('abc', 120.6), false);
  });

  it('bounding box fits inside the database range check (migration 009)', () => {
    assert.ok(OCC_MINDORO_BOUNDS.minLat >= 12 && OCC_MINDORO_BOUNDS.maxLat <= 14.05);
    assert.ok(OCC_MINDORO_BOUNDS.minLng >= 119.85 && OCC_MINDORO_BOUNDS.maxLng <= 121.3);
  });

  it('web app and API use the same boundary file', () => {
    const server = readFileSync(new URL('../data/occidental-mindoro.json', import.meta.url), 'utf8');
    let client;
    try {
      client = readFileSync(new URL('../../../client/src/data/occidental-mindoro.json', import.meta.url), 'utf8');
    } catch {
      return; // client folder not present (e.g. inside the API Docker image)
    }
    assert.equal(client, server);
  });
});
