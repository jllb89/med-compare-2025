// lib/price.ts

/**
 * Parse a price from mixed spreadsheet cell content.
 * - Accepts numbers directly.
 * - Accepts strings like "$1,234.56", "1.234,56 MXN", "39.858", "146,79", etc.
 * - REJECTS alphanumeric codes like "GRIN14", "CAJA256", "REF-001" unless a currency marker is present.
 * - Returns null for non-sensical / non-positive values.
 */
export function parsePrice(val: unknown): number | null {
  if (val == null) return null;

  if (typeof val === 'number') {
    return Number.isFinite(val) && val > 0 ? val : null;
  }

  let s = String(val).trim();
  if (!s) return null;

  // If the string has letters and NO currency marker, reject it outright.
  const hasLetters = /[A-Za-z]/.test(s);
  const hasCurrencyWord = /\b(mxn|usd|mn|mx|pesos?)\b/i.test(s);
  const hasCurrencySymbol = /\$|₱|€|£/.test(s);
  if (hasLetters && !(hasCurrencySymbol || hasCurrencyWord)) {
    return null;
  }

  // Keep digits, separators, minus sign.
  s = s.replace(/[^\d.,\-]/g, '');
  if (!/\d/.test(s)) return null;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastDot > lastComma) {
      // dot is decimal -> remove thousands commas
      s = s.replace(/,/g, '');
    } else {
      // comma is decimal -> remove dots (thousands), then last comma -> dot
      s = s.replace(/\./g, '');
      s = s.replace(/,([^,]*)$/, '.$1');
    }
  } else if (hasComma && !hasDot) {
    // decimal comma
    s = s.replace(/,/, '.');
    s = s.replace(/,/g, '');
  } else {
    // only dot or integer -> leave as-is
  }

  const num = parseFloat(s);
  if (!Number.isFinite(num)) return null;
  if (num <= 0) return null;

  return num;
}

/** Format a number as MXN currency (e.g., "$1,234.56"). */
const nfMXN = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Safe formatter used by UI components. */
export function formatMXN(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return nfMXN.format(value);
}
