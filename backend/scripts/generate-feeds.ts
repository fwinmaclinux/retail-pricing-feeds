/**
 * Writes example CSV feeds to ../sample-data for manual testing:
 *   - gb-lon-001-price-update.csv   valid delta feed for the London store
 *   - in-mum-001-with-errors.csv    mixed valid / invalid rows (shows row-level rejection)
 *   - large-full-feed-25k.csv       25,000-row full store feed (ingestion throughput)
 *
 * Usage: npm run generate:feeds
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../sample-data');
fs.mkdirSync(outDir, { recursive: true });
const header = 'Store ID,SKU,Product Name,Price,Date';

const write = (name: string, lines: string[]) => {
  fs.writeFileSync(path.join(outDir, name), [header, ...lines].join('\n') + '\n');
  console.log(`wrote ${name} (${lines.length} rows)`);
};

write('gb-lon-001-price-update.csv', [
  'GB-LON-001,GRC-10001,Organic Whole Milk 1L,1.29,2026-11-08',
  'GB-LON-001,GRC-10007,Arabica Coffee Beans 1kg,13.99,2026-11-08',
  'GB-LON-001,ELC-40002,Wireless Earbuds,34.99,2026-11-08',
  'GB-LON-001,APP-50003,Rain Jacket,39.99,2026-11-08',
  'GB-LON-001,NEW-11001,"Mince Pies, 6 pack",2.49,2026-11-08',
]);

write('in-mum-001-with-errors.csv', [
  'IN-MUM-001,GRC-10005,Basmati Rice 5kg,999,2026-11-08',
  'IN-MUM-001,GRC-10008,Green Tea (50 bags),"₹349",2026-11-08',
  'IN-MUM-001,GRC-10009,Dark Chocolate 70% 100g,189,08/11/2026',
  'IN-XXX-999,GRC-10010,Penne Pasta 500g,120,2026-11-08',
  'IN-MUM-001,,Missing SKU,10,2026-11-08',
  'IN-MUM-001,GRC-10012,Bananas (1kg),79,2026-11-08',
  'IN-MUM-001,GRC-10012,Bananas (1kg),75,2026-11-08',
]);

const large: string[] = [];
for (let i = 0; i < 25_000; i++) {
  const sku = `BULK-${String(i).padStart(6, '0')}`;
  large.push(`US-NYC-001,${sku},Bulk Catalogue Item ${i},${(1 + (i % 500) / 10).toFixed(2)},2026-11-08`);
}
write('large-full-feed-25k.csv', large);
