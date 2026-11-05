import Papa from 'papaparse';

/**
 * On-device pre-check of a feed before it is uploaded. It gives the user instant feedback
 * (wrong file, missing columns, obvious bad rows) without a round trip. The server repeats
 * every check authoritatively during ingestion - this is a UX aid, not a trust boundary.
 */

export const FEED_COLUMNS = ['storeId', 'sku', 'productName', 'price', 'date'] as const;
export type FeedColumn = (typeof FEED_COLUMNS)[number];

export const COLUMN_LABELS: Record<FeedColumn, string> = {
  storeId: 'Store ID',
  sku: 'SKU',
  productName: 'Product Name',
  price: 'Price',
  date: 'Date',
};

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

export interface CsvIssue {
  rowNumber: number;
  message: string;
}

export interface CsvPreview {
  columns: Array<{ header: string; mappedTo: FeedColumn | null }>;
  missingColumns: FeedColumn[];
  rowCount: number;
  rowCountIsEstimate: boolean;
  /** First rows, re-ordered into the canonical column order. */
  previewRows: string[][];
  issues: CsvIssue[];
  issueCount: number;
  sampledRows: number;
  canUpload: boolean;
}

const PRICE = /^\d{1,10}(\.\d{1,4})?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FULL_PARSE_LIMIT_CHARS = 5 * 1024 * 1024;

export function normalizeHeader(raw: string): string {
  return raw.replace(/^﻿/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function previewCsv(
  text: string,
  opts: { knownStoreIds?: Set<string>; sampleSize?: number; previewSize?: number; maxIssues?: number } = {},
): CsvPreview {
  const sampleSize = opts.sampleSize ?? 2000;
  const previewSize = opts.previewSize ?? 5;
  const maxIssues = opts.maxIssues ?? 50;
  const isLarge = text.length > FULL_PARSE_LIMIT_CHARS;

  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy', preview: isLarge ? sampleSize + 1 : 0 });
  const [header = [], ...rows] = parsed.data;

  const index: Partial<Record<FeedColumn, number>> = {};
  const columns = header.map((h, i) => {
    const mappedTo = HEADER_ALIASES[normalizeHeader(h)] ?? null;
    if (mappedTo && index[mappedTo] === undefined) index[mappedTo] = i;
    return { header: h.trim(), mappedTo };
  });
  const missingColumns = FEED_COLUMNS.filter((c) => index[c] === undefined);

  const issues: CsvIssue[] = [];
  let issueCount = 0;
  const sampled = rows.slice(0, sampleSize);
  if (missingColumns.length === 0) {
    sampled.forEach((cells, i) => {
      const messages = checkRow(cells, index as Record<FeedColumn, number>, opts.knownStoreIds);
      if (messages.length > 0) {
        issueCount += 1;
        if (issues.length < maxIssues) issues.push({ rowNumber: i + 2, message: messages.join('; ') });
      }
    });
  }

  const previewRows = rows
    .slice(0, previewSize)
    .map((cells) => FEED_COLUMNS.map((c) => (index[c] !== undefined ? (cells[index[c]!] ?? '').trim() : '')));

  return {
    columns,
    missingColumns,
    rowCount: isLarge ? estimateRows(text) : rows.length,
    rowCountIsEstimate: isLarge,
    previewRows,
    issues,
    issueCount,
    sampledRows: sampled.length,
    canUpload: header.length > 0 && missingColumns.length === 0 && rows.length > 0,
  };
}

function checkRow(cells: string[], index: Record<FeedColumn, number>, knownStoreIds?: Set<string>): string[] {
  const get = (c: FeedColumn) => (cells[index[c]] ?? '').trim();
  const messages: string[] = [];
  for (const c of FEED_COLUMNS) if (!get(c)) messages.push(`${COLUMN_LABELS[c]} is empty`);

  const storeId = get('storeId').toUpperCase();
  if (storeId && knownStoreIds && !knownStoreIds.has(storeId)) messages.push(`Store ${storeId} is not one of your stores`);

  const price = get('price');
  if (price && !PRICE.test(price)) {
    messages.push(price.includes(',') ? `Price "${price}" uses ',' - use '.' for decimals` : `Price "${price}" is not a valid amount`);
  }
  const date = get('date');
  if (date && !ISO_DATE.test(date)) messages.push(`Date "${date}" must be YYYY-MM-DD`);
  return messages;
}

function estimateRows(text: string): number {
  let lines = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lines++;
  return Math.max(0, lines - (text.endsWith('\n') ? 1 : 0));
}
