import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/database.js';
import { migrate } from './db/migrate.js';
import { seedSamplePrices, seedStores } from './db/seed.js';
import { FeedRepository } from './feeds/feedRepository.js';

const config = loadConfig();
const db = await createDatabase(config);
const { server, queue, ingestion, blobs } = await buildApp(config, db);

const applied = await migrate(db);
if (applied.length) server.log.info({ applied }, 'database migrated');
await seedStores(db);
if (config.seedSampleData) {
  const seeded = await seedSamplePrices(db, blobs, ingestion);
  if (seeded) server.log.info({ feeds: seeded }, 'sample price feeds loaded');
}

// Crash recovery: anything queued or mid-flight when the process stopped is picked up again.
for (const feedId of await new FeedRepository(db).findRecoverable()) queue.enqueue(feedId);

await server.listen({ port: config.port, host: config.host });

const shutdown = async (signal: string) => {
  server.log.info({ signal }, 'shutting down');
  await server.close(); // stop accepting requests, finish in-flight ones
  await queue.onIdle(); // let running ingestion jobs finish
  await db.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
