import { previewCsv } from '../csvPreview';
import { buildSampleFeed } from '../sampleFeed';

describe('previewCsv', () => {
  it('maps headers in any order and casing, and previews rows in canonical order', () => {
    const csv = 'price,SKU,store id,Effective Date,Product Name,Aisle\n1.99,A-1,GB-LON-001,2026-11-01,Milk,7\n';
    const p = previewCsv(csv);
    expect(p.missingColumns).toEqual([]);
    expect(p.rowCount).toBe(1);
    expect(p.previewRows[0]).toEqual(['GB-LON-001', 'A-1', 'Milk', '1.99', '2026-11-01']);
    expect(p.columns.find((c) => c.header === 'Aisle')?.mappedTo).toBeNull();
    expect(p.canUpload).toBe(true);
  });

  it('blocks upload when required columns are missing', () => {
    const p = previewCsv('Store ID,SKU,Price\nGB-LON-001,A,1\n');
    expect(p.missingColumns).toEqual(['productName', 'date']);
    expect(p.canUpload).toBe(false);
  });

  it('flags likely-rejected rows but still allows upload', () => {
    const csv = [
      'Store ID,SKU,Product Name,Price,Date',
      'GB-LON-001,A,Milk,"1,99",2026-11-01',
      'GB-LON-001,B,Bread,2.49,01/11/2026',
      'XX-000,C,Eggs,3.10,2026-11-01',
      'GB-LON-001,D,,1.00,2026-11-01',
      'GB-LON-001,E,Tea,4.00,2026-11-01',
    ].join('\n');
    const p = previewCsv(csv, { knownStoreIds: new Set(['GB-LON-001']) });
    expect(p.issueCount).toBe(4);
    expect(p.issues.map((i) => i.rowNumber)).toEqual([2, 3, 4, 5]);
    expect(p.issues[0]!.message).toContain("use '.' for decimals");
    expect(p.issues[2]!.message).toContain('not one of your stores');
    expect(p.canUpload).toBe(true);
  });

  it('handles quoted fields with commas and a UTF-8 BOM', () => {
    const p = previewCsv('﻿Store ID,SKU,Product Name,Price,Date\nGB-LON-001,A,"Biscuits, Tin",6.49,2026-11-01\n');
    expect(p.missingColumns).toEqual([]);
    expect(p.previewRows[0]![2]).toBe('Biscuits, Tin');
    expect(p.issueCount).toBe(0);
  });

  it('treats an empty file as not uploadable', () => {
    expect(previewCsv('').canUpload).toBe(false);
  });
});

describe('buildSampleFeed', () => {
  it('produces 10 valid rows and 2 rows the server will reject', () => {
    const { text, name } = buildSampleFeed('GB-LON-001');
    expect(name).toMatch(/^gb-lon-001-sample-\d{4}-\d{2}-\d{2}\.csv$/);
    const p = previewCsv(text, { knownStoreIds: new Set(['GB-LON-001']) });
    expect(p.rowCount).toBe(12);
    expect(p.issueCount).toBe(2);
  });
});
