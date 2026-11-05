import { describe, expect, it } from 'vitest';
import { mapHeader, validateRow, validateIsoDate, type FeedColumn } from '../src/feeds/csvValidation.js';

const index: Record<FeedColumn, number> = { storeId: 0, sku: 1, productName: 2, price: 3, date: 4 };
const ctx = {
  stores: new Map([
    ['GB-LON-001', { countryCode: 'GB' }],
    ['IN-MUM-001', { countryCode: 'IN' }],
  ]),
  canAccessStore: (s: { countryCode: string }) => s.countryCode === 'GB',
  today: '2026-11-03',
};

describe('mapHeader', () => {
  it('accepts headers in any order, case and spacing', () => {
    const result = mapHeader(['﻿Price', 'sku', 'Store ID', 'Effective Date', 'PRODUCT_NAME', 'Aisle']);
    expect(result).toEqual({
      ok: true,
      index: { price: 0, sku: 1, storeId: 2, date: 3, productName: 4 },
      ignoredColumns: ['Aisle'],
    });
  });

  it('names every missing column', () => {
    const result = mapHeader(['Store ID', 'SKU', 'Price']);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain('Product Name, Date');
  });
});

describe('validateRow', () => {
  it('normalises a valid row', () => {
    expect(validateRow([' gb-lon-001 ', 'grc-1', '  Milk   1L ', '1.69', '2026-11-01'], index, ctx)).toEqual({
      ok: true,
      row: { storeId: 'GB-LON-001', sku: 'GRC-1', productName: 'Milk 1L', price: '1.69', effectiveDate: '2026-11-01' },
    });
  });

  it.each([
    [['', 'A', 'Milk', '1', '2026-11-01'], 'Store ID is required'],
    [['XX-000', 'A', 'Milk', '1', '2026-11-01'], 'not a known store'],
    [['IN-MUM-001', 'A', 'Milk', '1', '2026-11-01'], 'outside your access scope'],
    [['GB-LON-001', 'A B', 'Milk', '1', '2026-11-01'], 'SKU "A B"'],
    [['GB-LON-001', 'A', '=HYPERLINK("x")', '1', '2026-11-01'], 'formula guard'],
    [['GB-LON-001', 'A', 'Milk', '£1.20', '2026-11-01'], 'no currency symbol'],
    [['GB-LON-001', 'A', 'Milk', '1,20', '2026-11-01'], "'.' as the decimal separator"],
    [['GB-LON-001', 'A', 'Milk', '-1', '2026-11-01'], 'non-negative'],
    [['GB-LON-001', 'A', 'Milk', '1', '01/11/2026'], 'ISO format'],
  ])('rejects %j', (cells, expected) => {
    const result = validateRow(cells, index, ctx);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.messages.join(' | ')).toContain(expected);
  });

  it('reports every problem in a row at once', () => {
    const result = validateRow(['', '', '', '', ''], index, ctx);
    expect(!result.ok && result.messages).toHaveLength(5);
  });
});

describe('validateIsoDate', () => {
  it('rejects impossible calendar dates', () => {
    expect(validateIsoDate('2026-02-30', '2026-11-03')).toContain('not a valid calendar date');
  });
  it('rejects dates more than a year ahead', () => {
    expect(validateIsoDate('2028-01-01', '2026-11-03')).toContain('future');
  });
  it('accepts a leap day', () => {
    expect(validateIsoDate('2028-02-29', '2027-11-03')).toBeNull();
  });
});
