/**
 * Reference data and deterministic sample feeds for local development and demos.
 * In production the store master is synchronised from the ERP; it is never uploaded by users.
 */

export const STORES = [
  { storeId: 'GB-LON-001', name: 'London Oxford Street', countryCode: 'GB', currency: 'GBP', timezone: 'Europe/London', region: 'EU' },
  { storeId: 'GB-MAN-002', name: 'Manchester Arndale', countryCode: 'GB', currency: 'GBP', timezone: 'Europe/London', region: 'EU' },
  { storeId: 'DE-BER-001', name: 'Berlin Alexanderplatz', countryCode: 'DE', currency: 'EUR', timezone: 'Europe/Berlin', region: 'EU' },
  { storeId: 'FR-PAR-001', name: 'Paris La Défense', countryCode: 'FR', currency: 'EUR', timezone: 'Europe/Paris', region: 'EU' },
  { storeId: 'IN-MUM-001', name: 'Mumbai Bandra West', countryCode: 'IN', currency: 'INR', timezone: 'Asia/Kolkata', region: 'APAC' },
  { storeId: 'IN-BLR-002', name: 'Bengaluru Indiranagar', countryCode: 'IN', currency: 'INR', timezone: 'Asia/Kolkata', region: 'APAC' },
  { storeId: 'IN-DEL-003', name: 'Delhi Connaught Place', countryCode: 'IN', currency: 'INR', timezone: 'Asia/Kolkata', region: 'APAC' },
  { storeId: 'SG-SIN-001', name: 'Singapore Orchard Road', countryCode: 'SG', currency: 'SGD', timezone: 'Asia/Singapore', region: 'APAC' },
  { storeId: 'JP-TYO-001', name: 'Tokyo Shibuya', countryCode: 'JP', currency: 'JPY', timezone: 'Asia/Tokyo', region: 'APAC' },
  { storeId: 'AE-DXB-001', name: 'Dubai Marina', countryCode: 'AE', currency: 'AED', timezone: 'Asia/Dubai', region: 'MEA' },
  { storeId: 'US-NYC-001', name: 'New York Herald Square', countryCode: 'US', currency: 'USD', timezone: 'America/New_York', region: 'NA' },
  { storeId: 'US-SFO-002', name: 'San Francisco Union Square', countryCode: 'US', currency: 'USD', timezone: 'America/Los_Angeles', region: 'NA' },
] as const;

/** [SKU, product name, base price in USD] */
const CATALOG: Array<[string, string, number]> = [
  ['GRC-10001', 'Organic Whole Milk 1L', 1.69],
  ['GRC-10002', 'Free Range Eggs (12 pack)', 4.29],
  ['GRC-10003', 'Sourdough Loaf 800g', 3.49],
  ['GRC-10004', 'Greek Yoghurt 500g', 2.99],
  ['GRC-10005', 'Basmati Rice 5kg', 12.99],
  ['GRC-10006', 'Extra Virgin Olive Oil 750ml', 9.49],
  ['GRC-10007', 'Arabica Coffee Beans 1kg', 18.99],
  ['GRC-10008', 'Green Tea (50 bags)', 4.79],
  ['GRC-10009', 'Dark Chocolate 70% 100g', 2.49],
  ['GRC-10010', 'Penne Pasta 500g', 1.59],
  ['GRC-10011', 'Cheddar Cheese Block 400g', 5.29],
  ['GRC-10012', 'Bananas (1kg)', 1.29],
  ['GRC-10013', 'Avocados (pack of 4)', 4.99],
  ['GRC-10014', 'Atlantic Salmon Fillet 300g', 8.99],
  ['GRC-10015', 'Chicken Breast 1kg', 9.99],
  ['HHD-20001', 'Laundry Detergent 2L', 11.49],
  ['HHD-20002', 'Dishwasher Tablets (40)', 9.99],
  ['HHD-20003', 'Paper Towels (6 rolls)', 7.49],
  ['HHD-20004', 'LED Bulb 9W E27 (2 pack)', 6.99],
  ['HHD-20005', 'Stainless Steel Water Bottle 750ml', 14.99],
  ['PCR-30001', 'Fluoride Toothpaste 100ml', 2.99],
  ['PCR-30002', 'Herbal Shampoo 400ml', 6.49],
  ['PCR-30003', 'SPF 50 Sunscreen 200ml', 12.49],
  ['PCR-30004', 'Hand Wash Refill 1L', 4.49],
  ['ELC-40001', 'USB-C Charging Cable 2m', 12.99],
  ['ELC-40002', 'Wireless Earbuds', 49.99],
  ['ELC-40003', 'AA Batteries (8 pack)', 8.99],
  ['ELC-40004', '20W Fast Charger', 19.99],
  ['APP-50001', 'Cotton Crew T-Shirt', 12.99],
  ['APP-50002', 'Running Socks (3 pairs)', 9.99],
  ['APP-50003', 'Rain Jacket', 59.99],
  ['APP-50004', 'Canvas Tote Bag', 7.99],
  ['TOY-60001', 'Building Blocks Set (500 pcs)', 29.99],
  ['TOY-60002', 'Jigsaw Puzzle 1000 pcs', 15.99],
  ['BAB-70001', 'Baby Wipes (72 pack)', 3.49],
  ['BAB-70002', 'Infant Formula 800g', 24.99],
  ['PET-80001', 'Dry Dog Food 3kg', 19.49],
  ['PET-80002', 'Cat Litter 10L', 8.49],
  ['BEV-90001', 'Sparkling Water 6 x 1L', 4.99],
  ['BEV-90002', 'Orange Juice Not From Concentrate 1L', 3.29],
];

const FX: Record<string, { rate: number; decimals: number }> = {
  GBP: { rate: 0.79, decimals: 2 },
  EUR: { rate: 0.92, decimals: 2 },
  INR: { rate: 83.2, decimals: 0 },
  SGD: { rate: 1.35, decimals: 2 },
  JPY: { rate: 151, decimals: 0 },
  AED: { rate: 3.67, decimals: 2 },
  USD: { rate: 1, decimals: 2 },
};

export const SAMPLE_DATES = ['2026-10-01', '2026-10-15', '2026-11-01'];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function localPrice(usd: number, currency: string, factor: number): string {
  const fx = FX[currency]!;
  const raw = usd * fx.rate * factor;
  if (fx.decimals === 0) return String(Math.max(1, Math.round(raw / 5) * 5));
  // Psychological price points: x.49 / x.99
  const whole = Math.floor(raw);
  return (raw - whole < 0.5 ? whole + 0.49 : whole + 0.99).toFixed(2);
}

/** Builds one CSV feed per store: every SKU priced on each sample date, with some price moves. */
export function buildStoreFeedCsv(storeIndex: number): string {
  const store = STORES[storeIndex]!;
  const rand = mulberry32(1000 + storeIndex);
  const lines = ['Store ID,SKU,Product Name,Price,Date'];
  for (const [sku, name, usd] of CATALOG) {
    let factor = 0.95 + rand() * 0.1;
    for (const date of SAMPLE_DATES) {
      if (rand() < 0.3) factor *= 0.9 + rand() * 0.15; // ~30% of SKUs move price each cycle
      lines.push([store.storeId, sku, csvEscape(name), localPrice(usd, store.currency, factor), date].join(','));
    }
  }
  return lines.join('\n') + '\n';
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
