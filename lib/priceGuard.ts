// lib/priceGuard.ts
export type Band = {
  method: 'MAD' | 'IQR' | 'NONE';
  median: number;
  low: number;
  high: number;
  pct: number; // half-band as percent from median, e.g. 0.3 = ±30%
};

function median(vals: number[]) {
  const a = [...vals].sort((x, y) => x - y);
  const n = a.length;
  const mid = Math.floor(n / 2);
  return n % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function mad(vals: number[], med: number) {
  const devs = vals.map((v) => Math.abs(v - med));
  return median(devs);
}

export function bandMAD(vals: number[], k = 3.5): Band {
  const med = median(vals);
  const MAD = mad(vals, med);
  if (MAD === 0) {
    return { method: 'NONE', median: med, low: med, high: med, pct: 0 };
  }
  const sigma = 1.4826 * MAD;
  const low = med - k * sigma;
  const high = med + k * sigma;
  const pct = sigma === 0 ? 0 : (k * sigma) / med;
  return { method: 'MAD', median: med, low, high, pct: Math.abs(pct) };
}

export function bandIQR(vals: number[], fence = 1.5): Band {
  const a = [...vals].sort((x, y) => x - y);
  const q1 = a[Math.floor((a.length - 1) * 0.25)];
  const q3 = a[Math.floor((a.length - 1) * 0.75)];
  const iqr = q3 - q1;
  const low = q1 - fence * iqr;
  const high = q3 + fence * iqr;
  const med = median(vals);
  const pct = med === 0 ? 0 : Math.max((med - low) / med, (high - med) / med);
  return { method: 'IQR', median: med, low, high, pct: Math.abs(pct) };
}

export function computeBand(vals: number[]): Band {
  const cleanVals = vals.filter((v) => Number.isFinite(v));
  if (cleanVals.length < 3) {
    const m = median(cleanVals.length ? cleanVals : [0]);
    return { method: 'NONE', median: m, low: m, high: m, pct: 0 };
  }
  const b = bandMAD(cleanVals);
  if (b.method === 'MAD' && b.low !== b.high) return b;
  return bandIQR(cleanVals);
}

export function flaggedOutlier(val: number | null | undefined, band: Band): boolean {
  if (val == null) return false;
  return val < band.low || val > band.high;
}
