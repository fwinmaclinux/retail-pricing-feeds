import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import type { Principal } from '../auth/principal.js';
import { FeedRepository } from '../feeds/feedRepository.js';
import type { FeedIngestionService } from '../feeds/ingestionService.js';
import type { BlobStore } from '../storage/blobStore.js';
import type { Database } from './database.js';
import { buildStoreFeedCsv, STORES } from './sampleData.js';

const SEED_PRINCIPAL: Principal = {
  userId: 'system.seed',
  displayName: 'Sample data loader',
  role: 'PRICING_ADMIN',
  storeIds: [],
  countryCodes: [],
};

export async function seedStores(db: Database): Promise<void> {
  await db.query(
    `INSERT INTO store (store_id, name, country_code, currency, timezone, region)
     SELECT * FROM jsonb_to_recordset($1::jsonb)
       AS s(store_id text, name text, country_code text, currency text, timezone text, region text)
     ON CONFLICT (store_id) DO UPDATE
       SET name = EXCLUDED.name, country_code = EXCLUDED.country_code, currency = EXCLUDED.currency,
           timezone = EXCLUDED.timezone, region = EXCLUDED.region`,
    [
      JSON.stringify(
        STORES.map((s) => ({
          store_id: s.storeId,
          name: s.name,
          country_code: s.countryCode,
          currency: s.currency,
          timezone: s.timezone,
          region: s.region,
        })),
      ),
    ],
  );
}

/** Loads sample prices through the real ingestion pipeline, so they carry feed + audit history. */
export async function seedSamplePrices(db: Database, blobs: BlobStore, ingestion: FeedIngestionService): Promise<number> {
  const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM price_record');
  if ((rows[0]?.n ?? 0) > 0) return 0;

  const feeds = new FeedRepository(db);
  for (let i = 0; i < STORES.length; i++) {
    const csv = buildStoreFeedCsv(i);
    const feedId = crypto.randomUUID();
    await feeds.create({
      feedId,
      fileName: `${STORES[i]!.storeId.toLowerCase()}-sample.csv`,
      sizeBytes: Buffer.byteLength(csv),
      checksumSha256: null,
      principal: SEED_PRINCIPAL,
    });
    const blobKey = `${feedId}.csv`;
    const stored = await blobs.write(blobKey, Readable.from([csv]), Number.MAX_SAFE_INTEGER);
    await feeds.markQueued(feedId, { blobKey, sizeBytes: stored.sizeBytes, sha256: stored.sha256 });
    await ingestion.process(feedId);
  }
  return STORES.length;
}
