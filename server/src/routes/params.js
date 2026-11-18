import { badRequest } from '../utils/httpError.js';
import { uuidParam } from './schemas.js';

/** Reject malformed :id-style params early (400 instead of a DB error). */
export function uuidParams(router, ...names) {
  for (const name of names) {
    router.param(name, (_req, _res, next, value) => (uuidParam.safeParse(value).success ? next() : next(badRequest(`Invalid ${name}`))));
  }
}
