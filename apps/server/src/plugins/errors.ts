import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string) => new AppError(400, 'BAD_REQUEST', msg);
export const unauthorized = (msg = 'Not authenticated') => new AppError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'Not allowed') => new AppError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Not found') => new AppError(404, 'NOT_FOUND', msg);
export const tooMany = (msg = 'Too many requests') => new AppError(429, 'RATE_LIMITED', msg);

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      void reply.code(err.status).send({ error: err.code, message: err.message });
      return;
    }
    if (err instanceof ZodError) {
      void reply.code(400).send({
        error: 'VALIDATION',
        message: 'Invalid input',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }
    if (typeof (err as { statusCode?: number }).statusCode === 'number') {
      const status = (err as { statusCode: number }).statusCode;
      if (status < 500) {
        void reply.code(status).send({ error: 'REQUEST_ERROR', message: (err as Error).message });
        return;
      }
    }
    logger.error({ err: err as Error, url: req.url }, 'unhandled error');
    void reply.code(500).send({ error: 'INTERNAL', message: 'Internal server error' });
  });

  app.setNotFoundHandler((req, reply) => {
    void reply.code(404).send({ error: 'NOT_FOUND', message: 'Route not found' });
  });
}
