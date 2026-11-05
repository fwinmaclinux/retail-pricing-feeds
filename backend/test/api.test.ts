import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDatabase, type Database } from '../src/db/database.js';
import { migrate } from '../src/db/migrate.js';
import { seedSamplePrices, seedStores } from '../src/db/seed.js';

let app: App;
let db: Database;
let blobDir: string;

beforeAll(async () => {
  blobDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pricing-blobs-'));
  const config = loadConfig({ pgliteDataDir: 'memory://', blobDir, databaseUrl: undefined, ingestBatchSize: 7 });
  db = await createDatabase(config);
  await migrate(db);
  await seedStores(db);
  app = await buildApp(config, db, { logger: false });
  await seedSamplePrices(db, app.blobs, app.ingestion);
});

afterAll(async () => {
  await app.server.close();
  await db.close();
  fs.rmSync(blobDir, { recursive: true, force: true });
});

async function login(userId: string): Promise<Record<string, string>> {
  const res = await app.server.inject({ method: 'POST', url: '/api/v1/auth/dev-login', payload: { userId } });
  expect(res.statusCode).toBe(200);
  return { authorization: `Bearer ${res.json().accessToken}` };
}

async function uploadCsv(headers: Record<string, string>, csv: string, fileName = 'feed.csv') {
  const checksumSha256 = crypto.createHash('sha256').update(csv).digest('hex');
  const created = await app.server.inject({
    method: 'POST',
    url: '/api/v1/feeds',
    headers,
    payload: { fileName, sizeBytes: Buffer.byteLength(csv), checksumSha256 },
  });
  const body = created.json();
  if (!body.upload) return { created, feed: body.feed, duplicateOf: body.duplicateOf as string | null };
  const put = await app.server.inject({
    method: 'PUT',
    url: body.upload.url,
    headers: { ...headers, 'content-type': 'text/csv' },
    payload: csv,
  });
  expect(put.statusCode).toBe(202);
  await app.queue.onIdle();
  const status = await app.server.inject({ method: 'GET', url: `/api/v1/feeds/${body.feed.feedId}`, headers });
  return { created, feed: status.json().feed, duplicateOf: null };
}

describe('authentication', () => {
  it('rejects calls without a token', async () => {
    const res = await app.server.inject({ method: 'GET', url: '/api/v1/prices' });
    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });
});

describe('feed upload and ingestion', () => {
  it('loads valid rows, rejects invalid ones with row-level reasons', async () => {
    const headers = await login('sm.london');
    const csv = [
      'SKU,Store ID,Product Name,Price,Date',
      'TST-0001,GB-LON-001,Test Item One,1.99,2026-11-02',
      'TST-0002,GB-LON-001,"Item, with comma",12.5,2026-11-02',
      'TST-0003,IN-MUM-001,Other store,3.00,2026-11-02', // outside scope
      'TST-0004,GB-LON-001,Bad price,abc,2026-11-02',
      'TST-0001,GB-LON-001,Duplicate,2.99,2026-11-02',
    ].join('\n');

    const { created, feed } = await uploadCsv(headers, csv);
    expect(created.statusCode).toBe(201);
    expect(feed).toMatchObject({ status: 'COMPLETED_WITH_ERRORS', totalRows: 5, insertedRows: 2, rejectedRows: 3 });

    const errors = await app.server.inject({ method: 'GET', url: `/api/v1/feeds/${feed.feedId}/errors`, headers });
    expect(errors.json().items.map((e: { rowNumber: number }) => e.rowNumber)).toEqual([4, 5, 6]);
    expect(errors.json().items[2].messages[0]).toContain('Duplicate of row 2');

    const search = await app.server.inject({ method: 'GET', url: '/api/v1/prices?sku=TST-0002', headers });
    expect(search.json().items[0]).toMatchObject({ productName: 'Item, with comma', price: '12.5', currency: 'GBP' });
  });

  it('recognises a re-uploaded identical file and does not apply it twice', async () => {
    const headers = await login('sm.london');
    const csv = 'Store ID,SKU,Product Name,Price,Date\nGB-LON-001,TST-0100,Idempotent Item,5.00,2026-11-02\n';
    const first = await uploadCsv(headers, csv);
    expect(first.feed.status).toBe('COMPLETED');
    const second = await uploadCsv(headers, csv);
    expect(second.duplicateOf).toBe(first.feed.feedId);
  });

  it('counts unchanged rows and bumps the version only for real changes', async () => {
    const headers = await login('sm.london');
    const header = 'Store ID,SKU,Product Name,Price,Date';
    await uploadCsv(headers, `${header}\nGB-LON-001,TST-0200,Changing Item,5.00,2026-11-02\nGB-LON-001,TST-0201,Stable Item,7.00,2026-11-02\n`);
    const { feed } = await uploadCsv(
      headers,
      `${header}\nGB-LON-001,TST-0200,Changing Item,5.50,2026-11-02\nGB-LON-001,TST-0201,Stable Item,7.00,2026-11-02\n`,
    );
    expect(feed).toMatchObject({ insertedRows: 0, updatedRows: 1, unchangedRows: 1 });

    const record = (await app.server.inject({ method: 'GET', url: '/api/v1/prices?sku=TST-0200', headers })).json().items[0];
    expect(record).toMatchObject({ price: '5.5', version: 2 });
  });

  it('fails the whole feed when required columns are missing', async () => {
    const headers = await login('sm.london');
    const { feed } = await uploadCsv(headers, 'Store,SKU,Price\nGB-LON-001,X,1\n');
    expect(feed.status).toBe('FAILED');
    expect(feed.failureReason).toContain('Product Name, Date');
  });

  it('rejects non-CSV uploads up front', async () => {
    const headers = await login('sm.london');
    const res = await app.server.inject({
      method: 'POST',
      url: '/api/v1/feeds',
      headers,
      payload: { fileName: 'prices.xlsx', sizeBytes: 10 },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('search', () => {
  it('scopes results to the caller entitlement', async () => {
    const manager = await login('sm.mumbai');
    const res = await app.server.inject({ method: 'GET', url: '/api/v1/prices?limit=100', headers: manager });
    const stores = new Set(res.json().items.map((r: { storeId: string }) => r.storeId));
    expect([...stores]).toEqual(['IN-MUM-001']);

    // Asking for another store explicitly still returns nothing.
    const other = await app.server.inject({ method: 'GET', url: '/api/v1/prices?storeId=GB-LON-001', headers: manager });
    expect(other.json().items).toHaveLength(0);
  });

  it('filters by text, price range and date range', async () => {
    const headers = await login('admin.hq');
    const res = await app.server.inject({
      method: 'GET',
      url: '/api/v1/prices?q=coffee&countryCode=US&minPrice=10&maxPrice=30&dateFrom=2026-11-01&dateTo=2026-11-01',
      headers,
    });
    const items = res.json().items;
    expect(items.length).toBe(2);
    for (const r of items) {
      expect(r.productName).toMatch(/coffee/i);
      expect(r.countryCode).toBe('US');
      expect(r.effectiveDate).toBe('2026-11-01');
      expect(Number(r.price)).toBeGreaterThanOrEqual(10);
    }
  });

  it('pages with a keyset cursor without gaps or duplicates', async () => {
    const headers = await login('pa.india');
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const url: string = `/api/v1/prices?storeId=IN-BLR-002&sort=price&order=asc&limit=25${cursor ? `&cursor=${cursor}` : ''}`;
      const page = (await app.server.inject({ method: 'GET', url, headers })).json();
      seen.push(...page.items.map((r: { id: string }) => r.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(120); // 40 SKUs x 3 dates
    expect(new Set(seen).size).toBe(120);
  });

  it('validates search criteria', async () => {
    const headers = await login('admin.hq');
    const res = await app.server.inject({ method: 'GET', url: '/api/v1/prices?minPrice=10&maxPrice=5', headers });
    expect(res.statusCode).toBe(400);
    expect(res.json().errors.minPrice).toBeDefined();
  });
});

describe('editing a price record', () => {
  async function firstRecord(headers: Record<string, string>, storeId: string) {
    const res = await app.server.inject({ method: 'GET', url: `/api/v1/prices?storeId=${storeId}&limit=1`, headers });
    return res.json().items[0];
  }

  it('saves a change with If-Match and records it in the audit history', async () => {
    const headers = await login('pa.india');
    const record = await firstRecord(headers, 'IN-DEL-003');
    const res = await app.server.inject({
      method: 'PATCH',
      url: `/api/v1/prices/${record.id}`,
      headers: { ...headers, 'if-match': `"${record.version}"` },
      payload: { price: '249', reason: 'Competitor price match' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers.etag).toBe(`"${record.version + 1}"`);
    expect(res.json()).toMatchObject({ price: '249', version: record.version + 1, updatedBy: 'pa.india' });

    const history = (await app.server.inject({ method: 'GET', url: `/api/v1/prices/${record.id}/history`, headers })).json();
    expect(history.items[0]).toMatchObject({
      action: 'MANUAL_EDIT',
      changeReason: 'Competitor price match',
      oldValues: { price: record.price },
      newValues: { price: '249' },
    });
  });

  it('rejects a stale save (lost update protection) and returns the current record', async () => {
    const headers = await login('pa.india');
    const record = await firstRecord(headers, 'IN-BLR-002');
    const save = (price: string) =>
      app.server.inject({
        method: 'PATCH',
        url: `/api/v1/prices/${record.id}`,
        headers: { ...headers, 'if-match': `"${record.version}"` },
        payload: { price, reason: 'Concurrent edit test' },
      });
    expect((await save('100')).statusCode).toBe(200);
    const stale = await save('200');
    expect(stale.statusCode).toBe(412);
    expect(stale.json()).toMatchObject({ code: 'VERSION_CONFLICT', current: { price: '100' } });
  });

  it('requires If-Match and a reason', async () => {
    const headers = await login('admin.hq');
    const record = await firstRecord(headers, 'US-NYC-001');
    const noIfMatch = await app.server.inject({ method: 'PATCH', url: `/api/v1/prices/${record.id}`, headers, payload: { price: '1', reason: 'x' } });
    expect(noIfMatch.statusCode).toBe(428);
    const noReason = await app.server.inject({
      method: 'PATCH',
      url: `/api/v1/prices/${record.id}`,
      headers: { ...headers, 'if-match': `"${record.version}"` },
      payload: { price: '1' },
    });
    expect(noReason.statusCode).toBe(400);
  });

  it('does not let a user edit a record outside their scope', async () => {
    const admin = await login('admin.hq');
    const record = await firstRecord(admin, 'JP-TYO-001');
    const res = await app.server.inject({
      method: 'PATCH',
      url: `/api/v1/prices/${record.id}`,
      headers: { ...(await login('sm.london')), 'if-match': `"${record.version}"` },
      payload: { price: '1', reason: 'Not mine' },
    });
    expect(res.statusCode).toBe(404);
  });
});
