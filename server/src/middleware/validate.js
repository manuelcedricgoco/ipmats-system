import { badRequest } from '../utils/httpError.js';

/** Validate req[source] with a zod schema and replace it with the parsed value. */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return next(badRequest('Validation failed', details));
  }
  req[source] = result.data;
  return next();
};
