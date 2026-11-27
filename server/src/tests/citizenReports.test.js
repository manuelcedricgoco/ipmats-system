import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import exifr from 'exifr';
import sharp from 'sharp';
import { makePanorama } from '../../scripts/panorama.mjs';
import {
  REPORT_CATEGORIES,
  CITIZEN_REPORT_THRESHOLD,
  generateTrackingCode,
  normalizeTrackingCode,
  hashTrackingCode,
  stripImageMetadata,
  manilaDate,
  reporterStatusLabel,
  referralReasons,
  canTransition,
  isClosedCaseStatus,
} from '../services/citizenReports.js';

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

describe('tracking codes', () => {
  it('tracking codes have 10 symbols from the alphabet, shown as XXXXX-XXXXX', () => {
    const re = new RegExp(`^[${ALPHA}]{5}-[${ALPHA}]{5}$`);
    const codes = Array.from({ length: 50 }, generateTrackingCode);
    for (const c of codes) assert.match(c, re);
    assert.equal(new Set(codes).size, 50);
  });

  it('normalizeTrackingCode accepts lower case and a missing dash', () => {
    assert.equal(normalizeTrackingCode('k7q4m-2xdpa'), 'K7Q4M2XDPA');
    assert.equal(normalizeTrackingCode('K7Q4M2XDPA'), 'K7Q4M2XDPA');
    assert.equal(normalizeTrackingCode('K7Q4M'), null);
    assert.equal(normalizeTrackingCode('K7Q4M-2XDP0'), null);
    assert.equal(normalizeTrackingCode(''), null);
  });

  it('hashTrackingCode is a keyed HMAC', () => {
    const a = hashTrackingCode('K7Q4M2XDPA', 'key-one');
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.equal(a, hashTrackingCode('K7Q4M2XDPA', 'key-one'));
    assert.notEqual(a, hashTrackingCode('K7Q4M2XDPA', 'key-two'));
    assert.ok(!a.toUpperCase().includes('K7Q4M2XDPA'));
  });
});

describe('stripImageMetadata', () => {
  it('removes GPS and camera data', async () => {
    const src = await makePanorama({ title: 'T', latitude: 13.4, longitude: 120.7, capturedAt: '2026-11-26 09:30:00' });
    const before = await exifr.parse(src, { gps: true });
    assert.ok(before && before.latitude, 'fixture should carry GPS');
    const out = await stripImageMetadata(src);
    const after = await exifr.parse(out, { gps: true });
    assert.ok(!after || after.latitude === undefined);
    const meta = await sharp(out).metadata();
    assert.equal(meta.exif, undefined);
    assert.equal(meta.format, 'jpeg');
  });

  it('shrinks very wide images to 2560 px', async () => {
    const src = await makePanorama({ title: 'T', latitude: 13.4, longitude: 120.7, capturedAt: '2026-11-26 09:30:00', width: 4000 });
    assert.equal((await sharp(src).metadata()).width, 4000);
    const out = await stripImageMetadata(src);
    assert.ok((await sharp(out).metadata()).width <= 2560);
  });
});

describe('helpers', () => {
  it('manilaDate uses Philippine time', () => {
    assert.equal(manilaDate(new Date('2026-11-26T17:30:00Z')), '2026-11-27');
  });

  it('constants and labels', () => {
    assert.equal(REPORT_CATEGORIES.length, 5);
    assert.equal(CITIZEN_REPORT_THRESHOLD, 10);
    assert.equal(reporterStatusLabel('received'), 'Received');
    assert.equal(reporterStatusLabel('under_review'), 'Under review');
    assert.equal(reporterStatusLabel('closed'), 'Closed');
  });

  it('referral reasons', () => {
    assert.deepEqual(referralReasons({ publicFlag: 'red', openReports: 0, hasOpenCase: false }), ['auditor_red']);
    assert.deepEqual(referralReasons({ publicFlag: 'yellow', openReports: 10, hasOpenCase: false }), ['citizen_reports']);
    assert.deepEqual(referralReasons({ publicFlag: 'yellow', openReports: 9, hasOpenCase: false }), []);
    assert.deepEqual(referralReasons({ publicFlag: null, openReports: 0, hasOpenCase: true }), ['open_case']);
    assert.deepEqual(referralReasons({ publicFlag: 'red', openReports: 12, hasOpenCase: true }), ['auditor_red', 'citizen_reports', 'open_case']);
  });

  it('case transitions', () => {
    for (const [f, t] of [['under_investigation', 'case_filed'], ['under_investigation', 'dismissed'], ['case_filed', 'resolved'], ['case_filed', 'dismissed']]) {
      assert.equal(canTransition(f, t), true, `${f}->${t}`);
    }
    for (const [f, t] of [['resolved', 'case_filed'], ['dismissed', 'under_investigation'], ['case_filed', 'under_investigation'], ['under_investigation', 'resolved']]) {
      assert.equal(canTransition(f, t), false, `${f}->${t}`);
    }
    assert.equal(isClosedCaseStatus('resolved'), true);
    assert.equal(isClosedCaseStatus('dismissed'), true);
    assert.equal(isClosedCaseStatus('case_filed'), false);
  });
});
