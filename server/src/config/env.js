import 'dotenv/config';

function list(value, fallback) {
  return (value || fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const env = Object.freeze({
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  corsOrigins: list(process.env.CORS_ORIGINS, 'http://localhost:5173'),
});

export function assertEnv() {
  const missing = [];
  if (!env.supabaseUrl) missing.push('SUPABASE_URL');
  if (!env.supabaseAnonKey) missing.push('SUPABASE_ANON_KEY');
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  if (!env.supabaseServiceKey) {
    console.warn('[config] SUPABASE_SERVICE_ROLE_KEY is not set: the API runs READ-ONLY (writes return 503).');
  }
}
