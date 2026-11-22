export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const unauthorized = (msg = 'Authentication required') => new HttpError(401, msg);
export const forbidden = (msg = 'You do not have permission to perform this action') => new HttpError(403, msg);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);

/** Unwrap a Supabase { data, error } result, mapping DB errors to HTTP errors. */
export function unwrap({ data, error }, { notFoundMessage } = {}) {
  if (error) {
    if (error.code === 'PGRST116') throw notFound(notFoundMessage);
    if (error.code === '23505') throw conflict('A record with the same unique value already exists.');
    if (error.code === '23503') throw badRequest('A referenced record does not exist.');
    if (error.code === '23514') throw badRequest('The data violates a validation rule.', error.message);
    if (error.code === '42501') throw forbidden();
    // Business-rule errors raised by our own database triggers (e.g. the Project ID cannot change).
    if (error.code === 'P0001') throw badRequest(error.message);
    const err = new HttpError(500, 'Database error');
    err.cause = error;
    throw err;
  }
  return data;
}
