/**
 * WEEK 3 — Daily re-check of every project's status and flag, so delays are
 * detected even when nobody submits an update (dates keep moving).
 * Runs inside the API (node-cron, Asia/Manila time), once at start-up, and on demand:
 *   npm run flags:recheck
 */
import cron from 'node-cron';
import { pathToFileURL } from 'node:url';
import { adminClient } from '../config/supabase.js';
import { env } from '../config/env.js';
import { logActivity } from '../services/activityLog.js';
import { evaluateAndSave, loadHashedImages } from '../services/projectEvaluation.js';
import { getFlagRules } from '../services/settings.js';

/**
 * Whether a check run without a person (daily or start-up) gets an activity-log entry. The daily check always
 * does (once a day). The start-up check runs on every restart, so it is logged only when it changed a flag or failed.
 */
export function shouldLogSystemCheck({ trigger, changed, failed }) {
  return trigger !== 'startup' || changed > 0 || failed > 0;
}

export async function runFlagCheck({ trigger = 'daily_check', actorId = null, today = new Date() } = {}) {
  if (!adminClient) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for the flag check.');
  const started = Date.now();
  const rules = await getFlagRules(adminClient);
  const { data: projects, error } = await adminClient.from('projects').select('id, project_code');
  if (error) throw error;
  const phashCandidates = await loadHashedImages(adminClient);
  const summary = { evaluated: 0, changed: 0, failed: 0, green: 0, yellow: 0, red: 0, changes: [] };
  for (const p of projects) {
    try {
      const r = await evaluateAndSave(adminClient, p.id, { trigger, actorId, rules, today, phashCandidates });
      summary.evaluated += 1;
      summary[r.flag] += 1;
      if (r.flagChanged) {
        summary.changed += 1;
        summary.changes.push({ project_code: p.project_code, from: r.previousFlag, to: r.flag });
      }
    } catch (err) {
      summary.failed += 1;
      console.error(`[flag-check] ${p.project_code} failed:`, err.message);
    }
  }
  summary.duration_ms = Date.now() - started;
  // Activity log: the scheduled and start-up checks are logged as "System" (manual re-checks are logged by the API with the person's name).
  if (!actorId && shouldLogSystemCheck({ trigger, changed: summary.changed, failed: summary.failed })) {
    await logActivity(null, {
      action: 'flag.check',
      entityType: 'system',
      summary: `Automatic flag check (${trigger}): ${summary.evaluated} projects evaluated, ${summary.changed} flag(s) changed`,
      details: { trigger, evaluated: summary.evaluated, changed: summary.changed, failed: summary.failed, changes: summary.changes.slice(0, 50) },
    });
  }
  return summary;
}

export function scheduleDailyFlagCheck() {
  if (!adminClient) {
    console.log('[flag-check] disabled: no service key (the API is read-only).');
    return null;
  }
  // Evaluate once at start-up so new or never-evaluated projects get a flag right away
  runFlagCheck({ trigger: 'startup' })
    .then((s) => console.log(`[flag-check] start-up: evaluated ${s.evaluated} (green ${s.green}, yellow ${s.yellow}, red ${s.red}), failed ${s.failed}`))
    .catch((err) => console.error('[flag-check] start-up run failed:', err.message));
  if (!cron.validate(env.dailyFlagCheckCron)) {
    console.error(`[flag-check] invalid DAILY_FLAG_CHECK_CRON "${env.dailyFlagCheckCron}"`);
    return null;
  }
  console.log(`[flag-check] daily schedule "${env.dailyFlagCheckCron}" (${env.timezone})`);
  return cron.schedule(
    env.dailyFlagCheckCron,
    async () => {
      try {
        const s = await runFlagCheck();
        console.log(`[flag-check] evaluated ${s.evaluated}, changed ${s.changed}, failed ${s.failed} in ${s.duration_ms} ms`);
      } catch (err) {
        console.error('[flag-check] run failed:', err.message);
      }
    },
    { timezone: env.timezone },
  );
}

// CLI: node src/jobs/dailyFlagCheck.js --run-now
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--run-now')) {
  runFlagCheck({ trigger: 'manual_cli' })
    .then((s) => {
      console.log(JSON.stringify(s, null, 2));
      process.exit(s.failed ? 1 : 0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
