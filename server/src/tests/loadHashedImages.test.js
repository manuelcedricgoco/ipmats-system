import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadHashedImages } from '../services/projectEvaluation.js';

function fakeDb(pageSizes) {
  const ranges = [];
  const selected = [];
  const chain = {
    select: (cols) => {
      selected.push(cols);
      return chain;
    },
    not: () => chain,
    order: () => chain,
    range: async (from, to) => {
      ranges.push([from, to]);
      const n = pageSizes[ranges.length - 1] ?? 0;
      return { data: Array.from({ length: n }, (_, i) => ({ id: `r${from + i}` })), error: null };
    },
  };
  return { db: { from: () => chain }, ranges, selected };
}

describe('loadHashedImages', () => {
  it('reads every page until a short one', async () => {
    const { db, ranges } = fakeDb([1000, 1000, 3]);
    const rows = await loadHashedImages(db);
    assert.equal(rows.length, 2003);
    assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
  });
  it('selects created_at so near-duplicate ordering works', async () => {
    const { db, selected } = fakeDb([1]);
    await loadHashedImages(db);
    assert.match(selected[0], /\bcreated_at\b/);
  });
  it('returns [] for an empty first page', async () => {
    const { db, ranges } = fakeDb([]);
    assert.deepEqual(await loadHashedImages(db), []);
    assert.equal(ranges.length, 1);
  });
});
