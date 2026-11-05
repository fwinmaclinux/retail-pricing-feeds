import { isoDaysAgo } from '@/utils/format';

const ITEMS: Array<[string, string, number]> = [
  ['GRC-10001', 'Organic Whole Milk 1L', 1.35],
  ['GRC-10003', 'Sourdough Loaf 800g', 2.95],
  ['GRC-10007', 'Arabica Coffee Beans 1kg', 14.49],
  ['GRC-10012', 'Bananas (1kg)', 0.99],
  ['HHD-20001', 'Laundry Detergent 2L', 8.99],
  ['PCR-30003', 'SPF 50 Sunscreen 200ml', 9.49],
  ['ELC-40001', 'USB-C Charging Cable 2m', 9.99],
  ['APP-50001', 'Cotton Crew T-Shirt', 9.49],
  ['NEW-12001', 'Winter Gloves (pair)', 11.99],
  ['NEW-12002', '"Festive Biscuits, Tin 500g"', 6.49],
];

/**
 * A realistic feed for demos and simulator testing (no file needs to be copied onto the
 * device): ten valid rows for the user's first store plus two rows that fail validation.
 */
export function buildSampleFeed(storeId: string, multiplier = 1): { name: string; text: string } {
  const date = isoDaysAgo(-1); // effective tomorrow
  const lines = ['Store ID,SKU,Product Name,Price,Date'];
  for (const [sku, name, price] of ITEMS) {
    const local = multiplier >= 20 ? Math.round(price * multiplier) : (price * multiplier).toFixed(2);
    lines.push([storeId, sku, name, local, date].join(','));
  }
  lines.push(`${storeId},GRC-10005,Basmati Rice 5kg,"12,99",${date}`); // comma decimal -> rejected
  lines.push(`${storeId},GRC-10009,Dark Chocolate 70% 100g,2.10,${date.split('-').reverse().join('/')}`); // DD/MM/YYYY -> rejected
  return { name: `${storeId.toLowerCase()}-sample-${date}.csv`, text: lines.join('\n') + '\n' };
}
