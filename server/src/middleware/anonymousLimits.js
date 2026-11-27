import crypto from 'node:crypto';
import net from 'node:net';
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

/** The eight 16-bit groups of an IPv6 address, as numbers. */
function ipv6Groups(ip) {
  let addr = ip.split('%')[0]; // drop a zone id (fe80::1%eth0)
  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(addr);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    addr = `${addr.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = addr.split('::');
  const part = (x) => (x ? x.split(':') : []);
  const h = part(head);
  const t = tail === undefined ? [] : part(tail);
  const groups = [...h, ...Array(8 - h.length - t.length).fill('0'), ...t];
  return groups.map((g) => parseInt(g, 16) || 0);
}

/**
 * What the limiters count by: an IPv4 address as is (also when written as IPv4-mapped IPv6, ::ffff:a.b.c.d),
 * an IPv6 address by its /64 prefix (one home or phone usually gets a whole /64 and can pick any address in it).
 */
export function limiterAddress(ip) {
  const value = String(ip ?? 'unknown');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(value);
  if (mapped) return mapped[1];
  if (!net.isIPv6(value.split('%')[0])) return value;
  return `${ipv6Groups(value)
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(':')}::/64`;
}

/** Anonymous limiter key: an HMAC of the IP (IPv6: its /64) under a per-day secret. Ignores req.user. */
export function anonKey(req, now = new Date()) {
  const digest = crypto.createHmac('sha256', secretForDay(now)).update(limiterAddress(req.ip)).digest('hex');
  return `a:${digest}`;
}

const make = (windowMs, limit, text, keyGenerator, skipFailedRequests = false) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { message: text } },
    keyGenerator,
    skipFailedRequests,
  });

const REPORT_MSG = 'Too many reports from this connection today. Please try again tomorrow.';
const DAY = 24 * 60 * 60_000;

export const reportSubmitLimiter = make(DAY, 3, REPORT_MSG, (req) => anonKey(req), true);
export const reportProjectLimiter = make(DAY, 1, REPORT_MSG, (req) => `${anonKey(req)}:${req.params.id}`, true);
export const trackingLookupLimiter = make(60 * 60_000, 20, 'Too many checks. Please try again later.', (req) => anonKey(req));
