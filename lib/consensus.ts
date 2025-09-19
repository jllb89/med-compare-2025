import type { FileResult } from './types';

const PRICE_HINTS = ['precio','price','costo','cost','neto','unit','unitario','público','publico','menudeo','lista'];
const WHOLESALE_HINTS = ['mayoreo','mayorista','aaa',' aa',' aa '];
const USD_HINTS = ['usd','dlls','dls','us$'];

function median(xs: number[]): number {
  const a = xs.slice().sort((x, y) => x - y);
  const n = a.length;
  return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : NaN;
}
function mad(xs: number[], m: number): number {
  const dev = xs.map((x) => Math.abs(x - m));
  return median(dev);
}
function within(x: number, low: number, high: number): boolean {
  return x >= low && x <= high;
}

export function computeConsensusBand(files: FileResult[]) {
  const trusted: number[] = [];
  for (const f of files) {
    const hasPriceHeader = f.mapping.priceCols.some((h) =>
      PRICE_HINTS.some((w) => h.toLowerCase().includes(w))
    );
    for (const m of f.matches) {
      if (m.priceSelected != null) {
        if (hasPriceHeader || (m.priceColumnUsed && PRICE_HINTS.some((w) => m.priceColumnUsed!.toLowerCase().includes(w)))) {
          trusted.push(m.priceSelected);
        }
      }
    }
  }

  const pool = trusted.length >= 2
    ? trusted
    : files.flatMap((f) => f.matches.map((m) => m.priceSelected).filter((x): x is number => x != null));

  if (pool.length === 0) return null;

  const med = median(pool);
  const _mad = mad(pool, med);
  const half = _mad > 0 ? 3 * _mad : 0.15 * med;
  const low = Math.max(0, med - half);
  const high = med + half;

  return { median: med, low, high, sampleSize: pool.length };
}

function scoreCandidate(
  value: number,
  header: string | undefined,
  band: { median: number; low: number; high: number } | null
): number {
  const h = (header || '').toLowerCase();

  let score = 0;

  if (PRICE_HINTS.some((w) => h.includes(w))) score += 2.0;
  if (WHOLESALE_HINTS.some((w) => h.includes(w))) score -= 1.4;
  if (USD_HINTS.some((w) => h.includes(w))) score -= 1.2;

  if (band) {
    const { median, low, high } = band;
    const dist = Math.abs(value - median);
    const w = Math.max(1, 0.1 * median);
    const closeness = Math.max(0, 1 - dist / (high - low || w));
    score += 2.2 * closeness;
    if (!within(value, low, high)) score -= 0.8;
  }

  if (Math.abs(value - Math.trunc(value)) > 1e-9) score += 0.3;

  return score;
}

/** Override per-row selection when a candidate clearly wins by score (>0.5 margin). */
export function refineSelectionsWithBand(files: FileResult[], band: { median: number; low: number; high: number } | null) {
  for (const f of files) {
    for (const m of f.matches) {
      const entries = Object.entries(m.priceCandidates).filter(([, v]) => v != null) as [string, number][];
      if (entries.length === 0) continue;

      const scored = entries.map(([hdr, val]) => ({
        hdr,
        val,
        score: scoreCandidate(val, hdr, band),
      })).sort((a, b) => b.score - a.score);

      if (scored.length === 0) continue;

      const top = scored[0];

      // If previous selection exists, compare scores
      if (m.priceSelected != null) {
        const prev = scored.find(s => Math.abs(s.val - (m.priceSelected as number)) < 1e-9 && s.hdr === (m.priceColumnUsed || s.hdr));
        const prevScore = prev?.score ?? -Infinity;
        const margin = top.score - prevScore;
        if (margin <= 0.5) {
          m.selectionReason = m.priceColumnUsed ? 'keyword' : 'min';
          continue;
        }
      }

      // Adopt top candidate
      m.priceSelected = top.val;
      m.priceColumnUsed = top.hdr;
      m.selectionReason = band ? 'band' : 'keyword';
    }
  }
  return files;
}
