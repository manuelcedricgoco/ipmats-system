// WEEK 3 — 360° upload validation: GPS + timestamp metadata (services/imageValidation.js)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makePanorama } from '../../scripts/panorama.mjs';
import { DEFAULT_RULES } from '../services/flagDetection.js';
import { readImageMetadata, validateImage } from '../services/imageValidation.js';

const project = { latitude: 13.4, longitude: 120.7, notice_to_proceed: '2026-01-01' };
const make = (o) => makePanorama({ title: 'Test', width: 512, latitude: 13.4002, longitude: 120.7002, capturedAt: '2026-11-10 10:00:00', ...o });

describe('360° image validation', () => {
  it('reads GPS and the capture time from the photo (EXIF)', async () => {
    const meta = await readImageMetadata(await make());
    assert.ok(Math.abs(meta.exifLatitude - 13.4002) < 0.0001);
    assert.ok(Math.abs(meta.exifLongitude - 120.7002) < 0.0001);
    assert.ok(meta.exifCapturedAt.startsWith('2026-11-'));
    assert.equal(meta.width / meta.height, 2);
  });
  it('accepts a photo taken at the site on the inspection date', async () => {
    const v = await validateImage({ buffer: await make(), project, inspectionDate: '2026-11-10', rules: DEFAULT_RULES });
    assert.deepEqual(v.problems, []);
    assert.equal(v.gpsSource, 'exif');
    assert.ok(v.validation.distance_m < 50);
    assert.equal(v.validation.timestamp_source, 'exif');
    assert.equal(v.validation.aspect_ratio_ok, true);
  });
  it('warns when the photo was taken far from the site or far from the inspection date', async () => {
    const far = await validateImage({ buffer: await make({ latitude: 13.41, longitude: 120.7 }), project, inspectionDate: '2026-11-10', rules: DEFAULT_RULES });
    assert.ok(far.validation.distance_m > 1000);
    assert.ok(far.validation.warnings.some((w) => /from the project site/.test(w)));
    const late = await validateImage({ buffer: await make({ capturedAt: '2026-10-01 10:00:00' }), project, inspectionDate: '2026-11-10', rules: DEFAULT_RULES });
    assert.ok(late.validation.date_gap_days > 30);
    assert.ok(late.validation.warnings.some((w) => /days away from the inspection date/.test(w)));
  });
  it('refuses a capture time in the future', async () => {
    const v = await validateImage({ buffer: await make({ capturedAt: '2099-01-01 10:00:00' }), project, inspectionDate: '2026-11-10', rules: DEFAULT_RULES });
    assert.ok(v.problems.some((p) => /future/.test(p)));
  });
  it('uses the uploader\'s coordinates when the photo has no GPS, and says so', async () => {
    const v = await validateImage({ buffer: await make({ latitude: null, longitude: null }), project, manualLatitude: 13.4, manualLongitude: 120.7, inspectionDate: '2026-11-10', rules: DEFAULT_RULES });
    assert.equal(v.gpsSource, 'manual');
    assert.ok(v.validation.warnings.some((w) => /No GPS data/.test(w)));
  });
  it('detects an identical file uploaded before', async () => {
    const v = await validateImage({ buffer: await make(), project, inspectionDate: '2026-11-10', existingWithHash: [{ project_id: 'other' }], rules: DEFAULT_RULES });
    assert.equal(v.validation.reused_elsewhere, true);
  });
});
