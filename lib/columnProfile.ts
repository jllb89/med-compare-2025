import { parsePrice } from './price';

const PRICE_WORDS = ['precio','price','costo','cost','neto','unit','unitario','p.lista','lista','aaa'];
const NON_PRICE_HINTS = ['exist','existencia','stock','qty','cantidad','pzas','pz','unid','u.','unidad'];

function hasCurrencyToken(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).toLowerCase();
  return /\$|mxn|m\.n\.|mn|usd/.test(s);
}

type ColStats = {
  idx: number;
  header: string;
  samples: number;
  parsedCount: number;
  currencyTokenCount: number;
  decimalCount: number;
  integerHeavy: boolean;
  avg: number | null;
  headerHint: boolean;
  nonPriceHint: boolean;
  score: number;
};

export function suggestPriceCols(dataRows: any[][], headersNorm: string[], maxCols = 3): number[] {
  const N = Math.min(dataRows.length, 300);
  const colCount = headersNorm.length;
  const stats: ColStats[] = [];

  for (let idx = 0; idx < colCount; idx++) {
    let samples = 0, parsedCount = 0, currencyTokenCount = 0, decimalCount = 0;
    let sum = 0, nsum = 0, intCount = 0;

    for (let r = 0; r < N; r++) {
      const v = dataRows[r]?.[idx];
      if (v == null || String(v).trim() === '') continue;
      samples++;

      if (hasCurrencyToken(v)) currencyTokenCount++;

      const parsed = parsePrice(v);
      if (parsed != null) {
        parsedCount++;
        nsum++;
        sum += parsed;
        if (Math.abs(parsed - Math.trunc(parsed)) < 1e-9) intCount++; else decimalCount++;
      }
    }

    const avg = nsum ? sum / nsum : null;
    const header = headersNorm[idx] || `col_${idx}`;
    const headerHint = PRICE_WORDS.some(w => header.includes(w));
    const nonPriceHint = NON_PRICE_HINTS.some(w => header.includes(w));
    const integerHeavy = parsedCount > 0 && intCount / parsedCount > 0.9;

    const parsedRatio = samples ? parsedCount / samples : 0;
    const currRatio = samples ? currencyTokenCount / samples : 0;
    const decRatio = parsedCount ? decimalCount / parsedCount : 0;

    let score = 0;
    score += 3.0 * parsedRatio;
    score += 1.5 * currRatio;
    score += 1.0 * decRatio;
    if (avg != null && avg > 0 && avg < 100000) score += 0.5;
    if (headerHint) score += 0.7;
    if (nonPriceHint) score -= 0.8;
    if (integerHeavy) score -= 0.6;

    stats.push({ idx, header, samples, parsedCount, currencyTokenCount, decimalCount, integerHeavy, avg, headerHint, nonPriceHint, score });
  }

  const ranked = stats.sort((a, b) => b.score - a.score);
  const chosen = ranked.filter(c => c.score > 0).slice(0, maxCols).map(c => c.idx);
  return chosen;
}
