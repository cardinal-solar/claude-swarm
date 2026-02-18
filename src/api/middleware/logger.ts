import { MiddlewareHandler } from 'hono';
import pino from 'pino';

export function createLogger(level: string) {
  return pino({ level, transport: level === 'debug' ? { target: 'pino-pretty' } : undefined });
}

export function loggerMiddleware(logger: pino.Logger): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    logger.info({
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration,
    });
  };
}
