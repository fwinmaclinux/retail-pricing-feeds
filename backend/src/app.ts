import crypto from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import authPlugin from './auth/authPlugin.js';
import { ApiError } from './common/errors.js';
import type { AppConfig } from './config.js';
import type { Database } from './db/database.js';
import { feedRoutes } from './feeds/feedRoutes.js';
import { FeedIngestionService } from './feeds/ingestionService.js';
import { InProcessJobQueue, type JobQueue } from './feeds/jobQueue.js';
import { priceRoutes } from './prices/priceRoutes.js';
import { LocalBlobStore, type BlobStore } from './storage/blobStore.js';
import { storeRoutes } from './stores/storeRoutes.js';

export interface App {
  server: FastifyInstance;
  queue: JobQueue;
  ingestion: FeedIngestionService;
  blobs: BlobStore;
}

export async function buildApp(config: AppConfig, db: Database, opts: { logger?: boolean } = {}): Promise<App> {
  const server = Fastify({
    logger:
      opts.logger === false
        ? false
        : { level: config.logLevel, redact: ['req.headers.authorization'] },
    // Correlation id: honour the caller's X-Request-Id (set by the app / API gateway) or mint one.
    genReqId: (req) => (req.headers['x-request-id'] as string) || crypto.randomUUID(),
    requestIdHeader: 'x-request-id',
    trustProxy: true,
  });

  const blobs = new LocalBlobStore(config.blobDir);
  const ingestion = new FeedIngestionService(db, blobs, server.log, config.ingestBatchSize);
  const queue = new InProcessJobQueue(
    (feedId) => ingestion.process(feedId),
    config.workerConcurrency,
    (feedId, err) => server.log.error({ feedId, err }, 'ingestion job crashed'),
  );

  await server.register(helmet);
  await server.register(cors, { origin: true, exposedHeaders: ['ETag', 'X-Request-Id'] });
  await server.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (req) => (req.headers.authorization ?? req.ip).slice(-32),
  });
  await server.register(authPlugin, { secret: config.jwtSecret, mode: config.authMode });

  server.addHook('onSend', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
  });

  server.setErrorHandler((err, request, reply) => {
    if (err instanceof ApiError) {
      return reply
        .status(err.status)
        .type('application/problem+json')
        .send({ status: err.status, code: err.code, title: err.message, requestId: request.id, ...err.extra });
    }
    if (err instanceof ZodError) {
      return reply.status(400).type('application/problem+json').send({
        status: 400,
        code: 'VALIDATION_FAILED',
        title: 'Invalid request',
        requestId: request.id,
        errors: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) request.log.error({ err }, 'unhandled error');
    return reply
      .status(status)
      .type('application/problem+json')
      .send({
        status,
        code: status === 429 ? 'RATE_LIMITED' : status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST',
        title: status >= 500 ? 'Something went wrong. Please try again.' : (err as Error).message,
        requestId: request.id,
      });
  });

  server.get('/health/live', async () => ({ status: 'ok' }));
  server.get('/health/ready', async () => {
    await db.query('SELECT 1');
    return { status: 'ready' };
  });

  storeRoutes(server, { db });
  priceRoutes(server, { db });
  feedRoutes(server, { db, blobs, queue, maxUploadBytes: config.maxUploadBytes });

  return { server, queue, ingestion, blobs };
}
