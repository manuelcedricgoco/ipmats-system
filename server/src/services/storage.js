/**
 * WEEK 3 — short-lived signed links for private Storage files (360° photos, evidence).
 * The API checks the user's role first, then signs with the service role.
 */
import { adminClient } from '../config/supabase.js';

const TTL = Number(process.env.SIGNED_URL_TTL || 3600); // seconds

/** Signed links for `paths` ({ path: url|null }). `ttl` in seconds (default SIGNED_URL_TTL, 1 hour). */
export async function signedUrls(bucket, paths, ttl = TTL) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length || !adminClient) return {};
  const { data, error } = await adminClient.storage.from(bucket).createSignedUrls(unique, ttl);
  if (error || !data) return {};
  return Object.fromEntries(data.map((d) => [d.path, d.error ? null : d.signedUrl]));
}

export async function signedUrl(bucket, path) {
  if (!path) return null;
  return (await signedUrls(bucket, [path]))[path] ?? null;
}
