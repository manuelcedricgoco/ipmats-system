import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api.js', () => ({ api: { get: vi.fn() } }));

const { api } = await import('../lib/api.js');
const { invalidateReference, loadReference } = await import('./useReference.js');

const ANON = { data: { contractors: [] } };
const STAFF = { data: { contractors: [{ id: 'c1', name: 'Amihan Infra Builders Corp.', is_active: true }] } };

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('reference lists cache', () => {
  beforeEach(() => {
    invalidateReference();
    api.get.mockReset();
  });

  it('loads once and reuses the cached lists', async () => {
    api.get.mockResolvedValue(STAFF);
    await loadReference();
    const again = await loadReference();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(again.contractors).toHaveLength(1);
  });

  it('after sign-in (invalidate), the lists are fetched again with the new session', async () => {
    api.get.mockResolvedValueOnce(ANON).mockResolvedValueOnce(STAFF);
    expect((await loadReference()).contractors).toHaveLength(0); // signed out: no contractors
    invalidateReference(); // what AuthContext does on SIGNED_IN
    expect((await loadReference()).contractors).toHaveLength(1);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('a signed-out request that finishes after sign-in does not overwrite the staff lists', async () => {
    const slowAnon = deferred();
    api.get.mockReturnValueOnce(slowAnon.promise).mockResolvedValueOnce(STAFF);
    const stale = loadReference(); // started while signed out
    invalidateReference(); // user signs in before it returns
    const fresh = await loadReference();
    slowAnon.resolve(ANON);
    await stale;
    expect(fresh.contractors).toHaveLength(1);
    expect((await loadReference()).contractors).toHaveLength(1); // cache still holds the staff lists
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('a failed request can be retried', async () => {
    api.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(STAFF);
    await expect(loadReference()).rejects.toThrow('offline');
    expect((await loadReference()).contractors).toHaveLength(1);
  });
});
