import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { processAvatar } from '../services/avatars.js';

describe('processAvatar', () => {
  it('crops any photo to a 512×512 WebP', async () => {
    const input = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#2f62a8' } }).png().toBuffer();
    const out = await processAvatar(input);
    const meta = await sharp(out).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width, 512);
    assert.equal(meta.height, 512);
  });
  it('rejects bytes that are not an image', async () => {
    await assert.rejects(processAvatar(Buffer.from('not an image at all')), /not a readable image/);
  });
  it('rejects tiny images', async () => {
    const tiny = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#000' } }).png().toBuffer();
    await assert.rejects(processAvatar(tiny), /at least 128/);
  });
});
