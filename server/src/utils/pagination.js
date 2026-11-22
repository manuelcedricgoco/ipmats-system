/**
 * Page and page size from the query string (?page=&pageSize=), clamped to sane bounds,
 * with the inclusive row range for Supabase's .range(from, to).
 */
export function pagination(query, { maxSize = 100, defaultSize = 25 } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, Number.parseInt(query.pageSize, 10) || defaultSize));
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
}
