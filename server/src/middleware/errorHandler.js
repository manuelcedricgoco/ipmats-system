import multer from 'multer';
import { HttpError } from '../utils/httpError.js';
import { env } from '../config/env.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.originalUrl}` } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large.' : err.message;
    return res.status(400).json({ error: { message } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { message: 'Malformed JSON body.' } });
  }
  const status = err instanceof HttpError ? err.status : 500;
  if (status >= 500 && !(err instanceof HttpError && status === 503)) {
    // Log internals server-side only; never leak stack traces or DB details. Log the route pattern
    // (/projects/:id), never the concrete path or query: it can hold ids, codes or search text.
    // (Express clears the mount prefix once a router is left, so it is usually not part of the pattern.)
    const route = `${req.baseUrl}${req.route?.path ?? ''}` || '(no matching route)';
    console.error(`[error] ${req.method} ${route}`, err.cause || err);
  }
  const body = { error: { message: status >= 500 && !(err instanceof HttpError) ? 'Internal server error' : err.message } };
  if (err.details && status < 500) body.error.details = err.details;
  if (env.nodeEnv === 'development' && status >= 500 && err.cause?.message) body.error.hint = err.cause.message;
  return res.status(status).json(body);
}
