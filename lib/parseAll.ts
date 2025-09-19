// lib/parseAll.ts
import * as XLSX from 'xlsx';
import { digitsOnly } from './normalize';
import { mapColumns, pickHeaderRow, getCell, inferSkuColsFromData } from './detect';
import { parsePrice } from './price';
import { suggestPriceCols } from './columnProfile';
import { detectProductColumns, extractFirstNonEmpty } from './productMap';
import type { MatchRow, FileResult } from './types';

const PRICE_PRIORITY = ['precio unitario','unit price','costo','cost','precio neto','neto'];

function pickSelectedPrice(priceMap: Record<string, number | null>): { value: number | null; col?: string } {
  for (const key of PRICE_PRIORITY) {
    const found = Object.entries(priceMap).find(([h, v]) => h.includes(key) && v != null);
    if (found) return { value: found[1], col: found[0] };
  }
  const candidates = Object.entries(priceMap).filter(([, v]) => v != null) as [string, number][];
  if (!candidates.length) return { value: null };
  const best = candidates.reduce((a, b) => (a[1] <= b[1] ? a : b));
  return { value: best[1], col: best[0] };
}

function extractSkuFromRow(row: any[], skuColsIdx: number[]): string | null {
  const cells = skuColsIdx.length ? skuColsIdx.map((i: number) => getCell(row, i)) : row;
  for (const c of cells) {
    const d = digitsOnly(c);
    if (d.length >= 12 && d.length <= 14) return d;
  }
  for (const c of row) {
    const d = digitsOnly(c);
    if (d.length >= 12 && d.length <= 14) return d;
  }
  return null;
}

function parseSingleSheetAll(
  ws: XLSX.WorkSheet,
  sheetName: string,
  filename: string
): FileResult {
  const t0 = Date.now();

  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  const headerRowIdx = pickHeaderRow(rows);
  const headers = (rows[headerRowIdx] || []).map(String);
  const dataRows = rows.slice(headerRowIdx + 1);

  const mapping0 = mapColumns(headers);
  const skuColsIdx = inferSkuColsFromData(dataRows, mapping0.headerStrings, mapping0.skuCols);
  const { H: hdrNorm, nameCols, formulaCols, labCols } = detectProductColumns(headers);

  let priceColsIdx = mapping0.priceCols;
  if (!priceColsIdx.length) {
    const inferred = suggestPriceCols(dataRows, mapping0.headerStrings);
    if (inferred.length) priceColsIdx = inferred;
  }

  const matches: MatchRow[] = [];
  let scanned = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] || [];
    scanned++;

    const skuDetected = extractSkuFromRow(row, skuColsIdx);
    if (!skuDetected) continue;

    let supplier: string | undefined = undefined;
    for (const si of mapping0.supplierCols) {
      const v = String(getCell(row, si) ?? '').trim();
      if (v) { supplier = v; break; }
    }

    const priceCandidates: Record<string, number | null> = {};
    const candidateIdxs: number[] = priceColsIdx.length ? priceColsIdx : headers.map((_, idx) => idx);
    for (const idx of candidateIdxs) {
      const h = hdrNorm[idx] || `col_${idx}`;
      const v = getCell(row, idx);
      const parsed = parsePrice(v);
      if (parsed != null) priceCandidates[h] = parsed;
    }
    const chosen = pickSelectedPrice(priceCandidates);

    const productName = extractFirstNonEmpty(row, nameCols);
    const formula = extractFirstNonEmpty(row, formulaCols);
    const lab = extractFirstNonEmpty(row, labCols);

    matches.push({
      rowIndex: headerRowIdx + 1 + i,
      supplier,
      priceSelected: chosen.value,
      priceColumnUsed: chosen.col,
      priceCandidates,
      skuDetected,
      productName, formula, lab,
      row: Object.fromEntries(headers.map((h, j: number) => [h, row[j]])),
    });
  }

  const parseMs = Date.now() - t0;
  return {
    filename,
    sheetName,
    headerRow: headerRowIdx,
    mapping: {
      skuCols: skuColsIdx.map((i: number) => headers[i] ?? `col_${i}`),
      priceCols: priceColsIdx.map((i: number) => headers[i] ?? `col_${i}`),
      supplierCols: mapping0.supplierCols.map((i: number) => headers[i] ?? `col_${i}`),
      productNameCols: nameCols.map((i: number) => headers[i] ?? `col_${i}`),
      formulaCols: formulaCols.map((i: number) => headers[i] ?? `col_${i}`),
      labCols: labCols.map((i: number) => headers[i] ?? `col_${i}`),
      confidence: mapping0.confidence,
    },
    stats: { rowsScanned: scanned, matches: matches.length, parseMs },
    matches,
  };
}

export function parseWorkbookAllSkusAllSheets(buffer: Buffer, filename: string): FileResult[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const out: FileResult[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    out.push(parseSingleSheetAll(ws, sheetName, filename));
  }
  return out;
}
