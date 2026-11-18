import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

let cache = null;
let inflight = null;

/** Municipalities, barangays, agencies, contractors (cached for the session). */
export function useReference() {
  const [data, setData] = useState(cache);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (cache) return;
    inflight ||= api.get('/reference').then((r) => (cache = r.data));
    inflight.then(setData).catch((e) => {
      inflight = null;
      setError(e);
    });
  }, []);
  return { ref: data, error, loading: !data && !error };
}

export function invalidateReference() {
  cache = null;
  inflight = null;
}
