import path from 'node:path';

/**
 * All runtime configuration comes from environment variables (12-factor).
 * Local development works with zero configuration: an embedded PostgreSQL
 * (PGlite) and a local-disk blob store stand in for Aurora PostgreSQL and S3.
 */
export interface AppConfig {
  port: number;
  host: string;
  /** postgres://... when running against a real PostgreSQL; unset = embedded PGlite. */
  databaseUrl?: string;
  /** Directory for PGlite data. 'memory://' keeps everything in memory (tests). */
  pgliteDataDir: string;
  blobDir: string;
  jwtSecret: string;
  /** 'dev' enables persona login; production validates IdP-issued tokens instead. */
  authMode: 'dev' | 'oidc';
  maxUploadBytes: number;
  ingestBatchSize: number;
  workerConcurrency: number;
  seedSampleData: boolean;
  logLevel: string;
}

const dataRoot = path.resolve(process.cwd(), '.data');

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const env = process.env;
  return {
    port: Number(env.PORT ?? 4000),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl: env.DATABASE_URL || undefined,
    pgliteDataDir: env.PGLITE_DATA_DIR ?? path.join(dataRoot, 'pgdata'),
    blobDir: env.BLOB_DIR ?? path.join(dataRoot, 'blobs'),
    jwtSecret: env.JWT_SECRET ?? 'local-dev-only-secret-change-me-0123456789',
    authMode: env.AUTH_MODE === 'oidc' ? 'oidc' : 'dev',
    maxUploadBytes: Number(env.MAX_UPLOAD_BYTES ?? 50 * 1024 * 1024),
    ingestBatchSize: Number(env.INGEST_BATCH_SIZE ?? 500),
    workerConcurrency: Number(env.WORKER_CONCURRENCY ?? 2),
    seedSampleData: (env.SEED_SAMPLE_DATA ?? 'true') === 'true',
    logLevel: env.LOG_LEVEL ?? 'info',
    ...overrides,
  };
}
