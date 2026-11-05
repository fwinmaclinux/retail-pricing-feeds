const moneyFormatters = new Map<string, Intl.NumberFormat>();

/** Formats a decimal-string price in the store's currency using the device locale. */
export function formatMoney(price: string, currency: string): string {
  let fmt = moneyFormatters.get(currency);
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency });
    } catch {
      return `${currency} ${price}`;
    }
    moneyFormatters.set(currency, fmt);
  }
  return fmt.format(Number(price));
}

/** Currency symbol for input adornments, e.g. "£" for GBP. */
export function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat(undefined, { style: 'currency', currency }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}

/** "2026-11-01" -> "1 Nov 2026" (calendar date, no timezone shift). */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y!, m! - 1, d!)),
  );
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}

export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return formatDateTime(iso);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat().format(n);
}

/** ISO date (YYYY-MM-DD) for today minus `days`, in the device's local calendar. */
export function isoDaysAgo(days: number, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const ROLE_LABELS = {
  STORE_MANAGER: 'Store Manager',
  PRICING_ANALYST: 'Pricing Analyst',
  PRICING_ADMIN: 'Pricing Admin (HQ)',
} as const;
