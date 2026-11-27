import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { manilaDate } from '../services/citizenReports.js';

// Per-day random secrets live only in memory, so a limiter key can't be linked to an IP
// after the day ends or after a restart. Never log or export the secret or the IP.
const secrets = new Map();

function secretForDay(now) {
  const day = manilaDate(now);
  let secret = secrets.get(day);
  if (!secret) {
    secret = crypto.randomBytes(32);
    for (const other of secrets.keys()) if (other !== day) secrets.delete(other);
    secrets.set(day, secret);
  }
  return secret;
}

/** Anonymous limiter key: an HMAC of the IP under a per-day secret. Ignores req.user. */
export function anonKey(req, now = new Date()) {
  const digest = crypto.createHmac('sha256', secretForDay(now)).update(String(req.ip ?? 'unknown')).digest('hex');
  return `a:${digest}`;
}

const make = (windowMs, limit, text, keyGenerator) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { message: text } },
    keyGenerator,
  });

const REPORT_MSG = 'Too many reports from this connection today. Please try again tomorrow.';
const DAY = 24 * 60 * 60_000;

export const reportSubmitLimiter = make(DAY, 3, REPORT_MSG, (req) => anonKey(req));
export const reportProjectLimiter = make(DAY, 1, REPORT_MSG, (req) => `${anonKey(req)}:${req.params.id}`);
export const trackingLookupLimiter = make(60 * 60_000, 20, 'Too many checks. Please try again later.', (req) => anonKey(req));
