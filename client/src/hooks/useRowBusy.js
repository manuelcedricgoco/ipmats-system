import { useCallback, useState } from 'react';

/**
 * Tracks which table rows have a request in flight, so their action buttons can be disabled.
 *   const rows = useRowBusy();
 *   await rows.run(item.id, () => api.del(`/things/${item.id}`));
 *   <RowActions busy={rows.isBusy(item.id)} … />
 */
export function useRowBusy() {
  const [ids, setIds] = useState(() => new Set());
  const run = useCallback(async (id, fn) => {
    setIds((s) => new Set(s).add(id));
    try {
      return await fn();
    } finally {
      setIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }, []);
  const isBusy = useCallback((id) => ids.has(id), [ids]);
  return { run, isBusy };
}
