import fs from 'node:fs';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/**
 * Thin persistence port. Production runs on Aurora PostgreSQL through node-postgres;
 * local development and tests run the same SQL on PGlite (PostgreSQL compiled to WASM),
 * so no Docker is needed to try the solution.
 */
export interface Database extends Queryable {
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function createDatabase(opts: { databaseUrl?: string; pgliteDataDir: string }): Promise<Database> {
  if (opts.databaseUrl) return createPgDatabase(opts.databaseUrl);
  return createPgliteDatabase(opts.pgliteDataDir);
}

async function createPgliteDatabase(dataDir: string): Promise<Database> {
  if (!dataDir.startsWith('memory://')) fs.mkdirSync(dataDir, { recursive: true });
  const db = await PGlite.create(dataDir, { extensions: { pg_trgm } });
  return {
    query: async <T>(sql: string, params?: unknown[]) => {
      const res = await db.query<T>(sql, params);
      return { rows: res.rows };
    },
    exec: async (sql) => {
      await db.exec(sql);
    },
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await tx.query<T>(sql, params)).rows }),
        }),
      ),
    close: () => db.close(),
  };
}

function createPgDatabase(connectionString: string): Database {
  const pool = new pg.Pool({ connectionString, max: 20, idleTimeoutMillis: 30_000 });
  const query = async <T>(sql: string, params?: unknown[]) => {
    const res = await pool.query(sql, params as unknown[]);
    return { rows: res.rows as T[] };
  };
  return {
    query,
    exec: async (sql) => {
      await pool.query(sql);
    },
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({
          query: async <T>(sql: string, params?: unknown[]) => {
            const res = await client.query(sql, params as unknown[]);
            return { rows: res.rows as T[] };
          },
        });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
