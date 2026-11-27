import 'dotenv/config';

function list(value, fallback) {
  return (value || fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Proxy hops in front of Express. A typo must not become NaN or true. */
export function parseTrustProxy(value) {
  if (value == null || String(value).trim() === '') return 1;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : 1;
}

export const env = Object.freeze({
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  corsOrigins: list(process.env.CORS_ORIGINS, 'http://localhost:5173'),
  // Week 3: daily automatic flag check (01:15 Philippine time)
  dailyFlagCheckCron: process.env.DAILY_FLAG_CHECK_CRON || '15 1 * * *',
  // Browser -> Vercel -> Render -> Express: raise by 1 if req.ip shows a proxy address
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  debugProxy: process.env.DEBUG_PROXY === '1',
  timezone: process.env.TZ_NAME || 'Asia/Manila',
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
