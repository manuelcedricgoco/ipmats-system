import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { dHash, hammingDistance, findNearDuplicates, PHASH_MAX_DISTANCE } from '../services/perceptualHash.js';

const W = 512;
const H = 256;
async function picture(fn, quality) {
  const raw = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const v = fn(x, y) % 256;
      const o = (y * W + x) * 3;
      raw[o] = v;
      raw[o + 1] = v;
      raw[o + 2] = v;
    }
  }
  return sharp(raw, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality }).toBuffer();
}
const patternA = (x, y) => x * 7 + y * 13 + ((x * y) % 31);
const patternB = (x, y) => x * x + 3 * y;

describe('perceptual hash', () => {
  it('returns 16 lowercase hex characters', async () => {
    assert.match(await dHash(await picture(patternA, 90)), /^[0-9a-f]{16}$/);
  });
  it('the same picture re-encoded at JPEG q60 is within the threshold', async () => {
    const a = await dHash(await picture(patternA, 90));
    const b = await dHash(await picture(patternA, 60));
    assert.ok(hammingDistance(a, b) <= PHASH_MAX_DISTANCE, `distance ${hammingDistance(a, b)}`);
  });
  it('a different picture is far', async () => {
    const a = await dHash(await picture(patternA, 90));
    const b = await dHash(await picture(patternB, 90));
    assert.ok(hammingDistance(a, b) > PHASH_MAX_DISTANCE, `distance ${hammingDistance(a, b)}`);
  });
  it('counts differing bits', () => {
    assert.equal(hammingDistance('0000000000000000', '000000000000000f'), 4);
  });
});

describe('findNearDuplicates', () => {
  const row = (o) => ({ id: 'a', project_id: 'p1', phash: '0000000000000000', inspection_date: '2026-11-01', ...o });
  it('ignores rows without a hash', () => {
    assert.equal(findNearDuplicates([row({ phash: null })], [row({ id: 'b', project_id: 'p2' })]).size, 0);
    assert.equal(findNearDuplicates([row({})], [row({ id: 'b', project_id: 'p2', phash: null })]).size, 0);
  });
  it('ignores the image itself and the same inspection of the same project', () => {
    const images = [row({})];
    assert.equal(findNearDuplicates(images, [row({})]).size, 0);
    assert.equal(findNearDuplicates(images, [row({ id: 'b' })]).size, 0);
  });
  it('finds a near copy in another project or an earlier inspection', () => {
    const images = [row({})];
    assert.deepEqual([...findNearDuplicates(images, [row({ id: 'b', project_id: 'p2', phash: '0000000000000003' })])], ['a']);
    assert.deepEqual([...findNearDuplicates(images, [row({ id: 'c', inspection_date: '2026-10-01' })])], ['a']);
  });
  it('does not match a distant hash', () => {
    assert.equal(findNearDuplicates([row({})], [row({ id: 'b', project_id: 'p2', phash: 'ffffffffffffffff' })]).size, 0);
  });
});
