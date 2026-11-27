import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

let cache = null;
let inflight = null;
// Bumped by invalidateReference(): a response to a request started before that (for example while signed out)
// must not fill the cache, because the lists differ per session (contractors are for staff and PACC only).
let generation = 0;

/** Municipalities, barangays, agencies, contractors — fetched once and cached until invalidated. */
export function loadReference() {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    const gen = generation;
    inflight = api.get('/reference').then(
      (r) => {
        if (gen === generation) cache = r.data;
        return r.data;
      },
      (e) => {
        if (gen === generation) inflight = null;
        throw e;
      },
    );
  }
  return inflight;
}

/** Municipalities, barangays, agencies, contractors (cached until sign-in, sign-out or an edit invalidates them). */
export function useReference() {
  const [data, setData] = useState(cache);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (cache) return;
    loadReference().then(setData).catch(setError);
  }, []);
  return { ref: data, error, loading: !data && !error };
}

/** Forget the cached lists: call after sign-in / sign-out and after editing contractors or offices. */
export function invalidateReference() {
  cache = null;
  inflight = null;
  generation += 1;
}
