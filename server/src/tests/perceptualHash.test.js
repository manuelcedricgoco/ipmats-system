import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { dHash, hammingDistance, findNearDuplicates, PHASH_MAX_DISTANCE } from '../services/perceptualHash.js';

const W = 512;
const H = 256;
function picture(fn) {
  const raw = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const v = Math.max(0, Math.min(255, Math.round(fn(x, y))));
      const o = (y * W + x) * 3;
      raw[o] = v;
      raw[o + 1] = v;
      raw[o + 2] = v;
    }
  }
  return sharp(raw, { raw: { width: W, height: H, channels: 3 } });
}
// Low-frequency pictures: their hash is stable under re-encoding.
const patternA = (x, y) => 128 + 60 * Math.sin(x / 170) + 50 * Math.cos(y / 90) + 30 * Math.sin((x + y) / 300);
const patternB = (x, y) => 128 + 80 * Math.cos(x / 60) * Math.sin(y / 40);
const jpeg = (fn, quality) => picture(fn).jpeg({ quality }).toBuffer();

describe('perceptual hash', () => {
  it('returns 16 lowercase hex characters', async () => {
    assert.match(await dHash(await jpeg(patternA, 90)), /^[0-9a-f]{16}$/);
  });
  it('the same picture re-encoded at JPEG q60 is within the threshold', async () => {
    const a = await dHash(await jpeg(patternA, 90));
    const b = await dHash(await jpeg(patternA, 60));
    assert.ok(hammingDistance(a, b) <= PHASH_MAX_DISTANCE, `distance ${hammingDistance(a, b)}`);
  });
  it('a lossless PNG and a JPEG q90 of the same picture are within the threshold', async () => {
    const a = await dHash(await picture(patternA).png().toBuffer());
    const b = await dHash(await jpeg(patternA, 90));
    assert.ok(hammingDistance(a, b) <= PHASH_MAX_DISTANCE, `distance ${hammingDistance(a, b)}`);
  });
  it('a different picture is far', async () => {
    const a = await dHash(await jpeg(patternA, 90));
    const b = await dHash(await jpeg(patternB, 90));
    assert.ok(hammingDistance(a, b) > PHASH_MAX_DISTANCE, `distance ${hammingDistance(a, b)}`);
  });
  it('hashes a JPEG truncated at 80% of its bytes', async () => {
    const full = await jpeg(patternA, 90);
    assert.match(await dHash(full.subarray(0, Math.floor(full.length * 0.8))), /^[0-9a-f]{16}$/);
  });
  it('rejects a file that only starts like a JPEG', async () => {
    const junk = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('junk junk junk junk')]);
    await assert.rejects(dHash(junk));
  });
  it('counts differing bits', () => {
    assert.equal(hammingDistance('0000000000000000', '000000000000000f'), 4);
  });
});

describe('findNearDuplicates', () => {
  const row = (o) => ({ id: 'a', project_id: 'p1', phash: '0000000000000000', inspection_date: '2026-11-01', created_at: '2026-11-01T08:00:00Z', ...o });
  it('ignores rows without a hash', () => {
    assert.equal(findNearDuplicates([row({ phash: null })], [row({ id: 'b', project_id: 'p2' })]).size, 0);
    assert.equal(findNearDuplicates([row({})], [row({ id: 'b', project_id: 'p2', phash: null, inspection_date: '2026-10-01' })]).size, 0);
  });
  it('ignores the image itself and the same inspection of the same project', () => {
    const images = [row({})];
    assert.equal(findNearDuplicates(images, [row({})]).size, 0);
    assert.equal(findNearDuplicates(images, [row({ id: 'b', created_at: '2026-10-01T00:00:00Z' })]).size, 0);
  });
  it('finds an earlier near copy in another project or an earlier inspection', () => {
    const images = [row({})];
    assert.deepEqual([...findNearDuplicates(images, [row({ id: 'b', project_id: 'p2', phash: '0000000000000003', inspection_date: '2026-10-01' })])], ['a']);
    assert.deepEqual([...findNearDuplicates(images, [row({ id: 'c', inspection_date: '2026-10-01' })])], ['a']);
  });
  it('the original (earlier) photo is not flagged when a later near-copy exists in another project', () => {
    const original = row({ id: 'orig', project_id: 'p1', inspection_date: '2026-10-01' });
    const copy = row({ id: 'copy', project_id: 'p2', inspection_date: '2026-11-01' });
    assert.equal(findNearDuplicates([original], [copy]).size, 0);
  });
  it('the later near-copy is flagged', () => {
    const original = row({ id: 'orig', project_id: 'p1', inspection_date: '2026-10-01' });
    const copy = row({ id: 'copy', project_id: 'p2', inspection_date: '2026-11-01' });
    assert.deepEqual([...findNearDuplicates([copy], [original])], ['copy']);
  });
  it('on the same inspection date the earlier created_at wins; missing created_at is not earlier', () => {
    const early = row({ id: 'e', project_id: 'p1', created_at: '2026-11-01T08:00:00Z' });
    const late = row({ id: 'l', project_id: 'p2', created_at: '2026-11-01T09:00:00Z' });
    assert.equal(findNearDuplicates([early], [late]).size, 0);
    assert.deepEqual([...findNearDuplicates([late], [early])], ['l']);
    assert.equal(findNearDuplicates([late], [{ ...early, created_at: undefined }]).size, 0);
  });
  it('does not match a distant hash', () => {
    assert.equal(findNearDuplicates([row({})], [row({ id: 'b', project_id: 'p2', phash: 'ffffffffffffffff', inspection_date: '2026-10-01' })]).size, 0);
  });
});
