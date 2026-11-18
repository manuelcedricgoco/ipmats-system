/**
 * Supabase clients.
 *  - userClient(token): acts AS the caller → every read is filtered by RLS.
 *  - anonClient: public visitor (RLS: approved/public rows only).
 *  - adminClient: service role, SERVER ONLY. Used for writes after the API has
 *    authenticated the caller and checked the role. Null if no key configured.
 */
import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

const base = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export const anonClient = env.supabaseUrl && env.supabaseAnonKey ? createClient(env.supabaseUrl, env.supabaseAnonKey, base) : null;

export const adminClient =
  env.supabaseUrl && env.supabaseServiceKey ? createClient(env.supabaseUrl, env.supabaseServiceKey, base) : null;

export function userClient(accessToken) {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    ...base,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
