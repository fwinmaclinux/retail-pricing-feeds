/**
 * Pure validation rules for the pricing-feed CSV contract:
 *   Store ID, SKU, Product Name, Price, Date
 * Header names are matched case/spacing-insensitively and in any order, so exports
 * from different store systems ("Store ID", "store_id", "StoreId") are all accepted.
 */

export const FEED_COLUMNS = ['storeId', 'sku', 'productName', 'price', 'date'] as const;
export type FeedColumn = (typeof FEED_COLUMNS)[number];

const HEADER_ALIASES: Record<string, FeedColumn> = {
  storeid: 'storeId',
  store: 'storeId',
  storecode: 'storeId',
  sku: 'sku',
  skucode: 'sku',
  productname: 'productName',
  product: 'productName',
  productdescription: 'productName',
  price: 'price',
  unitprice: 'price',
  date: 'date',
  pricedate: 'date',
  effectivedate: 'date',
};

export type HeaderMapping =
  | { ok: true; index: Record<FeedColumn, number>; ignoredColumns: string[] }
  | { ok: false; message: string };

export function normalizeHeader(raw: string): string {
  return raw.replace(/^﻿/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function mapHeader(headers: string[]): HeaderMapping {
  const index: Partial<Record<FeedColumn, number>> = {};
  const ignoredColumns: string[] = [];
  headers.forEach((h, i) => {
    const column = HEADER_ALIASES[normalizeHeader(h)];
    if (!column) {
      if (h.trim()) ignoredColumns.push(h.trim());
      return;
    }
    if (index[column] === undefined) index[column] = i;
  });
  const missing = FEED_COLUMNS.filter((c) => index[c] === undefined);
  if (missing.length > 0) {
    return {
      ok: false,
      message: `Missing required column(s): ${missing.map(columnLabel).join(', ')}. Expected header: Store ID, SKU, Product Name, Price, Date`,
    };
  }
  return { ok: true, index: index as Record<FeedColumn, number>, ignoredColumns };
}

export function columnLabel(c: FeedColumn): string {
  return { storeId: 'Store ID', sku: 'SKU', productName: 'Product Name', price: 'Price', date: 'Date' }[c];
}

export interface ValidPriceRow {
  storeId: string;
  sku: string;
  productName: string;
  price: string;
  effectiveDate: string;
}

export interface RowContext {
  /** Store master lookup: storeId -> countryCode. */
  stores: Map<string, { countryCode: string }>;
  canAccessStore: (store: { storeId: string; countryCode: string }) => boolean;
  /** Today's date (YYYY-MM-DD) - injected for deterministic tests. */
  today: string;
}

const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const PRICE_PATTERN = /^\d{1,10}(\.\d{1,4})?$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const FORMULA_PREFIX = /^[=+@\t\r]/;
const MAX_FUTURE_DAYS = 366;

export type RowResult = { ok: true; row: ValidPriceRow } | { ok: false; messages: string[] };

export function validateRow(cells: string[], index: Record<FeedColumn, number>, ctx: RowContext): RowResult {
  const get = (c: FeedColumn) => (cells[index[c]] ?? '').trim();
  const messages: string[] = [];

  const storeId = get('storeId').toUpperCase();
  const sku = get('sku').toUpperCase();
  const productName = get('productName').replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ');
  const priceRaw = get('price');
  const dateRaw = get('date');

  if (!storeId) {
    messages.push('Store ID is required');
  } else {
    const store = ctx.stores.get(storeId);
    if (!store) messages.push(`Store ID "${storeId}" is not a known store`);
    else if (!ctx.canAccessStore({ storeId, countryCode: store.countryCode }))
      messages.push(`Store ID "${storeId}" is outside your access scope`);
  }

  if (!sku) messages.push('SKU is required');
  else if (!SKU_PATTERN.test(sku)) messages.push(`SKU "${sku}" must be 1-40 letters, digits, '.', '_' or '-'`);

  if (!productName) messages.push('Product Name is required');
  else if (productName.length > 200) messages.push('Product Name must be at most 200 characters');
  else if (FORMULA_PREFIX.test(productName)) messages.push('Product Name must not start with =, +, @ (spreadsheet formula guard)');

  const price = normalizePrice(priceRaw);
  if (!priceRaw) messages.push('Price is required');
  else if (price === null) {
    messages.push(
      /,/.test(priceRaw)
        ? `Price "${priceRaw}" must use '.' as the decimal separator`
        : `Price "${priceRaw}" must be a non-negative number with up to 4 decimals and no currency symbol`,
    );
  }

  const dateError = validateIsoDate(dateRaw, ctx.today);
  if (dateError) messages.push(dateError);

  if (messages.length > 0) return { ok: false, messages };
  return { ok: true, row: { storeId, sku, productName, price: price!, effectiveDate: dateRaw } };
}

export function normalizePrice(raw: string): string | null {
  if (!PRICE_PATTERN.test(raw)) return null;
  return raw;
}

export function validateIsoDate(raw: string, today: string): string | null {
  if (!raw) return 'Date is required';
  const m = ISO_DATE_PATTERN.exec(raw);
  if (!m) return `Date "${raw}" must be in ISO format YYYY-MM-DD`;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const asDate = new Date(Date.UTC(y, mo - 1, d));
  if (asDate.getUTCFullYear() !== y || asDate.getUTCMonth() !== mo - 1 || asDate.getUTCDate() !== d)
    return `Date "${raw}" is not a valid calendar date`;
  if (y < 2000) return `Date "${raw}" is too far in the past`;
  const limit = new Date(Date.parse(`${today}T00:00:00Z`) + MAX_FUTURE_DAYS * 86_400_000);
  if (asDate > limit) return `Date "${raw}" is more than a year in the future`;
  return null;
}

export function naturalKey(row: Pick<ValidPriceRow, 'storeId' | 'sku' | 'effectiveDate'>): string {
  return `${row.storeId}|${row.sku}|${row.effectiveDate}`;
}
