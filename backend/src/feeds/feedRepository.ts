import type { Principal } from '../auth/principal.js';
import type { Queryable } from '../db/database.js';

export type FeedStatus =
  | 'AWAITING_UPLOAD'
  | 'QUEUED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'COMPLETED_WITH_ERRORS'
  | 'FAILED';

export interface Feed {
  feedId: string;
  fileName: string;
  sizeBytes: number | null;
  checksumSha256: string | null;
  uploadedBy: string;
  status: FeedStatus;
  totalRows: number;
  insertedRows: number;
  updatedRows: number;
  unchangedRows: number;
  rejectedRows: number;
  failureReason: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface FeedRow extends Feed {
  blobKey: string | null;
  uploaderScope: Principal;
}

const FEED_COLUMNS = `
  feed_id AS "feedId", file_name AS "fileName", size_bytes::float8 AS "sizeBytes",
  checksum_sha256 AS "checksumSha256", uploaded_by AS "uploadedBy", status,
  total_rows AS "totalRows", inserted_rows AS "insertedRows", updated_rows AS "updatedRows",
  unchanged_rows AS "unchangedRows", rejected_rows AS "rejectedRows", failure_reason AS "failureReason",
  created_at AS "createdAt", started_at AS "startedAt", completed_at AS "completedAt",
  blob_key AS "blobKey", uploader_scope AS "uploaderScope"`;

export function toFeedDto(row: FeedRow): Feed {
  const { blobKey: _b, uploaderScope: _s, ...feed } = row;
  return feed;
}

export class FeedRepository {
  constructor(private readonly db: Queryable) {}

  async create(input: {
    feedId: string;
    fileName: string;
    sizeBytes: number;
    checksumSha256: string | null;
    principal: Principal;
  }): Promise<FeedRow> {
    const { rows } = await this.db.query<FeedRow>(
      `INSERT INTO price_feed (feed_id, file_name, size_bytes, checksum_sha256, uploaded_by, uploader_scope, status)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'AWAITING_UPLOAD')
       RETURNING ${FEED_COLUMNS}`,
      [input.feedId, input.fileName, input.sizeBytes, input.checksumSha256, input.principal.userId, JSON.stringify(input.principal)],
    );
    return rows[0]!;
  }

  async findById(feedId: string): Promise<FeedRow | null> {
    const { rows } = await this.db.query<FeedRow>(`SELECT ${FEED_COLUMNS} FROM price_feed WHERE feed_id = $1`, [feedId]);
    return rows[0] ?? null;
  }

  async findActiveByChecksum(userId: string, checksum: string): Promise<FeedRow | null> {
    const { rows } = await this.db.query<FeedRow>(
      `SELECT ${FEED_COLUMNS} FROM price_feed
       WHERE uploaded_by = $1 AND checksum_sha256 = $2 AND status <> 'FAILED'
       ORDER BY created_at DESC LIMIT 1`,
      [userId, checksum],
    );
    return rows[0] ?? null;
  }

  async list(principal: Principal, limit: number): Promise<FeedRow[]> {
    const all = principal.role === 'PRICING_ADMIN';
    const { rows } = await this.db.query<FeedRow>(
      `SELECT ${FEED_COLUMNS} FROM price_feed
       WHERE ($1::boolean OR uploaded_by = $2)
       ORDER BY created_at DESC LIMIT $3`,
      [all, principal.userId, limit],
    );
    return rows;
  }

  async markQueued(feedId: string, blob: { blobKey: string; sizeBytes: number; sha256: string }): Promise<FeedRow> {
    const { rows } = await this.db.query<FeedRow>(
      `UPDATE price_feed SET status = 'QUEUED', blob_key = $2, size_bytes = $3, checksum_sha256 = $4
       WHERE feed_id = $1 RETURNING ${FEED_COLUMNS}`,
      [feedId, blob.blobKey, blob.sizeBytes, blob.sha256],
    );
    return rows[0]!;
  }

  /** Claims a feed for processing. Returns null if another worker already finished it. */
  async claimForProcessing(feedId: string): Promise<FeedRow | null> {
    const { rows } = await this.db.query<FeedRow>(
      `UPDATE price_feed
       SET status = 'PROCESSING', started_at = now(), total_rows = 0, inserted_rows = 0,
           updated_rows = 0, unchanged_rows = 0, rejected_rows = 0, failure_reason = NULL
       WHERE feed_id = $1 AND status IN ('QUEUED', 'PROCESSING')
       RETURNING ${FEED_COLUMNS}`,
      [feedId],
    );
    return rows[0] ?? null;
  }

  async updateProgress(
    feedId: string,
    c: { totalRows: number; insertedRows: number; updatedRows: number; unchangedRows: number; rejectedRows: number },
  ): Promise<void> {
    await this.db.query(
      `UPDATE price_feed SET total_rows = $2, inserted_rows = $3, updated_rows = $4, unchanged_rows = $5, rejected_rows = $6
       WHERE feed_id = $1`,
      [feedId, c.totalRows, c.insertedRows, c.updatedRows, c.unchangedRows, c.rejectedRows],
    );
  }

  async complete(feedId: string, status: FeedStatus, failureReason: string | null = null): Promise<void> {
    await this.db.query(
      `UPDATE price_feed SET status = $2, failure_reason = $3, completed_at = now() WHERE feed_id = $1`,
      [feedId, status, failureReason],
    );
  }

  async findRecoverable(): Promise<string[]> {
    const { rows } = await this.db.query<{ feedId: string }>(
      `SELECT feed_id AS "feedId" FROM price_feed WHERE status IN ('QUEUED', 'PROCESSING') ORDER BY created_at`,
    );
    return rows.map((r) => r.feedId);
  }

  async insertErrors(feedId: string, errors: Array<{ rowNumber: number; rawRow: string; messages: string[] }>): Promise<void> {
    if (errors.length === 0) return;
    await this.db.query(
      `INSERT INTO price_feed_error (feed_id, row_number, raw_row, messages)
       SELECT $1, e.row_number, e.raw_row, e.messages
       FROM jsonb_to_recordset($2::jsonb) AS e(row_number int, raw_row text, messages jsonb)
       ON CONFLICT (feed_id, row_number) DO UPDATE SET raw_row = EXCLUDED.raw_row, messages = EXCLUDED.messages`,
      [feedId, JSON.stringify(errors.map((e) => ({ row_number: e.rowNumber, raw_row: e.rawRow, messages: e.messages })))],
    );
  }

  async clearErrors(feedId: string): Promise<void> {
    await this.db.query('DELETE FROM price_feed_error WHERE feed_id = $1', [feedId]);
  }

  async listErrors(feedId: string, limit: number) {
    const { rows } = await this.db.query<{ rowNumber: number; rawRow: string; messages: string[] }>(
      `SELECT row_number AS "rowNumber", raw_row AS "rawRow", messages
       FROM price_feed_error WHERE feed_id = $1 ORDER BY row_number LIMIT $2`,
      [feedId, limit],
    );
    return rows;
  }
}
