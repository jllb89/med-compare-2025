import { normalizeHeader, looksLikeGtin } from './normalize';

const SKU_HEADERS = ['sku','gtin','ean','upc','codigo','codigo de barras','codigo barras','clave','product id','id producto','code','cod','cód'];
const PRICE_HEADERS = ['precio','price','costo','cost','unit price','precio unitario','precio sin iva','precio con iva','mayoreo','menudeo','lista','neto','publico','público'];
const SUPPLIER_HEADERS = ['proveedor','supplier','vendor','marca','brand','fabricante','manufacturer','distribuidor'];

const hasWord = (h: string, list: string[]) => list.some(k => h.includes(k));

export function pickHeaderRow(rows: any[][]): number {
  const limit = Math.min(rows.length, 20);
  let bestIdx = 0, bestScore = -1;
  for (let i = 0; i < limit; i++) {
    const r = rows[i] || [];
    const filled = r.filter(c => String(c ?? '').trim() !== '').length;
    const score = r.length ? filled / r.length : 0;
    if (score > bestScore && filled >= 2) { bestScore = score; bestIdx = i; }
  }
  return bestIdx;
}

export function mapColumns(headers: any[]): {
  skuCols: number[];
  priceCols: number[];
  supplierCols: number[];
  confidence: 'high'|'med'|'low';
  headerStrings: string[];
} {
  const H = headers.map(h => normalizeHeader(h));
  const skuCols: number[] = [], priceCols: number[] = [], supplierCols: number[] = [];
  H.forEach((h, i) => {
    if (hasWord(h, SKU_HEADERS)) skuCols.push(i);
    if (hasWord(h, PRICE_HEADERS)) priceCols.push(i);
    if (hasWord(h, SUPPLIER_HEADERS)) supplierCols.push(i);
  });

  let confidence: 'high'|'med'|'low' = 'low';
  if (skuCols.length && priceCols.length) confidence = 'high';
  else if (priceCols.length) confidence = 'med';

  return { skuCols, priceCols, supplierCols, confidence, headerStrings: H };
}

export function getCell(row: any[], idx: number): unknown {
  return row && idx >= 0 && idx < row.length ? row[idx] : undefined;
}

export function inferSkuColsFromData(dataRows: any[][], _headerStrings: string[], existingSkuCols: number[]): number[] {
  if (existingSkuCols.length) return existingSkuCols;
  const scores = new Map<number, number>();
  const sample = dataRows.slice(0, 50);
  for (const row of sample) {
    row.forEach((cell, i) => {
      if (looksLikeGtin(cell)) scores.set(i, (scores.get(i) || 0) + 1);
    });
  }
  return [...scores.entries()].sort((a,b)=>b[1]-a[1]).slice(0,2).map(([i])=>i);
}
