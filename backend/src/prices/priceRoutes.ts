import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../common/errors.js';
import type { Database } from '../db/database.js';
import { PriceRepository } from './priceRepository.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const decimal = z.string().regex(/^\d{1,10}(\.\d{1,4})?$/, 'Use a non-negative number with up to 4 decimals');

const searchQuery = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    storeId: z.string().trim().max(20).optional(),
    sku: z.string().trim().max(40).optional(),
    countryCode: z.string().trim().length(2).optional(),
    minPrice: decimal.optional(),
    maxPrice: decimal.optional(),
    dateFrom: isoDate.optional(),
    dateTo: isoDate.optional(),
    sort: z.enum(['effectiveDate', 'price', 'sku', 'productName']).default('effectiveDate'),
    order: z.enum(['asc', 'desc']).default('desc'),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().max(500).optional(),
  })
  .refine((q) => !q.minPrice || !q.maxPrice || Number(q.minPrice) <= Number(q.maxPrice), {
    message: 'minPrice must not exceed maxPrice',
    path: ['minPrice'],
  })
  .refine((q) => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo, {
    message: 'dateFrom must not be after dateTo',
    path: ['dateFrom'],
  });

const updateBody = z
  .object({
    price: decimal.optional(),
    productName: z.string().trim().min(1).max(200).regex(/^[^=+@]/, 'Must not start with =, + or @').optional(),
    reason: z.string().trim().min(3, 'Give a short reason for the change').max(200),
  })
  .refine((b) => b.price !== undefined || b.productName !== undefined, { message: 'Nothing to update' });

const idParams = z.object({ id: z.string().regex(/^\d{1,18}$/) });

/** ETag carries the record version; clients echo it in If-Match when saving. */
const etag = (version: number) => `"${version}"`;

function parseIfMatch(header: string | undefined): number {
  if (!header) throw new ApiError(428, 'PRECONDITION_REQUIRED', 'If-Match header with the record version is required');
  const m = /^(?:W\/)?"?(\d+)"?$/.exec(header.trim());
  if (!m) throw ApiError.badRequest('Malformed If-Match header');
  return Number(m[1]);
}

export function priceRoutes(app: FastifyInstance, deps: { db: Database }) {
  const prices = new PriceRepository(deps.db);

  app.get('/api/v1/prices', { preHandler: app.authenticate }, async (request) => {
    const parsed = searchQuery.safeParse(request.query);
    if (!parsed.success) throw ApiError.badRequest('Invalid search criteria', { errors: z.flattenError(parsed.error).fieldErrors });
    return prices.search(request.principal, parsed.data);
  });

  app.get('/api/v1/prices/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const record = await prices.findById(request.principal, id);
    reply.header('ETag', etag(record.version));
    return record;
  });

  app.patch('/api/v1/prices/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const expectedVersion = parseIfMatch(request.headers['if-match']);
    const parsed = updateBody.safeParse(request.body);
    if (!parsed.success) throw ApiError.badRequest('Invalid changes', { errors: z.flattenError(parsed.error).fieldErrors });
    const record = await prices.update(request.principal, id, expectedVersion, parsed.data);
    reply.header('ETag', etag(record.version));
    return record;
  });

  app.get('/api/v1/prices/:id/history', { preHandler: app.authenticate }, async (request) => {
    const { id } = idParams.parse(request.params);
    return { items: await prices.history(request.principal, id) };
  });
}
