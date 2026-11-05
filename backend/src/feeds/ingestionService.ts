import { parse } from 'csv-parse';
import type { FastifyBaseLogger } from 'fastify';
import { canAccessStore } from '../auth/principal.js';
import type { Database } from '../db/database.js';
import type { BlobStore } from '../storage/blobStore.js';
import { mapHeader, naturalKey, validateRow, type ValidPriceRow } from './csvValidation.js';
import { FeedRepository } from './feedRepository.js';

/** Cap on stored rejected rows per feed; all rejections are still counted. */
const MAX_STORED_ERRORS = 1000;

interface Counters {
  totalRows: number;
  insertedRows: number;
  updatedRows: number;
  unchangedRows: number;
  rejectedRows: number;
}

/**
 * Streams a stored CSV feed, validates each row and upserts valid rows in batches.
 *
 * - Constant memory: the file is never fully loaded; rows flow through in batches.
 * - Idempotent: rows are keyed on (store, SKU, effective date), and identical rows are
 *   skipped, so a redelivered queue message or a re-uploaded file cannot double-apply.
 * - Partial success: invalid rows are rejected with reasons; valid rows still load.
 */
export class FeedIngestionService {
  private readonly feeds: FeedRepository;

  constructor(
    private readonly db: Database,
    private readonly blobs: BlobStore,
    private readonly log: FastifyBaseLogger,
    private readonly batchSize: number,
    private readonly today: () => string = () => new Date().toISOString().slice(0, 10),
  ) {
    this.feeds = new FeedRepository(db);
  }

  async process(feedId: string): Promise<void> {
    const feed = await this.feeds.claimForProcessing(feedId);
    if (!feed || !feed.blobKey) {
      this.log.info({ feedId }, 'feed already processed or not uploaded; skipping');
      return;
    }
    const log = this.log.child({ feedId, uploadedBy: feed.uploadedBy });
    const started = Date.now();
    await this.feeds.clearErrors(feedId);
    const source = this.blobs.read(feed.blobKey);

    try {
      const stores = await this.loadStores();
      const principal = feed.uploaderScope;
      const ctx = {
        stores,
        canAccessStore: (s: { storeId: string; countryCode: string }) => canAccessStore(principal, s),
        today: this.today(),
      };
      const counters: Counters = { totalRows: 0, insertedRows: 0, updatedRows: 0, unchangedRows: 0, rejectedRows: 0 };
      const seenKeys = new Map<string, number>();
      let batch: ValidPriceRow[] = [];
      let errors: Array<{ rowNumber: number; rawRow: string; messages: string[] }> = [];
      let storedErrors = 0;
      let header: ReturnType<typeof mapHeader> | null = null;

      const parser = parse({ bom: true, relax_column_count: true, skip_empty_lines: true, info: true });
      source.on('error', (err) => parser.destroy(err));
      source.pipe(parser);

      const flush = async () => {
        if (batch.length > 0) {
          const result = await this.upsertBatch(batch, feedId, feed.uploadedBy);
          counters.insertedRows += result.inserted;
          counters.updatedRows += result.updated;
          counters.unchangedRows += batch.length - result.inserted - result.updated;
          batch = [];
        }
        if (errors.length > 0) {
          await this.feeds.insertErrors(feedId, errors);
          errors = [];
        }
        await this.feeds.updateProgress(feedId, counters);
      };

      for await (const { record, info } of parser as AsyncIterable<{ record: string[]; info: { lines: number } }>) {
        if (header === null) {
          header = mapHeader(record);
          if (!header.ok) {
            await this.feeds.complete(feedId, 'FAILED', header.message);
            log.warn({ reason: header.message }, 'feed rejected: invalid header');
            return;
          }
          continue;
        }
        if (!header.ok) break;

        counters.totalRows += 1;
        const rowNumber = info.lines;
        const result = validateRow(record, header.index, ctx);
        let messages = result.ok ? [] : result.messages;
        if (result.ok) {
          const key = naturalKey(result.row);
          const firstSeen = seenKeys.get(key);
          if (firstSeen !== undefined) messages = [`Duplicate of row ${firstSeen} (same Store ID, SKU and Date)`];
          else seenKeys.set(key, rowNumber);
        }

        if (messages.length > 0) {
          counters.rejectedRows += 1;
          if (storedErrors < MAX_STORED_ERRORS) {
            errors.push({ rowNumber, rawRow: record.join(',').slice(0, 500), messages });
            storedErrors += 1;
          }
        } else if (result.ok) {
          batch.push(result.row);
        }

        if (batch.length >= this.batchSize || errors.length >= this.batchSize) await flush();
      }

      await flush();

      if (counters.totalRows === 0) {
        await this.feeds.complete(feedId, 'FAILED', 'The file contains no data rows');
      } else {
        await this.feeds.complete(feedId, counters.rejectedRows > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED');
      }
      log.info({ ...counters, durationMs: Date.now() - started }, 'feed ingested');
    } catch (err) {
      log.error({ err }, 'feed ingestion failed');
      await this.feeds.complete(feedId, 'FAILED', err instanceof Error ? `Processing error: ${err.message}` : 'Processing error');
    } finally {
      source.destroy();
    }
  }

  private async loadStores(): Promise<Map<string, { countryCode: string }>> {
    const { rows } = await this.db.query<{ storeId: string; countryCode: string }>(
      `SELECT store_id AS "storeId", country_code AS "countryCode" FROM store WHERE active`,
    );
    return new Map(rows.map((r) => [r.storeId, { countryCode: r.countryCode }]));
  }

  /**
   * One round trip per batch: upsert changed rows and write their audit entries in a single
   * statement. Rows whose price and name are unchanged are left untouched (no version bump).
   * At production volume the same shape runs as COPY into a staging table + MERGE.
   */
  private async upsertBatch(rows: ValidPriceRow[], feedId: string, userId: string) {
    const payload = JSON.stringify(
      rows.map((r) => ({
        store_id: r.storeId,
        sku: r.sku,
        product_name: r.productName,
        price: r.price,
        effective_date: r.effectiveDate,
      })),
    );
    const { rows: actions } = await this.db.transaction((tx) =>
      tx.query<{ action: 'CREATED' | 'FEED_UPDATE' }>(
        `WITH incoming AS (
           SELECT i.store_id, i.sku, i.product_name, i.price, i.effective_date, s.currency, s.country_code
           FROM jsonb_to_recordset($1::jsonb)
                AS i(store_id text, sku text, product_name text, price numeric, effective_date date)
           JOIN store s ON s.store_id = i.store_id
         ),
         before AS (
           SELECT p.id, p.price, p.product_name
           FROM price_record p
           JOIN incoming i ON i.store_id = p.store_id AND i.sku = p.sku AND i.effective_date = p.effective_date
         ),
         upserted AS (
           INSERT INTO price_record AS p
             (store_id, sku, product_name, price, currency, effective_date, country_code, source_feed_id, updated_by)
           SELECT store_id, sku, product_name, price, currency, effective_date, country_code, $2::uuid, $3
           FROM incoming
           ON CONFLICT ON CONSTRAINT price_record_natural_key DO UPDATE
             SET product_name = EXCLUDED.product_name,
                 price = EXCLUDED.price,
                 version = p.version + 1,
                 source_feed_id = EXCLUDED.source_feed_id,
                 updated_by = EXCLUDED.updated_by,
                 updated_at = now()
             WHERE (p.price, p.product_name) IS DISTINCT FROM (EXCLUDED.price, EXCLUDED.product_name)
           RETURNING p.id, p.price, p.product_name, p.version
         )
         INSERT INTO price_record_audit
           (price_record_id, action, version, old_values, new_values, changed_by, source_feed_id)
         SELECT u.id,
                CASE WHEN b.id IS NULL THEN 'CREATED' ELSE 'FEED_UPDATE' END,
                u.version,
                CASE WHEN b.id IS NULL THEN NULL
                     ELSE jsonb_build_object('price', trim_scale(b.price)::text, 'productName', b.product_name) END,
                jsonb_build_object('price', trim_scale(u.price)::text, 'productName', u.product_name),
                $3, $2::uuid
         FROM upserted u LEFT JOIN before b ON b.id = u.id
         RETURNING action`,
        [payload, feedId, userId],
      ),
    );
    const inserted = actions.filter((a) => a.action === 'CREATED').length;
    return { inserted, updated: actions.length - inserted };
  }
}
