/**
 * Browser Supabase client — authentication only.
 * Uses the PUBLIC anon/publishable key; data access is protected by RLS and
 * all writes go through the Node.js API. Never put the service key here.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy client/.env.example to client/.env');
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
