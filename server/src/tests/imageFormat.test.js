import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { assertImageFormat, detectImageFormat } from '../services/imageFormat.js';

const base = () => sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } });

describe('detectImageFormat', () => {
  it('detects jpeg, png and webp from their first bytes', async () => {
    assert.equal(detectImageFormat(await base().jpeg().toBuffer()), 'jpeg');
    assert.equal(detectImageFormat(await base().png().toBuffer()), 'png');
    assert.equal(detectImageFormat(await base().webp().toBuffer()), 'webp');
  });
  it('returns null for SVG, GIF, HEIF-like and text', () => {
    assert.equal(detectImageFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
    assert.equal(detectImageFormat(Buffer.from('GIF89a')), null);
    assert.equal(detectImageFormat(Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])), null);
    assert.equal(detectImageFormat(Buffer.from('hello')), null);
  });
  it('returns null for empty and truncated buffers', () => {
    assert.equal(detectImageFormat(Buffer.alloc(0)), null);
    assert.equal(detectImageFormat(Buffer.from([0xff, 0xd8])), null);
  });
});

describe('assertImageFormat', () => {
  it('throws a 400', () => {
    assert.throws(() => assertImageFormat(Buffer.from('<svg/>')), (e) => e.status === 400 && /JPEG, PNG or WebP/.test(e.message));
  });
  it('returns the detected format when allowed', async () => {
    assert.equal(assertImageFormat(await base().png().toBuffer()), 'png');
  });
  it('rejects a detected format that is not in the allowed list', async () => {
    assert.throws(() => assertImageFormat(await_png, ['jpeg']), (e) => e.status === 400);
  });
});
const await_png = await base().png().toBuffer();
