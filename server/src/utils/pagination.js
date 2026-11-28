import { unwrap } from './httpError.js';

/**
 * Page and page size from the query string (?page=&pageSize=), clamped to sane bounds,
 * with the inclusive row range for Supabase's .range(from, to).
 */
export function pagination(query, { maxSize = 100, defaultSize = 25 } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, Number.parseInt(query.pageSize, 10) || defaultSize));
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
}

/** PostgREST returns at most this many rows per request (max_rows); longer lists are read page by page. */
export const PAGE_SIZE = 1000;

/**
 * Every row of the query `build()` returns (built fresh for each page, without order or range), read page by
 * page in a stable order (`id`) until a short page, so a list longer than max_rows is never cut silently.
 */
export async function readAllPages(build, pageSize = PAGE_SIZE) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const page = unwrap(await build().order('id').range(from, from + pageSize - 1));
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
