import crypto from 'node:crypto';
import type { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../common/errors.js';
import type { Database } from '../db/database.js';
import type { BlobStore } from '../storage/blobStore.js';
import { FeedRepository, toFeedDto, type FeedRow } from './feedRepository.js';
import type { JobQueue } from './jobQueue.js';

const createFeedBody = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((n) => /\.csv$/i.test(n), 'Only .csv files are accepted'),
  sizeBytes: z.number().int().positive(),
  checksumSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .transform((s) => s.toLowerCase())
    .optional(),
});

const feedParams = z.object({ feedId: z.uuid() });

export function feedRoutes(app: FastifyInstance, deps: { db: Database; blobs: BlobStore; queue: JobQueue; maxUploadBytes: number }) {
  const feeds = new FeedRepository(deps.db);

  // The upload body is streamed straight to blob storage; it is never buffered in memory.
  app.addContentTypeParser(['text/csv', 'application/octet-stream'], (_req, payload, done) => done(null, payload));

  const uploadInstructions = (feed: FeedRow) => ({
    // Production: a pre-signed S3 PUT URL (15 min expiry) so file bytes bypass the API tier.
    method: 'PUT' as const,
    url: `/api/v1/feeds/${feed.feedId}/content`,
    headers: { 'Content-Type': 'text/csv' },
  });

  const loadOwnFeed = async (feedId: string, userId: string, isAdmin: boolean) => {
    const feed = await feeds.findById(feedId);
    if (!feed || (!isAdmin && feed.uploadedBy !== userId)) throw ApiError.notFound('Feed not found');
    return feed;
  };

  /** Step 1: register the upload. Same file twice (by SHA-256) is recognised and not re-applied. */
  app.post('/api/v1/feeds', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = createFeedBody.safeParse(request.body);
    if (!parsed.success) throw ApiError.badRequest('Invalid upload request', { errors: z.flattenError(parsed.error).fieldErrors });
    const body = parsed.data;
    if (body.sizeBytes > deps.maxUploadBytes) {
      throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `Feed files are limited to ${Math.round(deps.maxUploadBytes / 1024 / 1024)} MB`);
    }

    if (body.checksumSha256) {
      const existing = await feeds.findActiveByChecksum(request.principal.userId, body.checksumSha256);
      if (existing?.status === 'AWAITING_UPLOAD') {
        return reply.status(200).send({ feed: toFeedDto(existing), upload: uploadInstructions(existing), duplicateOf: null });
      }
      if (existing) {
        return reply.status(200).send({ feed: toFeedDto(existing), upload: null, duplicateOf: existing.feedId });
      }
    }

    const feed = await feeds.create({
      feedId: crypto.randomUUID(),
      fileName: body.fileName,
      sizeBytes: body.sizeBytes,
      checksumSha256: body.checksumSha256 ?? null,
      principal: request.principal,
    });
    return reply.status(201).send({ feed: toFeedDto(feed), upload: uploadInstructions(feed), duplicateOf: null });
  });

  /** Step 2: receive the file bytes (local stand-in for the S3 pre-signed PUT). */
  app.put('/api/v1/feeds/:feedId/content', { preHandler: app.authenticate }, async (request, reply) => {
    const { feedId } = feedParams.parse(request.params);
    const feed = await loadOwnFeed(feedId, request.principal.userId, false);
    if (feed.status !== 'AWAITING_UPLOAD') {
      throw new ApiError(409, 'ALREADY_UPLOADED', 'This feed has already been uploaded');
    }

    const blobKey = `${feedId}.csv`;
    const stored = await deps.blobs.write(blobKey, request.body as Readable, deps.maxUploadBytes);
    if (feed.checksumSha256 && feed.checksumSha256 !== stored.sha256) {
      await deps.blobs.remove(blobKey);
      throw new ApiError(422, 'CHECKSUM_MISMATCH', 'The file was corrupted in transit. Please retry the upload.');
    }

    let queued: FeedRow;
    try {
      queued = await feeds.markQueued(feedId, { blobKey, sizeBytes: stored.sizeBytes, sha256: stored.sha256 });
    } catch (err) {
      if ((err as { code?: string }).code !== '23505') throw err;
      const original = await feeds.findActiveByChecksum(request.principal.userId, stored.sha256);
      await feeds.complete(feedId, 'FAILED', `Duplicate of an earlier upload (${original?.feedId ?? 'unknown'})`);
      await deps.blobs.remove(blobKey);
      throw new ApiError(409, 'DUPLICATE_FEED', 'This exact file has already been uploaded', { duplicateOf: original?.feedId });
    }

    deps.queue.enqueue(feedId);
    return reply.status(202).send({ feed: toFeedDto(queued) });
  });

  app.get('/api/v1/feeds', { preHandler: app.authenticate }, async (request) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) }).parse(request.query);
    const rows = await feeds.list(request.principal, limit);
    return { items: rows.map(toFeedDto) };
  });

  app.get('/api/v1/feeds/:feedId', { preHandler: app.authenticate }, async (request) => {
    const { feedId } = feedParams.parse(request.params);
    const feed = await loadOwnFeed(feedId, request.principal.userId, request.principal.role === 'PRICING_ADMIN');
    return { feed: toFeedDto(feed) };
  });

  app.get('/api/v1/feeds/:feedId/errors', { preHandler: app.authenticate }, async (request) => {
    const { feedId } = feedParams.parse(request.params);
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(1000).default(200) }).parse(request.query);
    await loadOwnFeed(feedId, request.principal.userId, request.principal.role === 'PRICING_ADMIN');
    return { items: await feeds.listErrors(feedId, limit) };
  });
}
