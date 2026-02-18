import { Context } from 'hono';
import { SwarmError, TaskNotFoundError } from '../../shared/errors';

export function errorHandler(err: Error, c: Context) {
  if (err instanceof TaskNotFoundError) {
    return c.json({ error: { code: err.code, message: err.message } }, 404);
  }
  if (err instanceof SwarmError) {
    const status = err.code === 'VALIDATION_ERROR' ? 400 : 500;
    return c.json({ error: { code: err.code, message: err.message, details: err.details } }, status);
  }
  console.error('Unhandled error:', err);
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
}
