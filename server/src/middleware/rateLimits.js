import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const message = { error: { message: 'Too many requests, please slow down.' } };

/** Signed-in users are limited per account, everyone else per IP. */
export function rateLimitKey(req) {
  return req.user ? `u:${req.user.id}` : `ip:${req.ip ?? 'unknown'}`;
}

const make = (windowMs, limit, keyGenerator) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message,
    ...(keyGenerator && { keyGenerator }),
  });

/** Runs before authentication: a generous per-IP ceiling. */
export const ipLimiter = make(60_000, 600);
/** Runs after authentication: per user (per IP when anonymous). */
export const userLimiter = make(60_000, 300, rateLimitKey);
export const uploadLimiter = make(10 * 60_000, 20, rateLimitKey);
export const reportLimiter = make(10 * 60_000, 30, rateLimitKey);

let logged = 0;
/** DEBUG_PROXY=1: log req.ip and X-Forwarded-For length for the first 20 requests. */
export function proxyDebug(req, _res, next) {
  if (env.debugProxy && logged < 20) {
    logged += 1;
    const hops = String(req.headers['x-forwarded-for'] ?? '').split(',').filter((x) => x.trim()).length;
    console.log(`[proxy-debug] req.ip=${req.ip} x-forwarded-for entries=${hops}`);
  }
  next();
}
