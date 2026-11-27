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
    await assert.rejects(processAvatar(Buffer.from('not an image at all')), /JPEG, PNG or WebP/);
  });
  it('rejects an SVG even when it claims to be PNG', async () => {
    await assert.rejects(processAvatar(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"/>')), /JPEG, PNG or WebP/);
  });
  it('rejects tiny images', async () => {
    const tiny = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#000' } }).png().toBuffer();
    await assert.rejects(processAvatar(tiny), /at least 128/);
  });
});

// Regression: /api/me must not crash for an account with a photo when the API has no service key
import { avatarUrl } from '../services/avatars.js';
describe('avatarUrl without the service key', () => {
  it('returns null instead of throwing', async () => {
    assert.equal(await avatarUrl('some-user/photo.webp'), null);
  });
});
