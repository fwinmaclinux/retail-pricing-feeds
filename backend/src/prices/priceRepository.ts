import { scopeClause, type Principal } from '../auth/principal.js';
import { ApiError } from '../common/errors.js';
import type { Database } from '../db/database.js';

export interface PriceRecord {
  id: string;
  storeId: string;
  storeName: string;
  countryCode: string;
  currency: string;
  sku: string;
  productName: string;
  /** Decimal string - money is never passed around as a float. */
  price: string;
  effectiveDate: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
  sourceFeedId: string | null;
}

export type SortField = 'effectiveDate' | 'price' | 'sku' | 'productName';

export interface SearchCriteria {
  q?: string;
  storeId?: string;
  sku?: string;
  countryCode?: string;
  minPrice?: string;
  maxPrice?: string;
  dateFrom?: string;
  dateTo?: string;
  sort: SortField;
  order: 'asc' | 'desc';
  limit: number;
  cursor?: string;
}

const SORT_COLUMNS: Record<SortField, { sql: string; cast: string }> = {
  effectiveDate: { sql: 'p.effective_date', cast: 'date' },
  price: { sql: 'p.price', cast: 'numeric' },
  sku: { sql: 'p.sku', cast: 'text' },
  productName: { sql: 'p.product_name', cast: 'text' },
};

const SELECT_RECORD = `
  SELECT p.id::text AS id, p.store_id AS "storeId", s.name AS "storeName", p.country_code AS "countryCode",
         p.currency, p.sku, p.product_name AS "productName", trim_scale(p.price)::text AS price,
         p.effective_date::text AS "effectiveDate", p.version, p.updated_at AS "updatedAt",
         p.updated_by AS "updatedBy", p.source_feed_id AS "sourceFeedId"
  FROM price_record p JOIN store s ON s.store_id = p.store_id`;

/** Opaque keyset cursor: [sort value of last row, id of last row]. */
export function encodeCursor(sortValue: string, id: string): string {
  return Buffer.from(JSON.stringify([sortValue, id])).toString('base64url');
}

function decodeCursor(cursor: string): [string, string] {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === 'string')) return value as [string, string];
  } catch {
    /* fall through */
  }
  throw ApiError.badRequest('Invalid cursor');
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export class PriceRepository {
  constructor(private readonly db: Database) {}

  /**
   * Keyset-paginated search. Every query is scoped to the caller's entitlement, and paging
   * never uses OFFSET, so page N costs the same as page 1 on a table with tens of millions of rows.
   */
  async search(principal: Principal, c: SearchCriteria): Promise<{ items: PriceRecord[]; nextCursor: string | null }> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: (n: number) => string, value: unknown) => {
      params.push(value);
      where.push(sql(params.length));
    };

    const scope = scopeClause(principal, 'p', params.length + 1);
    where.push(scope.sql);
    params.push(...scope.params);

    if (c.q) {
      const term = escapeLike(c.q.trim());
      params.push(`${term.toUpperCase()}%`, `%${term}%`);
      where.push(`(p.sku LIKE $${params.length - 1} OR p.product_name ILIKE $${params.length})`);
    }
    if (c.storeId) add((n) => `p.store_id = $${n}`, c.storeId.toUpperCase());
    if (c.sku) add((n) => `p.sku = $${n}`, c.sku.toUpperCase());
    if (c.countryCode) add((n) => `p.country_code = $${n}`, c.countryCode.toUpperCase());
    if (c.minPrice) add((n) => `p.price >= $${n}::numeric`, c.minPrice);
    if (c.maxPrice) add((n) => `p.price <= $${n}::numeric`, c.maxPrice);
    if (c.dateFrom) add((n) => `p.effective_date >= $${n}::date`, c.dateFrom);
    if (c.dateTo) add((n) => `p.effective_date <= $${n}::date`, c.dateTo);

    const sort = SORT_COLUMNS[c.sort];
    const dir = c.order === 'asc' ? 'ASC' : 'DESC';
    if (c.cursor) {
      const [value, id] = decodeCursor(c.cursor);
      params.push(value, id);
      const op = c.order === 'asc' ? '>' : '<';
      where.push(`(${sort.sql}, p.id) ${op} ($${params.length - 1}::${sort.cast}, $${params.length}::bigint)`);
    }

    params.push(c.limit + 1);
    const { rows } = await this.db.query<PriceRecord & { sortValue: string }>(
      `${SELECT_RECORD.replace('SELECT', `SELECT ${sort.sql}::text AS "sortValue",`)}
       WHERE ${where.join(' AND ')}
       ORDER BY ${sort.sql} ${dir}, p.id ${dir}
       LIMIT $${params.length}`,
      params,
    );

    const hasMore = rows.length > c.limit;
    const page = rows.slice(0, c.limit);
    const last = page[page.length - 1];
    return {
      items: page.map(({ sortValue: _s, ...r }) => r),
      nextCursor: hasMore && last ? encodeCursor(last.sortValue, last.id) : null,
    };
  }

  async findById(principal: Principal, id: string): Promise<PriceRecord> {
    const scope = scopeClause(principal, 'p', 2);
    const { rows } = await this.db.query<PriceRecord>(`${SELECT_RECORD} WHERE p.id = $1::bigint AND ${scope.sql}`, [id, ...scope.params]);
    if (!rows[0]) throw ApiError.notFound('Price record not found');
    return rows[0];
  }

  /**
   * Optimistic concurrency: the update only applies if the caller saw the latest version
   * (If-Match). A concurrent feed load or another user's edit makes this fail with 412.
   */
  async update(
    principal: Principal,
    id: string,
    expectedVersion: number,
    changes: { price?: string; productName?: string; reason: string },
  ): Promise<PriceRecord> {
    const current = await this.findById(principal, id);
    if (current.version !== expectedVersion) {
      throw new ApiError(412, 'VERSION_CONFLICT', 'This record was changed by someone else after you opened it', { current });
    }

    const updatedId = await this.db.transaction(async (tx) => {
      const { rows } = await tx.query<{ id: string; version: number; price: string; productName: string }>(
        `UPDATE price_record p
         SET price = COALESCE($3::numeric, p.price),
             product_name = COALESCE($4, p.product_name),
             version = p.version + 1, updated_at = now(), updated_by = $5,
             source_feed_id = NULL  -- value now comes from a person, not a feed (feed lineage stays in the audit trail)
         WHERE p.id = $1::bigint AND p.version = $2
         RETURNING p.id::text AS id, p.version, trim_scale(p.price)::text AS price, p.product_name AS "productName"`,
        [id, expectedVersion, changes.price ?? null, changes.productName ?? null, principal.userId],
      );
      const updated = rows[0];
      if (!updated) return null;
      await tx.query(
        `INSERT INTO price_record_audit (price_record_id, action, version, old_values, new_values, changed_by, change_reason)
         VALUES ($1::bigint, 'MANUAL_EDIT', $2, $3::jsonb, $4::jsonb, $5, $6)`,
        [
          id,
          updated.version,
          JSON.stringify({ price: current.price, productName: current.productName }),
          JSON.stringify({ price: updated.price, productName: updated.productName }),
          principal.userId,
          changes.reason,
        ],
      );
      return updated.id;
    });

    if (!updatedId) {
      const latest = await this.findById(principal, id);
      throw new ApiError(412, 'VERSION_CONFLICT', 'This record was changed by someone else after you opened it', { current: latest });
    }
    return this.findById(principal, id);
  }

  async history(principal: Principal, id: string) {
    await this.findById(principal, id); // enforces scope
    const { rows } = await this.db.query(
      `SELECT audit_id::text AS "auditId", action, version, old_values AS "oldValues", new_values AS "newValues",
              changed_by AS "changedBy", change_reason AS "changeReason", source_feed_id AS "sourceFeedId",
              changed_at AS "changedAt"
       FROM price_record_audit WHERE price_record_id = $1::bigint ORDER BY audit_id DESC LIMIT 50`,
      [id],
    );
    return rows;
  }
}
