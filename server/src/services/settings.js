import { DEFAULT_RULES } from './flagDetection.js';

/** WEEK 3 — flag thresholds from system_settings (falls back to the defaults). */
export async function getFlagRules(db) {
  const { data } = await db.from('system_settings').select('value').eq('key', 'flag_rules').maybeSingle();
  return { ...DEFAULT_RULES, ...(data?.value || {}) };
}
