import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

/**
 * Fetch `path` (with `query`) and expose { data, error, loading, reload }.
 * Re-fetches when path/query change; aborts stale requests.
 */
export function useApi(path, query, { enabled = true, select = (r) => r } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(enabled && path) });
  const key = `${path}|${JSON.stringify(query || {})}`;
  const selectRef = useRef(select);
  selectRef.current = select;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled || !path) {
      setState((s) => ({ ...s, loading: false }));
      return undefined;
    }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    api
      .get(path, { query, signal: ctrl.signal })
      .then((res) => setState({ data: selectRef.current(res), error: null, loading: false }))
      .catch((err) => {
        if (err.name !== 'AbortError') setState({ data: null, error: err, loading: false });
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
