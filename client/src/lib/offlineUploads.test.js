import { describe, expect, it } from 'vitest';
import { ownUploads } from './offlineUploads.js';

const item = (id, ownerId, createdAt) => ({ id, ownerId, createdAt, status: 'waiting' });

describe('ownUploads(items, userId)', () => {
  it('keeps only the photos queued by the signed-in account, oldest first', () => {
    const items = [item('b', 'u1', '2026-11-27T10:00:00Z'), item('x', 'u2', '2026-11-27T09:00:00Z'), item('a', 'u1', '2026-11-27T08:00:00Z')];
    expect(ownUploads(items, 'u1').map((i) => i.id)).toEqual(['a', 'b']);
    expect(ownUploads(items, 'u2').map((i) => i.id)).toEqual(['x']);
  });
  it('never hands out photos without an owner, or any photo when nobody is signed in', () => {
    const items = [item('old', undefined, '2026-11-27T08:00:00Z'), item('a', 'u1', '2026-11-27T09:00:00Z')];
    expect(ownUploads(items, 'u1').map((i) => i.id)).toEqual(['a']);
    expect(ownUploads(items, null)).toEqual([]);
    expect(ownUploads(items, undefined)).toEqual([]);
    expect(ownUploads(undefined, 'u1')).toEqual([]);
  });
});
