export type Role = 'STORE_MANAGER' | 'PRICING_ANALYST' | 'PRICING_ADMIN';

export interface User {
  userId: string;
  displayName: string;
  role: Role;
  storeIds: string[];
  countryCodes: string[];
}

export interface Store {
  storeId: string;
  name: string;
  countryCode: string;
  currency: string;
  timezone: string;
  region: string;
}

export interface PriceRecord {
  id: string;
  storeId: string;
  storeName: string;
  countryCode: string;
  currency: string;
  sku: string;
  productName: string;
  /** Decimal string, e.g. "12.99" - never a float. */
  price: string;
  effectiveDate: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
  sourceFeedId: string | null;
}

export type SortOption = 'effectiveDate:desc' | 'effectiveDate:asc' | 'price:asc' | 'price:desc' | 'sku:asc';

export interface SearchCriteria {
  q?: string;
  storeId?: string;
  countryCode?: string;
  minPrice?: string;
  maxPrice?: string;
  dateFrom?: string;
  dateTo?: string;
  sort: SortOption;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface AuditEntry {
  auditId: string;
  action: 'CREATED' | 'FEED_UPDATE' | 'MANUAL_EDIT';
  version: number;
  oldValues: { price: string; productName: string } | null;
  newValues: { price: string; productName: string };
  changedBy: string;
  changeReason: string | null;
  sourceFeedId: string | null;
  changedAt: string;
}

export type FeedStatus = 'AWAITING_UPLOAD' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED';

export interface Feed {
  feedId: string;
  fileName: string;
  sizeBytes: number | null;
  uploadedBy: string;
  status: FeedStatus;
  totalRows: number;
  insertedRows: number;
  updatedRows: number;
  unchangedRows: number;
  rejectedRows: number;
  failureReason: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface FeedRowError {
  rowNumber: number;
  rawRow: string;
  messages: string[];
}

export interface UploadInstructions {
  method: 'PUT';
  url: string;
  headers: Record<string, string>;
}

export interface CreateFeedResponse {
  feed: Feed;
  upload: UploadInstructions | null;
  duplicateOf: string | null;
}
